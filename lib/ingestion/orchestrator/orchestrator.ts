import { z } from "zod";

import {
  providerBatchSchema,
  isoDateTimeSchema,
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
  OrchestratorDependencies,
  ObservationDispatcherPort,
  RunExecutionOutcome,
} from "@/lib/ingestion/orchestrator/ports";
import type { ProviderCredential } from "@/lib/ingestion/providers/provider-adapter";
import { providerPullRequestSchema, type ProviderPullRequest } from "@/lib/ingestion/providers/provider-adapter";

const pollPhaseSchema = z.enum(["distant", "pregame", "live", "postgame", "complete"]);
const bindingModeSchema = z.enum(["disabled", "shadow", "write"]);
const budgetDecisionSchema = z
  .object({
    allowed: z.boolean(),
    cost: z.number().int().safe().positive(),
    reason: z.enum(["available", "exhausted", "unknown_budget", "invalid_budget"]),
    retryAt: isoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine((decision, context) => {
    if (decision.allowed && (decision.reason !== "available" || decision.retryAt !== undefined)) {
      context.addIssue({ code: "custom", path: ["reason"], message: "Allowed budget must be available without retryAt" });
    }
    if (!decision.allowed && decision.reason === "available") {
      context.addIssue({ code: "custom", path: ["reason"], message: "Denied budget cannot be available" });
    }
    if (!decision.allowed && decision.reason !== "exhausted" && decision.retryAt !== undefined) {
      context.addIssue({ code: "custom", path: ["retryAt"], message: "Only exhausted budgets may provide retryAt" });
    }
  });
const observationDispatchResultSchema = z
  .object({
    disposition: z.enum(["projected", "unchanged", "quarantined", "skipped"]),
    dataChanged: z.boolean(),
  })
  .strict();
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

const terminalHoldAt = (finishedAt: string): string =>
  new Date(Date.parse(finishedAt) + 300_000).toISOString();

const systemFailureMessage = (code: string): string => `Ingestion execution failed: ${code.replace(/^system:/u, "")}`;

const providerFailureMessage = (code: ProviderFailure["code"]): string => `Provider execution failed: ${code}`;

const namespacedProviderCode = (code: ProviderFailure["code"]): string => `provider:${code}`;

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
      finishedAt?: string;
    }> = {},
  ): Promise<RunExecutionOutcome> => {
    if (!run.leaseToken) throw new RunLedgerRepositoryError("lease_lost", "Run has no lease token");
    const finishedAt = options.finishedAt ?? nowIso(dependencies.clock);
    await dependencies.ledger.finish({
      runId: run.runId,
      leaseToken: run.leaseToken,
      outcome: status,
      finishedAt,
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
    code: string,
    counts: Omit<RunExecutionOutcome, "runId" | "status"> = emptyCounts(),
    metadata: JsonObject = {},
    nextPollAt?: string,
  ): Promise<RunExecutionOutcome> => {
    const finishedAt = nowIso(dependencies.clock);
    return finish(run, "failed", counts, {
      finishedAt,
      failureCode: code,
      errorMessage: systemFailureMessage(code),
      nextPollAt: nextPollAt ?? terminalHoldAt(finishedAt),
      metadata,
    });
  };

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
    } catch (classificationError) {
      if (isLeaseLostError(classificationError)) throw classificationError;
      return null;
    }
  };

  const safeRenew = async (
    run: ClaimedIngestionRun,
    leaseExpiresAt: string | null,
    counts: Omit<RunExecutionOutcome, "runId" | "status"> = emptyCounts(),
  ): Promise<{ leaseExpiresAt: string | null; failure?: RunExecutionOutcome }> => {
    try {
      return { leaseExpiresAt: await renewIfNeeded(run, leaseExpiresAt) };
    } catch (error) {
      if (isLeaseLostError(error)) throw error;
      return {
        leaseExpiresAt,
        failure: await finishFailure(run, "system:lease_renewal_failed", counts, failureDetails("lease_renewal")),
      };
    }
  };

  return {
    async execute(run): Promise<RunExecutionOutcome> {
      if (!run.leaseAcquired || !run.leaseToken) {
        throw new Error("Run requires an active lease before execution");
      }

      await dependencies.ledger.start({ runId: run.runId, leaseToken: run.leaseToken, now: nowIso(dependencies.clock) });
      const claimedMode = bindingModeSchema.safeParse(run.mode);
      if (!claimedMode.success) {
        return finishFailure(run, "system:invalid_binding_mode", emptyCounts(), failureDetails("claimed_mode"));
      }

      let currentModeValue: unknown;
      try {
        currentModeValue = await dependencies.modeReader.read(run.bindingId);
      } catch (error) {
        if (isLeaseLostError(error)) throw error;
        return finishFailure(run, "system:binding_mode_read_failed", emptyCounts(), failureDetails("current_mode"));
      }
      const currentMode = bindingModeSchema.safeParse(currentModeValue);
      if (!currentMode.success) {
        return finishFailure(run, "system:invalid_binding_mode", emptyCounts(), failureDetails("current_mode"));
      }
      const mode = effectiveBindingMode(claimedMode.data, currentMode.data);

      if (mode === "disabled") {
        const finishedAt = nowIso(dependencies.clock);
        return finish(run, "canceled", emptyCounts(), {
          finishedAt,
          nextPollAt: terminalHoldAt(finishedAt),
          dataChanged: false,
        });
      }

      let phase: PollPhase;
      let policy: z.infer<typeof pollPolicySchema>;
      try {
        phase = pollPhaseSchema.parse(dependencies.phaseResolver.resolve({ run, evaluatedAt: nowIso(dependencies.clock) }));
        policy = pollPolicySchema.parse(run.pollPolicy);
      } catch (error) {
        if (isLeaseLostError(error)) throw error;
        return finishFailure(run, "system:invalid_poll_policy", emptyCounts(), failureDetails("poll_policy"));
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
      } catch (error) {
        if (isLeaseLostError(error)) throw error;
        return finishFailure(run, "system:invalid_request", emptyCounts(), failureDetails("pull_request"));
      }

      let adapter: ReturnType<OrchestratorDependencies["adapters"]["get"]>;
      try {
        adapter = dependencies.adapters.get(run.adapterKey);
      } catch (error) {
        if (isLeaseLostError(error)) throw error;
        return finishFailure(run, "system:adapter_registry_failed", emptyCounts(), failureDetails("adapter_registry"));
      }
      if (!adapter || adapter.key !== run.adapterKey) {
        return finishFailure(run, "system:adapter_mismatch", emptyCounts(), failureDetails("adapter_registry"));
      }

      let leaseExpiresAt = run.leaseExpiresAt;
      const beforeBudget = await safeRenew(run, leaseExpiresAt);
      if (beforeBudget.failure) return beforeBudget.failure;
      leaseExpiresAt = beforeBudget.leaseExpiresAt;

      let rawBudget: unknown;
      try {
        rawBudget = await dependencies.budget.reserve({
          runId: run.runId,
          leaseToken: run.leaseToken,
          requestedAt: request.requestedAt,
          cost: 1,
        });
      } catch (error) {
        if (isLeaseLostError(error)) throw error;
        return finishFailure(run, "system:budget_reservation_failed", emptyCounts(), failureDetails("budget"));
      }
      const budgetResult = budgetDecisionSchema.safeParse(rawBudget);
      if (!budgetResult.success || budgetResult.data.cost !== 1) {
        const finishedAt = nowIso(dependencies.clock);
        return finish(run, "rate_limited", emptyCounts(), {
          finishedAt,
          nextPollAt: terminalHoldAt(finishedAt),
          dataChanged: false,
          failureCode: "system:invalid_budget_decision",
          errorMessage: systemFailureMessage("system:invalid_budget_decision"),
          metadata: failureDetails("budget"),
        });
      }

      const budget = budgetResult.data;
      if (!budget.allowed) {
        const finishedAt = nowIso(dependencies.clock);
        const scheduledAt = budget.retryAt ?? pollAtFor(mode, phase, policy, request.requestedAt) ?? terminalHoldAt(finishedAt);
        return finish(run, "rate_limited", emptyCounts(), {
          finishedAt,
          nextPollAt: scheduledAt,
          ...(budget.retryAt ? { nextRetryAt: budget.retryAt } : {}),
          dataChanged: false,
        });
      }

      if (!run.credentialRef) {
        return finishFailure(run, "system:missing_credential", emptyCounts(), failureDetails("credential"));
      }

      let credential: ProviderCredential;
      try {
        credential = await dependencies.credentials.resolve(run.credentialRef);
      } catch (error) {
        if (isLeaseLostError(error)) throw error;
        return finishFailure(run, "system:credential_resolution_failed", emptyCounts(), failureDetails("credential"));
      }

      const beforeProvider = await safeRenew(run, leaseExpiresAt);
      if (beforeProvider.failure) return beforeProvider.failure;
      leaseExpiresAt = beforeProvider.leaseExpiresAt;
      let batch: ProviderBatch;
      let candidate: unknown;
      try {
        candidate = await adapter.pull({ ...request, credential });
      } catch (error) {
        if (isLeaseLostError(error)) throw error;
        const failure = validateFailure(adapter, error);
        if (!failure) return finishFailure(run, "system:invalid_provider_failure", emptyCounts(), failureDetails("adapter"));
        const safe = safeFailure(failure);
        if (failure.httpStatus !== undefined || failure.retryAt !== undefined) {
          try {
            await dependencies.ledger.recordResponse({
              runId: run.runId,
              leaseToken: run.leaseToken,
              ...(failure.httpStatus === undefined ? {} : { httpStatus: failure.httpStatus }),
              ...(failure.retryAt === undefined ? {} : { retryAfterAt: failure.retryAt }),
              observedAt: nowIso(dependencies.clock),
            });
          } catch (recordError) {
            if (isLeaseLostError(recordError)) throw recordError;
            return finishFailure(run, "system:response_recording_failed", emptyCounts(), failureDetails("response"));
          }
        }
        const classification = classifyFailure(failure);
        const retry = decideRetry({
          failure,
          retryIndex: run.retryIndex,
          now: nowIso(dependencies.clock),
          claimKey: run.claimKey,
        });
        const finishedAt = nowIso(dependencies.clock);
        const nextPoll = retry.retryAt ?? pollAtFor(mode, phase, policy, finishedAt) ?? terminalHoldAt(finishedAt);
        return finish(run, failure.code === "rate_limited" ? "rate_limited" : "failed", emptyCounts(), {
          finishedAt,
          nextPollAt: nextPoll,
          ...(retry.retryAt ? { nextRetryAt: retry.retryAt } : {}),
          dataChanged: false,
          failureCode: namespacedProviderCode(classification.code),
          errorMessage: providerFailureMessage(classification.code),
          metadata: safe.details,
        });
      }
      try {
        batch = providerBatchSchema.parse(candidate);
      } catch {
        return finish(run, "failed", emptyCounts(), {
          nextPollAt: terminalHoldAt(nowIso(dependencies.clock)),
          failureCode: "provider:invalid_response",
          errorMessage: providerFailureMessage("invalid_response"),
          metadata: failureDetails("provider_batch"),
          dataChanged: false,
        });
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
        return finishFailure(run, "system:response_recording_failed", emptyCounts(), failureDetails("response"));
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

      for (const [observationIndex, observation] of batch.observations.entries()) {
        try {
          const dispatched = observationDispatchResultSchema.parse(await dispatcher.dispatch({
            run,
            observation,
            receivedAt: batch.receivedAt,
            mode,
          }));
          if (dispatched.disposition === "projected") counts.projectedCount += 1;
          if (dispatched.disposition === "unchanged") counts.unchangedCount += 1;
          if (dispatched.disposition === "quarantined") counts.quarantinedCount += 1;
          if (dispatched.disposition === "skipped") counts.skippedCount += 1;
        } catch (error) {
          if (isLeaseLostError(error)) throw error;
          counts.failedCount += batch.observations.length - observationIndex;
          return finishFailure(run, "system:observation_dispatch_failed", counts, failureDetails("observation_dispatch"));
        }
      }

      const beforePage = await safeRenew(run, leaseExpiresAt, counts);
      if (beforePage.failure) return beforePage.failure;
      leaseExpiresAt = beforePage.leaseExpiresAt;
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
        const code = error instanceof RunLedgerRepositoryError && error.kind === "checkpoint_conflict"
          ? "system:checkpoint_conflict"
          : error instanceof RunLedgerRepositoryError && error.kind === "page_conflict"
            ? "system:page_conflict"
            : "system:page_commit_failed";
        return finishFailure(run, code, counts, failureDetails("page_commit"));
      }

      const finishedAt = nowIso(dependencies.clock);
      const hasContinuation = batch.nextCursor !== undefined;
      const status = hasContinuation || counts.quarantinedCount > 0 ? "partial" : "succeeded";
      const scheduledAt = hasContinuation
        ? finishedAt
        : pollAtFor(mode, phase, policy, finishedAt)
          ?? (status === "partial" ? terminalHoldAt(finishedAt) : null);
      return finish(run, status, counts, {
        finishedAt,
        nextPollAt: scheduledAt,
        dataChanged: counts.projectedCount > 0,
      });
    },
  };
}
