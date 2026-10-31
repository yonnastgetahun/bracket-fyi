import { describe, expect, it } from "vitest";
import { buildSyntheticManifest, getEventDefinition, listEventDefinitions, type SlotSource, type SyntheticManifest } from "@/lib/events/catalog";

const startsAt = "2030-01-01T00:00:00Z";
const build = (key: string, categories?: string[]) => buildSyntheticManifest(key, { startsAt, categories });
const definition = (key: string) => getEventDefinition(key)!;
const market = (m: SyntheticManifest, suffix: string) => m.markets.find(x => x.id.endsWith(":market:" + suffix))!;
const entrant = (m: SyntheticManifest, suffix: string) => m.entrants.find(x => x.id.endsWith(":entrant:" + suffix))!.id;

/** Independent small oracle: consume the exported graph, never catalog construction logic. */
function evaluate(m: SyntheticManifest, results: Record<string, string>) {
  const byId = new Map(m.markets.map(x => [x.id, x]));
  const resolve = (s: SlotSource): string => {
    if (s.kind === "entrant") return s.entrantId;
    if (s.kind === "reviewed-placement") throw new Error("Review required");
    if (s.kind === "reseed") {
      const eligible = s.pool.map(resolve);
      return eligible.sort((a, b) => m.entrants.find(e => e.id === a)!.seed! - m.entrants.find(e => e.id === b)!.seed!)[s.rank];
    }
    const parent = byId.get(s.marketId)!;
    const participants = parent.inputs.map(resolve);
    const winner = results[s.marketId];
    if (!participants.includes(winner)) throw new Error("Missing or ineligible result");
    return s.kind === "winner" ? winner : participants.find(id => id !== winner)!;
  };
  return (id: string) => byId.get(id)!.inputs.map(resolve);
}
describe("adjudicated catalog regressions", () => {
  it("C1: 188 regulation results, 22 aggregate qualifiers, only one inclusive final", () => {
    const d = definition("ucl-2026-27");
    expect(d.markets.filter(m => m.kind === "result")).toHaveLength(188);
    expect(d.markets.filter(m => m.kind === "qualifier")).toHaveLength(22);
    expect(d.markets.filter(m => m.kind === "champion")).toHaveLength(1);
    const final = d.markets.find(m => m.id === d.championMarketId)!;
    expect(final.windowId).toBe(d.windows[12].id);
    expect(final.outcomeDomain).toBe("winner-including-overtime");
    expect(final.inputs).toHaveLength(2);
    for (const q of d.markets.filter(m => m.kind === "qualifier")) {
      const legs = q.legMarketIds!.map(id => d.markets.find(m => m.id === id)!);
      expect(legs.map(l => l.leg)).toEqual([1, 2]);
      expect(legs.every(l => l.tieId === q.tieId && l.windowId === q.windowId && l.outcomeDomain === "regulation-home-draw-away")).toBe(true);
      expect(legs[0].inputs).toEqual(q.inputs);
      expect(legs[1].inputs).toEqual([...q.inputs].reverse());
      expect(q.dependsOn).toEqual(legs.map(l => l.id));
      expect(q.outcomeDomain).toBe("aggregate-qualifier");
    }
    expect(d.windows.map(w => d.markets.filter(m => m.windowId === w.id).length)).toEqual([18,18,18,18,18,18,18,18,24,24,12,6,1]);
  });
  it("UCL has complete matchday membership and no invented official knockout choices", () => {
    const m = build("ucl-2026-27");
    const pairs = new Set<string>();
    for (const w of m.windows.slice(0, 8)) {
      const games = m.markets.filter(x => x.windowId === w.id);
      expect(new Set(games.flatMap(g => g.entrants.map(e => e.id))).size).toBe(36);
      games.forEach(g => {
        expect(g.choices).toEqual(["home", "draw", "away"]);
        const pair = g.entrants.map(e => e.id).sort().join("|");
        expect(pairs.has(pair)).toBe(false); pairs.add(pair);
      });
    }
    expect(m.markets.filter(x => x.stage !== "league").every(x => x.choices.length === 0 && x.entrants.length === 0)).toBe(true);
    expect(m.windows.slice(8).every(w => w.opensWhen === "reviewed-pairings" && w.prerequisiteMarketIds.length > 0)).toBe(true);
  });
  it("C2/C5/C7: NCAA has 76 entrants, twelve structural qualifiers and one post-qualification cutoff", () => {
    const m = build("ncaa-men-2027");
    expect(m.entrants).toHaveLength(76); expect(m.markets).toHaveLength(75);
    const opening = m.markets.filter(x => !x.scored);
    expect(opening).toHaveLength(12);
    expect(opening.every(x => x.kind === "structural" && x.stage === "opening-round")).toBe(true);
    expect(m.lockMode).toBe("whole-bracket"); expect(m.windows).toHaveLength(1);
    expect(m.windows[0]).toMatchObject({ opensWhen: "qualification-resolved", cutoff: "first-scored-start" });
    expect(m.windows[0].prerequisiteMarketIds).toEqual(opening.map(x => x.id));
    const stageCounts = Object.fromEntries(["round-of-64","round-of-32","sweet-16","elite-8","semi-final","final"].map(s => [s, m.markets.filter(x => x.stage === s).length]));
    expect(Object.values(stageCounts)).toEqual([32,16,8,4,2,1]);
    expect(m.markets.find(x => x.id === m.championMarketId)?.stage).toBe("final");
    const results = Object.fromEntries(opening.map(x => [x.id, x.entrants[1].id]));
    const r64 = m.markets.filter(x => x.stage === "round-of-64").flatMap(x => evaluate(m, results)(x.id));
    expect(new Set(r64).size).toBe(64);
    expect(opening.every(x => r64.includes(x.entrants[1].id) && !r64.includes(x.entrants[0].id))).toBe(true);
    // Replacing a qualifier winner changes participants, not the destination's logical identity.
    const destination = m.markets.find(x => x.inputs.some(s => s.kind === "winner" && s.marketId === opening[0].id))!;
    expect(evaluate(m, { ...results, [opening[0].id]: opening[0].entrants[0].id })(destination.id)).toContain(opening[0].entrants[0].id);
    expect(destination.id).toBe(market(build("ncaa-men-2027"), destination.id.split(":market:")[1]).id);
  });
  it("C3/C5: NBA scores fifteen best-of-seven series with one Finals champion and one cutoff", () => {
    const d = definition("nba-2027");
    expect(d.markets).toHaveLength(15); expect(d.entrants).toHaveLength(16);
    expect(d.markets.filter(m => m.kind === "champion")).toHaveLength(1);
    expect(d.markets.every(m => m.series?.bestOf === 7 && m.series.winsRequired === 4 && m.series.stopAtClinch && m.outcomeDomain === "series-winner")).toBe(true);
    expect(d.markets.find(m => m.id === d.championMarketId)?.stage).toBe("finals");
    expect(d.lockMode).toBe("whole-bracket"); expect(d.windows).toHaveLength(1);
    expect(d.windows[0].opensWhen).toBe("official-seeds-resolved");
    expect(new Set(d.markets.map(m => m.series!.id)).size).toBe(15);
  });
  it("C7: separate Play-In stable deciders consume losers of 7/8 and winners of 9/10", () => {
    const m = build("nba-play-in-2027");
    expect(m.entrants).toHaveLength(8); expect(m.markets).toHaveLength(6); expect(m.edges).toHaveLength(4);
    expect(m.championMarketId).toBeNull(); expect(m.windows).toHaveLength(1);
    for (const c of ["east","west"]) {
      const a = entrant(m, c + ".seed-7"), b = entrant(m, c + ".seed-8");
      const first = market(m, c + ".seven-eight"), lower = market(m, c + ".nine-ten");
      const decider = market(m, c + ".eighth-seed-decider");
      const nine = entrant(m, c + ".seed-9");
      expect(first.qualificationSeed).toBe(7); expect(decider.qualificationSeed).toBe(8);
      expect(decider.inputs).toEqual([{ kind: "loser", marketId: first.id }, { kind: "winner", marketId: lower.id }]);
      expect(decider.choices).toEqual([]);
      expect(evaluate(m, { [first.id]: a, [lower.id]: nine })(decider.id)).toEqual([b, nine]);
      expect(evaluate(m, { [first.id]: b, [lower.id]: nine })(decider.id)).toEqual([a, nine]);
    }
    expect(m.markets.some(x => definition("nba-2027").markets.some(y => x.id === y.id))).toBe(false);
  });
  it("C4: WWC group round-robin is complete and bronze follows semifinal losers", () => {
    const m = build("wwc-2027");
    expect(m.markets).toHaveLength(64); expect(m.entrants).toHaveLength(32); expect(m.windows).toHaveLength(7);
    const groupGames = m.markets.filter(x => x.stage === "group");
    expect(groupGames).toHaveLength(48);
    for (const g of "ABCDEFGH") {
      const games = groupGames.filter(x => x.entrants[0].group === g);
      expect(games).toHaveLength(6);
      expect(new Set(games.map(x => x.entrants.map(e => e.id).sort().join("|"))).size).toBe(6);
      expect(games.every(x => x.entrants.every(e => e.group === g) && x.choices.join() === "home,draw,away")).toBe(true);
    }
    for (const w of m.windows.slice(0, 3)) expect(new Set(groupGames.filter(x => x.windowId === w.id).flatMap(x => x.entrants.map(e => e.id))).size).toBe(32);
    const final = market(m, "final"), bronze = market(m, "bronze"), semis = m.markets.filter(x => x.stage === "semi-final");
    expect(final.id).toBe(m.championMarketId);
    expect(final.windowId).toBe(m.windows[6].id); expect(bronze.windowId).toBe(final.windowId);
    expect(bronze.role).toBe("bronze");
    expect(final.inputs).toEqual(semis.map(s => ({ kind: "winner", marketId: s.id })));
    expect(bronze.inputs).toEqual(semis.map(s => ({ kind: "loser", marketId: s.id })));
    expect(m.markets.filter(x => x.stage !== "group").every(x => x.outcomeDomain === "winner-including-overtime" && x.choices.length === 0)).toBe(true);
    expect(m.markets.filter(x => x.stage === "round-of-16").every(x => x.inputs.every(s => s.kind === "reviewed-placement" && s.marketIds.length === 6))).toBe(true);
  });
  it("NFL reseeds actual winners: seed one plays the lowest remaining seed, no bye points", () => {
    const m = build("nfl-2026-postseason");
    expect(m.markets).toHaveLength(13); expect(m.entrants.filter(e => e.bye)).toHaveLength(2);
    for (const c of ["afc","nfc"]) {
      const results = Object.fromEntries([7,3,4].map((seed, i) => [market(m, c + ".wild-card." + (i + 1)).id, entrant(m, c + ".seed-" + seed)]));
      const resolve = evaluate(m, results);
      expect(resolve(market(m, c + ".divisional.1").id)).toEqual([entrant(m, c + ".seed-1"), entrant(m, c + ".seed-7")]);
      expect(resolve(market(m, c + ".divisional.2").id)).toEqual([entrant(m, c + ".seed-3"), entrant(m, c + ".seed-4")]);
      results[market(m, c + ".wild-card.1").id] = entrant(m, c + ".seed-2");
      expect(evaluate(m, results)(market(m, c + ".divisional.1").id)).toEqual([entrant(m, c + ".seed-1"), entrant(m, c + ".seed-4")]);
    }
    expect(m.markets.find(x => x.id === m.championMarketId)?.stage).toBe("super-bowl");
  });
  it("MLB encodes versioned 3/5/7/7 series and fixed division feeds, not child-game markets", () => {
    const m = build("mlb-2027");
    expect(m.markets).toHaveLength(11); expect(m.entrants).toHaveLength(12);
    for (const [stage, count, bestOf] of [["wild-card",4,3],["division",4,5],["championship",2,7],["world-series",1,7]] as const) {
      const series = m.markets.filter(x => x.stage === stage);
      expect(series).toHaveLength(count);
      expect(series.every(x => x.series?.membershipVersion === 1 && x.series.bestOf === bestOf && x.series.winsRequired === (bestOf + 1)/2 && x.series.stopAtClinch)).toBe(true);
    }
    const d = market(m, "al.division.1");
    expect(d.inputs).toEqual([{ kind: "entrant", entrantId: entrant(m, "al.seed-1") }, { kind: "winner", marketId: market(m, "al.wild-card.2").id }]);
  });
  it("CFP preserves twelve-team fixed paths and four top-seed byes", () => {
    const m = build("cfp-2026-27");
    expect(m.entrants).toHaveLength(12); expect(m.markets).toHaveLength(11);
    expect(m.entrants.filter(x => x.bye).map(x => x.seed)).toEqual([1,2,3,4]);
    const first = m.markets.filter(x => x.stage === "first-round");
    expect(first.flatMap(x => x.entrants.map(e => e.seed)).sort((a,b) => a!-b!)).toEqual([5,6,7,8,9,10,11,12]);
    const results = Object.fromEntries(first.map(x => [x.id, x.entrants[1].id]));
    expect(evaluate(m, results)(market(m, "quarter-final.1").id)).toEqual([entrant(m, "seed-1"), entrant(m, "seed-9")]);
    expect(evaluate(m, results)(market(m, "quarter-final.2").id)).toEqual([entrant(m, "seed-4"), entrant(m, "seed-12")]);
    expect(m.edges.some(e => e.relation === "reseed")).toBe(false);
  });
  it("C6: nonblank unique category/nomination identity is order-independent and credits never multiply markets", () => {
    const a = build("oscars-2027", ["acting", "film"]);
    const b = build("oscars-2027", ["film", "acting"]);
    expect(a.markets.map(m => m.id).sort()).toEqual(b.markets.map(m => m.id).sort());
    expect(a.entrants.map(e => e.id).sort()).toEqual(b.entrants.map(e => e.id).sort());
    expect(a.markets).toHaveLength(2); expect(a.entrants).toHaveLength(8);
    expect(new Set(a.entrants.flatMap(e => e.credits!)).size).toBe(1);
    expect(a.markets[0].choices.every(id => !a.markets[1].choices.includes(id))).toBe(true);
    expect(a.markets.every(m => m.outcomeDomain === "nomination-winner-set" && m.entrants.every(e => e.categoryId === m.categoryId))).toBe(true);
    for (const categories of [[], [""], [" "], ["a","a"], ["a"," a "], ["é","e\u0301"]]) expect(() => build("oscars-2027", categories)).toThrow();
    expect(new Set(build("oscars-2027", ["a:b", "a%3Ab"]).markets.map(m => m.id)).size).toBe(2);
  });
});
describe("complete synthetic graph integrity", () => {
  it.each(listEventDefinitions().map(d => d.key))("%s has immutable unique slots, complete references, no cycles, and honest resolved choices", key => {
    const d = definition(key), m = build(key, ["film", "acting"]);
    expect(d).toMatchObject({ availability: "draft", manualMode: true, automation: "unavailable" });
    expect(Object.isFrozen(d)).toBe(true); expect(Object.isFrozen(m.markets)).toBe(true);
    const ids = [...m.markets.map(x => x.id), ...m.entrants.map(x => x.id), ...m.windows.map(x => x.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(id => id.startsWith("synthetic-" + key + ":"))).toBe(true);
    const seen = new Set<string>(), entrantIds = new Set(m.entrants.map(e => e.id));
    const referencedParents = (s: SlotSource): string[] => {
      if (s.kind === "entrant") { expect(entrantIds.has(s.entrantId)).toBe(true); return []; }
      if (s.kind === "reseed") return s.pool.flatMap(referencedParents);
      return s.kind === "reviewed-placement" ? [...s.marketIds] : [s.marketId];
    };
    for (const x of m.markets) {
      expect(m.windows.some(w => w.id === x.windowId)).toBe(true);
      const parents = [...x.inputs.flatMap(referencedParents), ...x.dependsOn];
      parents.forEach(id => {
        expect(seen.has(id)).toBe(true); // Topological ordering proves acyclic and no dangling references.
        expect(m.edges.some(e => e.from === id && e.to === x.id)).toBe(true);
      });
      const resolved = x.inputs.every(s => s.kind === "entrant");
      expect(x.choices.length > 0).toBe(resolved);
      expect(x.entrants.length).toBe(resolved ? x.inputs.length : 0);
      expect(new Set(x.choices).size).toBe(x.choices.length);
      expect(x.inputs.length).toBe(key === "oscars-2027" ? 4 : 2);
      expect(Object.isFrozen(x.inputs)).toBe(true); expect(Object.isFrozen(x.choices)).toBe(true);
      seen.add(x.id);
    }
    for (const e of m.edges) { expect(seen.has(e.from)).toBe(true); expect(seen.has(e.to)).toBe(true); }
    for (const w of m.windows) w.prerequisiteMarketIds.forEach(id => expect(seen.has(id)).toBe(true));
    expect(buildSyntheticManifest(key, { startsAt: "2031-06-01T00:00:00Z", categories: ["film","acting"] }).markets.map(x => x.id)).toEqual(m.markets.map(x => x.id));
  });
  it("rejects unknown editions and invalid time, keeping the catalog sealed", () => {
    expect(listEventDefinitions()).toHaveLength(9);
    expect(getEventDefinition("unknown")).toBeNull();
    expect(() => build("unknown")).toThrow();
    expect(() => buildSyntheticManifest("nba-2027", { startsAt: "invalid" })).toThrow();
    expect(() => (definition("nba-2027").markets as unknown as string[]).push("bad")).toThrow();
  });
});
