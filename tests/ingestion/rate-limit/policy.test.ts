import { describe, expect, it } from "vitest";

import { decideRateBudget } from "@/lib/ingestion/rate-limit/policy";

describe("provider budget policy", () => {
  it("allows an available request at the configured ceiling", () => {
    expect(decideRateBudget({ configuredLimit: 10, available: 4, now: "2026-10-08T17:00:00Z" })).toEqual({
      allowed: true,
      cost: 1,
      reason: "available",
    });
  });

  it("fails closed when configuration is missing", () => {
    expect(decideRateBudget({ now: "2026-10-08T17:00:00Z" })).toEqual({
      allowed: false,
      cost: 1,
      reason: "unknown_budget",
    });
  });

  it.each([
    { configuredLimit: 0, available: 0 },
    { configuredLimit: -1, available: 0 },
    { configuredLimit: 10, available: -1 },
    { configuredLimit: 10, available: 11 },
    { configuredLimit: 10.5, available: 2 },
  ])("rejects invalid budget values: $configuredLimit/$available", (input) => {
    expect(decideRateBudget({ ...input, now: "2026-10-08T17:00:00Z" })).toMatchObject({
      allowed: false,
      reason: "invalid_budget",
    });
  });

  it("rejects invalid costs and timestamps", () => {
    expect(decideRateBudget({ configuredLimit: 10, available: 5, cost: 0, now: "2026-10-08T17:00:00Z" })).toMatchObject({
      allowed: false,
      reason: "invalid_budget",
    });
    expect(decideRateBudget({ configuredLimit: 10, available: 5, cost: -1, now: "2026-10-08T17:00:00Z" })).toMatchObject({
      allowed: false,
      reason: "invalid_budget",
    });
    expect(decideRateBudget({ configuredLimit: 10, available: 5, now: "not-a-time" })).toMatchObject({
      allowed: false,
      reason: "invalid_budget",
    });
    expect(decideRateBudget({ configuredLimit: 10, available: 5, trustedResetAt: "not-a-time", now: "2026-10-08T17:00:00Z" })).toMatchObject({
      allowed: false,
      reason: "invalid_budget",
    });
  });

  it("returns an exhausted decision with the future trusted reset", () => {
    expect(decideRateBudget({
      configuredLimit: 10,
      available: 0,
      trustedResetAt: "2026-10-08T18:00:00-07:00",
      now: "2026-10-08T17:00:00Z",
      cost: 2,
    })).toEqual({
      allowed: false,
      cost: 2,
      retryAt: "2026-10-09T01:00:00.000Z",
      reason: "exhausted",
    });
  });

  it("restores the configured ceiling at an elapsed trusted reset", () => {
    expect(decideRateBudget({
      configuredLimit: 10,
      available: 0,
      trustedResetAt: "2026-10-08T17:00:00Z",
      now: "2026-10-08T17:00:00Z",
      cost: 3,
    })).toEqual({
      allowed: true,
      cost: 3,
      reason: "available",
    });
  });

  it("does not treat observed availability as a new configured ceiling", () => {
    expect(decideRateBudget({ configuredLimit: 10, available: 10, cost: 10, now: "2026-10-08T17:00:00Z" })).toMatchObject({
      allowed: true,
      cost: 10,
    });
    expect(decideRateBudget({ configuredLimit: 10, available: 0, cost: 1, now: "2026-10-08T17:00:00Z" })).toMatchObject({
      allowed: false,
      reason: "exhausted",
    });
  });
});
