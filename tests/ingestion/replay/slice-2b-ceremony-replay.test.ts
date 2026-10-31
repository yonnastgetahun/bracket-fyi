import { describe, expect, it } from "vitest";

import ceremonyFixture from "@/tests/ingestion/replay/fixtures/ceremony/awarded-category.json";
import { providerBatchSchema } from "@/lib/ingestion/contracts";
import { resolveResultIdentities } from "@/lib/ingestion/identity/resolve";
import { resultIdempotencyKey } from "@/lib/ingestion/idempotency/keys";

describe("synthetic ceremony replay", () => {
  it("accepts an awarded category through the same provider-neutral result seam", () => {
    const batch = providerBatchSchema.parse(ceremonyFixture);
    const stage = batch.observations.find((observation) => observation.entityKind === "stage");
    const resultObservation = batch.observations.find((observation) => observation.entityKind === "result");
    expect(stage?.data).toMatchObject({ stageKind: "ceremony" });
    expect(resultObservation?.data).toMatchObject({ resultStatus: "awarded", outcomeType: "winner" });

    const result = resultObservation!.data;
    const resolved = resolveResultIdentities({
      contest: {
        bindingId: "synthetic-binding",
        eventEditionId: "ceremony-edition",
        entityKind: "contest",
        externalId: result.contestExternalId,
        canonicalRef: { status: "reviewed", canonicalId: "canonical-ceremony-category" },
        aliasCandidates: [],
        fuzzyCandidates: [],
      },
      winnerEntry: {
        bindingId: "synthetic-binding",
        eventEditionId: "ceremony-edition",
        entityKind: "event_entry",
        externalId: result.winnerEventEntryExternalId!,
        // Explicit reviewed association; name-only/unverified automatic refs quarantine under P3.
        canonicalRef: { status: "reviewed", canonicalId: "canonical-ceremony-entry" },
        aliasCandidates: [],
        fuzzyCandidates: [],
      },
    });
    expect(resolved).toMatchObject({ status: "resolved", winnerEntryId: "canonical-ceremony-entry" });
    expect(resultIdempotencyKey({
      contestId: resolved.contestId!,
      resultStatus: result.resultStatus,
      outcomeType: result.outcomeType,
      winnerEventEntryId: resolved.winnerEntryId,
      resultData: result.resultData,
      providerEffectiveAt: result.providerEffectiveAt,
      orderingPolicyVersion: "result-ordering-v1",
    })).toMatch(/^v1:result:[a-f0-9]{64}$/);
  });
});
