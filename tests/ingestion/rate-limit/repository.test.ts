import { describe, expect, it, vi } from "vitest";

import {
  ProviderBudgetRepositoryError,
  createProviderBudgetRepository,
} from "@/lib/ingestion/rate-limit/repository";

const request = {
  runId: "123e4567-e89b-12d3-a456-426614174000",
  leaseToken: "lease-1",
  attemptKey: "v1:request:123e4567-e89b-12d3-a456-426614174000:0:" + "a".repeat(64),
  cost: 1,
} as const;

describe("provider budget repository", () => {
  it("sends only the authoritative four RPC arguments and maps a reservation", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        outcome: "reserved",
        reservation_id: "223e4567-e89b-12d3-a456-426614174000",
        remaining_count: 9,
        retry_at: null,
      }],
      error: null,
    });
    const repository = createProviderBudgetRepository({ rpc });

    await expect(repository.reserve(request)).resolves.toEqual({
      allowed: true,
      cost: 1,
      reason: "available",
    });
    expect(rpc).toHaveBeenCalledWith("reserve_provider_budget", {
      p_run_id: request.runId,
      p_lease_token: request.leaseToken,
      p_attempt_key: request.attemptKey,
      p_cost: request.cost,
    });
  });

  it("maps replayed reservations as available and exhausted as authoritative denial", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [{ outcome: "replayed", reservation_id: "223e4567-e89b-12d3-a456-426614174000", remaining_count: 8, retry_at: null }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ outcome: "exhausted", reservation_id: null, remaining_count: 0, retry_at: "2026-10-10T12:05:00Z" }],
        error: null,
      });
    const repository = createProviderBudgetRepository({ rpc });

    await expect(repository.reserve(request)).resolves.toEqual({ allowed: true, cost: 1, reason: "available" });
    await expect(repository.reserve(request)).resolves.toEqual({
      allowed: false,
      cost: 1,
      reason: "exhausted",
      retryAt: "2026-10-10T12:05:00.000Z",
    });
  });

  it("maps missing configuration to unknown_budget", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ outcome: "configuration_missing", reservation_id: null, remaining_count: null, retry_at: null }],
      error: null,
    });
    const repository = createProviderBudgetRepository({ rpc });

    await expect(repository.reserve(request)).resolves.toEqual({ allowed: false, cost: 1, reason: "unknown_budget" });
  });

  it.each([
    { outcome: "reserved", reservation_id: null, remaining_count: 9, retry_at: null },
    { outcome: "exhausted", reservation_id: null, remaining_count: 0, retry_at: null },
    { outcome: "unknown", reservation_id: null, remaining_count: 0, retry_at: null },
    { outcome: "reserved", reservation_id: "not-a-uuid", remaining_count: 9, retry_at: null, extra: true },
  ])("rejects malformed RPC output: %j", async (row) => {
    const repository = createProviderBudgetRepository({
      rpc: vi.fn().mockResolvedValue({ data: [row], error: null }),
    });

    await expect(repository.reserve(request)).rejects.toMatchObject({
      name: "ProviderBudgetRepositoryError",
      kind: "invalid_budget",
    });
  });

  it("turns a malformed RPC envelope into a typed sanitized error", async () => {
    const repository = createProviderBudgetRepository({
      rpc: vi.fn().mockResolvedValue({ data: [], error: null, unexpected: "secret" }),
    });

    await expect(repository.reserve(request)).rejects.toMatchObject({
      name: "ProviderBudgetRepositoryError",
      kind: "rpc",
      message: "Provider budget RPC failed",
    });
  });

  it.each([
    { code: "P0001", kind: "lease_lost" },
    { code: "P0005", kind: "attempt_conflict" },
    { code: "XX000", kind: "rpc" },
  ] as const)("maps sanitized RPC error %s", async ({ code, kind }) => {
    const repository = createProviderBudgetRepository({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code, message: "secret database detail" } }),
    });

    await expect(repository.reserve(request)).rejects.toMatchObject({ kind, message: expect.not.stringContaining("secret") });
  });

  it("rejects malformed caller input without making an RPC call", async () => {
    const rpc = vi.fn();
    const repository = createProviderBudgetRepository({ rpc });

    await expect(repository.reserve({ ...request, cost: 0 })).rejects.toBeInstanceOf(ProviderBudgetRepositoryError);
    await expect(repository.reserve({ ...request, runId: " run-1 " })).rejects.toBeInstanceOf(ProviderBudgetRepositoryError);
    await expect(repository.reserve({ ...request, extra: true } as never)).rejects.toBeInstanceOf(ProviderBudgetRepositoryError);
    expect(rpc).not.toHaveBeenCalled();
  });
});
