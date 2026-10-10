import { describe, expect, it } from "vitest";

import {
  decideFailureScheduling,
  decideHealthTransition,
  providerFailureCodes,
  systemFailureCodes,
  type FailureSchedulingDecision,
  type HealthTransitionInput,
} from "@/lib/ingestion/orchestrator/health";

const baseFailure = {
  now: "2026-10-10T12:00:00.000Z",
  deterministicBackoffAt: "2026-10-10T12:00:30.000Z",
  providerRetryAt: "2026-10-10T12:01:00.000Z",
  providerResetAt: "2026-10-10T12:02:00.000Z",
};

const baseHealth: HealthTransitionInput = {
  mode: "write",
  currentHealthStatus: "healthy",
  consecutiveFailures: 0,
  lastSuccessAt: "2026-10-10T11:59:00.000Z",
  lastDataAt: "2026-10-10T11:59:00.000Z",
  staleAfterSeconds: 60,
  now: "2026-10-10T12:00:00.000Z",
  runOutcome: "succeeded",
  dataChanged: true,
  hasItemFailure: false,
  hasQuarantine: false,
  hasContinuation: false,
  failureCode: null,
};

describe("failure scheduling policy", () => {
  it.each(providerFailureCodes)("maps provider code %s canonically", (code) => {
    const decision = decideFailureScheduling({ ...baseFailure, failureCode: code });
    expect(decision.accepted).toBe(true);
    expect(decision.failureCode).toBe(`provider:${code}`);
    expect(decision.itemFailedCountDelta).toBe(0);
    expect(decision.incrementConsecutiveFailures).toBe(true);
  });

  it.each(systemFailureCodes)("maps system code %s as terminal", (failureCode) => {
    const decision = decideFailureScheduling({ ...baseFailure, failureCode }) as FailureSchedulingDecision;
    expect(decision.accepted).toBe(true);
    expect(decision.failureCode).toBe(failureCode);
    expect(decision.outcome).toBe("failed");
    expect(decision.disposition).toBe(failureCode === "system:lease_expired" ? "unschedule" : "unschedule");
    expect(decision.incrementConsecutiveFailures).toBe(failureCode !== "system:lease_expired");
    expect(decision.itemFailedCountDelta).toBe(0);
  });

  it("selects the latest retry instant and emits UTC ISO", () => {
    const decision = decideFailureScheduling({
      failureCode: "timeout",
      now: "2026-10-10T05:00:00-07:00",
      deterministicBackoffAt: "2026-10-10T12:00:30Z",
      providerRetryAt: "2026-10-10T12:01:00+00:00",
      providerResetAt: "2026-10-10T12:02:00Z",
    });
    expect(decision).toMatchObject({ accepted: true, retryAt: "2026-10-10T12:02:00.000Z" });
  });

  it("uses an exact tie deterministically", () => {
    const decision = decideFailureScheduling({
      failureCode: "network",
      now: "2026-10-10T12:00:30Z",
      deterministicBackoffAt: "2026-10-10T12:00:30Z",
    });
    expect(decision).toMatchObject({ accepted: true, retryAt: "2026-10-10T12:00:30.000Z" });
  });

  it.each([
    { failureCode: "timeout", deterministicBackoffAt: undefined },
    { failureCode: "network", deterministicBackoffAt: "not-a-time" },
    { failureCode: "provider_server", providerRetryAt: "not-a-time" },
    { failureCode: "permanent", providerResetAt: "not-a-time" },
    { failureCode: "permanent", unexpected: true },
  ])("rejects malformed scheduling input: %j", (input) => {
    const decision = decideFailureScheduling({ ...baseFailure, ...input });
    expect(decision).toEqual({
      accepted: false,
      failureCode: "system:invalid_provider_failure",
      outcome: "failed",
      disposition: "unschedule",
      retryAt: null,
      incrementConsecutiveFailures: true,
      itemFailedCountDelta: 0,
      reason: "invalid_input",
    });
  });

  it.each(["provider:timeout", " TIMEOUT", "TIMEOUT", "unknown"])("rejects noncanonical code %s", (failureCode) => {
    const decision = decideFailureScheduling({ ...baseFailure, failureCode });
    expect(decision.accepted).toBe(false);
    expect(decision.reason).toBe("unknown_failure_code");
  });

  it("requires a backoff for every retryable provider code", () => {
    expect(decideFailureScheduling({ failureCode: "rate_limited", now: baseFailure.now })).toMatchObject({
      accepted: false,
      reason: "invalid_input",
    });
  });
});

describe("health transition policy", () => {
  it("resets failures and updates both timestamps for changed success", () => {
    expect(decideHealthTransition(baseHealth)).toEqual({
      accepted: true,
      mode: "write",
      healthStatus: "healthy",
      consecutiveFailures: 0,
      updateLastSuccessAt: true,
      updateLastDataAt: true,
      reason: "success_changed",
    });
  });

  it("uses deterministic partial precedence", () => {
    expect(decideHealthTransition({ ...baseHealth, runOutcome: "partial", dataChanged: false, hasContinuation: true, hasQuarantine: true })).toMatchObject({ reason: "partial_quarantine" });
    expect(decideHealthTransition({ ...baseHealth, runOutcome: "partial", dataChanged: false, hasContinuation: true, hasItemFailure: true })).toMatchObject({ reason: "partial_item_failure" });
  });

  it("preserves committed-data freshness through a later failure", () => {
    expect(decideHealthTransition({
      ...baseHealth,
      runOutcome: "failed",
      failureCode: "system:page_commit_failed",
      dataChanged: true,
      currentHealthStatus: "stale",
    })).toMatchObject({
      healthStatus: "degraded",
      consecutiveFailures: 1,
      updateLastSuccessAt: false,
      updateLastDataAt: true,
      reason: "stale_input_fresh_data",
    });
  });

  it("accepts provider 429 and local budget exhaustion distinctly", () => {
    expect(decideHealthTransition({ ...baseHealth, runOutcome: "rate_limited", dataChanged: false, failureCode: "provider:rate_limited" })).toMatchObject({ reason: "rate_limited" });
    expect(decideHealthTransition({ ...baseHealth, runOutcome: "rate_limited", dataChanged: false, failureCode: null })).toMatchObject({ reason: "rate_limited" });
  });

  it("disables the binding for authentication and authorization", () => {
    expect(decideHealthTransition({ ...baseHealth, runOutcome: "failed", failureCode: "provider:authentication", dataChanged: false })).toMatchObject({ mode: "disabled", healthStatus: "disabled", reason: "authentication_disabled" });
    expect(decideHealthTransition({ ...baseHealth, runOutcome: "failed", failureCode: "provider:authorization", dataChanged: false })).toMatchObject({ mode: "disabled", healthStatus: "disabled", reason: "authorization_disabled" });
  });

  it("cancels before stale evaluation and preserves health", () => {
    expect(decideHealthTransition({
      ...baseHealth,
      currentHealthStatus: "stale",
      runOutcome: "canceled",
      dataChanged: false,
    })).toEqual({
      accepted: true,
      mode: "write",
      healthStatus: "stale",
      consecutiveFailures: 0,
      updateLastSuccessAt: false,
      updateLastDataAt: false,
      reason: "canceled",
    });
  });

  it.each([
    { runOutcome: "succeeded", failureCode: "provider:timeout" },
    { runOutcome: "partial", failureCode: "provider:timeout", hasContinuation: true },
    { runOutcome: "canceled", dataChanged: true },
    { runOutcome: "failed", failureCode: null },
    { runOutcome: "rate_limited", failureCode: "provider:timeout" },
  ])("rejects invalid cross-field health input: %j", (override) => {
    expect(decideHealthTransition({ ...baseHealth, ...override } as HealthTransitionInput)).toEqual({
      accepted: false,
      reason: "invalid_input",
    });
  });

  it("rejects malformed and unknown fields", () => {
    expect(decideHealthTransition({ ...baseHealth, unexpected: true })).toEqual({ accepted: false, reason: "invalid_input" });
    expect(decideHealthTransition({ ...baseHealth, staleAfterSeconds: 59 })).toEqual({ accepted: false, reason: "invalid_input" });
  });
});
