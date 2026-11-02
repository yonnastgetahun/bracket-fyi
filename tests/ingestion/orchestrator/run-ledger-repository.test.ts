import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  computeIngestionPageKey,
  createRunLedgerRepository,
} from "@/lib/ingestion/orchestrator/run-ledger-repository";

const claimedRow = {
  run_id: "run-1",
  binding_id: "binding-1",
  claim_key: "v1:schedule:binding-1:g1",
  claim_request_key: "automated:v1:tick-1",
  claim_generation: 1,
  retry_index: 0,
  checkpoint_generation: 0,
  lease_token: "lease-1",
  lease_acquired: true,
  provider_id: "provider-1",
  event_edition_id: "edition-1",
  adapter_key: "synthetic-sports",
  binding_key: "primary",
  mode: "write",
  credential_ref: null,
  adapter_config_version: 1,
  adapter_config: { fixture: "sports" },
  poll_policy: { phase: "live" },
  provider_cursor: { page: 0 },
  provider_etag: null,
  lease_expires_at: "2026-10-08T18:05:00Z",
};

const page = {
  runId: "run-1",
  leaseToken: "lease-1",
  bindingId: "binding-1",
  expectedCheckpointGeneration: 0,
  expectedCursor: { page: 0 },
  expectedEtag: "etag-0",
  nextCursor: { page: 1 },
  responseEtag: "etag-1",
  fetchedDelta: 2,
  normalizedDelta: 2,
  projectedDelta: 1,
  unchangedDelta: 1,
  quarantinedDelta: 0,
  skippedDelta: 0,
  failedDelta: 0,
} as const;

describe("run ledger repository", () => {
  it("maps an owned due claim and sends the lease bounds to SQL", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [claimedRow], error: null });
    const repository = createRunLedgerRepository({ rpc });

    await expect(repository.claimDue({ requestKey: "tick-1", now: "2026-10-08T18:00:00Z", workerId: "worker-1" })).resolves.toMatchObject({
      runId: "run-1",
      claimRequestKey: "automated:v1:tick-1",
      checkpointGeneration: 0,
      leaseToken: "lease-1",
      leaseAcquired: true,
    });
    expect(rpc).toHaveBeenCalledWith("claim_due_ingestion_run", {
      p_claim_request_key: "tick-1",
      p_now: "2026-10-08T18:00:00Z",
      p_worker_id: "worker-1",
      p_lease_seconds: 300,
    });
  });

  it("keeps a competing claim tokenless and separates manual namespaces", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [{ ...claimedRow, lease_token: null, lease_acquired: false }], error: null })
      .mockResolvedValueOnce({ data: [{ ...claimedRow, claim_request_key: "manual:v1:binding-1:tick-1" }], error: null });
    const repository = createRunLedgerRepository({ rpc });

    await expect(repository.claimDue({ requestKey: "tick-1", now: "2026-10-08T18:00:00Z", workerId: "worker-2" })).resolves.toMatchObject({
      leaseToken: null,
      leaseAcquired: false,
    });
    await expect(repository.claimManual({ bindingId: "binding-1", requestKey: "tick-1", now: "2026-10-08T18:00:00Z", workerId: "operator" })).resolves.toMatchObject({
      claimRequestKey: "manual:v1:binding-1:tick-1",
    });
  });

  it("uses the exact lifecycle and lease RPC signatures", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [{ run_id: "run-1", status: "running", started_at: "2026-10-08T18:00:00Z" }], error: null })
      .mockResolvedValueOnce({ data: [{ run_id: "run-1", lease_expires_at: "2026-10-08T18:10:00Z" }], error: null })
      .mockResolvedValueOnce({ data: [{ run_id: "run-1", recorded: true }], error: null });
    const repository = createRunLedgerRepository({ rpc });

    await repository.start({ runId: "run-1", leaseToken: "lease-1", now: "2026-10-08T18:00:00Z" });
    await repository.renew({ runId: "run-1", leaseToken: "lease-1", now: "2026-10-08T18:01:00Z", leaseSeconds: 600 });
    await repository.recordResponse({ runId: "run-1", leaseToken: "lease-1", httpStatus: 429, rateLimitLimit: 10, rateLimitRemaining: 0, observedAt: "2026-10-08T18:02:00Z" });

    expect(rpc).toHaveBeenNthCalledWith(1, "start_ingestion_run", {
      p_run_id: "run-1", p_lease_token: "lease-1", p_now: "2026-10-08T18:00:00Z",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "renew_ingestion_run", {
      p_run_id: "run-1", p_lease_token: "lease-1", p_now: "2026-10-08T18:01:00Z", p_lease_seconds: 600,
    });
    expect(rpc).toHaveBeenNthCalledWith(3, "record_ingestion_response", expect.objectContaining({
      p_http_status: 429, p_rate_limit_limit: 10, p_rate_limit_remaining: 0,
    }));
  });

  it("maps reclamation and finish outcomes without policy decisions", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [{ run_id: "run-1", binding_id: "binding-1", retry_index: 1, reclaimed_at: "2026-10-08T18:00:00Z" }], error: null })
      .mockResolvedValueOnce({ data: [{ run_id: "run-1", status: "failed", health_status: "degraded", next_poll_at: "2026-10-08T18:02:00Z", next_retry_at: "2026-10-08T18:02:00Z" }], error: null });
    const repository = createRunLedgerRepository({ rpc });

    await expect(repository.reclaimExpired({ now: "2026-10-08T18:00:00Z", reason: "worker crashed", retryAt: "2026-10-08T18:02:00Z" })).resolves.toHaveLength(1);
    await expect(repository.finish({ runId: "run-1", leaseToken: "lease-1", outcome: "failed", finishedAt: "2026-10-08T18:01:00Z", nextRetryAt: "2026-10-08T18:02:00Z", dataChanged: false, failureCode: "timeout", errorMessage: "synthetic", metadata: { fixture: "sports" } })).resolves.toMatchObject({ status: "failed" });
    expect(rpc).toHaveBeenNthCalledWith(2, "finish_ingestion_run", expect.objectContaining({
      p_next_retry_at: "2026-10-08T18:02:00Z",
      p_metadata: { fixture: "sports" },
    }));
  });

  it("computes the deterministic page key from the packet framing", () => {
    const cursor = JSON.stringify(page.expectedCursor);
    const material = `slice-2c-page-v1${page.bindingId.length}${page.bindingId}1${page.expectedCheckpointGeneration}${cursor.length}${cursor}${page.expectedEtag.length}${page.expectedEtag}`;
    const expected = createHash("sha256").update(material).digest("hex");

    expect(computeIngestionPageKey(page)).toBe(expected);
  });

  it("uses UTF-8 byte lengths for the cross-runtime non-BMP golden vector", () => {
    expect(computeIngestionPageKey({
      ...page,
      bindingId: "c2000000-0000-4000-8000-000000000007",
      expectedCursor: { cursor: "😀" },
      expectedEtag: "etag-😀",
    })).toBe("13d8b9896be43bfb59674c09d8bdbfc0d76a6d4e00a083d2e253f5c00d2d2673");
  });

  it("commits and replays a page without changing the caller-owned key", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [{ outcome: "committed", page_ledger_id: "page-1", run_id: "run-1", checkpoint_generation: 1, cursor_after: { page: 1 }, provider_etag: "etag-1" }], error: null })
      .mockResolvedValueOnce({ data: [{ outcome: "replayed", page_ledger_id: "page-1", run_id: "run-1", checkpoint_generation: 1, cursor_after: { page: 1 }, provider_etag: "etag-1" }], error: null });
    const repository = createRunLedgerRepository({ rpc });

    await expect(repository.commitPage(page)).resolves.toMatchObject({ outcome: "committed", pageLedgerId: "page-1" });
    await expect(repository.commitPage(page)).resolves.toMatchObject({ outcome: "replayed", checkpointGeneration: 1 });
    expect(rpc).toHaveBeenNthCalledWith(1, "commit_ingestion_page", expect.objectContaining({
      p_page_key: computeIngestionPageKey(page),
      p_expected_checkpoint_generation: 0,
    }));
  });

  it.each([
    ["P0001", "lease_lost"],
    ["P0002", "checkpoint_conflict"],
    ["P0003", "page_conflict"],
  ] as const)("preserves SQLSTATE %s as typed %s", async (code, kind) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code, message: kind } });
    const repository = createRunLedgerRepository({ rpc });

    await expect(repository.start({ runId: "run-1", leaseToken: "lease-1", now: "2026-10-08T18:00:00Z" })).rejects.toMatchObject({ kind, sqlState: code });
  });
});
