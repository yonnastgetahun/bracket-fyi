import { createHash } from "node:crypto";
import { z } from "zod";

import { jsonObjectSchema, type JsonObject } from "@/lib/ingestion/contracts";
import { canonicalJson } from "@/lib/ingestion/idempotency/canonical-json";
import type { CheckpointDecision } from "@/lib/ingestion/orchestrator/checkpoint";

export const MAX_PAGES_PER_RUN = 25;

export type PaginationDecision = Readonly<{
  action: "complete" | "continue" | "yield" | "hold" | "invalid";
  pagesProcessed: number;
  scheduleImmediately: boolean;
  reason:
    | "page_consumed"
    | "partial_page"
    | "retryable_failure"
    | "invalid_page"
    | "repeated_cursor"
    | "page_limit";
}>;

const checkpointDecisionSchema = z
  .object({
    advance: z.boolean(),
    cursorAfter: jsonObjectSchema.optional(),
    etag: z.string().trim().min(1).optional(),
    reason: z.enum([
      "page_consumed",
      "not_modified",
      "partial_page",
      "retryable_failure",
      "invalid_page",
      "repeated_cursor",
    ]),
  })
  .strict();

const paginationInputSchema = z
  .object({
    pagesProcessed: z.number().int().safe().min(0).max(MAX_PAGES_PER_RUN),
    checkpoint: checkpointDecisionSchema,
    nextCursor: jsonObjectSchema.optional(),
  })
  .strict();

const invalidDecision = (pagesProcessed: number): PaginationDecision => ({
  action: "invalid",
  pagesProcessed,
  scheduleImmediately: false,
  reason: "invalid_page",
});

export function cursorFingerprint(cursor: JsonObject): string {
  const canonical = canonicalJson(jsonObjectSchema.parse(cursor));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function isRepeatedCursor(input: Readonly<{
  currentCursor?: JsonObject;
  nextCursor?: JsonObject;
  seenCursorFingerprints: ReadonlySet<string>;
}>): boolean {
  if (input.nextCursor === undefined) return false;

  const nextFingerprint = cursorFingerprint(input.nextCursor);
  if (input.currentCursor !== undefined && cursorFingerprint(input.currentCursor) === nextFingerprint) {
    return true;
  }
  return input.seenCursorFingerprints.has(nextFingerprint);
}

export function decidePagination(input: Readonly<{
  pagesProcessed: number;
  checkpoint: CheckpointDecision;
  nextCursor?: JsonObject;
}>): PaginationDecision {
  const parsed = paginationInputSchema.safeParse(input);
  const requestedPages = typeof input?.pagesProcessed === "number" ? input.pagesProcessed : 0;
  if (!parsed.success) return invalidDecision(requestedPages);

  const { pagesProcessed, checkpoint, nextCursor } = parsed.data;
  const advanceReason =
    checkpoint.reason === "partial_page"
      ? "partial_page"
      : checkpoint.reason === "page_consumed" || checkpoint.reason === "not_modified"
        ? "page_consumed"
        : undefined;

  if (!checkpoint.advance) {
    if (checkpoint.reason === "retryable_failure") {
      return {
        action: "hold",
        pagesProcessed,
        scheduleImmediately: false,
        reason: "retryable_failure",
      };
    }
    if (checkpoint.reason === "repeated_cursor") {
      return { action: "invalid", pagesProcessed, scheduleImmediately: false, reason: "repeated_cursor" };
    }
    if (checkpoint.reason === "invalid_page") {
      return { action: "invalid", pagesProcessed, scheduleImmediately: false, reason: "invalid_page" };
    }
    return invalidDecision(pagesProcessed);
  }

  if (advanceReason === undefined || pagesProcessed >= MAX_PAGES_PER_RUN) {
    return invalidDecision(pagesProcessed);
  }

  const nextPagesProcessed = pagesProcessed + 1;
  if (nextCursor === undefined) {
    return {
      action: "complete",
      pagesProcessed: nextPagesProcessed,
      scheduleImmediately: false,
      reason: advanceReason,
    };
  }

  if (nextPagesProcessed === MAX_PAGES_PER_RUN) {
    return {
      action: "yield",
      pagesProcessed: nextPagesProcessed,
      scheduleImmediately: true,
      reason: "page_limit",
    };
  }

  return {
    action: "continue",
    pagesProcessed: nextPagesProcessed,
    scheduleImmediately: false,
    reason: advanceReason,
  };
}
