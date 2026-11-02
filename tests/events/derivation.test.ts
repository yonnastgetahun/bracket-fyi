import { describe, expect, it } from "vitest";
import { deriveSeries, playInPredictions, playInWorlds, reseed, validateGraph } from "@/lib/events/derivation";
import { scoreParticipant } from "@/lib/events/outcomes";

describe("event structures and independent derivation oracles", () => {
  it("retains one series win per child ID and retracts a corrected clinch", () => {
    const games = ["1","2","3"].map(id => ({ id, version: 1, winner: "a" }));
    expect(deriveSeries(["a","b"], 7, games).outcome).toEqual({ kind: "unresolved" });
    expect(deriveSeries(["a","b"], 7, [...games,{ id:"4",version:1,winner:"a" }]).outcome).toEqual({kind:"winner",entrant:"a"});
    expect(deriveSeries(["a","b"], 7, [...games,{id:"4",version:2,winner:null}]).outcome).toEqual({kind:"unresolved"});
    expect(() => deriveSeries(["a","b"], 7, [...games,games[0]])).toThrow();
  });
  it("keeps Play-In predicted loser paths separate and scores changed opponents", () => {
    const seeds = ["a","b","c","d"] as const;
    expect(playInPredictions(seeds, { sevenEight:"a",nineTen:"c",decider:"b" })).toEqual({ seventh:"a",eighth:"b",deciderEntrants:["b","c"] });
    expect(() => playInPredictions(seeds, { sevenEight:"a",nineTen:"c",decider:"a" })).toThrow();
    const markets = [
      {id:"sevenEight",locked:true,weight:1,result:{kind:"winner" as const,entrant:"a"}},
      {id:"nineTen",locked:true,weight:1,result:{kind:"winner" as const,entrant:"c"}},
      {id:"decider",locked:true,weight:1,result:{kind:"unresolved" as const}},
    ];
    const worlds = [{ marketIds: markets.map(m=>m.id), worlds: playInWorlds(seeds) }];
    expect(scoreParticipant(markets,{sevenEight:"a",nineTen:"c",decider:"b"},worlds)).toMatchObject({earned:2,maximum:3,wrong:0});
    expect(scoreParticipant(markets,{sevenEight:"b",nineTen:"c",decider:"c"},worlds)).toMatchObject({earned:1,maximum:2,wrong:1});
  });
  it("reseeds by official seed, not prior hypothetical opponents", () => {
    expect(reseed([{id:"a",seed:1},{id:"b",seed:4},{id:"c",seed:6},{id:"d",seed:7}])).toEqual([["a","d"],["b","c"]]);
    expect(() => reseed([{id:"a",seed:1},{id:"b",seed:1}])).toThrow();
  });
  it("rejects cycles, cross-edition edges and duplicate destinations", () => {
    const nodes = [{id:"sf",edition:"cup"},{id:"final",edition:"cup"},{id:"bronze",edition:"cup"}];
    expect(() => validateGraph(nodes,[{from:"sf",to:"final",role:"home",outcome:"winner"},{from:"sf",to:"bronze",role:"home",outcome:"loser"}])).not.toThrow();
    expect(() => validateGraph(nodes,[{from:"sf",to:"final",role:"home",outcome:"winner"},{from:"final",to:"sf",role:"home",outcome:"winner"}])).toThrow();
    expect(() => validateGraph([...nodes,{id:"other",edition:"other"}],[{from:"sf",to:"other",role:"home",outcome:"winner"}])).toThrow();
    expect(() => validateGraph(nodes,[{from:"sf",to:"final",role:"home",outcome:"winner"},{from:"bronze",to:"final",role:"home",outcome:"winner"}])).toThrow();
  });
});
