import { describe, expect, it } from "vitest";

import { validateAccountingCounts, type IngestionCounts } from "@/lib/ingestion/orchestrator/accounting";

const validCounts: IngestionCounts = {
  fetchedCount: 10,
  normalizedCount: 6,
  projectedCount: 2,
  unchangedCount: 1,
  quarantinedCount: 1,
  skippedCount: 1,
  failedCount: 1,
};

describe("accounting policy", () => {
  it("accepts valid conserved counts while keeping fetched independent", () => {
    expect(validateAccountingCounts(validCounts)).toEqual({
      accepted: true,
      counts: validCounts,
      reason: "accepted",
    });
  });

  it("retains validated counts for a conservation failure", () => {
    expect(validateAccountingCounts({ ...validCounts, normalizedCount: 7 })).toEqual({
      accepted: false,
      counts: { ...validCounts, normalizedCount: 7 },
      reason: "not_conserved",
    });
  });

  it.each([
    { fetchedCount: -1 },
    { normalizedCount: 1.5 },
    { projectedCount: Number.NaN },
    { unchangedCount: Number.POSITIVE_INFINITY },
    { quarantinedCount: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects malformed count values: %j", (override) => {
    expect(validateAccountingCounts({ ...validCounts, ...override })).toEqual({
      accepted: false,
      counts: null,
      reason: "invalid_counts",
    });
  });

  it.each([
    null,
    [],
    { ...validCounts, extra: 1 },
    { ...validCounts, failedCount: undefined },
  ])("rejects malformed count objects: %j", (input) => {
    expect(validateAccountingCounts(input)).toEqual({
      accepted: false,
      counts: null,
      reason: "invalid_counts",
    });
  });

  it("uses exact arithmetic for safe-integer totals", () => {
    const counts = {
      fetchedCount: Number.MAX_SAFE_INTEGER,
      normalizedCount: Number.MAX_SAFE_INTEGER,
      projectedCount: Number.MAX_SAFE_INTEGER - 3,
      unchangedCount: 1,
      quarantinedCount: 1,
      skippedCount: 1,
      failedCount: 0,
    };
    expect(validateAccountingCounts(counts)).toEqual({ accepted: true, counts, reason: "accepted" });
  });

  it("does not mutate caller input", () => {
    const input = { ...validCounts };
    const before = { ...input };
    validateAccountingCounts(input);
    expect(input).toEqual(before);
  });

  it("rejects class instances while accepting null-prototype objects", () => {
    class Counts {
      fetchedCount = validCounts.fetchedCount;
      normalizedCount = validCounts.normalizedCount;
      projectedCount = validCounts.projectedCount;
      unchangedCount = validCounts.unchangedCount;
      quarantinedCount = validCounts.quarantinedCount;
      skippedCount = validCounts.skippedCount;
      failedCount = validCounts.failedCount;
    }

    expect(validateAccountingCounts(new Counts())).toEqual({
      accepted: false,
      counts: null,
      reason: "invalid_counts",
    });
    expect(validateAccountingCounts(Object.assign(Object.create(null), validCounts))).toEqual({
      accepted: true,
      counts: validCounts,
      reason: "accepted",
    });
  });

  it.each([
    new Proxy(validCounts, { get: () => { throw new Error("blocked"); } }),
    new Proxy(validCounts, { ownKeys: () => { throw new Error("blocked"); } }),
  ])("fails closed for hostile count objects", (input) => {
    expect(() => validateAccountingCounts(input)).not.toThrow();
    expect(validateAccountingCounts(input)).toEqual({
      accepted: false,
      counts: null,
      reason: "invalid_counts",
    });
  });

  it("fails closed for a revoked proxy", () => {
    const revocable = Proxy.revocable({ ...validCounts }, {});
    revocable.revoke();
    expect(validateAccountingCounts(revocable.proxy)).toEqual({
      accepted: false,
      counts: null,
      reason: "invalid_counts",
    });
  });
});
