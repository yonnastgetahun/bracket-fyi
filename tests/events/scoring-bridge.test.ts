import { describe, expect, it } from "vitest";
import { buildSyntheticManifest, getEventDefinition, type EventDefinition, type EventMarket, type EventKey } from "@/lib/events/catalog";
import { deriveSeries } from "@/lib/events/derivation";
import { scoreEvent, type EventScoreInput } from "@/lib/events/scoring-bridge";

function group(): EventScoreInput {
  const base = getEventDefinition("wwc-2027")!;
  const market = base.markets[0];
  const ids = market.inputs.map(s => s.kind === "entrant" ? s.entrantId : "");
  const catalog: EventDefinition = { ...base, markets: [market], entrants: base.entrants.filter(e => ids.includes(e.id)), windows: [base.windows[0]], edges: [], championMarketId: null };
  return {
    edition: { catalog, graphVersion: 1 },
    binding: { reviewed: true, graphVersion: 1, markets: [{ marketId: market.id, inputs: market.inputs, eligibleEntrantIds: ids, orientation: [ids[0], ids[1]] }] },
    outcomes: { [market.id]: { kind: "draw" } },
    windows: { [market.windowId]: "locked" },
    participants: [{ id: "P", graphVersion:1,picks: { [market.id]: "draw" } }, { id: "Q", graphVersion:1,picks: { [market.id]: "home" } }],
    components: [],
  };
}
function fixture(key: EventKey, build: (base: EventDefinition) => EventMarket[], eligible: string[][]): EventScoreInput {
  const base = getEventDefinition(key)!;
  const markets = build(base);
  const ids = new Set(markets.map(m=>m.id));
  const catalog: EventDefinition = {...base, markets, windows:base.windows.filter(w=>markets.some(m=>m.windowId===w.id)),
    edges:base.edges.filter(e=>ids.has(e.from)&&ids.has(e.to)),championMarketId:null};
  return {edition:{catalog,graphVersion:1},binding:{reviewed:true,graphVersion:1,markets:markets.map((m,i)=>({
    marketId:m.id,inputs:m.inputs,eligibleEntrantIds:eligible[i],orientation:eligible[i].length===2 ? [eligible[i][0],eligible[i][1]] : null,
  }))},outcomes:{},windows:Object.fromEntries(catalog.windows.map(w=>[w.id,"locked"])),participants:[],components:[]};
}
function tie() {
  const base=getEventDefinition("ucl-2026-27")!, [a,b]=base.entrants.map(e=>e.id);
  const x=fixture(base.key,d=>d.markets.filter(m=>m.tieId===d.markets.find(m=>m.role==="leg")!.tieId).map(m=>({
    ...m,inputs:(m.leg===2?[b,a]:[a,b]).map(entrantId=>({kind:"entrant" as const,entrantId})),
  })),[[a,b],[b,a],[a,b]]);
  const [l1,l2,t]=x.edition.catalog.markets.map(m=>m.id);
  x.outcomes={[l1]:{kind:"winner",entrant:a}};
  x.participants=[
    {id:"P",graphVersion:1,picks:{[l1]:"home",[l2]:"home",[t]:a}},
    {id:"Q",graphVersion:1,picks:{[l1]:"home",[l2]:"away",[t]:a}},
    {id:"R",graphVersion:1,picks:{[l1]:"away",[l2]:"draw",[t]:b}},
  ];
  // Hand-enumerated signs after A 2–0: B may win leg two by 1, 2 (parity), or 3+.
  x.components=[{marketIds:[l1,l2,t],evidence:{reviewed:true,graphVersion:1,reference:"original-2-0-oracle"},worlds:[
    {[l1]:[a],[l2]:[a],[t]:[a]}, {[l1]:[a],[l2]:["draw"],[t]:[a]},
    {[l1]:[a],[l2]:[b],[t]:[a]}, {[l1]:[a],[l2]:[b],[t]:[b]},
  ]}];
  return {x,a,b,l1,l2,t};
}
function playIn() {
  const base=getEventDefinition("nba-play-in-2027")!, [a,b,c,d]=base.entrants.map(e=>e.id);
  const x=fixture(base.key,d=>d.markets.slice(0,3),[[a,b],[c,d],[a,b,c,d]]);
  const [s,n,t]=x.edition.catalog.markets.map(m=>m.id);
  x.participants=[{id:"P",graphVersion:1,picks:{[s]:a,[n]:c,[t]:b}},{id:"Q",graphVersion:1,picks:{[s]:b,[n]:c,[t]:c}}];
  // All eight hand-listed conference completions; no production generator.
  x.components=[{marketIds:[s,n,t],evidence:{reviewed:true,graphVersion:1,reference:"eight-play-in-worlds"},worlds:[
    {[s]:[a],[n]:[c],[t]:[b]}, {[s]:[a],[n]:[c],[t]:[c]},
    {[s]:[a],[n]:[d],[t]:[b]}, {[s]:[a],[n]:[d],[t]:[d]},
    {[s]:[b],[n]:[c],[t]:[a]}, {[s]:[b],[n]:[c],[t]:[c]},
    {[s]:[b],[n]:[d],[t]:[a]}, {[s]:[b],[n]:[d],[t]:[d]},
  ]}];
  return {x,a,b,c,d,s,n,t};
}
const scores=(x:EventScoreInput)=>scoreEvent(x).map(r=>[r.id,r.earned,r.maximum,r.wrong,r.rank]);
describe("catalog scoring bridge", () => {
  it("conditions unresolved NCAA pairing maxima on structural qualification and correction",()=>{
    const base=getEventDefinition("ncaa-men-2027")!;
    const opening=base.markets.find(m=>!m.scored)!;
    const next=base.markets.find(m=>m.scored && m.inputs.some(s=>s.kind==="winner" && s.marketId===opening.id))!;
    const [a,b]=opening.inputs.map(s=>s.kind==="entrant"?s.entrantId:"");
    const direct=next.inputs.find(s=>s.kind==="entrant")!;
    if (direct.kind!=="entrant") throw new Error("Expected direct NCAA entrant");
    const x=fixture(base.key,()=>[opening,next],[[a,b],[a,b,direct.entrantId]]);
    x.participants=[{id:"P",graphVersion:1,picks:{[next.id]:b}}];
    x.components=[{marketIds:[next.id],evidence:{reviewed:true,graphVersion:1,reference:"prequalification-three-winners"},
      worlds:[a,b,direct.entrantId].map(id=>({[next.id]:[id]}))}];
    expect(x.binding.markets[1].orientation).toBeNull();
    expect(scoreEvent(x)).toEqual([{id:"P",earned:0,maximum:1,wrong:0,pending:1,rank:1}]);
    x.outcomes={[opening.id]:{kind:"winner",entrant:a}};
    expect(scoreEvent(x)).toEqual([{id:"P",earned:0,maximum:0,wrong:0,pending:1,rank:1}]);
    x.outcomes={[opening.id]:{kind:"winner",entrant:b}};
    expect(scoreEvent(x)).toEqual([{id:"P",earned:0,maximum:1,wrong:0,pending:1,rank:1}]);
    x.outcomes={[opening.id]:{kind:"unresolved"}};
    expect(scoreEvent(x)[0].maximum).toBe(1);
  });
  it("compares nested reseed sources structurally while retaining ordered pools",()=>{
    const x=group(), m=x.edition.catalog.markets[0], ids=x.binding.markets[0].eligibleEntrantIds;
    const inputs=ids.map((_,rank)=>({kind:"reseed" as const,rank,order:"ascending-seed" as const,pool:ids.map(entrantId=>({kind:"entrant" as const,entrantId}))}));
    x.edition={...x.edition,catalog:{...(x.edition.catalog as EventDefinition),markets:[{...m,inputs}]}};
    x.binding={...x.binding,markets:x.binding.markets.map(b=>({...b,inputs:inputs.map(s=>({pool:s.pool.map(p=>({entrantId:p.entrantId,kind:p.kind})),order:s.order,rank:s.rank,kind:s.kind}))}))};
    expect(scores(x)).toEqual([["P",1,1,0,1],["Q",0,0,1,2]]);
    const b=x.binding.markets[0];
    expect(()=>scoreEvent({...x,binding:{...x.binding,markets:[{...b,inputs:[...b.inputs].reverse()}]}})).toThrow("Inconsistent graph binding");
  });
  it("accepts structurally equal sources regardless of object property insertion order",()=>{
    const x=group();
    x.binding={...x.binding,markets:x.binding.markets.map(b=>({...b,inputs:b.inputs.map(s=>s.kind==="entrant"?{entrantId:s.entrantId,kind:"entrant" as const}:s)}))};
    expect(scores(x)).toEqual([["P",1,1,0,1],["Q",0,0,1,2]]);
  });
  it("conditions maxima on actual pairing without discarding predicted routes",()=>{
    const {x,a,b,c,s,n,t}=playIn();
    x.binding={...x.binding,markets:x.binding.markets.map(m=>m.marketId===t?{...m,orientation:[b,c]}:m)};
    x.participants=[{id:"P",graphVersion:1,picks:{[s]:b,[n]:c,[t]:a}}];
    // Actual final B/C forces A to win 7–8 and C to win 9–10: only N can score.
    expect(scores(x)).toEqual([["P",0,1,0,1]]);
  });
  it("rejects impossible partial Play-In outcomes and predictions",()=>{
    const {x,a,s,t}=playIn();
    expect(()=>scoreEvent({...x,outcomes:{[s]:{kind:"winner",entrant:a},[t]:{kind:"winner",entrant:a}}})).toThrow("Impossible advancement path");
    expect(()=>scoreEvent({...x,participants:[{id:"P",graphVersion:1,picks:{[s]:a,[t]:a}}]})).toThrow("Impossible advancement path");
  });
  it("rejects explicit ambiguous null instead of silently treating it as unresolved",()=>{
    const x=group(), m=x.edition.catalog.markets[0];
    expect(()=>scoreEvent({...x,outcomes:{[m.id]:null} as unknown as EventScoreInput["outcomes"]})).toThrow();
  });
  it("rejects truncated eligible membership and noncanonical whitespace IDs",()=>{
    const x=group(), m=x.edition.catalog.markets[0], b=x.binding.markets[0];
    expect(()=>scoreEvent({...x,participants:[],binding:{...x.binding,markets:[{...b,eligibleEntrantIds:[b.eligibleEntrantIds[0]],orientation:null}]}})).toThrow();
    expect(()=>scoreEvent({...x,outcomes:{[m.id]:{kind:"winner",entrant:" "+b.eligibleEntrantIds[0]}}})).toThrow();
  });
  it("keeps unknown, no-contest and zero forfeits distinct; unlocked futures selectable",()=>{
    const x=group(), m=x.edition.catalog.markets[0], [a,b]=x.binding.markets[0].eligibleEntrantIds;
    x.outcomes={}; x.participants=[{id:"P",graphVersion:1,picks:{}}];
    expect(scores(x)).toEqual([["P",0,0,1,1]]);
    x.windows={[m.windowId]:"unopened"};
    expect(scores(x)).toEqual([["P",0,null,0,1]]);
    x.components=[{marketIds:[m.id],evidence:{reviewed:true,graphVersion:1,reference:"regulation-three-signs"},worlds:[
      {[m.id]:[a]},{[m.id]:["draw"]},{[m.id]:[b]},
    ]}];
    expect(scores(x)).toEqual([["P",0,1,0,1]]);
    x.outcomes={[m.id]:{kind:"no-contest"}};
    expect(scores(x)).toEqual([["P",0,null,0,1]]);
  });
  it("UCL reversed leg orientation, baseline, effective override and draw correction match independent table",()=>{
    const {x,a,b,l1,l2,t}=tie();
    x.outcomes={[l1]:{kind:"winner",entrant:a},[l2]:{kind:"winner",entrant:b},[t]:{kind:"winner",entrant:a}};
    expect(scores(x)).toEqual([["P",3,3,0,1],["Q",2,2,1,2],["R",0,0,3,3]]);
    x.outcomes={...x.outcomes,[l2]:{kind:"winner",entrant:a}};
    expect(scores(x)).toEqual([["Q",3,3,0,1],["P",2,2,1,2],["R",0,0,3,3]]);
    x.outcomes={...x.outcomes,[l2]:{kind:"draw"}};
    expect(scores(x)).toEqual([["P",2,2,1,1],["Q",2,2,1,1],["R",1,1,2,3]]);
    expect(scoreEvent({...x,components:[]}).every(r=>r.maximum===r.earned)).toBe(true);
  });
  it("series child clinch/correction awards only the parent for NBA and MLB thresholds",()=>{
    for (const [key,target] of [["nba-2027",4],["mlb-2027",2]] as const) {
      const base=getEventDefinition(key)!, m=base.markets[0], ids=m.inputs.map(s=>s.kind==="entrant"?s.entrantId:"");
      const [a,b]=ids, x=fixture(key,d=>[d.markets[0]],[ids]);
      x.participants=[{id:"P",graphVersion:1,picks:{[m.id]:a}},{id:"Q",graphVersion:1,picks:{[m.id]:b}}];
      x.components=[{marketIds:[m.id],evidence:{reviewed:true,graphVersion:1,reference:"series-two-winners"},worlds:[{[m.id]:[a]},{[m.id]:[b]}]}];
      const games=Array.from({length:target-1},(_,i)=>({id:"child-"+i,version:1,winner:a}));
      const result=(extra:boolean)=>deriveSeries(ids,m.series!.bestOf,extra?[...games,{id:"clinch",version:1,winner:a}]:games).outcome;
      x.outcomes={[m.id]:result(false)};
      expect(scores(x)).toEqual([["P",0,1,0,1],["Q",0,1,0,1]]);
      x.outcomes={[m.id]:result(true)};
      expect(scores(x)).toEqual([["P",1,1,0,1],["Q",0,0,1,2]]);
      x.outcomes={[m.id]:result(false)};
      expect(scores(x)).toEqual([["P",0,1,0,1],["Q",0,1,0,1]]);
    }
  });
  it("nomination winner-set and correction preserve one credit and competition ranks",()=>{
    const catalog=buildSyntheticManifest("oscars-2027",{startsAt:"2027-01-01T00:00:00Z",categories:["Picture"]});
    const m=catalog.markets[0], [a,b,c]=m.entrants.map(e=>e.id);
    const x:EventScoreInput={edition:{catalog,graphVersion:1},binding:{reviewed:true,graphVersion:1,markets:[
      {marketId:m.id,inputs:m.inputs,eligibleEntrantIds:m.entrants.map(e=>e.id),orientation:null},
    ]},outcomes:{[m.id]:{kind:"winner-set",entrants:[a,b]}},windows:{[m.windowId]:"locked"},
      participants:[{id:"P",graphVersion:1,picks:{[m.id]:a}},{id:"Q",graphVersion:1,picks:{[m.id]:b}},{id:"R",graphVersion:1,picks:{[m.id]:c}}],components:[]};
    expect(scores(x)).toEqual([["P",1,1,0,1],["Q",1,1,0,1],["R",0,0,1,3]]);
    x.outcomes={[m.id]:{kind:"winner-set",entrants:[a]}};
    expect(scores(x)).toEqual([["P",1,1,0,1],["Q",0,0,1,2],["R",0,0,1,2]]);
  });
  it("WWC medal markets score final and bronze once with shared rank",()=>{
    const base=getEventDefinition("wwc-2027")!, [a,b,c,d]=base.entrants.map(e=>e.id);
    const x=fixture(base.key,definition=>definition.markets.filter(m=>m.stage==="medals").map((m,i)=>({...m,
      inputs:(i?[c,d]:[a,b]).map(entrantId=>({kind:"entrant" as const,entrantId})),
    })),[[a,b],[c,d]]);
    const [f,bronze]=x.edition.catalog.markets.map(m=>m.id);
    x.participants=[{id:"P",graphVersion:1,picks:{[f]:a,[bronze]:c}},{id:"Q",graphVersion:1,picks:{[f]:b,[bronze]:d}}];
    x.outcomes={[f]:{kind:"winner",entrant:a},[bronze]:{kind:"winner",entrant:d}};
    expect(scores(x)).toEqual([["P",1,1,1,1],["Q",1,1,1,1]]);
    x.outcomes={...x.outcomes,[bronze]:{kind:"unresolved"}};
    expect(scoreEvent(x).map(r=>[r.pending,r.maximum])).toEqual([[1,null],[1,null]]);
  });
  it("Play-In preserves predicted opponents and correction/invalidation table",()=>{
    const {x,a,b,c,s,n,t}=playIn();
    expect(scores(x)).toEqual([["P",0,3,0,1],["Q",0,3,0,1]]);
    x.outcomes={[s]:{kind:"winner",entrant:a},[n]:{kind:"winner",entrant:c}};
    expect(scores(x)).toEqual([["P",2,3,0,1],["Q",1,2,1,2]]);
    x.outcomes={...x.outcomes,[t]:{kind:"winner",entrant:b}};
    expect(scores(x)).toEqual([["P",3,3,0,1],["Q",1,1,2,2]]);
    x.outcomes={...x.outcomes,[t]:{kind:"winner",entrant:c}};
    expect(scores(x)).toEqual([["P",2,2,1,1],["Q",2,2,1,1]]);
    x.outcomes={...x.outcomes,[t]:{kind:"unresolved"}};
    expect(scores(x)).toEqual([["P",2,3,0,1],["Q",1,2,1,2]]);
    expect(()=>scoreEvent({...x,participants:[{id:"bad",graphVersion:1,picks:{[s]:a,[n]:c,[t]:a}}]})).toThrow();
  });
  it("requires trusted joint UCL worlds, never independent optimistic factors",()=>{
    const {x,l1,l2,t,a,b}=tie();
    expect(scores(x)).toEqual([["P",1,3,0,1],["Q",1,3,0,1],["R",0,1,1,3]]);
    expect(scoreEvent({...x,components:[{...x.components[0],evidence:null}]}).every(r=>r.maximum===null)).toBe(true);
    expect(()=>scoreEvent({...x,components:[
      {marketIds:[l1,l2],evidence:x.components[0].evidence,worlds:[{[l1]:[a],[l2]:["draw"]}]},
      {marketIds:[t],evidence:x.components[0].evidence,worlds:[{[t]:[b]}]},
    ]})).toThrow();
  });
  it("fails closed on unknown IDs, unsupported result types and stale/false bindings", () => {
    const x = group(), m = x.edition.catalog.markets[0];
    expect(() => scoreEvent({ ...x, outcomes: { alien: {kind:"draw"} } })).toThrow();
    expect(() => scoreEvent({ ...x, outcomes: {[m.id]: {kind:"winner-set",entrants:[x.binding.markets[0].eligibleEntrantIds[0]]}} })).toThrow();
    expect(() => scoreEvent({ ...x, binding: {...x.binding,graphVersion:2} })).toThrow();
    expect(() => scoreEvent({ ...x, binding: {...x.binding,markets:[{...x.binding.markets[0],inputs:[]}]} })).toThrow();
    expect(() => scoreEvent({ ...x, windows: {} })).toThrow();
    expect(() => scoreEvent({ ...x, participants: x.participants.map(p=>({...p,graphVersion:2})) })).toThrow();
    expect(() => scoreEvent({ ...x, binding:{...x.binding,markets:[{...x.binding.markets[0],orientation:[x.binding.markets[0].eligibleEntrantIds[1],x.binding.markets[0].eligibleEntrantIds[0]]}]} })).toThrow();
    expect(() => scoreEvent({ ...x, components:[{marketIds:[m.id],evidence:{reviewed:true,graphVersion:1,reference:"bad-world"},worlds:[{[m.id]:["home"]}]}] })).toThrow();
    expect(() => scoreEvent({ ...x, participants:[{id:"P",graphVersion:1,picks:{[m.id]:"not-home"}}] })).toThrow();
    expect(() => scoreEvent({ ...x, outcomes: {[m.id]: {kind:"winner",entrant:"alien"}} })).toThrow();
  });
  it("WWC regulation draw and canonical home correction reverse exact scores", () => {
    const input = group(), m = input.edition.catalog.markets[0];
    expect(scoreEvent(input).map(r => [r.id,r.earned,r.maximum,r.wrong,r.rank])).toEqual([["P",1,1,0,1],["Q",0,0,1,2]]);
    input.outcomes = { [m.id]: { kind: "winner", entrant: input.binding.markets[0].orientation![0] } };
    expect(scoreEvent(input).map(r => [r.id,r.earned,r.maximum,r.wrong,r.rank])).toEqual([["Q",1,1,0,1],["P",0,0,1,2]]);
  });
});
