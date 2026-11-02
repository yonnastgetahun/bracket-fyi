import { describe, expect, it } from "vitest";

import sportsFixture from "@/tests/ingestion/replay/fixtures/sports/final-match.json";
import { providerBatchSchema } from "@/lib/ingestion/contracts";
import { decideCheckpoint } from "@/lib/ingestion/orchestrator/checkpoint";
import { cursorFingerprint, decidePagination, isRepeatedCursor } from "@/lib/ingestion/orchestrator/pagination";
import { resultIdempotencyKey } from "@/lib/ingestion/idempotency/keys";

describe("sports orchestrator replay acceptance", () => {
  it("advances a synthetic paginated sports delivery and rejects cursor replay", () => {
    const batch = providerBatchSchema.parse(sportsFixture);
    expect(batch.observations.map((observation) => observation.entityKind)).toEqual([
      "event_entry",
      "event_entry",
      "result",
    ]);

    const firstCursor = { page: 1 };
    const nextCursor = { page: 2 };
    const checkpoint = decideCheckpoint({
      currentCursor: firstCursor,
      currentEtag: "sports-etag-1",
      nextCursor,
      responseEtag: "sports-etag-2",
      transportSucceeded: true,
      pageValid: true,
      observationsTerminal: true,
      pageWasNotModified: false,
      validPartialPage: false,
      repeatedCursor: false,
    });
    expect(checkpoint).toMatchObject({ advance: true, cursorAfter: nextCursor, etag: "sports-etag-2" });
    expect(decidePagination({ pagesProcessed: 0, checkpoint, nextCursor })).toMatchObject({
      action: "continue",
      pagesProcessed: 1,
    });

    const seen = new Set([cursorFingerprint(firstCursor), cursorFingerprint(nextCursor)]);
    expect(isRepeatedCursor({ currentCursor: nextCursor, nextCursor, seenCursorFingerprints: seen })).toBe(true);
    expect(decideCheckpoint({
      currentCursor: nextCursor,
      currentEtag: "sports-etag-2",
      nextCursor,
      responseEtag: "sports-etag-2",
      transportSucceeded: true,
      pageValid: true,
      observationsTerminal: true,
      pageWasNotModified: false,
      validPartialPage: false,
      repeatedCursor: true,
    })).toMatchObject({ advance: false, reason: "repeated_cursor" });
  });

  it("gives exact sports result replay one semantic identity", () => {
    const batch = providerBatchSchema.parse(sportsFixture);
    const result = batch.observations.find((observation) => observation.entityKind === "result");
    expect(result).toBeDefined();
    if (!result || result.entityKind !== "result") return;

    const input = {
      contestId: "canonical-sports-contest",
      resultStatus: result.data.resultStatus,
      outcomeType: result.data.outcomeType,
      winnerEventEntryId: "canonical-sports-entry",
      score: result.data.score,
      resultData: result.data.resultData,
      providerEffectiveAt: result.data.providerEffectiveAt,
      orderingPolicyVersion: "result-ordering-v1",
    };
    expect(resultIdempotencyKey(input)).toBe(resultIdempotencyKey(structuredClone(input)));
  });
});
