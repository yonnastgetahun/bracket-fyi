import { describe, expect, it } from "vitest";

import sportsFixture from "@/tests/ingestion/replay/fixtures/sports/final-match.json";
import { normalizedObservationSchema, providerBatchSchema } from "@/lib/ingestion/contracts";
import { resolveIdentity, resolveResultIdentities } from "@/lib/ingestion/identity/resolve";
import { normalizeIdentityText } from "@/lib/ingestion/identity/normalize";
import { resultIdempotencyKey } from "@/lib/ingestion/idempotency/keys";
import { compareResultOrdering } from "@/lib/ingestion/ordering/compare";

describe("synthetic sports replay", () => {
  it("replays a validated batch through identity, ordering, and semantic-key seams", () => {
    const batch = providerBatchSchema.parse(sportsFixture);
    expect(batch.observations).toHaveLength(3);
    const entry = normalizedObservationSchema.parse(batch.observations[0]);
    expect(entry.entityKind).toBe("event_entry");

    expect(normalizeIdentityText("Team A — East", "en-US")).toBe("team a east");
    expect(resolveIdentity({
      bindingId: "synthetic-binding",
      eventEditionId: "sports-edition",
      entityKind: "competitor",
      externalId: "sports-team-a",
      aliasCandidates: [{ canonicalId: "canonical-team-a", source: "exact_alias", explanation: "synthetic exact alias" }],
      fuzzyCandidates: [],
    })).toMatchObject({ status: "automatic", canonicalId: "canonical-team-a" });

    const resultObservation = batch.observations.find(
      (observation): observation is Extract<(typeof batch.observations)[number], { entityKind: "result" }> => observation.entityKind === "result",
    );
    expect(resultObservation).toBeDefined();
    const result = resultObservation!.data;
    const resolved = resolveResultIdentities({
      contest: {
        bindingId: "synthetic-binding",
        eventEditionId: "sports-edition",
        entityKind: "contest",
        externalId: result.contestExternalId,
        canonicalRef: { status: "reviewed", canonicalId: "canonical-sports-contest" },
        aliasCandidates: [],
        fuzzyCandidates: [],
      },
      winnerEntry: {
        bindingId: "synthetic-binding",
        eventEditionId: "sports-edition",
        entityKind: "event_entry",
        externalId: result.winnerEventEntryExternalId!,
        canonicalRef: { status: "reviewed", canonicalId: "canonical-sports-entry-a" },
        aliasCandidates: [],
        fuzzyCandidates: [],
      },
    });
    expect(resolved).toMatchObject({ status: "resolved", contestId: "canonical-sports-contest", winnerEntryId: "canonical-sports-entry-a" });

    const semanticKey = resultIdempotencyKey({
      contestId: resolved.contestId!,
      resultStatus: result.resultStatus,
      outcomeType: result.outcomeType,
      winnerEventEntryId: resolved.winnerEntryId,
      score: result.score,
      resultData: result.resultData,
      providerEffectiveAt: result.providerEffectiveAt,
      orderingPolicyVersion: "result-ordering-v1",
    });
    expect(semanticKey).toMatch(/^v1:result:[a-f0-9]{64}$/);

    const state = {
      normalizedResult: result,
      sourceObservationId: "synthetic-sports-observation",
      providerUpdatedAt: "2026-10-08T18:00:00Z",
      providerEffectiveAt: result.providerEffectiveAt,
      observedAt: resultObservation!.observedAt,
      receivedAt: batch.receivedAt,
      providerRevision: resultObservation!.providerRevision,
      semanticKey,
    };
    expect(compareResultOrdering({ current: state, incoming: state, explicitCorrection: false })).toMatchObject({ decision: "no_op_duplicate" });
    expect(compareResultOrdering({
      current: state,
      incoming: { ...state, semanticKey: "v1:result:older", providerEffectiveAt: "2026-10-07T18:00:00Z" },
      explicitCorrection: false,
    })).toMatchObject({ decision: "ignore_older" });
  });

  it("quarantines missing, ambiguous, fuzzy, and human-participant identity instead of guessing", () => {
    const base = { bindingId: "synthetic-binding", eventEditionId: "sports-edition", entityKind: "competitor" as const, externalId: "unknown", aliasCandidates: [], fuzzyCandidates: [] };
    expect(resolveIdentity(base)).toMatchObject({ status: "unresolved", quarantineCode: "mapping_missing" });
    expect(resolveIdentity({ ...base, aliasCandidates: [
      { canonicalId: "team-a", source: "exact_alias", explanation: "one" },
      { canonicalId: "team-b", source: "exact_alias", explanation: "two" },
    ] })).toMatchObject({ status: "unresolved", quarantineCode: "mapping_ambiguous" });
    expect(resolveIdentity({ ...base, fuzzyCandidates: [{ canonicalId: "team-a", source: "fuzzy_advisory", score: 0.91, explanation: "synthetic advisory" }] })).toMatchObject({ status: "unresolved", quarantineCode: "mapping_ambiguous" });
    expect(resolveIdentity({ ...base, entityKind: "result" as never })).toMatchObject({ status: "unresolved", quarantineCode: "mapping_ambiguous" });
  });
});
