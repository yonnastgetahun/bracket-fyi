import { describe, expect, it } from "vitest";

import {
  decideFailureScheduling,
  decideHealthTransition,
  providerFailureCodes,
  systemFailureCodes,
  type PersistedFailureCode,
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

const persistedFailureCodes: readonly PersistedFailureCode[] = [
  ...providerFailureCodes.map((code) => `provider:${code}` as PersistedFailureCode),
  ...systemFailureCodes,
];

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

  it("treats nullable optional timestamps as absent", () => {
    expect(decideFailureScheduling({
      failureCode: "timeout",
      now: baseFailure.now,
      deterministicBackoffAt: baseFailure.deterministicBackoffAt,
      providerRetryAt: null,
      providerResetAt: null,
    })).toMatchObject({ accepted: true, retryAt: "2026-10-10T12:00:30.000Z" });
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

  it("returns complete decisions for every provider code", () => {
    const decisions = Object.fromEntries(providerFailureCodes.map((code) => [
      code,
      decideFailureScheduling({ ...baseFailure, failureCode: code }),
    ]));
    expect(decisions.authentication).toMatchObject({ outcome: "failed", disposition: "disable", retryAt: null, reason: "terminal_provider" });
    expect(decisions.authorization).toMatchObject({ outcome: "failed", disposition: "disable", retryAt: null, reason: "terminal_provider" });
    for (const code of ["not_found", "invalid_response", "unsupported_shape", "permanent"] as const) {
      expect(decisions[code]).toMatchObject({ outcome: "failed", disposition: "unschedule", retryAt: null, reason: "terminal_provider" });
    }
    for (const code of ["timeout", "network", "provider_server"] as const) {
      expect(decisions[code]).toMatchObject({ outcome: "failed", disposition: "retry", reason: "retryable_provider", retryAt: "2026-10-10T12:02:00.000Z" });
    }
    expect(decisions.rate_limited).toMatchObject({ outcome: "rate_limited", disposition: "retry", reason: "rate_limited_provider", retryAt: "2026-10-10T12:02:00.000Z" });
  });

  it("returns complete decisions for every system code", () => {
    for (const failureCode of systemFailureCodes) {
      expect(decideFailureScheduling({ ...baseFailure, failureCode })).toMatchObject({
        accepted: true,
        failureCode,
        outcome: "failed",
        disposition: "unschedule",
        retryAt: null,
        incrementConsecutiveFailures: failureCode !== "system:lease_expired",
        itemFailedCountDelta: 0,
        reason: failureCode === "system:lease_expired" ? "lease_expired" : "terminal_system",
      });
    }
  });

  it("fails closed for hostile scheduling objects", () => {
    const throwingGet = new Proxy({ ...baseFailure, failureCode: "timeout" }, { get: () => { throw new Error("secret"); } });
    const throwingKeys = new Proxy({ ...baseFailure, failureCode: "timeout" }, { ownKeys: () => { throw new Error("secret"); } });
    const revoked = Proxy.revocable({ ...baseFailure, failureCode: "timeout" }, {});
    revoked.revoke();
    for (const input of [throwingGet, throwingKeys, revoked.proxy]) {
      expect(() => decideFailureScheduling(input)).not.toThrow();
      expect(decideFailureScheduling(input)).toMatchObject({ accepted: false, reason: "invalid_input" });
    }
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

  it("preserves disabled-mode failure counters without authentication", () => {
    expect(decideHealthTransition({
      ...baseHealth,
      mode: "disabled",
      consecutiveFailures: 4,
      runOutcome: "failed",
      failureCode: "system:page_commit_failed",
      dataChanged: false,
    })).toMatchObject({ mode: "disabled", healthStatus: "disabled", consecutiveFailures: 4, reason: "disabled_mode" });
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

  it.each([
    { input: { hasContinuation: false, hasQuarantine: false, hasItemFailure: false }, expected: { accepted: false } },
    { input: { hasContinuation: true, hasQuarantine: false, hasItemFailure: false }, expected: { reason: "partial_continuation", healthStatus: "healthy", consecutiveFailures: 0, updateLastSuccessAt: true } },
    { input: { hasContinuation: false, hasQuarantine: true, hasItemFailure: false }, expected: { reason: "partial_quarantine", healthStatus: "degraded", consecutiveFailures: 2, updateLastSuccessAt: false } },
    { input: { hasContinuation: false, hasQuarantine: false, hasItemFailure: true }, expected: { reason: "partial_item_failure", healthStatus: "degraded", consecutiveFailures: 3, updateLastSuccessAt: false } },
    { input: { hasContinuation: true, hasQuarantine: true, hasItemFailure: false }, expected: { reason: "partial_quarantine", healthStatus: "degraded", consecutiveFailures: 2, updateLastSuccessAt: false } },
    { input: { hasContinuation: true, hasQuarantine: false, hasItemFailure: true }, expected: { reason: "partial_item_failure", healthStatus: "degraded", consecutiveFailures: 3, updateLastSuccessAt: false } },
    { input: { hasContinuation: false, hasQuarantine: true, hasItemFailure: true }, expected: { reason: "partial_item_failure", healthStatus: "degraded", consecutiveFailures: 3, updateLastSuccessAt: false } },
    { input: { hasContinuation: true, hasQuarantine: true, hasItemFailure: true }, expected: { reason: "partial_item_failure", healthStatus: "degraded", consecutiveFailures: 3, updateLastSuccessAt: false } },
  ])("handles all partial flag combinations: %j", (flags) => {
    const decision = decideHealthTransition({
      ...baseHealth,
      consecutiveFailures: 2,
      runOutcome: "partial",
      dataChanged: false,
      ...flags.input,
    } as HealthTransitionInput);
    if (flags.expected.accepted === false) {
      expect(decision).toEqual({ accepted: false, reason: "invalid_input" });
    } else {
      expect(decision).toMatchObject({
        accepted: true,
        ...flags.expected,
        updateLastDataAt: false,
      });
    }
  });

  it("separates stale status selection from counter calculation", () => {
    expect(decideHealthTransition({ ...baseHealth, currentHealthStatus: "stale", lastDataAt: "2026-10-10T11:58:00Z", dataChanged: false, consecutiveFailures: 4 })).toMatchObject({ reason: "stale_input_no_fresh_data", healthStatus: "stale", consecutiveFailures: 0, updateLastSuccessAt: true });
    expect(decideHealthTransition({ ...baseHealth, currentHealthStatus: "stale", lastDataAt: "2026-10-10T11:58:00Z", runOutcome: "partial", hasContinuation: true, dataChanged: false, consecutiveFailures: 4 })).toMatchObject({ reason: "stale_input_no_fresh_data", healthStatus: "stale", consecutiveFailures: 0, updateLastSuccessAt: true });
    expect(decideHealthTransition({ ...baseHealth, currentHealthStatus: "stale", lastDataAt: "2026-10-10T11:58:00Z", runOutcome: "partial", hasQuarantine: true, dataChanged: true, consecutiveFailures: 4 })).toMatchObject({ reason: "stale_input_fresh_data", healthStatus: "degraded", consecutiveFailures: 4, updateLastSuccessAt: false, updateLastDataAt: true });
    expect(decideHealthTransition({ ...baseHealth, currentHealthStatus: "stale", lastDataAt: "2026-10-10T11:58:00Z", runOutcome: "partial", hasItemFailure: true, dataChanged: true, consecutiveFailures: 4 })).toMatchObject({ reason: "stale_input_fresh_data", healthStatus: "degraded", consecutiveFailures: 5, updateLastSuccessAt: false, updateLastDataAt: true });
    expect(decideHealthTransition({ ...baseHealth, currentHealthStatus: "stale", lastDataAt: "2026-10-10T11:58:00Z", runOutcome: "rate_limited", failureCode: "provider:rate_limited", dataChanged: true, consecutiveFailures: 4 })).toMatchObject({ reason: "stale_input_fresh_data", healthStatus: "degraded", consecutiveFailures: 5, updateLastSuccessAt: false, updateLastDataAt: true });
    expect(decideHealthTransition({ ...baseHealth, lastDataAt: "2026-10-10T11:59:00Z", runOutcome: "partial", hasQuarantine: true, dataChanged: false, consecutiveFailures: 4 })).toMatchObject({ reason: "partial_quarantine", healthStatus: "degraded", consecutiveFailures: 4 });
  });

  it("rejects an unsafe failure increment while allowing maximum-safe resets and preserves", () => {
    expect(decideHealthTransition({ ...baseHealth, consecutiveFailures: Number.MAX_SAFE_INTEGER, runOutcome: "failed", failureCode: "system:page_commit_failed", dataChanged: false })).toEqual({ accepted: false, reason: "invalid_input" });
    expect(decideHealthTransition({ ...baseHealth, consecutiveFailures: Number.MAX_SAFE_INTEGER, dataChanged: false })).toMatchObject({ accepted: true, consecutiveFailures: 0 });
    expect(decideHealthTransition({ ...baseHealth, consecutiveFailures: Number.MAX_SAFE_INTEGER, runOutcome: "partial", hasQuarantine: true, dataChanged: false })).toMatchObject({ accepted: true, consecutiveFailures: Number.MAX_SAFE_INTEGER });
  });

  it("fails closed for hostile health objects", () => {
    const throwingGet = new Proxy(baseHealth, { get: () => { throw new Error("blocked"); } });
    const throwingKeys = new Proxy(baseHealth, { ownKeys: () => { throw new Error("blocked"); } });
    const revoked = Proxy.revocable({ ...baseHealth }, {});
    revoked.revoke();
    for (const input of [throwingGet, throwingKeys, revoked.proxy]) {
      expect(() => decideHealthTransition(input)).not.toThrow();
      expect(decideHealthTransition(input)).toEqual({ accepted: false, reason: "invalid_input" });
    }
  });

  describe("exhaustive health cross-field matrix", () => {
    it.each(persistedFailureCodes)("rejects %s for succeeded", (failureCode) => {
      expect(decideHealthTransition({ ...baseHealth, failureCode })).toEqual({ accepted: false, reason: "invalid_input" });
    });

    it.each(persistedFailureCodes)("rejects %s for partial", (failureCode) => {
      expect(decideHealthTransition({ ...baseHealth, runOutcome: "partial", hasContinuation: true, failureCode })).toEqual({ accepted: false, reason: "invalid_input" });
    });

    it.each(persistedFailureCodes)("rejects %s for canceled", (failureCode) => {
      expect(decideHealthTransition({ ...baseHealth, runOutcome: "canceled", dataChanged: false, failureCode })).toEqual({ accepted: false, reason: "invalid_input" });
    });

    it.each([
      { dataChanged: true },
      { hasContinuation: true },
      { hasQuarantine: true },
      { hasItemFailure: true },
    ])("rejects canceled with an active-state field: %j", (override) => {
      expect(decideHealthTransition({ ...baseHealth, runOutcome: "canceled", dataChanged: false, ...override })).toEqual({ accepted: false, reason: "invalid_input" });
    });

    it.each(persistedFailureCodes.filter((code) => code !== "provider:rate_limited"))("accepts %s for failed", (failureCode) => {
      const decision = decideHealthTransition({ ...baseHealth, runOutcome: "failed", dataChanged: false, failureCode });
      expect(decision).toMatchObject({ accepted: true, reason: failureCode === "provider:authentication" ? "authentication_disabled" : failureCode === "provider:authorization" ? "authorization_disabled" : "failed" });
    });

    it.each([null, "provider:rate_limited"] as const)("rejects %s for failed", (failureCode) => {
      expect(decideHealthTransition({ ...baseHealth, runOutcome: "failed", dataChanged: false, failureCode })).toEqual({ accepted: false, reason: "invalid_input" });
    });

    it.each([null, "provider:rate_limited"] as const)("accepts %s for rate_limited", (failureCode) => {
      expect(decideHealthTransition({ ...baseHealth, runOutcome: "rate_limited", dataChanged: false, failureCode })).toMatchObject({ accepted: true, reason: "rate_limited" });
    });

    it.each(persistedFailureCodes.filter((code) => code !== "provider:rate_limited"))("rejects %s for rate_limited", (failureCode) => {
      expect(decideHealthTransition({ ...baseHealth, runOutcome: "rate_limited", dataChanged: false, failureCode })).toEqual({ accepted: false, reason: "invalid_input" });
    });
  });

  it.each([
    { name: "success_changed", input: { ...baseHealth, dataChanged: true }, reason: "success_changed" },
    { name: "success_unchanged", input: { ...baseHealth, dataChanged: false }, reason: "success_unchanged" },
    { name: "partial_continuation", input: { ...baseHealth, runOutcome: "partial", dataChanged: false, hasContinuation: true }, reason: "partial_continuation" },
    { name: "partial_quarantine", input: { ...baseHealth, runOutcome: "partial", dataChanged: false, hasQuarantine: true }, reason: "partial_quarantine" },
    { name: "partial_item_failure", input: { ...baseHealth, runOutcome: "partial", dataChanged: false, hasItemFailure: true }, reason: "partial_item_failure" },
    { name: "failed", input: { ...baseHealth, runOutcome: "failed", dataChanged: false, failureCode: "system:page_commit_failed" }, reason: "failed" },
    { name: "rate_limited", input: { ...baseHealth, runOutcome: "rate_limited", dataChanged: false, failureCode: "provider:rate_limited" }, reason: "rate_limited" },
    { name: "canceled", input: { ...baseHealth, runOutcome: "canceled", dataChanged: false }, reason: "canceled" },
    { name: "disabled_mode", input: { ...baseHealth, mode: "disabled", dataChanged: false }, reason: "disabled_mode" },
    { name: "authentication_disabled", input: { ...baseHealth, runOutcome: "failed", dataChanged: false, failureCode: "provider:authentication" }, reason: "authentication_disabled" },
    { name: "authorization_disabled", input: { ...baseHealth, runOutcome: "failed", dataChanged: false, failureCode: "provider:authorization" }, reason: "authorization_disabled" },
    { name: "stale_input_fresh_data", input: { ...baseHealth, currentHealthStatus: "stale", lastDataAt: "2026-10-10T11:58:00Z", dataChanged: true }, reason: "stale_input_fresh_data" },
    { name: "stale_input_no_fresh_data", input: { ...baseHealth, currentHealthStatus: "stale", lastDataAt: "2026-10-10T11:58:00Z", dataChanged: false }, reason: "stale_input_no_fresh_data" },
  ])("directly exercises the $name reason", ({ input, reason }) => {
    expect(decideHealthTransition(input)).toMatchObject({ accepted: true, reason });
  });

  it("treats the stale boundary as fresh and one millisecond beyond as stale", () => {
    const atBoundary = decideHealthTransition({ ...baseHealth, lastDataAt: "2026-10-10T11:59:00Z", dataChanged: false });
    const beyondBoundary = decideHealthTransition({ ...baseHealth, lastDataAt: "2026-10-10T11:58:59.999Z", dataChanged: false });
    expect(atBoundary).toMatchObject({ reason: "success_unchanged", healthStatus: "healthy" });
    expect(beyondBoundary).toMatchObject({ reason: "stale_input_no_fresh_data", healthStatus: "stale" });
  });
});
