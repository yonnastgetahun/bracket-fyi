import { z } from "zod";

import { jsonObjectSchema, type JsonObject } from "@/lib/ingestion/contracts";

export type CheckpointDecision = Readonly<{
  advance: boolean;
  cursorAfter?: JsonObject;
  etag?: string;
  reason:
    | "page_consumed"
    | "not_modified"
    | "partial_page"
    | "retryable_failure"
    | "invalid_page"
    | "repeated_cursor";
}>;

export type CheckpointInput = Readonly<{
  currentCursor?: JsonObject;
  currentEtag?: string;
  nextCursor?: JsonObject;
  responseEtag?: string;
  transportSucceeded: boolean;
  pageValid: boolean;
  observationsTerminal: boolean;
  pageWasNotModified: boolean;
  validPartialPage: boolean;
  repeatedCursor: boolean;
}>;

const checkpointInputSchema = z
  .object({
    currentCursor: jsonObjectSchema.optional(),
    currentEtag: z.string().trim().min(1).optional(),
    nextCursor: jsonObjectSchema.optional(),
    responseEtag: z.string().trim().min(1).optional(),
    transportSucceeded: z.boolean(),
    pageValid: z.boolean(),
    observationsTerminal: z.boolean(),
    pageWasNotModified: z.boolean(),
    validPartialPage: z.boolean(),
    repeatedCursor: z.boolean(),
  })
  .strict();

const invalidPage = (): CheckpointDecision => ({
  advance: false,
  reason: "invalid_page",
});

const failedPage = (): CheckpointDecision => ({
  advance: false,
  reason: "retryable_failure",
});

export function decideCheckpoint(input: CheckpointInput): CheckpointDecision {
  const parsed = checkpointInputSchema.safeParse(input);
  if (!parsed.success) return invalidPage();

  const value = parsed.data;
  if (value.repeatedCursor && value.nextCursor === undefined) return invalidPage();
  if (value.pageWasNotModified && value.validPartialPage) return invalidPage();
  if (value.pageWasNotModified && value.nextCursor !== undefined) return invalidPage();
  if (value.pageWasNotModified && value.repeatedCursor) return invalidPage();

  if (!value.transportSucceeded) return failedPage();
  if (!value.pageValid) return invalidPage();
  if (!value.observationsTerminal) return failedPage();
  if (value.repeatedCursor) return { advance: false, reason: "repeated_cursor" };

  const cursorAfter = value.nextCursor ?? value.currentCursor;
  const etag = value.responseEtag ?? value.currentEtag;
  const decision = value.pageWasNotModified
    ? { advance: true, reason: "not_modified" as const }
    : value.validPartialPage
      ? { advance: true, reason: "partial_page" as const }
      : { advance: true, reason: "page_consumed" as const };

  return {
    ...decision,
    ...(cursorAfter === undefined ? {} : { cursorAfter }),
    ...(etag === undefined ? {} : { etag }),
  };
}
