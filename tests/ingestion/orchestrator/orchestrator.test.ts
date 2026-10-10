import { describe, expect, it, vi } from "vitest";

import type { ProviderBatch, NormalizedObservation, JsonObject } from "@/lib/ingestion/contracts";
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
  commitPage: vi.fn().mockImplementation(async (input: {
    runId: string;
    expectedCheckpointGeneration: number;
    nextCursor: JsonObject;
    responseEtag?: string;
    expectedEtag?: string;
  }) => ({
    outcome: "committed",
    pageLedgerId: `page-${input.expectedCheckpointGeneration + 1}`,
    runId: input.runId,
    checkpointGeneration: input.expectedCheckpointGeneration + 1,
    cursorAfter: input.nextCursor,
    providerEtag: input.responseEtag ?? input.expectedEtag ?? null,
  })),
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
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ outcome: "failed", failureCode: "system:missing_credential", nextPollAt: expect.any(String) }));
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
    expect(dependencies.ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ failureCode: "system:invalid_request", nextPollAt: expect.any(String) }));
  });

  it("requires the registry adapter key to match the claimed key", async () => {
    const { dependencies } = makeDependencies({
      adapters: { get: vi.fn().mockReturnValue({ key: "different-adapter", capabilities: new Set(), pull: vi.fn(), classifyError: vi.fn() }) },
    });
    const result = await execute(dependencies);

    expect(result.status).toBe("failed");
    expect(dependencies.budget.reserve).not.toHaveBeenCalled();
    expect(dependencies.ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ failureCode: "system:adapter_mismatch", nextPollAt: expect.any(String) }));
  });

  it.each([
    ["sports", "synthetic-sports", sportsObservation, "projected"],
    ["ceremony", "synthetic-ceremony", ceremonyObservation, "projected"],
  ] as const)("runs a %s adapter through the same provider-neutral path", async (_name, adapterKey, _observation, expected) => {
    const seen: NormalizedObservation[] = [];
    const { dependencies } = makeDependencies({
      dispatcher: {
        dispatch: vi.fn().mockImplementation(async ({ observation: normalized }: { observation: NormalizedObservation }) => {
          seen.push(normalized);
          return { disposition: "projected", dataChanged: true };
        }),
      },
    });
    const sportsRaw = { match_id: "match-1", home_team: "North", away_team: "South", home_score: 2, away_score: 1, state: "final" };
    const ceremonyRaw = { category_code: "category-best-picture", label: "Best Picture", nominee_codes: ["film-a", "film-b"], winner_code: "film-a", state: "awarded" };
    const sportsAdapter: ProviderAdapter = {
      key: "synthetic-sports",
      capabilities: new Set(),
      pull: vi.fn().mockImplementation(async () => {
        const normalized: NormalizedObservation = {
          ...sportsObservation,
          externalId: sportsRaw.match_id,
          sanitizedPayload: sportsRaw,
          data: { ...sportsObservation.data, contestKey: sportsRaw.match_id, name: `${sportsRaw.home_team} v ${sportsRaw.away_team}` },
        };
        return batchFor([normalized]);
      }),
      classifyError: vi.fn<ProviderAdapter["classifyError"]>(() => ({ code: "permanent", retry: "never", message: "sports failure", details: {} })),
    };
    const ceremonyAdapter: ProviderAdapter = {
      key: "synthetic-ceremony",
      capabilities: new Set(),
      pull: vi.fn().mockImplementation(async () => {
        const normalized: NormalizedObservation = {
          ...ceremonyObservation,
          externalId: ceremonyRaw.category_code,
          sanitizedPayload: ceremonyRaw,
          data: { ...ceremonyObservation.data, contestExternalId: ceremonyRaw.category_code, resultData: { winner: ceremonyRaw.winner_code } },
        };
        return batchFor([normalized]);
      }),
      classifyError: vi.fn<ProviderAdapter["classifyError"]>(() => ({ code: "permanent", retry: "never", message: "ceremony failure", details: {} })),
    };
    (dependencies.adapters.get as ReturnType<typeof vi.fn>).mockImplementation((key: string) => key === "synthetic-sports" ? sportsAdapter : ceremonyAdapter);
    const result = await execute(dependencies, { ...runDefaults, runId: `${adapterKey}-run`, adapterKey });
    expect(result.status).toBe(expected === "projected" ? "succeeded" : "failed");
    expect((adapterKey === "synthetic-sports" ? sportsAdapter : ceremonyAdapter).pull).toHaveBeenCalledTimes(1);
    expect(seen).toHaveLength(1);
    if (adapterKey === "synthetic-sports") {
      expect(seen[0].data).toMatchObject({ contestKey: "match-1", name: "North v South" });
      expect(seen[0].sanitizedPayload).toMatchObject({ home_team: "North", home_score: 2 });
    } else {
      expect(seen[0].data).toMatchObject({ contestExternalId: "category-best-picture", resultData: { winner: "film-a" } });
      expect(seen[0].sanitizedPayload).toMatchObject({ category_code: "category-best-picture", winner_code: "film-a" });
    }
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
    expect(dependencies.ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ failureCode: "provider:invalid_response", nextPollAt: expect.any(String) }));
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
    expect(ledger.renew).toHaveBeenCalledTimes(3);
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
    ((dependencies.adapters.get("synthetic-sports") as ProviderAdapter).pull as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(batchFor([], { nextCursor: { page: 1 }, etag: undefined }))
      .mockResolvedValueOnce(batchFor([], { etag: undefined }));
    const result = await execute(dependencies);

    expect(result.status).toBe("succeeded");
    expect((dependencies.adapters.get("synthetic-sports") as ProviderAdapter).pull).toHaveBeenCalledTimes(2);
    expect(ledger.commitPage).toHaveBeenCalledWith(expect.objectContaining({
      expectedCursor: runDefaults.providerCursor,
      expectedEtag: runDefaults.providerEtag,
      nextCursor: { page: 1 },
      responseEtag: runDefaults.providerEtag,
    }));
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ outcome: "succeeded", nextPollAt: "2026-10-10T18:00:30.000Z" }));
  });

  it("progresses through two pages using each committed cursor, ETag, and generation", async () => {
    const firstPage = batchFor([sportsObservation], { nextCursor: { page: 1 }, etag: "etag-1" });
    const secondPage = batchFor([], { etag: "etag-2" });
    const { dependencies, ledger } = makeDependencies();
    const adapter = dependencies.adapters.get("synthetic-sports") as ProviderAdapter;
    (adapter.pull as ReturnType<typeof vi.fn>).mockResolvedValueOnce(firstPage).mockResolvedValueOnce(secondPage);
    (ledger.commitPage as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        outcome: "committed",
        pageLedgerId: "page-1",
        runId: runDefaults.runId,
        checkpointGeneration: 1,
        cursorAfter: { page: 1 },
        providerEtag: "etag-1",
      })
      .mockResolvedValueOnce({
        outcome: "committed",
        pageLedgerId: "page-2",
        runId: runDefaults.runId,
        checkpointGeneration: 2,
        cursorAfter: { page: 1 },
        providerEtag: "etag-2",
      });

    const result = await execute(dependencies);

    expect(result).toMatchObject({ status: "succeeded", fetchedCount: 1, normalizedCount: 1, projectedCount: 1 });
    expect(adapter.pull).toHaveBeenCalledTimes(2);
    expect(adapter.pull).toHaveBeenNthCalledWith(1, expect.objectContaining({ cursor: { page: 0 }, etag: "etag-0", requestedAt: expect.any(String) }));
    expect(adapter.pull).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: { page: 1 }, etag: "etag-1", requestedAt: expect.any(String) }));
    expect(ledger.commitPage).toHaveBeenNthCalledWith(1, expect.objectContaining({ expectedCheckpointGeneration: 0, expectedCursor: { page: 0 }, expectedEtag: "etag-0", nextCursor: { page: 1 }, responseEtag: "etag-1" }));
    expect(ledger.commitPage).toHaveBeenNthCalledWith(2, expect.objectContaining({ expectedCheckpointGeneration: 1, expectedCursor: { page: 1 }, expectedEtag: "etag-1", nextCursor: { page: 1 }, responseEtag: "etag-2" }));
  });

  it("chains three pages with fresh budget reservations and one credential resolution", async () => {
    const { dependencies, ledger } = makeDependencies();
    const adapter = dependencies.adapters.get("synthetic-sports") as ProviderAdapter;
    let pullIndex = 0;
    (adapter.pull as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      pullIndex += 1;
      return pullIndex < 3
        ? batchFor([sportsObservation], { nextCursor: { page: pullIndex }, etag: `etag-${pullIndex}` })
        : batchFor([] , { etag: "etag-2" });
    });
    (ledger.commitPage as ReturnType<typeof vi.fn>).mockImplementation(async (input: { expectedCheckpointGeneration: number; nextCursor: { page: number }; responseEtag?: string }) => ({
      outcome: "committed",
      pageLedgerId: `page-${input.expectedCheckpointGeneration + 1}`,
      runId: runDefaults.runId,
      checkpointGeneration: input.expectedCheckpointGeneration + 1,
      cursorAfter: input.nextCursor,
      providerEtag: input.responseEtag ?? null,
    }));

    const result = await execute(dependencies);

    expect(result).toMatchObject({ status: "succeeded", fetchedCount: 2, normalizedCount: 2, projectedCount: 2 });
    expect(adapter.pull).toHaveBeenCalledTimes(3);
    expect(dependencies.budget.reserve).toHaveBeenCalledTimes(3);
    expect(dependencies.credentials.resolve).toHaveBeenCalledTimes(1);
    expect(adapter.pull).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: { page: 1 }, etag: "etag-1" }));
    expect(adapter.pull).toHaveBeenNthCalledWith(3, expect.objectContaining({ cursor: { page: 2 }, etag: "etag-2" }));
  });

  it("uses a replayed page outcome as the authoritative checkpoint for the next page", async () => {
    const { dependencies, ledger } = makeDependencies();
    const adapter = dependencies.adapters.get("synthetic-sports") as ProviderAdapter;
    (adapter.pull as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(batchFor([], { nextCursor: { page: 1 }, etag: "etag-1" }))
      .mockResolvedValueOnce(batchFor([]));
    (ledger.commitPage as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ outcome: "replayed", pageLedgerId: "page-existing", runId: runDefaults.runId, checkpointGeneration: 1, cursorAfter: { page: 1 }, providerEtag: "etag-1" })
      .mockResolvedValueOnce({ outcome: "committed", pageLedgerId: "page-new", runId: runDefaults.runId, checkpointGeneration: 2, cursorAfter: { page: 1 }, providerEtag: "etag-1" });

    await execute(dependencies);

    expect(adapter.pull).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: { page: 1 }, etag: "etag-1" }));
    expect(ledger.commitPage).toHaveBeenNthCalledWith(2, expect.objectContaining({ expectedCheckpointGeneration: 1, expectedCursor: { page: 1 }, expectedEtag: "etag-1" }));
  });

  it("fails closed when a committed page outcome contains an unknown field", async () => {
    const ledger = makeLedger({
      commitPage: vi.fn().mockResolvedValue({
        outcome: "committed",
        pageLedgerId: "page-1",
        runId: runDefaults.runId,
        checkpointGeneration: 1,
        cursorAfter: runDefaults.providerCursor,
        providerEtag: runDefaults.providerEtag,
        unexpected: true,
      } as never),
    });
    const { dependencies, adapter } = makeDependencies({
      ledger,
    });

    const result = await execute(dependencies);

    expect(result).toMatchObject({ status: "failed", projectedCount: 1 });
    expect(adapter.pull).toHaveBeenCalledTimes(1);
    expect(ledger.commitPage).toHaveBeenCalledTimes(1);
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "failed",
      failureCode: "system:page_commit_failed",
      dataChanged: true,
      metadata: { stage: "page_commit_outcome" },
      nextPollAt: expect.any(String),
    }));
  });

  it.each([
    ["invalid outcome", { outcome: "ignored" }],
    ["blank page ledger id", { pageLedgerId: " " }],
    ["wrong run id", { runId: "other-run" }],
    ["whitespace-padded run id", { runId: " run-1 " }],
    ["negative generation", { checkpointGeneration: -1 }],
    ["fractional generation", { checkpointGeneration: 1.5 }],
    ["unsafe generation", { checkpointGeneration: Number.MAX_SAFE_INTEGER + 1 }],
    ["unchanged generation", { checkpointGeneration: 0 }],
    ["skipped generation", { checkpointGeneration: 2 }],
    ["malformed cursor", { cursorAfter: null }],
    ["blank provider ETag", { providerEtag: " " }],
    ["oversized provider ETag", { providerEtag: "e".repeat(1025) }],
    ["control-character provider ETag", { providerEtag: "safe\nunsafe" }],
  ] as const)("rejects %s in a page commit outcome without another pull", async (_name, change) => {
    const ledger = makeLedger({
      commitPage: vi.fn().mockResolvedValue({
        outcome: "committed",
        pageLedgerId: "page-1",
        runId: runDefaults.runId,
        checkpointGeneration: 1,
        cursorAfter: runDefaults.providerCursor,
        providerEtag: runDefaults.providerEtag,
        ...change,
      } as never),
    });
    const { dependencies, adapter } = makeDependencies({ ledger });

    const result = await execute(dependencies);

    expect(result).toMatchObject({ status: "failed", projectedCount: 1 });
    expect(adapter.pull).toHaveBeenCalledTimes(1);
    expect(ledger.commitPage).toHaveBeenCalledTimes(1);
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({
      failureCode: "system:page_commit_failed",
      dataChanged: true,
      metadata: { stage: "page_commit_outcome" },
      nextPollAt: expect.any(String),
    }));
  });

  it.each([
    ["current", { page: 0 }],
    ["inconsistent", { page: 99 }],
  ] as const)("rejects a %s cursor returned for a continuation commit", async (_name, cursorAfter) => {
    const ledger = makeLedger({
      commitPage: vi.fn().mockResolvedValue({
        outcome: "committed",
        pageLedgerId: "page-1",
        runId: runDefaults.runId,
        checkpointGeneration: 1,
        cursorAfter,
        providerEtag: runDefaults.providerEtag,
      }),
    });
    const { dependencies, adapter } = makeDependencies({ ledger });
    (adapter.pull as ReturnType<typeof vi.fn>).mockResolvedValue(batchFor([], { nextCursor: { page: 1 } }));

    const result = await execute(dependencies);

    expect(result.status).toBe("failed");
    expect(adapter.pull).toHaveBeenCalledTimes(1);
    expect(ledger.commitPage).toHaveBeenCalledTimes(1);
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ failureCode: "system:page_commit_failed" }));
  });

  it("conservatively converts a throwing raw ETag getter into invalid response", async () => {
    const { dependencies, ledger, adapter } = makeDependencies();
    const candidate = batchFor([]) as unknown as Record<string, unknown>;
    Object.defineProperty(candidate, "etag", { get: () => { throw new Error("etag getter"); } });
    (adapter.pull as ReturnType<typeof vi.fn>).mockResolvedValue(candidate);

    const result = await execute(dependencies);

    expect(result.status).toBe("failed");
    expect(ledger.recordResponse).not.toHaveBeenCalled();
    expect(ledger.commitPage).not.toHaveBeenCalled();
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ failureCode: "provider:invalid_response" }));
  });

  it("conservatively converts a throwing raw ETag proxy into invalid response", async () => {
    const { dependencies, ledger, adapter } = makeDependencies();
    const candidate = new Proxy(batchFor([], { etag: "etag-proxy" }), {
      get(target, property, receiver) {
        if (property === "etag") throw new Error("etag proxy getter");
        return Reflect.get(target, property, receiver);
      },
    });
    (adapter.pull as ReturnType<typeof vi.fn>).mockResolvedValue(candidate);

    const result = await execute(dependencies);

    expect(result.status).toBe("failed");
    expect(dependencies.evidence.record).not.toHaveBeenCalled();
    expect(ledger.recordResponse).not.toHaveBeenCalled();
    expect(ledger.commitPage).not.toHaveBeenCalled();
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ failureCode: "provider:invalid_response" }));
  });

  it("stops on a later page conflict after prior pages commit", async () => {
    const { dependencies, ledger, adapter } = makeDependencies();
    (adapter.pull as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(batchFor([], { nextCursor: { page: 1 } }))
      .mockResolvedValueOnce(batchFor([]));
    (ledger.commitPage as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        outcome: "committed",
        pageLedgerId: "page-1",
        runId: runDefaults.runId,
        checkpointGeneration: 1,
        cursorAfter: { page: 1 },
        providerEtag: runDefaults.providerEtag,
      })
      .mockRejectedValueOnce(new RunLedgerRepositoryError("page_conflict", "later page conflict"));

    const result = await execute(dependencies);

    expect(result.status).toBe("failed");
    expect(adapter.pull).toHaveBeenCalledTimes(2);
    expect(ledger.commitPage).toHaveBeenCalledTimes(2);
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ failureCode: "system:page_conflict" }));
  });

  it("denies a later page budget reservation before making its pull", async () => {
    const { dependencies, ledger, adapter } = makeDependencies({
      budget: { reserve: vi.fn().mockResolvedValueOnce({ allowed: true, cost: 1, reason: "available" }).mockResolvedValueOnce({ allowed: false, cost: 1, reason: "exhausted", retryAt: "2026-10-10T18:05:00.000Z" }) },
    });
    (adapter.pull as ReturnType<typeof vi.fn>).mockResolvedValue(batchFor([], { nextCursor: { page: 1 } }));

    const result = await execute(dependencies);

    expect(result.status).toBe("rate_limited");
    expect(adapter.pull).toHaveBeenCalledTimes(1);
    expect(ledger.commitPage).toHaveBeenCalledTimes(1);
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ outcome: "rate_limited", nextRetryAt: "2026-10-10T18:05:00.000Z" }));
  });

  it("preserves prior-page aggregate counts when a later provider call fails", async () => {
    const { dependencies, ledger, adapter } = makeDependencies();
    (adapter.pull as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(batchFor([sportsObservation], { nextCursor: { page: 1 } }))
      .mockRejectedValueOnce(new Error("later provider failure"));
    (adapter.classifyError as ReturnType<typeof vi.fn>).mockReturnValue({ code: "timeout", retry: "backoff", message: "later failure", details: {} });

    const result = await execute(dependencies);

    expect(result).toMatchObject({ status: "failed", fetchedCount: 1, normalizedCount: 1, projectedCount: 1, failedCount: 0 });
    expect(ledger.commitPage).toHaveBeenCalledTimes(1);
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ failureCode: "provider:timeout" }));
  });

  it("withholds only a later page checkpoint when later dispatch fails", async () => {
    const { dependencies, ledger, adapter } = makeDependencies({
      dispatcher: {
        dispatch: vi.fn().mockRejectedValue(new Error("later dispatch failure")),
      },
    });
    (adapter.pull as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(batchFor([], { nextCursor: { page: 1 } }))
      .mockResolvedValueOnce(batchFor([sportsObservation]));

    const result = await execute(dependencies);

    expect(result).toMatchObject({ status: "failed", normalizedCount: 1, failedCount: 1 });
    expect(adapter.pull).toHaveBeenCalledTimes(2);
    expect(ledger.commitPage).toHaveBeenCalledTimes(1);
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ failureCode: "system:observation_dispatch_failed" }));
  });

  it("propagates lease loss during a later page without finishing", async () => {
    const { dependencies, ledger, adapter } = makeDependencies();
    let renewCalls = 0;
    (ledger.renew as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      renewCalls += 1;
      if (renewCalls === 4) throw new RunLedgerRepositoryError("lease_lost", "later page lease lost");
      return { run_id: runDefaults.runId, lease_expires_at: "2026-10-10T18:00:30.000Z" };
    });
    (adapter.pull as ReturnType<typeof vi.fn>).mockResolvedValue(batchFor([], { nextCursor: { page: 1 } }));

    await expect(execute(dependencies, { ...runDefaults, leaseExpiresAt: "2026-10-10T18:00:30.000Z" })).rejects.toMatchObject({ kind: "lease_lost" });
    expect(adapter.pull).toHaveBeenCalledTimes(1);
    expect(ledger.commitPage).toHaveBeenCalledTimes(1);
    expect(ledger.finish).not.toHaveBeenCalled();
  });

  it("stops pagination on a later checkpoint conflict", async () => {
    const { dependencies, ledger, adapter } = makeDependencies();
    (adapter.pull as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(batchFor([], { nextCursor: { page: 1 } }))
      .mockResolvedValueOnce(batchFor([]));
    (ledger.commitPage as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ outcome: "committed", pageLedgerId: "page-1", runId: runDefaults.runId, checkpointGeneration: 1, cursorAfter: { page: 1 }, providerEtag: "etag-0" })
      .mockRejectedValueOnce(new RunLedgerRepositoryError("checkpoint_conflict", "later checkpoint conflict"));

    const result = await execute(dependencies);

    expect(result.status).toBe("failed");
    expect(adapter.pull).toHaveBeenCalledTimes(2);
    expect(ledger.commitPage).toHaveBeenCalledTimes(2);
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ failureCode: "system:checkpoint_conflict" }));
  });

  it("detects a historical cursor cycle before dispatching or committing the offending page", async () => {
    const { dependencies, ledger, adapter } = makeDependencies();
    (adapter.pull as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(batchFor([], { nextCursor: { page: 1 } }))
      .mockResolvedValueOnce(batchFor([sportsObservation], { nextCursor: { page: 0 } }));
    (ledger.commitPage as ReturnType<typeof vi.fn>).mockImplementation(async (input: { expectedCheckpointGeneration: number; nextCursor: { page: number }; expectedEtag?: string }) => ({
      outcome: "committed",
      pageLedgerId: `page-${input.expectedCheckpointGeneration + 1}`,
      runId: runDefaults.runId,
      checkpointGeneration: input.expectedCheckpointGeneration + 1,
      cursorAfter: input.nextCursor,
      providerEtag: "etag-0",
    }));

    const result = await execute(dependencies);

    expect(result.status).toBe("failed");
    expect(adapter.pull).toHaveBeenCalledTimes(2);
    expect(dependencies.evidence.record).not.toHaveBeenCalled();
    expect(ledger.commitPage).toHaveBeenCalledTimes(1);
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ failureCode: "provider:invalid_response" }));
  });

  it("rejects a commit outcome that returns a genuinely previously committed cursor", async () => {
    const { dependencies, ledger, adapter } = makeDependencies();
    (adapter.pull as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(batchFor([sportsObservation], { nextCursor: { page: 1 }, etag: "etag-1" }))
      .mockResolvedValueOnce(batchFor([sportsObservation], { nextCursor: { page: 2 }, etag: "etag-2" }));
    (ledger.commitPage as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        outcome: "committed",
        pageLedgerId: "page-1",
        runId: runDefaults.runId,
        checkpointGeneration: 1,
        cursorAfter: { page: 1 },
        providerEtag: "etag-1",
      })
      .mockResolvedValueOnce({
        outcome: "replayed",
        pageLedgerId: "page-2",
        runId: runDefaults.runId,
        checkpointGeneration: 2,
        cursorAfter: { page: 1 },
        providerEtag: "etag-2",
      });

    const result = await execute(dependencies);

    expect(result).toMatchObject({ status: "failed", projectedCount: 2 });
    expect(adapter.pull).toHaveBeenCalledTimes(2);
    expect(ledger.commitPage).toHaveBeenCalledTimes(2);
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({
      failureCode: "system:page_commit_failed",
      dataChanged: true,
      metadata: { stage: "page_commit_outcome" },
      nextPollAt: expect.any(String),
    }));
  });

  it("commits exactly 25 pages and yields without a 26th pull", async () => {
    const { dependencies, ledger, adapter } = makeDependencies();
    let page = 0;
    (adapter.pull as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      page += 1;
      return batchFor([], { nextCursor: { page }, etag: `etag-${page}` });
    });
    (ledger.commitPage as ReturnType<typeof vi.fn>).mockImplementation(async (input: { expectedCheckpointGeneration: number; nextCursor: { page: number }; responseEtag?: string }) => ({
      outcome: "committed",
      pageLedgerId: `page-${input.expectedCheckpointGeneration + 1}`,
      runId: runDefaults.runId,
      checkpointGeneration: input.expectedCheckpointGeneration + 1,
      cursorAfter: input.nextCursor,
      providerEtag: input.responseEtag ?? null,
    }));

    const result = await execute(dependencies);

    expect(result.status).toBe("partial");
    expect(adapter.pull).toHaveBeenCalledTimes(25);
    expect(ledger.commitPage).toHaveBeenCalledTimes(25);
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ outcome: "partial", nextPollAt: "2026-10-10T18:00:00.000Z" }));
  });

  it("completes on page 25 when no continuation cursor remains", async () => {
    const { dependencies, ledger, adapter } = makeDependencies();
    let page = 0;
    (adapter.pull as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      page += 1;
      return batchFor([], page < 25 ? { nextCursor: { page } } : {});
    });
    (ledger.commitPage as ReturnType<typeof vi.fn>).mockImplementation(async (input: { expectedCheckpointGeneration: number; nextCursor: { page: number }; expectedEtag?: string }) => ({
      outcome: "committed",
      pageLedgerId: `page-${input.expectedCheckpointGeneration + 1}`,
      runId: runDefaults.runId,
      checkpointGeneration: input.expectedCheckpointGeneration + 1,
      cursorAfter: input.nextCursor,
      providerEtag: input.expectedEtag ?? null,
    }));

    const result = await execute(dependencies);

    expect(result.status).toBe("succeeded");
    expect(adapter.pull).toHaveBeenCalledTimes(25);
    expect(ledger.commitPage).toHaveBeenCalledTimes(25);
  });

  it("rejects unsafe raw page ETags before dispatch or checkpoint commit", async () => {
    const { dependencies, ledger, adapter } = makeDependencies();
    (adapter.pull as ReturnType<typeof vi.fn>).mockResolvedValue(batchFor([], { etag: ` ${"e".repeat(1024)} ` } as never));

    const result = await execute(dependencies);

    expect(result.status).toBe("failed");
    expect(dependencies.evidence.record).not.toHaveBeenCalled();
    expect(ledger.recordResponse).not.toHaveBeenCalled();
    expect(ledger.commitPage).not.toHaveBeenCalled();
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ failureCode: "provider:invalid_response" }));
  });

  it("rejects control-character raw page ETags before dispatch", async () => {
    const { dependencies, ledger, adapter } = makeDependencies();
    (adapter.pull as ReturnType<typeof vi.fn>).mockResolvedValue(batchFor([], { etag: "safe\nunsafe" } as never));

    const result = await execute(dependencies);

    expect(result.status).toBe("failed");
    expect(dependencies.evidence.record).not.toHaveBeenCalled();
    expect(ledger.recordResponse).not.toHaveBeenCalled();
    expect(ledger.commitPage).not.toHaveBeenCalled();
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ failureCode: "provider:invalid_response" }));
  });

  it("stops before dispatch when a cursor repeats immediately", async () => {
    const { dependencies, ledger, adapter } = makeDependencies();
    (adapter.pull as ReturnType<typeof vi.fn>).mockResolvedValue(batchFor([sportsObservation], { nextCursor: { page: 0 } }));

    const result = await execute(dependencies);

    expect(result.status).toBe("failed");
    expect(dependencies.evidence.record).not.toHaveBeenCalled();
    expect(ledger.commitPage).not.toHaveBeenCalled();
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({
      failureCode: "provider:invalid_response",
      errorMessage: "Provider execution failed: invalid_response",
    }));
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
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ outcome: status, failureCode: `provider:${code}`, nextPollAt: expect.any(String) }));
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

  it("fails closed for malformed claimed and current binding modes", async () => {
    for (const [run, currentMode] of [
      [{ ...runDefaults, mode: "unexpected" as never }, "write"],
      [runDefaults, "unexpected" as never],
    ] as const) {
      const { dependencies, ledger } = makeDependencies({
        modeReader: { read: vi.fn().mockResolvedValue(currentMode) as never },
      });
      const result = await execute(dependencies, run);
      expect(result.status).toBe("failed");
      expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({
        failureCode: "system:invalid_binding_mode",
        nextPollAt: expect.any(String),
      }));
      expect(dependencies.budget.reserve).not.toHaveBeenCalled();
      expect(dependencies.credentials.resolve).not.toHaveBeenCalled();
      expect(dependencies.evidence.record).not.toHaveBeenCalled();
    }
  });

  it.each([
    { allowed: "false", cost: 1, reason: "available" },
    { allowed: true, cost: 1, reason: "exhausted" },
    { allowed: true, cost: 0, reason: "available" },
    { allowed: true, cost: 2, reason: "available" },
    { allowed: false, cost: 1, reason: "available" },
    { allowed: false, cost: 1, reason: "exhausted", retryAt: "not-a-date" },
    { allowed: false, cost: 1, reason: "unknown_budget", retryAt: "2026-10-10T18:05:00.000Z" },
    { allowed: false, cost: 1, reason: "invalid_budget", retryAt: "2026-10-10T18:05:00.000Z" },
    { allowed: true, cost: 1, reason: "available", unexpected: true },
  ] as const)("fails closed for malformed budget decision %#", async (decision) => {
    const { dependencies, ledger, adapter } = makeDependencies({
      budget: { reserve: vi.fn().mockResolvedValue(decision as never) },
    });
    const result = await execute(dependencies);

    expect(result.status).toBe("rate_limited");
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({
      failureCode: "system:invalid_budget_decision",
      nextPollAt: expect.any(String),
    }));
    expect(dependencies.credentials.resolve).not.toHaveBeenCalled();
    expect(adapter.pull).not.toHaveBeenCalled();
  });

  it("renews before reserving budget and again before the provider call when needed", async () => {
    const { dependencies, adapter, ledger } = makeDependencies();
    const order: string[] = [];
    (ledger.renew as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push("renew");
      return { run_id: runDefaults.runId, lease_expires_at: "2026-10-10T18:00:30.000Z" };
    });
    (dependencies.budget.reserve as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push("budget");
      return { allowed: true, cost: 1, reason: "available" };
    });
    (dependencies.credentials.resolve as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push("credential");
      return { reference: "credential://synthetic", getValue: () => "secret" };
    });
    (adapter.pull as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push("pull");
      return batchFor([]);
    });

    await execute(dependencies, { ...runDefaults, leaseExpiresAt: "2026-10-10T18:00:30.000Z" });

    expect(order.slice(0, 4)).toEqual(["renew", "budget", "credential", "renew"]);
    expect(order.indexOf("renew")).toBeLessThan(order.indexOf("budget"));
    expect(order.indexOf("pull")).toBeGreaterThan(order.indexOf("credential"));
    expect(order.indexOf("pull")).toBeGreaterThan(order.lastIndexOf("renew", order.indexOf("pull")));
  });

  it("uses a fixed namespaced message and omits adapter-controlled failure content", async () => {
    const { dependencies, adapter, ledger } = makeDependencies();
    const sentinel = "credential-token-secret-sentinel";
    (adapter.classifyError as ReturnType<typeof vi.fn>).mockReturnValue({
      code: "provider_server",
      retry: "backoff",
      message: sentinel,
      details: { visible: true, token: sentinel, nested: { body: sentinel } },
    });
    (adapter.pull as ReturnType<typeof vi.fn>).mockRejectedValue(new Error(sentinel));

    await execute(dependencies);

    const finishInput = (ledger.finish as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(finishInput.failureCode).toBe("provider:provider_server");
    expect(finishInput.errorMessage).toBe("Provider execution failed: provider_server");
    expect(JSON.stringify(finishInput)).not.toContain(sentinel);
  });

  it("records validated thrown 429 metadata before the namespaced finish", async () => {
    const { dependencies, adapter, ledger } = makeDependencies();
    const retryAt = "2026-10-10T18:05:00.000Z";
    (adapter.classifyError as ReturnType<typeof vi.fn>).mockReturnValue({
      code: "rate_limited",
      retry: "provider_reset",
      message: "secret response message",
      httpStatus: 429,
      retryAt,
      details: { safe: true },
    });
    (adapter.pull as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("secret raw error"));

    const result = await execute(dependencies);

    expect(result.status).toBe("rate_limited");
    expect(ledger.recordResponse).toHaveBeenCalledWith(expect.objectContaining({
      observedAt: "2026-10-10T18:00:00.000Z",
      httpStatus: 429,
      retryAfterAt: retryAt,
    }));
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({
      failureCode: "provider:rate_limited",
      nextPollAt: retryAt,
      nextRetryAt: retryAt,
    }));
    expect((ledger.recordResponse as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0])
      .toBeLessThan((ledger.finish as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]);
  });

  it.each([
    ["mode reader", { modeReader: { read: vi.fn().mockRejectedValue(new Error("mode port")) } }, "system:binding_mode_read_failed"],
    ["adapter registry", { adapters: { get: vi.fn().mockImplementation(() => { throw new Error("registry port"); }) } }, "system:adapter_registry_failed"],
    ["budget repository", { budget: { reserve: vi.fn().mockRejectedValue(new Error("budget port")) } }, "system:budget_reservation_failed"],
    ["credential resolver", { credentials: { resolve: vi.fn().mockRejectedValue(new Error("credential port")) } }, "system:credential_resolution_failed"],
    ["response repository", { ledger: makeLedger({ recordResponse: vi.fn().mockRejectedValue(new Error("response port")) }) }, "system:response_recording_failed"],
    ["lease renewal", { ledger: makeLedger({ renew: vi.fn().mockRejectedValue(new Error("renew port")) }) }, "system:lease_renewal_failed"],
  ] as const)("fails safely when the %s fails", async (_name, overrides, expectedCode) => {
    const { dependencies, adapter } = makeDependencies(overrides as Partial<OrchestratorDependencies>);
    const ledger = dependencies.ledger;
    const nearExpiry = { ...runDefaults, leaseExpiresAt: "2026-10-10T18:00:30.000Z" };
    const result = await execute(dependencies, nearExpiry);

    expect(result.status).toBe("failed");
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ failureCode: expectedCode, nextPollAt: expect.any(String) }));
    if (_name === "response repository") expect(adapter.pull).toHaveBeenCalledTimes(1);
    else expect(adapter.pull).not.toHaveBeenCalled();
    expect(dependencies.ledger.commitPage).not.toHaveBeenCalled();
  });

  it.each([
    ["binding mode reader", { modeReader: { read: vi.fn().mockRejectedValue(new RunLedgerRepositoryError("lease_lost", "mode lease lost")) } }],
    ["adapter registry", { adapters: { get: vi.fn().mockImplementation(() => { throw new RunLedgerRepositoryError("lease_lost", "registry lease lost"); }) } }],
    ["budget reservation", { budget: { reserve: vi.fn().mockRejectedValue(new RunLedgerRepositoryError("lease_lost", "budget lease lost")) } }],
    ["credential resolver", { credentials: { resolve: vi.fn().mockRejectedValue(new RunLedgerRepositoryError("lease_lost", "credential lease lost")) } }],
  ] as const)("rethrows lease loss from the %s without finishing", async (_name, overrides) => {
    const { dependencies, adapter } = makeDependencies(overrides as Partial<OrchestratorDependencies>);

    await expect(execute(dependencies)).rejects.toMatchObject({ kind: "lease_lost" });
    expect(dependencies.ledger.finish).not.toHaveBeenCalled();
    expect(dependencies.ledger.commitPage).not.toHaveBeenCalled();
    expect(adapter.pull).not.toHaveBeenCalled();
    expect(dependencies.evidence.record).not.toHaveBeenCalled();
  });

  it("finishes controlled terminal outcomes with a non-null terminal hold", async () => {
    const cases: Array<[
      string,
      Partial<OrchestratorDependencies>,
      Partial<ClaimedIngestionRun>,
    ]> = [
      ["missing credential", {}, { credentialRef: null }],
      ["invalid request", { pullWindowResolver: { resolve: vi.fn().mockReturnValue({ windowStart: "bad", windowEnd: "bad" }) } }, {}],
      ["adapter mismatch", { adapters: { get: vi.fn().mockReturnValue({ key: "wrong", capabilities: new Set(), pull: vi.fn(), classifyError: vi.fn() }) } }, {}],
      ["terminal provider failure", {}, {}],
    ];
    for (const [name, overrides, runOverride] of cases) {
      const { dependencies, adapter, ledger } = makeDependencies(overrides);
      if (name === "terminal provider failure") {
        (adapter.pull as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("terminal"));
        (adapter.classifyError as ReturnType<typeof vi.fn>).mockReturnValue({ code: "permanent", retry: "never", message: "secret", details: {} });
      }
      await execute(dependencies, { ...runDefaults, ...runOverride });
      expect(ledger.finish, name).toHaveBeenCalledWith(expect.objectContaining({ nextPollAt: expect.any(String) }));
    }
  });

  it("replays prior evidence and projection effects before committing a recovered page", async () => {
    const evidenceByKey = new Map<string, string>();
    const projectedObservationIds = new Set<string>();
    const canonicalMutations = new Map<string, number>();
    let failLaterObservationOnce = true;
    const { dependencies, ledger } = makeDependencies({
      evidence: {
        record: vi.fn().mockImplementation(async (input: { externalObjectKind: string; externalObjectId: string; providerRevision?: string }) => {
          const key = `${input.externalObjectKind}:${input.externalObjectId}:${input.providerRevision ?? ""}`;
          const existing = evidenceByKey.get(key);
          if (existing) return { outcome: "exact_replay", observationId: existing };
          if (input.externalObjectId === "match-2" && failLaterObservationOnce) {
            failLaterObservationOnce = false;
            throw new Error("later observation failed");
          }
          const observationId = `observation-${evidenceByKey.size + 1}`;
          evidenceByKey.set(key, observationId);
          return { outcome: "inserted", observationId };
        }),
      },
      structural: {
        projectObservation: vi.fn().mockImplementation(async ({ observationId }: { observationId: string }) => {
          if (projectedObservationIds.has(observationId)) return { kind: "unchanged", canonicalId: `canonical-${observationId}` };
          projectedObservationIds.add(observationId);
          canonicalMutations.set(observationId, (canonicalMutations.get(observationId) ?? 0) + 1);
          return { kind: "projected", canonicalId: `canonical-${observationId}` };
        }),
      },
    });
    const secondObservation = { ...sportsObservation, externalId: "match-2" };
    ((dependencies.adapters.get("synthetic-sports") as ProviderAdapter).pull as ReturnType<typeof vi.fn>)
      .mockResolvedValue(batchFor([sportsObservation, secondObservation]));

    const firstAttempt = await execute(dependencies);
    expect(firstAttempt).toMatchObject({ normalizedCount: 2, projectedCount: 1, failedCount: 1, status: "failed" });
    expect(firstAttempt.projectedCount + firstAttempt.unchangedCount + firstAttempt.quarantinedCount + firstAttempt.skippedCount + firstAttempt.failedCount)
      .toBe(firstAttempt.normalizedCount);
    expect(ledger.commitPage).not.toHaveBeenCalled();
    const recovered = await execute(dependencies);

    expect(recovered).toMatchObject({ normalizedCount: 2, projectedCount: 1, unchangedCount: 1, failedCount: 0 });
    expect(ledger.commitPage).toHaveBeenCalledTimes(1);
    expect(dependencies.evidence.record).toHaveBeenCalledTimes(4);
    expect(dependencies.structural.projectObservation).toHaveBeenCalledTimes(3);
    expect([...canonicalMutations.values()]).toEqual([1, 1]);
    const counts = recovered.projectedCount + recovered.unchangedCount + recovered.quarantinedCount + recovered.skippedCount + recovered.failedCount;
    expect(counts).toBe(recovered.normalizedCount);
  });

  it("replays a committed page statefully without duplicating canonical or ledger effects", async () => {
    const evidenceIds = new Map<string, string>();
    const projectedIds = new Set<string>();
    let pageApplied = 0;
    const ledger = makeLedger({
      commitPage: vi.fn().mockImplementation(async (input: { runId: string; expectedCheckpointGeneration: number; nextCursor: JsonObject; expectedEtag?: string }) => {
        const outcome = {
          outcome: pageApplied === 0 ? "committed" : "replayed",
          pageLedgerId: "page-1",
          runId: input.runId,
          checkpointGeneration: input.expectedCheckpointGeneration + 1,
          cursorAfter: input.nextCursor,
          providerEtag: input.expectedEtag ?? null,
        } as const;
        if (pageApplied === 0) pageApplied += 1;
        return outcome;
      }),
    });
    const { dependencies } = makeDependencies({
      ledger,
      evidence: {
        record: vi.fn().mockImplementation(async (input: { externalObjectId: string }) => {
          const existing = evidenceIds.get(input.externalObjectId);
          if (existing) return { outcome: "exact_replay", observationId: existing };
          const observationId = `observation-${evidenceIds.size + 1}`;
          evidenceIds.set(input.externalObjectId, observationId);
          return { outcome: "inserted", observationId };
        }),
      },
      structural: {
        projectObservation: vi.fn().mockImplementation(async ({ observationId }: { observationId: string }) => {
          if (projectedIds.has(observationId)) return { kind: "unchanged", canonicalId: "canonical-1" };
          projectedIds.add(observationId);
          return { kind: "projected", canonicalId: "canonical-1" };
        }),
      },
    });

    const first = await execute(dependencies);
    const replay = await execute(dependencies);

    expect(first).toMatchObject({ status: "succeeded", projectedCount: 1, unchangedCount: 0 });
    expect(replay).toMatchObject({ status: "succeeded", projectedCount: 0, unchangedCount: 1 });
    expect(dependencies.ledger.commitPage).toHaveBeenCalledTimes(2);
    expect(pageApplied).toBe(1);
    expect(projectedIds.size).toBe(1);
    expect(dependencies.evidence.record).toHaveBeenCalledTimes(2);
  });

  it("commits mixed dispositions only after count conservation holds", async () => {
    const { dependencies, ledger } = makeDependencies();
    const secondObservation = { ...sportsObservation, externalId: "match-2" };
    ((dependencies.adapters.get("synthetic-sports") as ProviderAdapter).pull as ReturnType<typeof vi.fn>)
      .mockResolvedValue(batchFor([sportsObservation, secondObservation]));
    (dependencies.structural.projectObservation as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ kind: "projected", canonicalId: "canonical-1" })
      .mockResolvedValueOnce({ kind: "quarantined", quarantineId: "quarantine-1" });

    const result = await execute(dependencies);

    expect(result).toMatchObject({ status: "partial", normalizedCount: 2, projectedCount: 1, quarantinedCount: 1 });
    expect(ledger.commitPage).toHaveBeenCalledTimes(1);
    expect(result.projectedCount + result.unchangedCount + result.quarantinedCount + result.skippedCount + result.failedCount)
      .toBe(result.normalizedCount);
  });

  it("aggregates mixed dispositions across pages and finishes partial when any page quarantines", async () => {
    const dispositions = ["projected", "unchanged", "quarantined", "skipped"] as const;
    let dispatchIndex = 0;
    const { dependencies, ledger, adapter } = makeDependencies({
      dispatcher: {
        dispatch: vi.fn().mockImplementation(async () => ({ disposition: dispositions[dispatchIndex++], dataChanged: false })),
      },
    });
    const observations = [
      sportsObservation,
      { ...sportsObservation, externalId: "match-2" },
      { ...sportsObservation, externalId: "match-3" },
      { ...sportsObservation, externalId: "match-4" },
    ];
    (adapter.pull as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(batchFor(observations.slice(0, 2), { nextCursor: { page: 1 } }))
      .mockResolvedValueOnce(batchFor(observations.slice(2)));
    (ledger.commitPage as ReturnType<typeof vi.fn>).mockImplementation(async (input: { expectedCheckpointGeneration: number; nextCursor: { page: number }; expectedEtag?: string }) => ({
      outcome: "committed",
      pageLedgerId: `page-${input.expectedCheckpointGeneration + 1}`,
      runId: runDefaults.runId,
      checkpointGeneration: input.expectedCheckpointGeneration + 1,
      cursorAfter: input.nextCursor,
      providerEtag: input.expectedEtag ?? null,
    }));

    const result = await execute(dependencies);

    expect(result).toMatchObject({ status: "partial", normalizedCount: 4, projectedCount: 1, unchangedCount: 1, quarantinedCount: 1, skippedCount: 1 });
    expect(ledger.commitPage).toHaveBeenCalledTimes(2);
    expect(result.projectedCount + result.unchangedCount + result.quarantinedCount + result.skippedCount + result.failedCount)
      .toBe(result.normalizedCount);
  });

  it.each([0, 1])("accounts for the failed and remaining observations when dispatch fails at index %d", async (failureIndex) => {
    const { dependencies, ledger } = makeDependencies({
      dispatcher: {
        dispatch: vi.fn().mockImplementation(async ({ observation }: { observation: NormalizedObservation }) => {
          const index = observation.externalId === "match-1" ? 0 : observation.externalId === "match-2" ? 1 : 2;
          if (index === failureIndex) throw new Error("dispatch failure");
          return { disposition: "projected", dataChanged: true };
        }),
      },
    });
    const observations = [
      sportsObservation,
      { ...sportsObservation, externalId: "match-2" },
      { ...sportsObservation, externalId: "match-3" },
    ];
    ((dependencies.adapters.get("synthetic-sports") as ProviderAdapter).pull as ReturnType<typeof vi.fn>)
      .mockResolvedValue(batchFor(observations));

    const result = await execute(dependencies);

    expect(result).toMatchObject({ normalizedCount: 3, projectedCount: failureIndex, failedCount: 3 - failureIndex, status: "failed" });
    expect(result.projectedCount + result.unchangedCount + result.quarantinedCount + result.skippedCount + result.failedCount)
      .toBe(result.normalizedCount);
    expect(ledger.commitPage).not.toHaveBeenCalled();
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ failureCode: "system:observation_dispatch_failed" }));
  });

  it("treats a malformed dispatcher disposition as a failed current and unprocessed batch", async () => {
    const { dependencies, ledger } = makeDependencies({
      dispatcher: {
        dispatch: vi.fn().mockResolvedValue({ disposition: "mystery", dataChanged: false } as never),
      },
    });
    const observations = [sportsObservation, { ...sportsObservation, externalId: "match-2" }, { ...sportsObservation, externalId: "match-3" }];
    ((dependencies.adapters.get("synthetic-sports") as ProviderAdapter).pull as ReturnType<typeof vi.fn>)
      .mockResolvedValue(batchFor(observations));

    const result = await execute(dependencies);

    expect(result).toMatchObject({ normalizedCount: 3, failedCount: 3, status: "failed" });
    expect(result.projectedCount + result.unchangedCount + result.quarantinedCount + result.skippedCount + result.failedCount)
      .toBe(result.normalizedCount);
    expect(ledger.commitPage).not.toHaveBeenCalled();
    expect(ledger.finish).toHaveBeenCalledWith(expect.objectContaining({ failureCode: "system:observation_dispatch_failed" }));
  });
});
