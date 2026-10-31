import { describe, it, expect } from "vitest";
import { parseOutcome, resolveEffective, scoreParticipant } from "@/lib/events/outcomes";

describe("typed event scoring independent oracles", () => {
  it("rejects ambiguous null, ineligible winners and duplicate nomination credits", () => {
    expect(() => parseOutcome(null, ["a", "b"], ["winner", "draw"])).toThrow();
    expect(parseOutcome({ kind: "draw" }, ["a", "b"], ["winner", "draw"])).toEqual({ kind: "draw" });
    expect(() => parseOutcome({ kind: "winner", entrant: "x" }, ["a"], ["winner"])).toThrow();
    expect(() => parseOutcome({ kind: "winner-set", entrants: ["a", "a"] }, ["a"], ["winner-set"])).toThrow();
  });
  it("does not add mutually incompatible UCL leg/qualifier possibilities", () => {
    // A won first leg 2–0. Draw in leg two and B qualification cannot coexist.
    const markets = [
      { id: "leg1", weight: 1, locked: true, result: { kind: "winner" as const, entrant: "a" } },
      { id: "leg2", weight: 1, locked: true, result: { kind: "unresolved" as const } },
      { id: "tie", weight: 1, locked: true, result: { kind: "unresolved" as const } },
    ];
    const domains = [{ marketIds: ["leg1", "leg2", "tie"], worlds: [
      { leg1: ["a"], leg2: ["a"], tie: ["a"] },
      { leg1: ["a"], leg2: ["draw"], tie: ["a"] },
      { leg1: ["a"], leg2: ["b"], tie: ["a"] },
      { leg1: ["a"], leg2: ["b"], tie: ["b"] },
    ] }];
    expect(scoreParticipant(markets, { leg1: "b", leg2: "draw", tie: "b" }, domains))
      .toMatchObject({ earned: 0, maximum: 1, wrong: 1 });
    expect(scoreParticipant(markets, { leg1: "a", leg2: "b", tie: "a" }, domains))
      .toMatchObject({ earned: 1, maximum: 3, wrong: 0 });
    expect(scoreParticipant(markets, { leg1: "b", leg2: "draw", tie: "b" }, [] ).maximum).toBeNull();
  });
  it("scores tied nominations once, forfeits only locked windows and selects future picks", () => {
    const markets = [
      { id: "award", weight: 1, locked: true, result: { kind: "winner-set" as const, entrants: ["n1", "n2"] } },
      { id: "missed", weight: 1, locked: true, result: { kind: "unresolved" as const } },
      { id: "future", weight: 1, locked: false, result: { kind: "unresolved" as const } },
    ];
    expect(scoreParticipant(markets, { award: "n2" }, [
      { marketIds: ["missed"], worlds: [{ missed: ["a"] }, { missed: ["b"] }] },
      { marketIds: ["future"], worlds: [{ future: ["a"] }, { future: ["b"] }] },
    ])).toEqual({ earned: 1, maximum: 2, wrong: 1, pending: 1 });
  });
  it("retains known zero maximum for an entirely forfeited unknown component", () => {
    expect(scoreParticipant([{id:"m",weight:1,locked:true,result:{kind:"unresolved"}}],{},
      [{marketIds:["m"],worlds:null}])).toEqual({earned:0,maximum:0,wrong:1,pending:0});
  });
  it("masked canonical changes affect provenance but not override conflict token; expiry exposes canon", () => {
    const canonical = { id: "c1", version: 1, outcome: { kind: "winner" as const, entrant: "a" } };
    const override = { id: "o1", revision: 1, outcome: { kind: "draw" as const }, expiresAt: "2027-01-02T00:00:00Z", status: "active" as const };
    const basis = { graph: 1, requiredSet: 1, scoring: 1 };
    const first = resolveEffective(canonical, override, basis, "2027-01-01T00:00:00Z");
    const corrected = resolveEffective({ ...canonical, version: 2 }, override, basis, "2027-01-01T00:00:00Z");
    expect(first.effectiveToken).toBe(corrected.effectiveToken);
    expect(first.provenanceToken).not.toBe(corrected.provenanceToken);
    expect(resolveEffective(canonical, override, basis, "2027-01-02T00:00:00Z").outcome).toEqual(canonical.outcome);
  });
});
