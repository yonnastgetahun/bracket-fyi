import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { provisionApplicationAwards } from "../../lib/events/application-awards";
import { buildApplicationManifest, type ApplicationManifest } from "../../lib/events/application-manifest";
import { scoreEvent, type EventScoreInput } from "../../lib/events/scoring-bridge";

function fakeDatabase() {
  const inserted: Record<string, Record<string, unknown>[]> = {};
  const db = {
    from(table: string) {
      return {
        async insert(values: Record<string, unknown> | Record<string, unknown>[]) {
          (inserted[table] ??= []).push(...(Array.isArray(values) ? values : [values]));
          return { error: null };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, inserted };
}
const baseManifest = () => buildApplicationManifest(
  "oscars-2027", "2027-01-01T00:00:00Z", 3, "UTC", ["Picture", "Director"],
);
function scoring(manifest: ApplicationManifest): EventScoreInput {
  const [picture, director] = manifest.markets;
  return {
    edition: { catalog: manifest, graphVersion: 3 },
    binding: manifest.lifecycle.binding,
    components: manifest.lifecycle.components,
    outcomes: {},
    windows: Object.fromEntries(manifest.windows.map(w => [w.id, "locked"])),
    participants: [
      { id: "P", graphVersion: 3, picks: { [picture.id]: picture.choices[0], [director.id]: director.choices[0] } },
      { id: "Q", graphVersion: 3, picks: { [picture.id]: picture.choices[1], [director.id]: director.choices[1] } },
    ],
  };
}
const rows = (input: EventScoreInput) => scoreEvent(input).map(r => [r.id, r.earned, r.maximum, r.wrong, r.rank]);

describe("provisioned awards feasibility", () => {
  it("scores remapped nomination UUIDs with exhaustive tied-winner worlds after provisioning", async () => {
    const base = baseManifest(), snapshot = structuredClone(base);
    const { db, inserted } = fakeDatabase();
    const { editionId, manifest } = await provisionApplicationAwards(db, base);
    const input = scoring(manifest);
    expect(rows(input)).toEqual([["P", 0, 2, 0, 1], ["Q", 0, 2, 0, 1]]);

    expect(base).toEqual(snapshot);
    const nominations = inserted.award_nominations;
    expect(nominations).toHaveLength(8);
    expect(new Set(nominations.map(n => n.id))).toEqual(new Set(manifest.entrants.map(e => e.id)));
    expect(nominations.every(n => n.event_edition_id === editionId)).toBe(true);
    expect(manifest.entrants.every(e => !base.entrants.some(old => old.id === e.id))).toBe(true);
    expect(manifest.lifecycle.components).toHaveLength(2);
    for (const [index, market] of manifest.markets.entries()) {
      const component = manifest.lifecycle.components[index];
      expect(component.evidence).toEqual(base.lifecycle.components[index].evidence);
      expect(component.marketIds).toEqual([market.id]);
      // Independent four-nomination oracle: all 15 nonempty subsets, ties included.
      const expected = Array.from({ length: 15 }, (_, mask) =>
        market.choices.filter((_, bit) => ((mask + 1) & (1 << bit)) !== 0));
      expect(component.worlds).toEqual(expected.map(winners => ({ [market.id]: winners })));
      expect(nominations.filter(n => n.contest_id === market.categoryId).map(n => n.id)).toEqual(market.choices);
    }

    const [picture, director] = manifest.markets;
    input.outcomes = { [picture.id]: { kind: "winner-set", entrants: picture.choices.slice(0, 2) } };
    expect(rows(input)).toEqual([["P", 1, 2, 0, 1], ["Q", 1, 2, 0, 1]]);
    input.outcomes = { [picture.id]: { kind: "winner-set", entrants: [picture.choices[0]] } };
    expect(rows(input)).toEqual([["P", 1, 2, 0, 1], ["Q", 0, 1, 1, 2]]);
    input.outcomes = { ...input.outcomes, [director.id]: { kind: "winner-set", entrants: [director.choices[1]] } };
    expect(rows(input)).toEqual([["P", 1, 1, 1, 1], ["Q", 1, 1, 1, 1]]);
    input.outcomes = { ...input.outcomes, [picture.id]: { kind: "unresolved" } };
    expect(rows(input)).toEqual([["Q", 1, 2, 0, 1], ["P", 0, 1, 1, 2]]);
  });
});

describe("provisioning preserves feasibility trust boundaries", () => {
  it.each(["missing", "unreviewed", "unknown-worlds"] as const)(
    "does not upgrade %s feasibility into numeric maxima", async mode => {
      const base = baseManifest();
      base.lifecycle.components = mode === "missing" ? [] : base.lifecycle.components.map(c => ({
        ...c,
        ...(mode === "unreviewed" ? { evidence: null } : { worlds: null }),
      }));
      const { manifest } = await provisionApplicationAwards(fakeDatabase().db, base);
      expect(scoreEvent(scoring(manifest)).map(r => r.maximum)).toEqual([null, null]);
      expect(manifest.lifecycle.components.map(c => c.evidence))
        .toEqual(base.lifecycle.components.map(c => c.evidence));
    },
  );

  it("leaves stale graph evidence rejected by the scorer", async () => {
    const base = baseManifest();
    base.lifecycle.components = base.lifecycle.components.map(c => ({
      ...c, evidence: { ...c.evidence!, graphVersion: 2 },
    }));
    const { manifest } = await provisionApplicationAwards(fakeDatabase().db, base);
    expect(() => scoreEvent(scoring(manifest))).toThrow("Stale/unreviewed feasible evidence");
  });

  it("does not sanitize an invalid world choice into a trusted nominee", async () => {
    const base = baseManifest();
    const market = base.markets[0];
    base.lifecycle.components = base.lifecycle.components.map((c, index) => index === 0 ? {
      ...c, worlds: [{ [market.id]: ["not-a-canonical-nomination"] }],
    } : c);
    const { manifest } = await provisionApplicationAwards(fakeDatabase().db, base);
    expect(() => scoreEvent(scoring(manifest))).toThrow("Invalid canonical world choice");
  });
});
