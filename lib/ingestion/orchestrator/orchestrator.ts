import { z } from "zod";

import {
  providerBatchSchema,
  type ProviderBatch,
  type JsonObject,
  type JsonValue,
} from "@/lib/ingestion/contracts";
import {
  providerFailureSchema,
  type ProviderFailure,
} from "@/lib/ingestion/errors";
import { classifyFailure, sanitizeFailure } from "@/lib/ingestion/orchestrator/failure-policy";
import {
  RunLedgerRepositoryError,
  type ClaimedIngestionRun,
} from "@/lib/ingestion/orchestrator/run-ledger-repository";
import { nextPollAt } from "@/lib/ingestion/orchestrator/policy";
import { decideRetry } from "@/lib/ingestion/retry/policy";
import type { PollPhase } from "@/lib/ingestion/orchestrator/types";
import {
  createObservationDispatcher,
} from "@/lib/ingestion/orchestrator/observation-dispatch";
import type {
  CurrentBindingMode,
  IngestionOrchestrator,
  OrchestrationErrorCode,
  OrchestratorDependencies,
  ObservationDispatcherPort,
  RunExecutionOutcome,
} from "@/lib/ingestion/orchestrator/ports";
import type { ProviderCredential } from "@/lib/ingestion/providers/provider-adapter";
import { providerPullRequestSchema, type ProviderPullRequest } from "@/lib/ingestion/providers/provider-adapter";

const pollPhaseSchema = z.enum(["distant", "pregame", "live", "postgame", "complete"]);
const pollPolicySchema = z
  .object({
    idleSeconds: z.number().int().min(300),
    pregameSeconds: z.number().int().min(60),
    liveSeconds: z.number().int().min(30),
    postgameSeconds: z.number().int().min(60),
    staleAfterSeconds: z.number().int().min(60),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.staleAfterSeconds < value.liveSeconds) {
      context.addIssue({ code: "custom", path: ["staleAfterSeconds"], message: "staleAfterSeconds must be at least liveSeconds" });
    }
  });

const sensitiveKey = /authorization|cookie|credential|password|secret|token|payload|raw|body/i;

const stripSensitiveKeys = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) return value.map(stripSensitiveKeys);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !sensitiveKey.test(key))
      .map(([key, child]) => [key, stripSensitiveKeys(child)]),
  ) as JsonObject;
};

const safeFailure = (failure: ProviderFailure) => {
  const sanitized = sanitizeFailure(failure);
  return {
    ...sanitized,
    details: stripSensitiveKeys(sanitized.details) as JsonObject,
  };
};

const nowIso = (clock: OrchestratorDependencies["clock"]): string => clock.now().toISOString();

export function effectiveBindingMode(
  claimedMode: CurrentBindingMode,
  currentMode: CurrentBindingMode,
): CurrentBindingMode {
  if (claimedMode === "disabled" || currentMode === "disabled") return "disabled";
  if (claimedMode === "shadow" || currentMode === "shadow") return "shadow";
  return "write";
}

const isLeaseLostError = (error: unknown): boolean =>
  error instanceof RunLedgerRepositoryError && error.kind === "lease_lost"
  || (typeof error === "object" && error !== null && "kind" in error && error.kind === "lease_lost");

const outcome = (
  runId: string,
  status: RunExecutionOutcome["status"],
  counts: Omit<RunExecutionOutcome, "runId" | "status">,
): RunExecutionOutcome => ({ runId, status, ...counts });

const emptyCounts = (): Omit<RunExecutionOutcome, "runId" | "status"> => ({
  fetchedCount: 0,
  normalizedCount: 0,
  projectedCount: 0,
  unchangedCount: 0,
  quarantinedCount: 0,
  skippedCount: 0,
  failedCount: 0,
});

const safeErrorMessage = (code: OrchestrationErrorCode): string => {
  switch (code) {
    case "invalid_request": return "Provider pull request failed validation";
    case "invalid_batch": return "Provider batch failed validation";
    case "adapter_mismatch": return "No adapter matches the claimed adapter key";
    case "missing_credential": return "A credential reference is required for this binding";
    case "unowned_run": return "The run is not owned by an active lease";
  }
};

const failureDetails = (stage: string): JsonObject => ({ stage });

const pollAtFor = (
  mode: CurrentBindingMode,
  phase: PollPhase,
  policy: z.infer<typeof pollPolicySchema>,
  evaluatedAt: string,
): string | null => nextPollAt({ mode, phase, ...policy }, evaluatedAt);

export function createIngestionOrchestrator(
  dependencies: OrchestratorDependencies,
): IngestionOrchestrator {
  const dispatcher: ObservationDispatcherPort = dependencies.dispatcher ?? createObservationDispatcher({
    evidence: dependencies.evidence,
    structural: dependencies.structural,
    result: dependencies.result,
  });

  const finish = async (
    run: ClaimedIngestionRun,
    status: "succeeded" | "partial" | "failed" | "rate_limited" | "canceled",
    counts: Omit<RunExecutionOutcome, "runId" | "status">,
    options: Readonly<{
      nextPollAt?: string | null;
      nextRetryAt?: string | null;
      dataChanged?: boolean;
      failureCode?: string;
      errorMessage?: string;
      metadata?: JsonObject;
    }> = {},
  ): Promise<RunExecutionOutcome> => {
    if (!run.leaseToken) throw new RunLedgerRepositoryError("lease_lost", "Run has no lease token");
    await dependencies.ledger.finish({
      runId: run.runId,
      leaseToken: run.leaseToken,
      outcome: status,
      finishedAt: nowIso(dependencies.clock),
      ...(options.nextPollAt ? { nextPollAt: options.nextPollAt } : {}),
      ...(options.nextRetryAt ? { nextRetryAt: options.nextRetryAt } : {}),
      dataChanged: options.dataChanged ?? counts.projectedCount > 0,
      ...(options.failureCode ? { failureCode: options.failureCode } : {}),
      ...(options.errorMessage ? { errorMessage: options.errorMessage } : {}),
      ...(options.metadata ? { metadata: options.metadata } : {}),
    });
    return outcome(run.runId, status, counts);
  };

  const finishFailure = async (
    run: ClaimedIngestionRun,
    code: "invalid_response" | "permanent",
    message: string,
    counts: Omit<RunExecutionOutcome, "runId" | "status"> = emptyCounts(),
    metadata: JsonObject = {},
  ): Promise<RunExecutionOutcome> => finish(run, "failed", counts, {
    failureCode: code,
    errorMessage: message,
    metadata,
  });

  const renewIfNeeded = async (
    run: ClaimedIngestionRun,
    leaseExpiresAt: string | null,
  ): Promise<string | null> => {
    if (!run.leaseToken || !leaseExpiresAt) return leaseExpiresAt;
    const evaluatedAt = nowIso(dependencies.clock);
    const remaining = Date.parse(leaseExpiresAt) - Date.parse(evaluatedAt);
    if (!Number.isFinite(remaining) || remaining > 60_000) return leaseExpiresAt;
    const renewed = await dependencies.ledger.renew({
      runId: run.runId,
      leaseToken: run.leaseToken,
      now: evaluatedAt,
    });
    return renewed.lease_expires_at;
  };

  const validateFailure = (adapter: { classifyError(error: unknown): unknown }, error: unknown): ProviderFailure | null => {
    try {
      return providerFailureSchema.parse(adapter.classifyError(error));
    } catch {
      return null;
    }
  };

  return {
    async execute(run): Promise<RunExecutionOutcome> {
      if (!run.leaseAcquired || !run.leaseToken) {
        throw new Error("Run requires an active lease before execution");
      }

      await dependencies.ledger.start({ runId: run.runId, leaseToken: run.leaseToken, now: nowIso(dependencies.clock) });
      const currentMode = await dependencies.modeReader.read(run.bindingId);
      const mode = effectiveBindingMode(run.mode, currentMode);

      if (mode === "disabled") {
        return finish(run, "canceled", emptyCounts(), { dataChanged: false });
      }

      let phase: PollPhase;
      let policy: z.infer<typeof pollPolicySchema>;
      try {
        phase = pollPhaseSchema.parse(dependencies.phaseResolver.resolve({ run, evaluatedAt: nowIso(dependencies.clock) }));
        policy = pollPolicySchema.parse(run.pollPolicy);
      } catch {
        return finishFailure(run, "invalid_response", "Polling policy failed validation", emptyCounts(), failureDetails("poll_policy"));
      }

      let request: ProviderPullRequest;
      try {
        const requestedAt = nowIso(dependencies.clock);
        const window = dependencies.pullWindowResolver.resolve({ run, requestedAt });
        request = providerPullRequestSchema.parse({
          bindingId: run.bindingId,
          providerKey: run.adapterKey,
          eventEditionId: run.eventEditionId,
          bindingKey: run.bindingKey,
          adapterConfigVersion: run.adapterConfigVersion,
          adapterConfig: run.adapterConfig,
          windowStart: window.windowStart,
          windowEnd: window.windowEnd,
          requestedAt,
          cursor: run.providerCursor,
          ...(run.providerEtag ? { etag: run.providerEtag } : {}),
        });
      } catch {
        return finishFailure(run, "invalid_response", safeErrorMessage("invalid_request"), emptyCounts(), failureDetails("pull_request"));
      }

      const adapter = dependencies.adapters.get(run.adapterKey);
      if (!adapter || adapter.key !== run.adapterKey) {
        return finishFailure(run, "permanent", safeErrorMessage("adapter_mismatch"), emptyCounts(), failureDetails("adapter_registry"));
      }

      const budget = await dependencies.budget.reserve({
        runId: run.runId,
        leaseToken: run.leaseToken,
        requestedAt: request.requestedAt,
        cost: 1,
      });
      if (!budget.allowed) {
        const scheduledAt = budget.retryAt ?? pollAtFor(mode, phase, policy, request.requestedAt);
        return finish(run, "rate_limited", emptyCounts(), {
          nextPollAt: scheduledAt,
          ...(budget.retryAt ? { nextRetryAt: budget.retryAt } : {}),
          dataChanged: false,
        });
      }

      if (!run.credentialRef) {
        return finishFailure(run, "permanent", safeErrorMessage("missing_credential"), emptyCounts(), failureDetails("credential"));
      }

      let credential: ProviderCredential;
      try {
        credential = await dependencies.credentials.resolve(run.credentialRef);
      } catch {
        return finishFailure(run, "permanent", "Credential resolution failed", emptyCounts(), failureDetails("credential"));
      }

      const leaseExpiresAt = await renewIfNeeded(run, run.leaseExpiresAt);
      let batch: ProviderBatch;
      let candidate: unknown;
      try {
        candidate = await adapter.pull({ ...request, credential });
      } catch (error) {
        if (isLeaseLostError(error)) throw error;
        const failure = validateFailure(adapter, error);
        if (!failure) return finishFailure(run, "invalid_response", "Adapter failure classification failed validation", emptyCounts(), failureDetails("adapter"));
        const safe = safeFailure(failure);
        const classification = classifyFailure(failure);
        const retry = decideRetry({
          failure,
          retryIndex: run.retryIndex,
          now: nowIso(dependencies.clock),
          claimKey: run.claimKey,
        });
        const nextPoll = retry.retryAt ?? pollAtFor(mode, phase, policy, nowIso(dependencies.clock));
        return finish(run, failure.code === "rate_limited" ? "rate_limited" : "failed", emptyCounts(), {
          nextPollAt: nextPoll,
          ...(retry.retryAt ? { nextRetryAt: retry.retryAt } : {}),
          dataChanged: false,
          failureCode: classification.code,
          errorMessage: safe.message,
          metadata: safe.details,
        });
      }
      try {
        batch = providerBatchSchema.parse(candidate);
      } catch {
        return finishFailure(run, "invalid_response", "Provider batch failed validation", emptyCounts(), failureDetails("provider_batch"));
      }

      try {
        await dependencies.ledger.recordResponse({
          runId: run.runId,
          leaseToken: run.leaseToken,
          observedAt: batch.receivedAt,
          ...(batch.rateLimit?.limit === undefined ? {} : { rateLimitLimit: batch.rateLimit.limit }),
          ...(batch.rateLimit?.remaining === undefined ? {} : { rateLimitRemaining: batch.rateLimit.remaining }),
          ...(batch.rateLimit?.resetAt === undefined ? {} : { rateLimitResetAt: batch.rateLimit.resetAt }),
          ...(batch.rateLimit?.retryAfterAt === undefined ? {} : { retryAfterAt: batch.rateLimit.retryAfterAt }),
        });
      } catch (error) {
        if (isLeaseLostError(error)) throw error;
        return finishFailure(run, "permanent", "Response metadata recording failed", emptyCounts(), failureDetails("response"));
      }

      const counts = {
        fetchedCount: batch.fetchedCount,
        normalizedCount: batch.observations.length,
        projectedCount: 0,
        unchangedCount: 0,
        quarantinedCount: 0,
        skippedCount: 0,
        failedCount: 0,
      };

      for (const observation of batch.observations) {
        try {
          const dispatched = await dispatcher.dispatch({
            run,
            observation,
            receivedAt: batch.receivedAt,
            mode,
          });
          if (dispatched.disposition === "projected") counts.projectedCount += 1;
          if (dispatched.disposition === "unchanged") counts.unchangedCount += 1;
          if (dispatched.disposition === "quarantined") counts.quarantinedCount += 1;
          if (dispatched.disposition === "skipped") counts.skippedCount += 1;
        } catch (error) {
          if (isLeaseLostError(error)) throw error;
          counts.failedCount += 1;
          return finishFailure(run, "permanent", "Observation processing failed", counts, failureDetails("observation_dispatch"));
        }
      }

      await renewIfNeeded(run, leaseExpiresAt);
      try {
        await dependencies.ledger.commitPage({
          runId: run.runId,
          leaseToken: run.leaseToken,
          bindingId: run.bindingId,
          expectedCheckpointGeneration: run.checkpointGeneration,
          expectedCursor: run.providerCursor,
          ...(run.providerEtag ? { expectedEtag: run.providerEtag } : {}),
          nextCursor: batch.nextCursor ?? run.providerCursor,
          ...(batch.etag ?? run.providerEtag ? { responseEtag: batch.etag ?? run.providerEtag ?? undefined } : {}),
          fetchedDelta: batch.fetchedCount,
          normalizedDelta: batch.observations.length,
          projectedDelta: counts.projectedCount,
          unchangedDelta: counts.unchangedCount,
          quarantinedDelta: counts.quarantinedCount,
          skippedDelta: counts.skippedCount,
          failedDelta: counts.failedCount,
        });
      } catch (error) {
        if (isLeaseLostError(error)) throw error;
        return finishFailure(run, "permanent", "Page checkpoint commit failed", counts, failureDetails("page_commit"));
      }

      const finishedAt = nowIso(dependencies.clock);
      const hasContinuation = batch.nextCursor !== undefined;
      const status = hasContinuation || counts.quarantinedCount > 0 ? "partial" : "succeeded";
      const scheduledAt = hasContinuation
        ? finishedAt
        : pollAtFor(mode, phase, policy, finishedAt);
      return finish(run, status, counts, {
        nextPollAt: scheduledAt,
        dataChanged: counts.projectedCount > 0,
      });
    },
  };
}
