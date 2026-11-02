import { describe, expect, it } from "vitest";

import ceremonyFixture from "@/tests/ingestion/replay/fixtures/ceremony/awarded-category.json";
import { providerBatchSchema } from "@/lib/ingestion/contracts";
import { decideCheckpoint } from "@/lib/ingestion/orchestrator/checkpoint";
import { decideFailureScheduling } from "@/lib/ingestion/orchestrator/health";
import { decidePagination } from "@/lib/ingestion/orchestrator/pagination";
import { nextPollAt } from "@/lib/ingestion/orchestrator/policy";

describe("ceremony orchestrator replay acceptance", () => {
  it("accepts awarded ceremony data and completes an unchanged replay", () => {
    const batch = providerBatchSchema.parse(ceremonyFixture);
    expect(batch.observations.some((observation) => observation.entityKind === "stage")).toBe(true);
    expect(batch.observations.some((observation) => observation.entityKind === "result")).toBe(true);

    const unchanged = decideCheckpoint({
      currentCursor: { ceremony: "2026" },
      currentEtag: "ceremony-etag-1",
      transportSucceeded: true,
      pageValid: true,
      observationsTerminal: true,
      pageWasNotModified: true,
      validPartialPage: false,
      repeatedCursor: false,
    });
    expect(unchanged).toMatchObject({ advance: true, reason: "not_modified", etag: "ceremony-etag-1" });
    expect(decidePagination({ pagesProcessed: 0, checkpoint: unchanged })).toMatchObject({
      action: "complete",
      pagesProcessed: 1,
    });
  });

  it("keeps retry, authentication, and disabled scheduling deterministic", () => {
    expect(decideFailureScheduling({
      failureCode: "rate_limited",
      now: "2026-10-10T18:00:00.000Z",
      deterministicBackoffAt: "2026-10-10T18:01:00.000Z",
      providerRetryAt: "2026-10-10T18:03:00.000Z",
      providerResetAt: "2026-10-10T18:02:00.000Z",
    })).toMatchObject({ outcome: "rate_limited", disposition: "retry", retryAt: "2026-10-10T18:03:00.000Z" });
    expect(decideFailureScheduling({
      failureCode: "authentication",
      now: "2026-10-10T18:00:00.000Z",
    })).toMatchObject({ outcome: "failed", disposition: "disable", retryAt: null });
    expect(nextPollAt({
      mode: "disabled",
      phase: "complete",
      idleSeconds: 300,
      pregameSeconds: 60,
      liveSeconds: 30,
      postgameSeconds: 60,
      staleAfterSeconds: 60,
    }, "2026-10-10T18:00:00.000Z")).toBeNull();
  });
});
