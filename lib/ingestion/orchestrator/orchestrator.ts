import { z } from "zod";
import { quarantineAdapterRejection } from "@/lib/ingestion/quarantine/adapter-rejection";

import {
  providerBatchSchema,
  isoDateTimeSchema,
  jsonObjectSchema,
  type ProviderBatch,
  type JsonObject,
  type JsonValue,
} from "@/lib/ingestion/contracts";
import { canonicalJson } from "@/lib/ingestion/idempotency/canonical-json";
import {
  providerFailureSchema,
  type ProviderFailure,
} from "@/lib/ingestion/errors";
import { classifyFailure, sanitizeFailure } from "@/lib/ingestion/orchestrator/failure-policy";
import {
  computeIngestionPageKey,
  RunLedgerRepositoryError,
  type ClaimedIngestionRun,
} from "@/lib/ingestion/orchestrator/run-ledger-repository";
import { nextPollAt } from "@/lib/ingestion/orchestrator/policy";
import { decideCheckpoint, providerEtagSchema } from "@/lib/ingestion/orchestrator/checkpoint";
import { cursorFingerprint, decidePagination, isRepeatedCursor } from "@/lib/ingestion/orchestrator/pagination";
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
import { createAttemptKey } from "@/lib/ingestion/rate-limit/attempt-key";

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
const pageCommitOutcomeSchema = z
  .object({
    outcome: z.enum(["committed", "replayed"]),
    pageLedgerId: z.string().trim().min(1),
    runId: z.string().min(1).refine((value) => value.trim().length > 0),
    checkpointGeneration: z.number().int().safe().nonnegative(),
    cursorAfter: jsonObjectSchema,
    providerEtag: providerEtagSchema.nullable(),
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

const systemFailureMessage = (code: string): string => `Ingestion execution failed: ${code.replace(/^system:/u, "")}`;

const providerFailureMessage = (code: ProviderFailure["code"]): string => `Provider execution failed: ${code}`;

const namespacedProviderCode = (code: ProviderFailure["code"]): string => `provider:${code}`;

const failureDetails = (stage: string): JsonObject => ({ stage });

type ExecutionCounts = {
  -readonly [Key in keyof Omit<RunExecutionOutcome, "runId" | "status">]: Omit<RunExecutionOutcome, "runId" | "status">[Key];
};

const addCounts = (target: ExecutionCounts, delta: ExecutionCounts): void => {
  target.fetchedCount += delta.fetchedCount;
  target.normalizedCount += delta.normalizedCount;
  target.projectedCount += delta.projectedCount;
  target.unchangedCount += delta.unchangedCount;
  target.quarantinedCount += delta.quarantinedCount;
  target.skippedCount += delta.skippedCount;
  target.failedCount += delta.failedCount;
};

const hasConservedCounts = (counts: ExecutionCounts): boolean =>
  counts.normalizedCount ===
  counts.projectedCount + counts.unchangedCount + counts.quarantinedCount + counts.skippedCount + counts.failedCount;

const hasRawSafeEtag = (candidate: unknown): boolean => {
  try {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return true;
    if (!Object.prototype.hasOwnProperty.call(candidate, "etag")) return true;
    const rawEtag = (candidate as { etag?: unknown }).etag;
    return rawEtag === undefined || providerEtagSchema.safeParse(rawEtag).success;
  } catch {
    return false;
  }
};

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
      nextRetryAt?: string;
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
      ...(options.nextPollAt !== undefined ? { nextPollAt: options.nextPollAt } : {}),
      ...(options.nextRetryAt !== undefined ? { nextRetryAt: options.nextRetryAt } : {}),
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
    nextPollAt: string | null = null,
  ): Promise<RunExecutionOutcome> => {
    const finishedAt = nowIso(dependencies.clock);
    return finish(run, "failed", counts, {
      finishedAt,
      failureCode: code,
      errorMessage: systemFailureMessage(code),
      nextPollAt,
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
          nextPollAt: null,
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
      let currentCursor = run.providerCursor;
      let currentEtag = run.providerEtag;
      let checkpointGeneration = run.checkpointGeneration;
      let pagesProcessed = 0;
      let credential: ProviderCredential | null = null;
      const seenCursorFingerprints = new Set<string>();
      try {
        seenCursorFingerprints.add(cursorFingerprint(currentCursor));
      } catch {
        return finishFailure(run, "system:invalid_request", emptyCounts(), failureDetails("checkpoint"));
      }
      const aggregate = emptyCounts();
      let dataChanged = false;
      let hasQuarantine = false;

      const finishInvalidResponse = async (metadata: JsonObject): Promise<RunExecutionOutcome> => {
        const finishedAt = nowIso(dependencies.clock);
        return finish(run, "failed", aggregate, {
          finishedAt,
          nextPollAt: null,
          failureCode: "provider:invalid_response",
          errorMessage: providerFailureMessage("invalid_response"),
          metadata,
          dataChanged,
        });
      };

      while (true) {
        let request: ProviderPullRequest;
        try {
          const requestedAt = nowIso(dependencies.clock);
          const etag = currentEtag === null ? undefined : providerEtagSchema.parse(currentEtag);
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
            cursor: currentCursor,
            ...(etag === undefined ? {} : { etag }),
          });
        } catch (error) {
          if (isLeaseLostError(error)) throw error;
          return finishFailure(run, "system:invalid_request", aggregate, failureDetails("pull_request"));
        }

        const beforeBudget = await safeRenew(run, leaseExpiresAt, aggregate);
        if (beforeBudget.failure) return beforeBudget.failure;
        leaseExpiresAt = beforeBudget.leaseExpiresAt;

        let rawBudget: unknown;
        let attemptKey = "";
        try {
          const pageKey = computeIngestionPageKey({
            bindingId: run.bindingId,
            expectedCheckpointGeneration: checkpointGeneration,
            expectedCursor: currentCursor,
            ...(currentEtag === null ? {} : { expectedEtag: currentEtag }),
          });
          attemptKey = createAttemptKey({ runId: run.runId, retryIndex: run.retryIndex, pageKey });
          rawBudget = await dependencies.budget.reserve({
            runId: run.runId,
            leaseToken: run.leaseToken,
            attemptKey,
            requestedAt: request.requestedAt,
            cost: 1,
          });
        } catch (error) {
          if (isLeaseLostError(error)) throw error;
          return finishFailure(run, "system:budget_reservation_failed", aggregate, failureDetails("budget"));
        }
        const budgetResult = budgetDecisionSchema.safeParse(rawBudget);
        if (!budgetResult.success || budgetResult.data.cost !== 1) {
          const finishedAt = nowIso(dependencies.clock);
          return finish(run, "rate_limited", aggregate, {
            finishedAt,
            nextPollAt: null,
            dataChanged,
            failureCode: "system:invalid_budget_decision",
            errorMessage: systemFailureMessage("system:invalid_budget_decision"),
            metadata: failureDetails("budget"),
          });
        }

        const budget = budgetResult.data;
        if (!budget.allowed) {
          const finishedAt = nowIso(dependencies.clock);
          const scheduledAt = budget.reason === "exhausted" ? budget.retryAt ?? null : null;
          return finish(run, "rate_limited", aggregate, {
            finishedAt,
            nextPollAt: scheduledAt,
            ...(budget.retryAt ? { nextRetryAt: budget.retryAt } : {}),
            dataChanged,
          });
        }

        if (!credential) {
          if (!run.credentialRef) {
            return finishFailure(run, "system:missing_credential", aggregate, failureDetails("credential"));
          }
          try {
            credential = await dependencies.credentials.resolve(run.credentialRef);
          } catch (error) {
            if (isLeaseLostError(error)) throw error;
            return finishFailure(run, "system:credential_resolution_failed", aggregate, failureDetails("credential"));
          }
        }

        const beforeProvider = await safeRenew(run, leaseExpiresAt, aggregate);
        if (beforeProvider.failure) return beforeProvider.failure;
        leaseExpiresAt = beforeProvider.leaseExpiresAt;


        const controls = dependencies.attemptControls;
        let permitId: string | undefined;
        const cancelAdmission = () => finish(run, "canceled", aggregate, {
          finishedAt: nowIso(dependencies.clock), nextPollAt: null, dataChanged,
        });
        try {
          if (!controls) return cancelAdmission();
          const permit = await controls.admit({runId:run.runId,leaseToken:run.leaseToken,attemptKey});
          if (!permit.allowed || !permit.permitId || !permit.startDeadline ||
              !Number.isFinite(Date.parse(permit.startDeadline)) ||
              Date.parse(permit.startDeadline) <= dependencies.clock.now().getTime()) return cancelAdmission();
          permitId = permit.permitId;
          // This is the final awaited operation before bounded adapter HTTP.
          if (!await controls.start({permitId,runId:run.runId,leaseToken:run.leaseToken})) return cancelAdmission();
          // A paused process or delayed RPC acknowledgement must not start late.
          // Its durable issued state remains conservatively outstanding.
          if (Date.parse(permit.startDeadline) <= dependencies.clock.now().getTime()) return cancelAdmission();
        } catch (error) {
          if (isLeaseLostError(error)) throw error;
          return cancelAdmission();
        }
        let candidate: unknown;
        try {
          candidate = await adapter.pull({ ...request, credential });
        } catch (error) {
          // Lost transport acknowledgement cannot be called canceled/drained.
          try { await controls!.complete({permitId:permitId!,runId:run.runId,leaseToken:run.leaseToken,uncertain:true}); }
          catch { /* Durable issued state stays outstanding if completion persistence fails. */ }
          if (isLeaseLostError(error)) throw error;
          const failure = validateFailure(adapter, error);
          if (!failure) return finishFailure(run, "system:invalid_provider_failure", aggregate, failureDetails("adapter"));
          const safe = safeFailure(failure);
          let reviewEvidence: JsonObject | null;
          try {
            reviewEvidence = await quarantineAdapterRejection({
              run, checkpointGeneration, failure, receivedAt: nowIso(dependencies.clock),
              evidence: dependencies.evidence, quarantine: dependencies.quarantine,
            });
          } catch (reviewError) {
            if (isLeaseLostError(reviewError)) throw reviewError;
            return finishFailure(run, "system:adapter_quarantine_failed", aggregate, {
              ...safe.details, stage: "adapter_quarantine", reviewPersistenceFailed: true,
            });
          }
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
              return finishFailure(run, "system:response_recording_failed", aggregate, failureDetails("response"));
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
          const nextPoll = retry.retryAt ?? null;
          return finish(run, failure.code === "rate_limited" ? "rate_limited" : "failed", aggregate, {
            finishedAt,
            nextPollAt: nextPoll,
            ...(retry.retryAt ? { nextRetryAt: retry.retryAt } : {}),
            dataChanged,
            failureCode: namespacedProviderCode(classification.code),
            errorMessage: providerFailureMessage(classification.code),
            metadata: { ...safe.details, ...(reviewEvidence ? { reviewEvidence } : {}) },
          });
        }

        try {
          await controls!.complete({permitId:permitId!,runId:run.runId,leaseToken:run.leaseToken,uncertain:false});
        } catch (error) {
          if (isLeaseLostError(error)) throw error;
          return cancelAdmission();
        }
        if (!hasRawSafeEtag(candidate)) return finishInvalidResponse(failureDetails("provider_batch"));
        let batch: ProviderBatch;
        try {
          batch = providerBatchSchema.parse(candidate);
        } catch {
          return finishInvalidResponse(failureDetails("provider_batch"));
        }

        const pageCounts: ExecutionCounts = {
          fetchedCount: batch.fetchedCount,
          normalizedCount: batch.observations.length,
          projectedCount: 0,
          unchangedCount: 0,
          quarantinedCount: 0,
          skippedCount: 0,
          failedCount: 0,
        };

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
          pageCounts.failedCount = pageCounts.normalizedCount;
          addCounts(aggregate, pageCounts);
          return finishFailure(run, "system:response_recording_failed", aggregate, failureDetails("response"));
        }

        let repeated = false;
        try {
          repeated = isRepeatedCursor({
            currentCursor,
            nextCursor: batch.nextCursor,
            seenCursorFingerprints,
          });
        } catch {
          repeated = true;
        }
        if (repeated) {
          pageCounts.failedCount = pageCounts.normalizedCount;
          addCounts(aggregate, pageCounts);
          return finishInvalidResponse(failureDetails("repeated_cursor"));
        }

        for (const [observationIndex, observation] of batch.observations.entries()) {
          try {
            const dispatched = observationDispatchResultSchema.parse(await dispatcher.dispatch({
              run,
              observation,
              receivedAt: batch.receivedAt,
              mode,
            }));
            if (dispatched.disposition === "projected") {
              pageCounts.projectedCount += 1;
              dataChanged = true;
            }
            if (dispatched.disposition === "unchanged") pageCounts.unchangedCount += 1;
            if (dispatched.disposition === "quarantined") {
              pageCounts.quarantinedCount += 1;
              hasQuarantine = true;
            }
            if (dispatched.disposition === "skipped") pageCounts.skippedCount += 1;
          } catch (error) {
            if (isLeaseLostError(error)) throw error;
            pageCounts.failedCount += batch.observations.length - observationIndex;
            addCounts(aggregate, pageCounts);
            return finishFailure(run, "system:observation_dispatch_failed", aggregate, failureDetails("observation_dispatch"));
          }
        }

        if (!hasConservedCounts(pageCounts)) {
          addCounts(aggregate, pageCounts);
          return finishFailure(run, "system:observation_dispatch_failed", aggregate, failureDetails("count_conservation"));
        }

        const checkpoint = decideCheckpoint({
          currentCursor,
          ...(currentEtag === null ? {} : { currentEtag }),
          ...(batch.nextCursor === undefined ? {} : { nextCursor: batch.nextCursor }),
          ...(batch.etag === undefined ? {} : { responseEtag: batch.etag }),
          transportSucceeded: true,
          pageValid: true,
          observationsTerminal: true,
          pageWasNotModified: false,
          validPartialPage: false,
          repeatedCursor: false,
        });
        const pagination = decidePagination({
          pagesProcessed,
          checkpoint,
          ...(batch.nextCursor === undefined ? {} : { nextCursor: batch.nextCursor }),
        });
        if (!checkpoint.advance || pagination.action === "hold" || pagination.action === "invalid") {
          addCounts(aggregate, pageCounts);
          return finishFailure(run, "system:checkpoint_conflict", aggregate, failureDetails("checkpoint_policy"));
        }

        addCounts(aggregate, pageCounts);
        const beforePage = await safeRenew(run, leaseExpiresAt, aggregate);
        if (beforePage.failure) return beforePage.failure;
        leaseExpiresAt = beforePage.leaseExpiresAt;
        let committed: unknown;
        try {
          committed = await dependencies.ledger.commitPage({
            runId: run.runId,
            leaseToken: run.leaseToken,
            bindingId: run.bindingId,
            expectedCheckpointGeneration: checkpointGeneration,
            expectedCursor: currentCursor,
            ...(currentEtag === null ? {} : { expectedEtag: currentEtag }),
            nextCursor: checkpoint.cursorAfter ?? currentCursor,
            ...(checkpoint.etag === undefined ? {} : { responseEtag: checkpoint.etag }),
            fetchedDelta: pageCounts.fetchedCount,
            normalizedDelta: pageCounts.normalizedCount,
            projectedDelta: pageCounts.projectedCount,
            unchangedDelta: pageCounts.unchangedCount,
            quarantinedDelta: pageCounts.quarantinedCount,
            skippedDelta: pageCounts.skippedCount,
            failedDelta: pageCounts.failedCount,
          });
        } catch (error) {
          if (isLeaseLostError(error)) throw error;
          const code = error instanceof RunLedgerRepositoryError && error.kind === "checkpoint_conflict"
            ? "system:checkpoint_conflict"
            : error instanceof RunLedgerRepositoryError && error.kind === "page_conflict"
              ? "system:page_conflict"
              : "system:page_commit_failed";
          return finishFailure(run, code, aggregate, failureDetails("page_commit"));
        }

        let validatedCommit;
        let committedCursorFingerprint = "";
        try {
          validatedCommit = pageCommitOutcomeSchema.parse(committed);
          const expectedGeneration = checkpointGeneration + 1;
          const expectedCursor = checkpoint.cursorAfter ?? currentCursor;
          const expectedEtag = checkpoint.etag ?? null;
          const continuation = pagination.action === "continue" || pagination.action === "yield";

          if (!Number.isSafeInteger(expectedGeneration) || validatedCommit.runId !== run.runId) {
            throw new Error("Page commit outcome identity is inconsistent");
          }
          if (validatedCommit.checkpointGeneration !== expectedGeneration) {
            throw new Error("Page commit outcome generation is inconsistent");
          }
          if (canonicalJson(validatedCommit.cursorAfter) !== canonicalJson(expectedCursor)) {
            throw new Error("Page commit outcome cursor is inconsistent");
          }
          if (validatedCommit.providerEtag !== expectedEtag) {
            throw new Error("Page commit outcome ETag is inconsistent");
          }
          if (continuation && isRepeatedCursor({
            currentCursor,
            nextCursor: validatedCommit.cursorAfter,
            seenCursorFingerprints,
          })) {
            throw new Error("Page commit outcome cursor repeats prior state");
          }
          committedCursorFingerprint = cursorFingerprint(validatedCommit.cursorAfter);
        } catch (error) {
          if (isLeaseLostError(error)) throw error;
          return finishFailure(run, "system:page_commit_failed", aggregate, failureDetails("page_commit_outcome"));
        }
        if (committedCursorFingerprint.length === 0) {
          return finishFailure(run, "system:page_commit_failed", aggregate, failureDetails("page_commit_outcome"));
        }

        checkpointGeneration = validatedCommit.checkpointGeneration;
        currentCursor = validatedCommit.cursorAfter;
        currentEtag = validatedCommit.providerEtag;
        pagesProcessed = pagination.pagesProcessed;
        seenCursorFingerprints.add(committedCursorFingerprint);

        if (pagination.action === "continue") continue;

        const finishedAt = nowIso(dependencies.clock);
        const status = pagination.action === "yield" || hasQuarantine ? "partial" : "succeeded";
        const scheduledAt = pagination.action === "yield"
          ? finishedAt
          : pollAtFor(mode, phase, policy, finishedAt)
            ?? null;
        return finish(run, status, aggregate, {
          finishedAt,
          nextPollAt: scheduledAt,
          dataChanged,
        });
      }
    },
  };
}
