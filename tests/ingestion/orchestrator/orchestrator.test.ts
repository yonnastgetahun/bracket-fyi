import { describe, expect, it, vi } from "vitest";

import type { ProviderBatch, NormalizedObservation } from "@/lib/ingestion/contracts";
import { RunLedgerRepositoryError, type ClaimedIngestionRun, type RunLedgerRepository } from "@/lib/ingestion/orchestrator/run-ledger-repository";
import { createIngestionOrchestrator, effectiveBindingMode } from "@/lib/ingestion/orchestrator/orchestrator";
import type { OrchestratorDependencies } from "@/lib/ingestion/orchestrator/ports";
import type { ProviderAdapter } from "@/lib/ingestion/providers/provider-adapter";

const runDefaults: ClaimedIngestionRun = {
  runId: "run-1",
  bindingId: "10000000-0000-4000-8000-000000000001",
  claimKey: "v1:schedule:binding:g1",
  claimRequestKey: "automated:v1:run-1",
  claimGeneration: 1,
  retryIndex: 0,
  checkpointGeneration: 0,
  leaseToken: "lease-1",
  leaseAcquired: true,
  providerId: "20000000-0000-4000-8000-000000000001",
  eventEditionId: "30000000-0000-4000-8000-000000000001",
  adapterKey: "synthetic-sports",
  bindingKey: "primary",
  mode: "write",
  credentialRef: "credential://synthetic",
  adapterConfigVersion: 1,
  adapterConfig: { fixture: "sports" },
  pollPolicy: {
    idleSeconds: 300,
    pregameSeconds: 60,
    liveSeconds: 30,
    postgameSeconds: 60,
    staleAfterSeconds: 60,
  },
  providerCursor: { page: 0 },
  providerEtag: "etag-0",
  leaseExpiresAt: "2026-10-10T18:05:00.000Z",
};

const sportsObservation: NormalizedObservation = {
  entityKind: "contest",
  externalId: "match-1",
  providerRevision: "sports-r1",
  providerUpdatedAt: "2026-10-10T17:59:00.000Z",
  observedAt: "2026-10-10T18:00:00.000Z",
  completeness: "full",
  sanitizedPayload: {
    teams: { home: "North", away: "South" },
    match: { status: "final", score: { home: 2, away: 1 } },
  },
  data: {
    eventEditionExternalId: "edition-1",
    stageExternalId: "stage-1",
    contestKey: "match-1",
    name: "North v South",
    contestKind: "match",
    status: "final",
    requiredForCompletion: true,
    entries: [],
    metadata: { sport: "synthetic" },
  },
};

const ceremonyObservation: NormalizedObservation = {
  entityKind: "result",
  externalId: "category-best-picture",
  providerRevision: "ceremony-r1",
  observedAt: "2026-10-10T18:00:00.000Z",
  completeness: "full",
  sanitizedPayload: {
    category: "Best Picture",
    nominees: ["Film A", "Film B"],
    ceremonyStatus: "awarded",
  },
  data: {
    eventEditionExternalId: "edition-ceremony",
    contestExternalId: "category-best-picture",
    resultStatus: "awarded",
    outcomeType: "winner",
    resultData: { winner: "film-a" },
    winnerEventEntryExternalId: "film-a",
  },
};

const batchFor = (observations: NormalizedObservation[], overrides: Partial<ProviderBatch> = {}): ProviderBatch => ({
  observations,
  fetchedCount: observations.length,
  receivedAt: "2026-10-10T18:00:00.000Z",
  ...overrides,
});

const makeLedger = (overrides: Partial<RunLedgerRepository> = {}) => ({
  claimDue: vi.fn(),
  claimManual: vi.fn(),
  start: vi.fn().mockResolvedValue({ run_id: "run-1", status: "running", started_at: "2026-10-10T18:00:00.000Z" }),
  renew: vi.fn().mockResolvedValue({ run_id: "run-1", lease_expires_at: "2026-10-10T18:10:00.000Z" }),
  recordResponse: vi.fn().mockResolvedValue({ run_id: "run-1", recorded: true }),
  reclaimExpired: vi.fn(),
  commitPage: vi.fn().mockResolvedValue({
    outcome: "committed",
    pageLedgerId: "page-1",
    runId: "run-1",
    checkpointGeneration: 1,
    cursorAfter: { page: 1 },
    providerEtag: "etag-1",
  }),
  finish: vi.fn().mockResolvedValue({
    run_id: "run-1",
    status: "succeeded",
    health_status: "healthy",
    next_poll_at: null,
    next_retry_at: null,
  }),
  ...overrides,
}) satisfies RunLedgerRepository;

const makeDependencies = (overrides: Partial<OrchestratorDependencies> = {}) => {
  const ledger = makeLedger();
  const adapter: ProviderAdapter = {
    key: "synthetic-sports",
    capabilities: new Set(),
    pull: vi.fn().mockResolvedValue(batchFor([sportsObservation])),
    classifyError: vi.fn<ProviderAdapter["classifyError"]>(() => ({ code: "permanent", retry: "never", message: "synthetic", details: {} })),
  };
  const dependencies: OrchestratorDependencies = {
    clock: { now: vi.fn(() => new Date("2026-10-10T18:00:00.000Z")) },
    ledger,
    modeReader: { read: vi.fn().mockResolvedValue("write") },
    pullWindowResolver: {
      resolve: vi.fn().mockReturnValue({ windowStart: "2026-10-10T17:00:00.000Z", windowEnd: "2026-10-10T18:00:00.000Z" }),
    },
    phaseResolver: { resolve: vi.fn().mockReturnValue("live") },
    budget: { reserve: vi.fn().mockResolvedValue({ allowed: true, cost: 1, reason: "available" }) },
    credentials: {
      resolve: vi.fn().mockResolvedValue({ reference: "credential://synthetic", getValue: () => "secret-sentinel" }),
    },
    adapters: { get: vi.fn().mockReturnValue(adapter) },
    evidence: {
      record: vi.fn().mockResolvedValue({ outcome: "inserted", observationId: "observation-1" }),
    },
    structural: {
      projectObservation: vi.fn().mockResolvedValue({ kind: "projected", canonicalId: "canonical-1" }),
    },
    result: {
      project: vi.fn().mockResolvedValue({ outcome: "projected", contestResultId: "result-1" }),
    },
    ...overrides,
  };
  return { dependencies, ledger, adapter };
};

const execute = (dependencies: OrchestratorDependencies, run: ClaimedIngestionRun = runDefaults) =>
  createIngestionOrchestrator(dependencies).execute(run);

describe("provider-neutral ingestion orchestration", () => {
  it("rejects an unowned or tokenless run before side effects", async () => {
    const { dependencies, ledger } = makeDependencies();

    await expect(execute(dependencies, { ...runDefaults, leaseAcquired: false, leaseToken: null })).rejects.toThrow("active lease");
    expect(ledger.start).not.toHaveBeenCalled();
    expect(dependencies.modeReader.read).not.toHaveBeenCalled();
    expect(dependencies.budget.reserve).not.toHaveBeenCalled();
  });

  it("starts an owned run before any execution port", async () => {
    const { dependencies, ledger } = makeDependencies();
    await execute(dependencies);

    expect(ledger.start).toHaveBeenCalledBefore(dependencies.modeReader.read as ReturnType<typeof vi.fn>);
    expect(ledger.start).toHaveBeenCalledWith({ runId: runDefaults.runId, leaseToken: runDefaults.leaseToken, now: "2026-10-10T18:00:00.000Z" });
  });

  it.each([
    ["disabled", "write", "disabled"],
    ["write", "disabled", "disabled"],
    ["shadow", "write", "shadow"],
    ["write", "shadow", "shadow"],
    ["write", "write", "write"],
  ] as const)("uses least-privilege mode %s + %s = %s", (claimed, current, expected) => {
    expect(effectiveBindingMode(claimed, current)).toBe(expected);
  });

  it("finishes canceled for disabled mode without budget, credential, adapter, evidence, or projection activity", async () => {
    const { dependencies, ledger, adapter } = makeDependencies({ modeReader: { read: vi.fn().mockResolvedValue("disabled") } });
    const result = await execute(dependencies);

    expect(result).toMatchObject({ status: "canceled", fetchedCount: 0, skippedCount: 0 });
    expect(dependencies.budget.reserve).not.toHaveBeenCalled();
    expect(dependencies.credentials.resolve).not.toHaveBeenCalled();
    expect(dependencies.adapters.get).not.toHaveBeenCalled();
    expect(adapter.pull).not.toHaveBeenCalled();
    expect(dependencies.evidence.record).not.toHaveBeenCalled();
    expect(dependencies.structural.projectObservation).not.toHaveBeenCalled();
    expect(dependencies.result.project).not.toHaveBeenCalled();
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ outcome: "canceled", dataChanged: false }));
  });

  it("retains evidence and skips projectors in effective shadow mode", async () => {
    const { dependencies } = makeDependencies({ modeReader: { read: vi.fn().mockResolvedValue("shadow") } });
    const result = await execute(dependencies);

    expect(result).toMatchObject({ status: "succeeded", normalizedCount: 1, skippedCount: 1, projectedCount: 0 });
    expect(dependencies.evidence.record).toHaveBeenCalledTimes(1);
    expect(dependencies.structural.projectObservation).not.toHaveBeenCalled();
    expect(dependencies.result.project).not.toHaveBeenCalled();
  });

  it("denies budget before credential resolution or adapter invocation", async () => {
    const { dependencies, adapter, ledger } = makeDependencies({
      budget: { reserve: vi.fn().mockResolvedValue({ allowed: false, cost: 1, reason: "exhausted", retryAt: "2026-10-10T18:05:00.000Z" }) },
    });
    const result = await execute(dependencies);

    expect(result.status).toBe("rate_limited");
    expect(dependencies.credentials.resolve).not.toHaveBeenCalled();
    expect(adapter.pull).not.toHaveBeenCalled();
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ outcome: "rate_limited", nextRetryAt: "2026-10-10T18:05:00.000Z", nextPollAt: "2026-10-10T18:05:00.000Z" }));
  });

  it("fails closed for a missing credential", async () => {
    const { dependencies, adapter, ledger } = makeDependencies();
    const result = await execute(dependencies, { ...runDefaults, credentialRef: null });

    expect(result.status).toBe("failed");
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ outcome: "failed", failureCode: "permanent" }));
    expect(dependencies.credentials.resolve).not.toHaveBeenCalled();
    expect(adapter.pull).not.toHaveBeenCalled();
  });

  it("validates the pull request before reserving budget", async () => {
    const { dependencies } = makeDependencies({
      pullWindowResolver: { resolve: vi.fn().mockReturnValue({ windowStart: "not-a-date", windowEnd: "2026-10-10T18:00:00.000Z" }) },
    });
    const result = await execute(dependencies);

    expect(result.status).toBe("failed");
    expect(dependencies.budget.reserve).not.toHaveBeenCalled();
    expect(dependencies.ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ failureCode: "invalid_response" }));
  });

  it("requires the registry adapter key to match the claimed key", async () => {
    const { dependencies } = makeDependencies({
      adapters: { get: vi.fn().mockReturnValue({ key: "different-adapter", capabilities: new Set(), pull: vi.fn(), classifyError: vi.fn() }) },
    });
    const result = await execute(dependencies);

    expect(result.status).toBe("failed");
    expect(dependencies.budget.reserve).not.toHaveBeenCalled();
    expect(dependencies.ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ failureCode: "permanent" }));
  });

  it.each([
    ["sports", "synthetic-sports", sportsObservation, "projected"],
    ["ceremony", "synthetic-ceremony", ceremonyObservation, "projected"],
  ] as const)("runs a %s adapter through the same provider-neutral path", async (_name, adapterKey, observation, expected) => {
    const { dependencies, adapter } = makeDependencies();
    const ceremonyAdapter: ProviderAdapter = { ...adapter, key: adapterKey, pull: vi.fn().mockResolvedValue(batchFor([observation])) };
    (dependencies.adapters.get as ReturnType<typeof vi.fn>).mockReturnValue(ceremonyAdapter);
    const result = await execute(dependencies, { ...runDefaults, runId: `${adapterKey}-run`, adapterKey });
    expect(result.status).toBe(expected === "projected" ? "succeeded" : "failed");
    expect(ceremonyAdapter.pull).toHaveBeenCalledTimes(1);
  });

  it("invokes one adapter pull with a validated request and never serializes the credential", async () => {
    const { dependencies, adapter } = makeDependencies();
    const credential = "credential-value-must-not-escape";
    (dependencies.credentials.resolve as ReturnType<typeof vi.fn>).mockResolvedValue({ reference: "credential://synthetic", getValue: () => credential });
    const serializedRequests: string[] = [];
    (adapter.pull as ReturnType<typeof vi.fn>).mockImplementation(async (request: unknown) => {
      serializedRequests.push(JSON.stringify(request));
      return batchFor([]);
    });

    const result = await execute(dependencies);
    expect(result.status).toBe("succeeded");
    expect(adapter.pull).toHaveBeenCalledTimes(1);
    expect(serializedRequests[0]).not.toContain(credential);
    expect(dependencies.credentials.resolve).toHaveBeenCalledWith(runDefaults.credentialRef);
  });

  it("treats a malformed adapter batch as terminal invalid_response", async () => {
    const { dependencies, adapter } = makeDependencies();
    (adapter.pull as ReturnType<typeof vi.fn>).mockResolvedValue({ observations: "not-an-array" });
    const result = await execute(dependencies);

    expect(result.status).toBe("failed");
    expect(dependencies.ledger.recordResponse).not.toHaveBeenCalled();
    expect(dependencies.ledger.commitPage).not.toHaveBeenCalled();
    expect(dependencies.ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ failureCode: "invalid_response" }));
    expect(adapter.classifyError).not.toHaveBeenCalled();
  });

  it("records rate-limit metadata and renews before provider and page operations", async () => {
    const { dependencies, adapter, ledger } = makeDependencies();
    (ledger.renew as ReturnType<typeof vi.fn>).mockResolvedValue({ run_id: "run-1", lease_expires_at: "2026-10-10T18:00:30.000Z" });
    (adapter.pull as ReturnType<typeof vi.fn>).mockResolvedValue(batchFor([sportsObservation], {
      rateLimit: { limit: 10, remaining: 9, resetAt: "2026-10-10T19:00:00.000Z", retryAfterAt: "2026-10-10T18:01:00.000Z" },
    }));
    const nearExpiry = { ...runDefaults, leaseExpiresAt: "2026-10-10T18:00:30.000Z" };
    const result = await execute(dependencies, nearExpiry);

    expect(result.status).toBe("succeeded");
    expect(ledger.renew).toHaveBeenCalledTimes(2);
    expect(dependencies.ledger.recordResponse).toHaveBeenCalledWith(expect.objectContaining({
      observedAt: "2026-10-10T18:00:00.000Z",
      rateLimitLimit: 10,
      rateLimitRemaining: 9,
      rateLimitResetAt: "2026-10-10T19:00:00.000Z",
      retryAfterAt: "2026-10-10T18:01:00.000Z",
    }));
    expect((ledger.renew as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]).toBeLessThan((adapter.pull as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]);
    expect((ledger.renew as ReturnType<typeof vi.fn>).mock.invocationCallOrder[1]).toBeLessThan((ledger.commitPage as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]);
  });

  it("propagates lease loss without attempting an unauthorized finish", async () => {
    const ledger = makeLedger({ renew: vi.fn().mockRejectedValue(new RunLedgerRepositoryError("lease_lost", "lease_lost")) });
    const { dependencies } = makeDependencies({ ledger });
    await expect(execute(dependencies, { ...runDefaults, leaseExpiresAt: "2026-10-10T18:00:30.000Z" })).rejects.toMatchObject({ kind: "lease_lost" });
    expect(ledger.finish).not.toHaveBeenCalled();
  });

  it("preserves omitted cursor and ETag and schedules a next-cursor batch immediately", async () => {
    const { dependencies, ledger } = makeDependencies();
    ((dependencies.adapters.get("synthetic-sports") as ProviderAdapter).pull as ReturnType<typeof vi.fn>).mockResolvedValue(batchFor([], { nextCursor: { page: 1 }, etag: undefined }));
    const result = await execute(dependencies);

    expect(result.status).toBe("partial");
    expect(ledger.commitPage).toHaveBeenCalledWith(expect.objectContaining({
      expectedCursor: runDefaults.providerCursor,
      expectedEtag: runDefaults.providerEtag,
      nextCursor: { page: 1 },
      responseEtag: runDefaults.providerEtag,
    }));
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ outcome: "partial", nextPollAt: "2026-10-10T18:00:00.000Z" }));
  });

  it("treats an empty batch as successful and preserves the checkpoint values", async () => {
    const { dependencies, ledger } = makeDependencies();
    ((dependencies.adapters.get("synthetic-sports") as ProviderAdapter).pull as ReturnType<typeof vi.fn>).mockResolvedValue(batchFor([], { etag: undefined }));
    const result = await execute(dependencies);

    expect(result).toMatchObject({ status: "succeeded", fetchedCount: 0, normalizedCount: 0 });
    expect(ledger.commitPage).toHaveBeenCalledWith(expect.objectContaining({
      nextCursor: runDefaults.providerCursor,
      responseEtag: runDefaults.providerEtag,
    }));
  });

  it.each([
    ["timeout", "failed", "backoff"],
    ["rate_limited", "rate_limited", "provider_reset"],
    ["authentication", "failed", "never"],
  ] as const)("classifies %s adapter failures as %s with %s policy", async (code, status, retry) => {
    const { dependencies, adapter, ledger } = makeDependencies();
    (adapter.classifyError as ReturnType<typeof vi.fn>).mockReturnValue({
      code,
      retry,
      message: "synthetic adapter failure",
      details: { safe: true },
    });
    (adapter.pull as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("adapter failure"));

    const result = await execute(dependencies);
    expect(result.status).toBe(status);
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ outcome: status, failureCode: code }));
    if (status === "rate_limited" || retry === "backoff") expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ nextRetryAt: expect.any(String) }));
  });

  it("filters sensitive failure keys from persisted metadata", async () => {
    const { dependencies, adapter, ledger } = makeDependencies();
    (adapter.classifyError as ReturnType<typeof vi.fn>).mockReturnValue({
      code: "provider_server",
      retry: "backoff",
      message: "safe message",
      details: {
        safe: { value: true },
        authorization: "secret",
        nested: { cookie: "secret", visible: "yes" },
      },
    });
    (adapter.pull as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("provider failure"));

    await execute(dependencies);
    const finishInput = (ledger.finish as ReturnType<typeof vi.fn>).mock.calls[0][0] as { metadata: Record<string, unknown> };
    expect(finishInput.metadata).toEqual({ safe: { value: true }, nested: { visible: "yes" } });
    expect(JSON.stringify(finishInput)).not.toContain("authorization");
    expect(JSON.stringify(finishInput)).not.toContain("secret");
  });

  it("withholds page commit when a later observation fails after earlier effects", async () => {
    const { dependencies, ledger } = makeDependencies();
    (dependencies.evidence.record as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ outcome: "inserted", observationId: "observation-1" })
      .mockRejectedValueOnce(new Error("synthetic later failure"));
    ((dependencies.adapters.get("synthetic-sports") as ProviderAdapter).pull as ReturnType<typeof vi.fn>).mockResolvedValue(batchFor([sportsObservation, { ...sportsObservation, externalId: "match-2" }]));

    const result = await execute(dependencies);
    expect(result).toMatchObject({ status: "failed", normalizedCount: 2, failedCount: 1 });
    expect(dependencies.evidence.record).toHaveBeenCalledTimes(2);
    expect(dependencies.structural.projectObservation).toHaveBeenCalledTimes(1);
    expect(ledger.commitPage).not.toHaveBeenCalled();
  });
});
