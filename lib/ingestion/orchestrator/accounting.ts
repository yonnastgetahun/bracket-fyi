import { z } from "zod";

export type IngestionCounts = Readonly<{
  fetchedCount: number;
  normalizedCount: number;
  projectedCount: number;
  unchangedCount: number;
  quarantinedCount: number;
  skippedCount: number;
  failedCount: number;
}>;

export type AccountingDecision =
  | Readonly<{ accepted: true; counts: IngestionCounts; reason: "accepted" }>
  | Readonly<{ accepted: false; counts: null; reason: "invalid_counts" }>
  | Readonly<{ accepted: false; counts: IngestionCounts; reason: "not_conserved" }>;

const countSchema = z.number().int().nonnegative().safe();
const countsSchema = z
  .object({
    fetchedCount: countSchema,
    normalizedCount: countSchema,
    projectedCount: countSchema,
    unchangedCount: countSchema,
    quarantinedCount: countSchema,
    skippedCount: countSchema,
    failedCount: countSchema,
  })
  .strict();

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  try {
    if (typeof value !== "object" || value === null) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
};

export function validateAccountingCounts(input: unknown): AccountingDecision {
  try {
    if (!isPlainObject(input)) return { accepted: false, counts: null, reason: "invalid_counts" };
    const parsed = countsSchema.safeParse(input);
    if (!parsed.success) return { accepted: false, counts: null, reason: "invalid_counts" };

    const counts = parsed.data;
    const classifiedTotal =
      BigInt(counts.projectedCount) +
      BigInt(counts.unchangedCount) +
      BigInt(counts.quarantinedCount) +
      BigInt(counts.skippedCount) +
      BigInt(counts.failedCount);
    if (BigInt(counts.normalizedCount) !== classifiedTotal) {
      return { accepted: false, counts, reason: "not_conserved" };
    }
    return { accepted: true, counts, reason: "accepted" };
  } catch {
    return { accepted: false, counts: null, reason: "invalid_counts" };
  }
}
