import { z } from "zod";

import { isoDateTimeSchema } from "@/lib/ingestion/contracts";
import { providerFailureCodes, type ProviderFailureCode } from "@/lib/ingestion/errors";

export { providerFailureCodes } from "@/lib/ingestion/errors";
export type { ProviderFailureCode } from "@/lib/ingestion/errors";

export type SystemFailureCode =
  | "system:adapter_mismatch" | "system:adapter_registry_failed" | "system:binding_mode_read_failed"
  | "system:budget_reservation_failed" | "system:checkpoint_conflict" | "system:credential_resolution_failed"
  | "system:invalid_binding_mode" | "system:invalid_budget_decision" | "system:invalid_poll_policy"
  | "system:invalid_provider_failure" | "system:invalid_request" | "system:lease_renewal_failed"
  | "system:missing_credential" | "system:observation_dispatch_failed" | "system:page_commit_failed"
  | "system:page_conflict" | "system:response_recording_failed" | "system:lease_expired";

export type PersistedFailureCode = `provider:${ProviderFailureCode}` | SystemFailureCode;

export type IngestionFailureCode = ProviderFailureCode | SystemFailureCode;

export type FailureSchedulingInput = Readonly<{
  failureCode: string;
  now: string;
  deterministicBackoffAt?: string | null;
  providerRetryAt?: string | null;
  providerResetAt?: string | null;
}>;

export type FailureSchedulingDecision =
  | Readonly<{
      accepted: true;
      failureCode: PersistedFailureCode;
      outcome: "failed" | "rate_limited";
      disposition: "retry" | "unschedule" | "disable";
      retryAt: string | null;
      incrementConsecutiveFailures: boolean;
      itemFailedCountDelta: 0;
      reason: "retryable_provider" | "rate_limited_provider" | "terminal_provider" | "terminal_system" | "lease_expired";
    }>
  | Readonly<{
      accepted: false;
      failureCode: "system:invalid_provider_failure";
      outcome: "failed";
      disposition: "unschedule";
      retryAt: null;
      incrementConsecutiveFailures: true;
      itemFailedCountDelta: 0;
      reason: "invalid_input" | "unknown_failure_code";
    }>;

const retryableProviderCodes = new Set<ProviderFailureCode>(["timeout", "network", "provider_server", "rate_limited"]);
const systemFailureCodes = [
  "system:adapter_mismatch", "system:adapter_registry_failed", "system:binding_mode_read_failed",
  "system:budget_reservation_failed", "system:checkpoint_conflict", "system:credential_resolution_failed",
  "system:invalid_binding_mode", "system:invalid_budget_decision", "system:invalid_poll_policy",
  "system:invalid_provider_failure", "system:invalid_request", "system:lease_renewal_failed",
  "system:missing_credential", "system:observation_dispatch_failed", "system:page_commit_failed",
  "system:page_conflict", "system:response_recording_failed", "system:lease_expired",
] as const satisfies readonly SystemFailureCode[];
export { systemFailureCodes };

const timestampFields = ["now", "deterministicBackoffAt", "providerRetryAt", "providerResetAt"] as const;
const failureInputSchema = z.object({
  failureCode: z.string(),
  now: isoDateTimeSchema,
  deterministicBackoffAt: isoDateTimeSchema.nullable().optional(),
  providerRetryAt: isoDateTimeSchema.nullable().optional(),
  providerResetAt: isoDateTimeSchema.nullable().optional(),
}).strict();

const rejected = (reason: "invalid_input" | "unknown_failure_code"): FailureSchedulingDecision => ({
  accepted: false,
  failureCode: "system:invalid_provider_failure",
  outcome: "failed",
  disposition: "unschedule",
  retryAt: null,
  incrementConsecutiveFailures: true,
  itemFailedCountDelta: 0,
  reason,
});

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const canonicalIso = (value: string): string => new Date(Date.parse(value)).toISOString();

export function decideFailureScheduling(input: unknown): FailureSchedulingDecision {
  if (!isPlainObject(input)) return rejected("invalid_input");
  const parsed = failureInputSchema.safeParse(input);
  if (!parsed.success) return rejected("invalid_input");
  const value = parsed.data;
  if (timestampFields.some((field) => field !== "now" && field in value && value[field] === null)) {
    return rejected("invalid_input");
  }

  const isProvider = (providerFailureCodes as readonly string[]).includes(value.failureCode);
  const isSystem = (systemFailureCodes as readonly string[]).includes(value.failureCode);
  if (!isProvider && !isSystem) return rejected("unknown_failure_code");

  const code = value.failureCode as IngestionFailureCode;
  const canonicalCode = isProvider ? `provider:${code}` as PersistedFailureCode : code as SystemFailureCode;
  if (isProvider && retryableProviderCodes.has(code as ProviderFailureCode)) {
    if (value.deterministicBackoffAt === undefined || value.deterministicBackoffAt === null) return rejected("invalid_input");
    const retryAt = [value.now, value.deterministicBackoffAt, value.providerRetryAt, value.providerResetAt]
      .filter((timestamp): timestamp is string => timestamp !== undefined && timestamp !== null)
      .map(canonicalIso)
      .sort()
      .at(-1);
    if (retryAt === undefined) return rejected("invalid_input");
    return {
      accepted: true,
      failureCode: canonicalCode,
      outcome: code === "rate_limited" ? "rate_limited" : "failed",
      disposition: "retry",
      retryAt,
      incrementConsecutiveFailures: true,
      itemFailedCountDelta: 0,
      reason: code === "rate_limited" ? "rate_limited_provider" : "retryable_provider",
    };
  }

  if (isProvider && (code === "authentication" || code === "authorization")) {
    return {
      accepted: true,
      failureCode: canonicalCode,
      outcome: "failed",
      disposition: "disable",
      retryAt: null,
      incrementConsecutiveFailures: true,
      itemFailedCountDelta: 0,
      reason: "terminal_provider",
    };
  }

  return {
    accepted: true,
    failureCode: canonicalCode,
    outcome: "failed",
    disposition: "unschedule",
    retryAt: null,
    incrementConsecutiveFailures: code !== "system:lease_expired",
    itemFailedCountDelta: 0,
    reason: code === "system:lease_expired" ? "lease_expired" : isProvider ? "terminal_provider" : "terminal_system",
  };
}

export type HealthTransitionInput = Readonly<{
  mode: "disabled" | "shadow" | "write";
  currentHealthStatus: "healthy" | "degraded" | "stale" | "disabled";
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastDataAt: string | null;
  staleAfterSeconds: number;
  now: string;
  runOutcome: "succeeded" | "partial" | "failed" | "rate_limited" | "canceled";
  dataChanged: boolean;
  hasItemFailure: boolean;
  hasQuarantine: boolean;
  hasContinuation: boolean;
  failureCode: PersistedFailureCode | null;
}>;

export type HealthTransitionDecision =
  | Readonly<{
      accepted: true;
      mode: "disabled" | "shadow" | "write";
      healthStatus: "healthy" | "degraded" | "stale" | "disabled";
      consecutiveFailures: number;
      updateLastSuccessAt: boolean;
      updateLastDataAt: boolean;
      reason: "success_changed" | "success_unchanged" | "partial_continuation" | "partial_quarantine" |
        "partial_item_failure" | "failed" | "rate_limited" | "canceled" | "disabled_mode" |
        "authentication_disabled" | "authorization_disabled" | "stale_input_fresh_data" | "stale_input_no_fresh_data";
    }>
  | Readonly<{ accepted: false; reason: "invalid_input" }>;

type AcceptedHealthTransition = Exclude<HealthTransitionDecision, { accepted: false }>;

const healthInputSchema = z.object({
  mode: z.enum(["disabled", "shadow", "write"]),
  currentHealthStatus: z.enum(["healthy", "degraded", "stale", "disabled"]),
  consecutiveFailures: z.number().int().nonnegative().safe(),
  lastSuccessAt: isoDateTimeSchema.nullable(),
  lastDataAt: isoDateTimeSchema.nullable(),
  staleAfterSeconds: z.number().int().min(60).safe(),
  now: isoDateTimeSchema,
  runOutcome: z.enum(["succeeded", "partial", "failed", "rate_limited", "canceled"]),
  dataChanged: z.boolean(),
  hasItemFailure: z.boolean(),
  hasQuarantine: z.boolean(),
  hasContinuation: z.boolean(),
  failureCode: z.string().nullable(),
}).strict();

const isPersistedFailureCode = (value: string): value is PersistedFailureCode =>
  value.startsWith("provider:")
    ? (providerFailureCodes as readonly string[]).includes(value.slice("provider:".length))
    : (systemFailureCodes as readonly string[]).includes(value);

const healthRejected: HealthTransitionDecision = { accepted: false, reason: "invalid_input" };

export const DEGRADED_AFTER_FAILURES = 1;

export function decideHealthTransition(input: unknown): HealthTransitionDecision {
  if (!isPlainObject(input)) return healthRejected;
  const parsed = healthInputSchema.safeParse(input);
  if (!parsed.success) return healthRejected;
  const value = parsed.data;
  const failureCode = value.failureCode;
  if (failureCode !== null && !isPersistedFailureCode(failureCode)) return healthRejected;

  const partialFlags = [value.hasContinuation, value.hasQuarantine, value.hasItemFailure].filter(Boolean).length;
  if (value.runOutcome === "succeeded" && (failureCode !== null || partialFlags !== 0)) return healthRejected;
  if (value.runOutcome === "partial" && (failureCode !== null || partialFlags === 0)) return healthRejected;
  if (value.runOutcome === "canceled" && (failureCode !== null || value.dataChanged || partialFlags !== 0)) return healthRejected;
  if (value.runOutcome === "failed" && (failureCode === null || failureCode === "provider:rate_limited")) return healthRejected;
  if (value.runOutcome === "rate_limited" && failureCode !== null && failureCode !== "provider:rate_limited") return healthRejected;

  const now = Date.parse(value.now);
  const lastData = value.lastDataAt === null ? null : Date.parse(value.lastDataAt);
  const staleByAge = lastData === null || now - lastData > value.staleAfterSeconds * 1000;
  const staleInput = value.currentHealthStatus === "stale" || staleByAge;
  const output = (healthStatus: AcceptedHealthTransition["healthStatus"], consecutiveFailures: number, updateLastSuccessAt: boolean, reason: AcceptedHealthTransition["reason"]): AcceptedHealthTransition => ({
    accepted: true,
    mode: value.mode,
    healthStatus,
    consecutiveFailures,
    updateLastSuccessAt,
    updateLastDataAt: value.dataChanged,
    reason,
  });

  if (failureCode === "provider:authentication") return { ...output("disabled", value.consecutiveFailures + 1, false, "authentication_disabled"), mode: "disabled" };
  if (failureCode === "provider:authorization") return { ...output("disabled", value.consecutiveFailures + 1, false, "authorization_disabled"), mode: "disabled" };
  if (value.mode === "disabled") return output("disabled", value.consecutiveFailures, false, "disabled_mode");
  if (value.runOutcome === "canceled") return output(value.currentHealthStatus, value.consecutiveFailures, false, "canceled");
  if (staleInput && value.dataChanged) {
    const healthStatus = value.runOutcome === "succeeded" || (value.runOutcome === "partial" && value.hasContinuation && !value.hasQuarantine && !value.hasItemFailure) ? "healthy" : "degraded";
    return output(healthStatus, value.runOutcome === "partial" && value.hasItemFailure ? value.consecutiveFailures + 1 : value.runOutcome === "failed" || value.runOutcome === "rate_limited" ? value.consecutiveFailures + 1 : 0, value.runOutcome === "succeeded" || (value.runOutcome === "partial" && value.hasContinuation && !value.hasQuarantine && !value.hasItemFailure), "stale_input_fresh_data");
  }
  if (staleInput) {
    return output("stale", value.runOutcome === "partial" && value.hasItemFailure ? value.consecutiveFailures + 1 : value.runOutcome === "failed" || value.runOutcome === "rate_limited" ? value.consecutiveFailures + 1 : value.consecutiveFailures, value.runOutcome === "partial" && value.hasContinuation && !value.hasQuarantine && !value.hasItemFailure, "stale_input_no_fresh_data");
  }
  if (value.runOutcome === "succeeded") return output("healthy", 0, true, value.dataChanged ? "success_changed" : "success_unchanged");
  if (value.runOutcome === "partial") {
    if (value.hasItemFailure) return output("degraded", value.consecutiveFailures + 1, false, "partial_item_failure");
    if (value.hasQuarantine) return output("degraded", value.consecutiveFailures, false, "partial_quarantine");
    return output("healthy", 0, true, "partial_continuation");
  }
  if (value.runOutcome === "failed") return output("degraded", value.consecutiveFailures + 1, false, "failed");
  return output("degraded", value.consecutiveFailures + 1, false, "rate_limited");
}
