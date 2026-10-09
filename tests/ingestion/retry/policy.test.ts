import { describe, expect, it } from "vitest";

import { decideRetry } from "@/lib/ingestion/retry/policy";
import { providerFailureCodes, type ProviderFailure, type ProviderFailureCode } from "@/lib/ingestion/errors";

const failure = (code: ProviderFailureCode, overrides: Partial<ProviderFailure> = {}): ProviderFailure => ({
  code,
  retry: code === "rate_limited" ? "provider_reset" : ["timeout", "network", "provider_server"].includes(code) ? "backoff" : "never",
  message: "Synthetic failure",
  details: { fixture: true },
  ...overrides,
});

describe("retry and deterministic backoff policy", () => {
  it.each([
    ["timeout", "retryable"],
    ["network", "retryable"],
    ["provider_server", "retryable"],
    ["rate_limited", "provider_reset"],
  ] as const)("retries %s with reason %s", (code, reason) => {
    const decision = decideRetry({
      failure: failure(code),
      retryIndex: 0,
      now: "2026-10-08T17:00:00Z",
      claimKey: "claim-synthetic",
    });

    expect(decision.retry).toBe(true);
    expect(decision.retryIndex).toBe(1);
    expect(decision.reason).toBe(reason);
    expect(decision.delaySeconds).toBeGreaterThanOrEqual(0);
    expect(decision.delaySeconds).toBeLessThanOrEqual(30);
    expect(decision.retryAt).toMatch(/Z$/);
  });

  it.each(providerFailureCodes.filter((code) => !["timeout", "network", "provider_server", "rate_limited"].includes(code)))
    ("does not retry terminal failure %s", (code) => {
      expect(decideRetry({
        failure: failure(code),
        retryIndex: 0,
        now: "2026-10-08T17:00:00Z",
        claimKey: "claim-synthetic",
      })).toEqual({ retry: false, retryIndex: 0, reason: "terminal" });
    });

  it.each([0, 1, 2] as const)("allows retry indexes %s and applies exponential caps", (retryIndex) => {
    const decision = decideRetry({
      failure: failure("timeout"),
      retryIndex,
      now: "2026-10-08T17:00:00Z",
      claimKey: "claim-synthetic",
    });

    expect(decision.retry).toBe(true);
    expect(decision.retryIndex).toBe(retryIndex + 1);
    expect(decision.delaySeconds).toBeLessThanOrEqual(Math.min(900, 30 * 2 ** retryIndex));
  });

  it("exhausts after three retries, for four total attempts", () => {
    expect(decideRetry({
      failure: failure("timeout"),
      retryIndex: 3,
      now: "2026-10-08T17:00:00Z",
      claimKey: "claim-synthetic",
    })).toEqual({ retry: false, retryIndex: 3, reason: "max_retries" });
  });

  it("selects the later of provider reset, Retry-After, and jitter backoff", () => {
    const decision = decideRetry({
      failure: failure("rate_limited", { retryAt: "2026-10-08T18:00:00-07:00" }),
      retryIndex: 0,
      now: "2026-10-08T17:00:00Z",
      claimKey: "claim-synthetic",
      retryAfterAt: "2026-10-09T02:00:00Z",
    });

    expect(decision.reason).toBe("provider_reset");
    expect(decision.retryAt).toBe("2026-10-09T02:00:00.000Z");
    expect(decision.delaySeconds).toBe(9 * 60 * 60);
  });

  it("produces repeatable full jitter within the inclusive delay range", () => {
    const input = {
      failure: failure("timeout"),
      retryIndex: 1,
      now: "2026-10-08T17:00:00Z",
      claimKey: "claim-synthetic",
    } as const;
    const first = decideRetry(input);
    const second = decideRetry(input);

    expect(first).toEqual(second);
    expect(first.delaySeconds).toBeGreaterThanOrEqual(0);
    expect(first.delaySeconds).toBeLessThanOrEqual(60);
  });

  it("normalizes retry output to UTC regardless of input timezone", () => {
    const decision = decideRetry({
      failure: failure("timeout"),
      retryIndex: 0,
      now: "2026-10-08T10:00:00-07:00",
      claimKey: "claim-synthetic",
      retryAfterAt: "2026-10-08T10:01:00-07:00",
    });

    expect(decision.retryAt).toBe("2026-10-08T17:01:00.000Z");
  });

  it("rejects invalid retry indexes, timestamps, and claim keys", () => {
    expect(() => decideRetry({ failure: failure("timeout"), retryIndex: -1, now: "2026-10-08T17:00:00Z", claimKey: "claim" })).toThrow();
    expect(() => decideRetry({ failure: failure("timeout"), retryIndex: 0, now: "not-a-time", claimKey: "claim" })).toThrow();
    expect(() => decideRetry({ failure: failure("timeout"), retryIndex: 0, now: "2026-10-08T17:00:00Z", claimKey: " " })).toThrow();
    expect(() => decideRetry({ failure: failure("timeout"), retryIndex: 0, now: "2026-10-08T17:00:00Z", claimKey: "claim", retryAfterAt: "not-a-time" })).toThrow();
  });
});
