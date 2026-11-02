import { describe, expect, it, vi } from "vitest";
import { createFakeNotificationTransport, createNotificationWorker, notificationKinds, type NotificationRepository } from "@/lib/events/notifications";
import { createNotificationRepository } from "@/lib/events/notifications-repository";

function repository(): NotificationRepository {
  return {
    scan: vi.fn(async () => ["intent"]),
    admit: vi.fn(async () => ({ admitted: true, attemptId: "attempt" })),
    start: vi.fn(async () => ({ started: true, dedupId: "stable", timeoutMs: 10000, startBudgetMs: 5000 })),
    finish: vi.fn(async () => ({ accepted: true })),
  };
}
describe("durable fake notification worker", () => {
  it("retains all nine trigger kinds", () => { expect(new Set(notificationKinds).size).toBe(9); });
  it("admission then immediate pretransport check then finish, exact one fake send", async () => {
    const repo = repository(), transport = createFakeNotificationTransport();
    expect(await createNotificationWorker(repo, transport).run()).toEqual({ admitted: 1, sent: 1, skipped: 0, uncertain: 0, failed: 0 });
    expect(transport.calls).toHaveLength(1);
    expect(repo.finish).toHaveBeenCalledWith("attempt", expect.any(String), 201, false);
  });
  it("stop at admission or pretransport produces zero sends", async () => {
    for (const stopAt of ["admit", "start"] as const) {
      const repo = repository(), transport = createFakeNotificationTransport();
      if (stopAt === "admit") vi.mocked(repo.admit).mockResolvedValue({ admitted: false });
      else vi.mocked(repo.start).mockResolvedValue({ started: false });
      await createNotificationWorker(repo, transport).run();
      expect(transport.calls).toHaveLength(0); expect(repo.finish).not.toHaveBeenCalled();
    }
  });
  it("new worker has new incarnation; no API accepting old permits", async () => {
    const repo = repository();
    await createNotificationWorker(repo, createFakeNotificationTransport()).run();
    await createNotificationWorker(repo, createFakeNotificationTransport()).run();
    const calls = vi.mocked(repo.admit).mock.calls;
    expect(calls[0][1]).not.toBe(calls[1][1]);
  });
  it("bounds hung transport at ten seconds and records uncertainty", async () => {
    vi.useFakeTimers();
    try {
      const repo = repository();
      const run = createNotificationWorker(repo, { mode: "fake", send: () => new Promise(() => {}) }).run();
      await vi.advanceTimersByTimeAsync(10_000);
      expect((await run).uncertain).toBe(1);
      expect(repo.finish).toHaveBeenCalledWith("attempt", expect.any(String), null, true);
    } finally { vi.useRealTimers(); }
  });
  it("delayed start acknowledgment cannot send after five-second admission budget", async () => {
    const repo = repository(), transport = createFakeNotificationTransport();
    vi.mocked(repo.start).mockResolvedValue({ started: true, startBudgetMs: -1 } as never);
    const result = await createNotificationWorker(repo, transport).run();
    expect(transport.calls).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });
  it("lost DB acknowledgment does not reuse or resend a permit", async () => {
    const repo = repository(), transport = createFakeNotificationTransport();
    vi.mocked(repo.finish).mockRejectedValue(new Error("lost"));
    await expect(createNotificationWorker(repo, transport).run()).rejects.toThrow("lost");
    expect(transport.calls).toHaveLength(1); expect(repo.admit).toHaveBeenCalledTimes(1);
  });
  it("real transport rejected even through a cast", () => {
    expect(() => createNotificationWorker(repository(), { mode: "real" } as never)).toThrow("disabled");
  });
  it("repository uses service RPCs and never returns raw database error text", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "secret-sentinel" } }));
    const repo = createNotificationRepository({ rpc });
    await expect(repo.admit("id", "worker")).rejects.toThrow(/^Notification operation failed$/);
    expect(rpc).toHaveBeenCalledWith("admit_event_notification", { p_outbox: "id", p_worker: "worker" });
  });
});
