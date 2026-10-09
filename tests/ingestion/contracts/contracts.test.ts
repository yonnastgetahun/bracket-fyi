import { describe, expect, it } from "vitest";

import {
  normalizedBracketSchema,
  normalizedContestSchema,
  normalizedEventEditionSchema,
  normalizedRoundSchema,
  normalizedStageSchema,
  normalizedResultSchema,
  normalizedObservationSchema,
  providerBatchSchema,
  type NormalizedObservation,
} from "@/lib/ingestion/contracts";

const observedAt = "2026-10-08T17:00:00-07:00";

const contestObservation = (kind: "game" | "category"): NormalizedObservation => ({
  entityKind: "contest",
  externalId: `${kind}-1`,
  observedAt,
  completeness: "full",
  sanitizedPayload: { source: "synthetic", arbitrary: { providerField: 1 } },
  data: {
    eventEditionExternalId: `${kind}-edition`,
    stageExternalId: `${kind}-stage`,
    contestKey: `${kind}-1`,
    name: kind === "game" ? "Synthetic Final" : "Best Picture",
    contestKind: kind,
    status: kind === "game" ? "final" : "final",
    requiredForCompletion: true,
    entries: [
      {
        eventEntryExternalId: `${kind}-entry-a`,
        role: kind === "game" ? "home" : "nominee",
        side: kind === "game" ? "home" : undefined,
        ordinal: 1,
        metadata: {},
      },
      {
        eventEntryExternalId: `${kind}-entry-b`,
        role: kind === "game" ? "away" : "nominee",
        side: kind === "game" ? "away" : undefined,
        ordinal: 2,
        metadata: {},
      },
    ],
    metadata: { fixture: true },
  },
});

const resultObservation = (
  kind: "game" | "category",
  resultStatus: "final" | "awarded" = kind === "game" ? "final" : "awarded",
): NormalizedObservation => ({
  entityKind: "result",
  externalId: `${kind}-result-1`,
  observedAt,
  completeness: "full",
  sanitizedPayload: { source: "synthetic" },
  data: {
    eventEditionExternalId: `${kind}-edition`,
    contestExternalId: `${kind}-1`,
    resultStatus,
    outcomeType: "winner",
    winnerEventEntryExternalId: `${kind}-entry-a`,
    resultData: { source: "mock-adapter" },
  },
});

describe("provider-neutral contracts", () => {
  it("accepts an organization observation", () => {
    const observation: NormalizedObservation = {
      entityKind: "organization",
      externalId: "uefa",
      observedAt: "2026-10-08T17:00:00-07:00",
      completeness: "full",
      sanitizedPayload: { source: "synthetic" },
      data: {
        organizationKind: "governing_body",
        name: "Synthetic European Football Association",
        metadata: { fixture: true },
      },
    };

    expect(normalizedObservationSchema.parse(observation)).toEqual(observation);
  });

  it("accepts sports and ceremony contest/result observations", () => {
    expect(normalizedObservationSchema.parse(contestObservation("game")).data).toMatchObject({ contestKind: "game" });
    expect(normalizedObservationSchema.parse(resultObservation("game")).data).toMatchObject({ resultStatus: "final" });
    expect(normalizedObservationSchema.parse(contestObservation("category")).data).toMatchObject({ contestKind: "category" });
    expect(normalizedObservationSchema.parse(resultObservation("category")).data).toMatchObject({ resultStatus: "awarded" });
  });

  it("rejects an observation whose entity kind does not match its data", () => {
    const mismatched = { ...contestObservation("game"), entityKind: "result" };
    expect(() => normalizedObservationSchema.parse(mismatched)).toThrow();
  });

  it.each([
    ["provisional", "winner", "entry"],
    ["unresolved", "draw", undefined],
    ["final", "pending", undefined],
    ["final", "winner", undefined],
    ["awarded", "draw", undefined],
    ["canceled", "winner", "entry"],
    ["void", "draw", undefined],
  ] as const)("rejects illegal result state %s/%s", (resultStatus, outcomeType, winner) => {
    const result = {
      eventEditionExternalId: "edition",
      contestExternalId: "contest",
      resultStatus,
      outcomeType,
      resultData: {},
      ...(winner ? { winnerEventEntryExternalId: winner } : {}),
    };
    expect(() => normalizedResultSchema.parse(result)).toThrow();
  });

  it("requires a winner for winner outcomes and forbids it for draw outcomes", () => {
    expect(() => normalizedResultSchema.parse({
      eventEditionExternalId: "edition",
      contestExternalId: "contest",
      resultStatus: "final",
      outcomeType: "winner",
      resultData: {},
    })).toThrow();
    expect(() => normalizedResultSchema.parse({
      eventEditionExternalId: "edition",
      contestExternalId: "contest",
      resultStatus: "final",
      outcomeType: "draw",
      winnerEventEntryExternalId: "entry",
      resultData: {},
    })).toThrow();
  });

  it("rejects duplicate contest entries and self-referential bracket edges", () => {
    const contest = contestObservation("game").data;
    if (!("entries" in contest)) throw new Error("fixture must be a contest");
    expect(() => normalizedContestSchema.parse({
      ...contest,
      entries: [contest.entries[0], { ...contest.entries[1], eventEntryExternalId: contest.entries[0].eventEntryExternalId }],
    })).toThrow();
    expect(() => normalizedContestSchema.parse({
      ...contest,
      entries: [contest.entries[0], { ...contest.entries[1], ordinal: contest.entries[0].ordinal }],
    })).toThrow();
    expect(() => normalizedBracketSchema.parse({
      eventEditionExternalId: "edition",
      bracketKey: "main",
      name: "Main bracket",
      bracketKind: "single_elimination",
      edges: [{
        fromContestExternalId: "contest",
        toContestExternalId: "contest",
        outcome: "winner",
        targetRole: "finalist",
        priority: 1,
        metadata: {},
      }],
      metadata: {},
    })).toThrow();
  });

  it("rejects reversed edition, stage, round, and contest timestamps", () => {
    const reversed = { startsAt: "2026-10-09T17:00:00-07:00", endsAt: "2026-10-08T17:00:00-07:00" };
    expect(() => normalizedEventEditionSchema.parse({
      competitionExternalId: "competition", editionKey: "edition", name: "Edition", seasonLabel: "2026",
      timezone: "UTC", status: "planned", metadata: {}, ...reversed,
    })).toThrow();
    expect(() => normalizedStageSchema.parse({
      eventEditionExternalId: "edition", stageKey: "stage", name: "Stage", stageKind: "league", ordinal: 1,
      metadata: {}, ...reversed,
    })).toThrow();
    expect(() => normalizedRoundSchema.parse({
      eventEditionExternalId: "edition", stageExternalId: "stage", roundKey: "round", name: "Round", ordinal: 1,
      metadata: {}, ...reversed,
    })).toThrow();
    expect(() => normalizedContestSchema.parse({
      ...contestObservation("game").data, ...reversed,
    })).toThrow();
  });

  it("rejects non-JSON sanitized payloads but permits arbitrary provider keys", () => {
    expect(normalizedObservationSchema.parse({
      ...contestObservation("game"),
      sanitizedPayload: { arbitraryProviderKey: ["value", { nested: true }] },
    })).toBeTruthy();
    for (const value of [undefined, () => "secret", Symbol("secret"), Infinity, new Date()]) {
      expect(() => normalizedObservationSchema.parse({ ...contestObservation("game"), sanitizedPayload: { value } })).toThrow();
    }
  });

  it("accepts partial observations without manufacturing optional values", () => {
    const partial = normalizedObservationSchema.parse({
      entityKind: "organization",
      externalId: "org",
      observedAt,
      completeness: "partial",
      sanitizedPayload: {},
      data: { organizationKind: "other", name: "Partial", metadata: {} },
    });
    expect(partial).not.toHaveProperty("providerRevision");
    expect(partial.data).not.toHaveProperty("officialUrl");
  });

  it("validates provider batch rate limits and allows an empty unchanged batch", () => {
    const batch = {
      observations: [],
      fetchedCount: 0,
      receivedAt: observedAt,
      rateLimit: { limit: 10, remaining: 10 },
    };
    expect(providerBatchSchema.parse(batch)).toEqual(batch);
    expect(() => providerBatchSchema.parse({ ...batch, rateLimit: { limit: 1, remaining: 2 } })).toThrow();
  });
});
