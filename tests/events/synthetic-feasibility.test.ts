import { describe, expect, it } from "vitest";
import { buildApplicationManifest } from "@/lib/events/application-manifest";
import { buildSyntheticFeasibility } from "@/lib/events/synthetic-feasibility";
import { buildSyntheticManifest, listEventDefinitions, type SyntheticManifest, type SlotSource } from "@/lib/events/catalog";
import { scoreEvent, type EventScoreInput, type ReviewedGraphBinding } from "@/lib/events/scoring-bridge";

const start = "2027-01-01T00:00:00Z";
function input(catalog: SyntheticManifest, limit = 4096): EventScoreInput {
  const byId = new Map(catalog.markets.map(m => [m.id,m]));
  function pool(s: SlotSource): string[] {
    if (s.kind === "entrant") return [s.entrantId];
    if (s.kind === "reviewed-placement") return catalog.entrants.map(e=>e.id);
    if (s.kind === "reseed") return s.pool.flatMap(pool);
    return byId.get(s.marketId)!.inputs.flatMap(pool);
  }
  const binding: ReviewedGraphBinding = {reviewed:true,graphVersion:1,markets:catalog.markets.map(m=>{
    const members = [...new Set(m.inputs.flatMap(pool))];
    return {marketId:m.id,inputs:m.inputs,eligibleEntrantIds:members,
      orientation:m.inputs.every(s=>s.kind==="entrant") && members.length===2 ? members as [string,string] : null};
  })};
  return {edition:{catalog,graphVersion:1},binding,components:buildSyntheticFeasibility(catalog,1,limit),
    outcomes:{},windows:Object.fromEntries(catalog.windows.map(w=>[w.id,"locked"])),participants:[]};
}
const rows=(x:EventScoreInput)=>scoreEvent(x).map(r=>[r.id,r.earned,r.maximum,r.wrong,r.rank]);
function playIn() {
  const manifest=buildApplicationManifest("nba-play-in-2027",start,1,"UTC");
  const x=input(manifest);
  // Exercise the actual persisted application evidence, not test-supplied worlds.
  x.components=manifest.lifecycle.components;
  const [s,n,t]=manifest.markets;
  const [a,b,c,d]=manifest.entrants.map(e=>e.id);
  x.participants=[{id:"P",graphVersion:1,picks:{[s.id]:a,[n.id]:c,[t.id]:b}},
    {id:"Q",graphVersion:1,picks:{[s.id]:b,[n.id]:c,[t.id]:c}}];
  // Other conference has coherent locked picks and all three points remain attainable.
  const west=manifest.markets.slice(3);
  x.windows={[manifest.windows[0].id]:"locked"};
  for (const p of x.participants) {
    const [wa,wb,wc]=manifest.entrants.slice(4).map(e=>e.id);
    Object.assign(p.picks,{[west[0].id]:wa,[west[1].id]:wc,[west[2].id]:wb});
  }
  return {x,a,b,c,d,s:s.id,n:n.id,t:t.id};
}
describe("trusted synthetic numerical acceptance",()=>{
  it("integrates exhaustive eight-world conference factors into the actual application manifest",()=>{
    const {x}=playIn();
    expect(x.components.map(c=>c.worlds?.length)).toEqual([8,8]);
    const [a,b,c,d]=x.edition.catalog.entrants.map(e=>e.id);
    const [s,n,t]=x.edition.catalog.markets.map(m=>m.id);
    const expected=[[a,c,b],[a,c,c],[a,d,b],[a,d,d],[b,c,a],[b,c,c],[b,d,a],[b,d,d]];
    expect(x.components[0].worlds!.map(w=>[w[s][0],w[n][0],w[t][0]])).toEqual(expected);
    expect(rows(x)).toEqual([["P",0,6,0,1],["Q",0,6,0,1]]);
  });
  it("matches full Play-In correction, invalidation and multiplayer rank oracles",()=>{
    const {x,a,b,c,s,n,t}=playIn();
    x.outcomes={[s]:{kind:"winner",entrant:a},[n]:{kind:"winner",entrant:c}};
    expect(rows(x)).toEqual([["P",2,6,0,1],["Q",1,5,1,2]]);
    x.outcomes={...x.outcomes,[t]:{kind:"winner",entrant:b}};
    expect(rows(x)).toEqual([["P",3,6,0,1],["Q",1,4,2,2]]);
    x.outcomes={...x.outcomes,[t]:{kind:"winner",entrant:c}};
    expect(rows(x)).toEqual([["P",2,5,1,1],["Q",2,5,1,1]]);
    x.outcomes={...x.outcomes,[t]:{kind:"unresolved"}};
    expect(rows(x)).toEqual([["P",2,6,0,1],["Q",1,5,1,2]]);
    for (const p of x.participants.slice(0,1)) {
      for(const m of x.edition.catalog.markets.slice(3)) x.outcomes={...x.outcomes,[m.id]:{kind:"winner",entrant:p.picks[m.id]}};
    }
    x.outcomes={...x.outcomes,[t]:{kind:"winner",entrant:b}};
    expect(rows(x)).toEqual([["P",6,6,0,1],["Q",4,4,2,2]]);
  });
  it("proves UCL A first-leg win plus draw cannot coexist with B qualification",()=>{
    const base=buildSyntheticManifest("ucl-2026-27",{startsAt:start});
    const [a,b]=base.entrants.map(e=>e.id);
    const tie=base.markets.find(m=>m.tieId)!.tieId;
    const markets=base.markets.filter(m=>m.tieId===tie).map(m=>({...m,
      inputs:(m.leg===2?[b,a]:[a,b]).map(entrantId=>({kind:"entrant" as const,entrantId}))}));
    const ids=new Set(markets.map(m=>m.id));
    const catalog={...base,markets,windows:base.windows.filter(w=>markets.some(m=>m.windowId===w.id)),
      edges:base.edges.filter(e=>ids.has(e.from)&&ids.has(e.to)),championMarketId:null};
    const x=input(catalog),[l1,l2,q]=markets.map(m=>m.id);
    x.outcomes={[l1]:{kind:"winner",entrant:a}};
    x.participants=[{id:"P",graphVersion:1,picks:{[l1]:"away",[l2]:"draw",[q]:b}},
      {id:"Q",graphVersion:1,picks:{[l1]:"home",[l2]:"draw",[q]:a}}];
    expect(rows(x)).toEqual([["Q",1,3,0,1],["P",0,1,1,2]]);
    expect(rows({...x,components:[]})).toEqual([["Q",1,null,0,1],["P",0,null,1,2]]);
  });
  it("never certifies unknown placement or a truncated component",()=>{
    const x=input(buildSyntheticManifest("wwc-2027",{startsAt:start}));
    // Every group match feeds the unsupported reviewed-placement boundary.
    // No upstream factor may claim independence from that unknown domain.
    expect(x.components).toHaveLength(1);
    expect(new Set(x.components[0].marketIds)).toEqual(new Set(
      x.edition.catalog.markets.filter(m=>m.scored).map(m=>m.id)));
    expect(x.components.every(c=>c.evidence===null && c.worlds===null)).toBe(true);
    x.windows=Object.fromEntries(Object.keys(x.windows).map(id=>[id,"unopened"]));
    x.participants=[{id:"P",graphVersion:1,picks:{}}];
    expect(scoreEvent(x)[0].maximum).toBeNull();
    const p=playIn().x;
    p.components=buildSyntheticFeasibility(p.edition.catalog as SyntheticManifest,1,7);
    expect(p.components.every(c=>c.evidence===null && c.worlds===null)).toBe(true);
    expect(scoreEvent(p)[0].maximum).toBeNull();
  });
});

// Reviewed, original synthetic WWC placement fixture. Explicit entrants replace
// the unknown placement boundary; this is not a claim about real qualification.
function reviewedWwc() {
  const base=buildSyntheticManifest("wwc-2027",{startsAt:start});
  const markets=base.markets.map(m=>({...m,inputs:m.inputs.map(s=>{
    if(s.kind!=="reviewed-placement") return s;
    const entrant=base.entrants.find(e=>e.group===s.placement[0] && e.seed===Number(s.placement[1]))!;
    return {kind:"entrant" as const,entrantId:entrant.id};
  })}));
  return input({...base,markets,edges:base.edges.filter(e=>e.relation!=="reviewed-placement")},65536);
}
function completeWwc(x:EventScoreInput) {
  const winners:Record<string,string>={}, pairings:Record<string,[string,string]>={};
  function actual(s:SlotSource):string {
    if(s.kind==="entrant") return s.entrantId;
    if(s.kind==="winner") return winners[s.marketId];
    if(s.kind==="loser") return pairings[s.marketId].find(id=>id!==winners[s.marketId])!;
    throw new Error("Unreviewed test placement");
  }
  const picks:Record<string,string>={};
  for(const m of x.edition.catalog.markets) {
    pairings[m.id]=m.inputs.map(actual) as [string,string];
    if(m.stage==="group") {
      x.outcomes={...x.outcomes,[m.id]:{kind:"draw"}};
      picks[m.id]="draw";
    } else {
      winners[m.id]=pairings[m.id][m.role==="bronze"?1:0];
      x.outcomes={...x.outcomes,[m.id]:{kind:"winner",entrant:winners[m.id]}};
      picks[m.id]=winners[m.id];
    }
  }
  x.binding={...x.binding,markets:x.binding.markets.map(m=>({...m,orientation:pairings[m.marketId]}))};
  return {picks,pairings};
}
describe("WWC full 64-market independent numerical oracle",()=>{
  it("counts selectable future windows and final/bronze exactly once, with shared ranks",()=>{
    const x=reviewedWwc();
    const groups=x.edition.catalog.markets.filter(m=>m.stage==="group");
    x.outcomes=Object.fromEntries(groups.map(m=>[m.id,{kind:"draw" as const}]));
    x.windows=Object.fromEntries(x.edition.catalog.windows.map(w=>[w.id,
      groups.some(m=>m.windowId===w.id)?"locked":"unopened"]));
    const groupPicks=Object.fromEntries(groups.map(m=>[m.id,"draw"]));
    x.participants=[{id:"P",graphVersion:1,picks:groupPicks},
      {id:"Q",graphVersion:1,picks:{...groupPicks,[groups[0].id]:"home"}}];
    expect(x.components.every(c=>c.evidence!==null)).toBe(true);
    expect(rows(x)).toEqual([["P",48,64,0,1],["Q",47,63,1,2]]);
    expect(scoreEvent(x).map(r=>r.pending)).toEqual([16,16]);

    const {picks,pairings}=completeWwc(x);
    x.windows=Object.fromEntries(x.edition.catalog.windows.map(w=>[w.id,"locked"]));
    x.participants=[{id:"P",graphVersion:1,picks:{...picks}},{id:"Q",graphVersion:1,picks:{...picks}}];
    expect(rows(x)).toEqual([["P",64,64,0,1],["Q",64,64,0,1]]);
    expect(scoreEvent(x).map(r=>r.pending)).toEqual([0,0]);

    const final=x.edition.catalog.markets.find(m=>m.role==="champion")!.id;
    const bronze=x.edition.catalog.markets.find(m=>m.role==="bronze")!.id;
    x.participants=[{id:"P",graphVersion:1,picks:{...picks,[bronze]:pairings[bronze][0]}},
      {id:"Q",graphVersion:1,picks:{...picks,[final]:pairings[final][1]}}];
    expect(rows(x)).toEqual([["P",63,63,1,1],["Q",63,63,1,1]]);
    x.outcomes={...x.outcomes,[bronze]:{kind:"unresolved"}};
    expect(rows(x)).toEqual([["P",63,64,0,1],["Q",62,63,1,2]]);
    expect(scoreEvent(x).map(r=>r.pending)).toEqual([1,1]);
  },30000);
});

describe("synthetic evidence integration boundaries",()=>{
  it.each(listEventDefinitions().map(d=>d.key))("validates complete application graph %s without certifying unknown factors",key=>{
    const manifest=buildApplicationManifest(key,start,1,"UTC",["Picture"]);
    expect(manifest.lifecycle.components.every(c=>c.evidence!==null)).toBe(true);
    for(const c of manifest.lifecycle.components) {
      expect(c.evidence===null).toBe(c.worlds===null);
      if(c.evidence) expect(c.evidence.reference).toBe("original-synthetic-exhaustive-rules-v1");
    }
    if(["ucl-2026-27","wwc-2027","nfl-2026-postseason","ncaa-men-2027","nba-2027"].includes(key))
      expect(manifest.lifecycle.components.flatMap(c=>c.marketIds).length)
        .toBeLessThan(manifest.markets.filter(m=>m.scored).length);
  });
  it("includes tied nomination winner sets instead of pretending winners are exclusive",()=>{
    const manifest=buildApplicationManifest("oscars-2027",start,1,"UTC",["Picture"]);
    const x=input(manifest),m=manifest.markets[0],[a,b]=manifest.entrants.map(e=>e.id);
    x.components=manifest.lifecycle.components;
    expect(x.components[0].worlds).toHaveLength(15);
    x.participants=[{id:"P",graphVersion:1,picks:{[m.id]:a}},{id:"Q",graphVersion:1,picks:{[m.id]:b}}];
    x.outcomes={[m.id]:{kind:"winner-set",entrants:[a,b]}};
    expect(rows(x)).toEqual([["P",1,1,0,1],["Q",1,1,0,1]]);
  });
  it("rejects stale evidence and returns unverified when trusted evidence is removed",()=>{
    const {x}=playIn();
    expect(()=>scoreEvent({...x,components:x.components.map(c=>({...c,
      evidence:{...c.evidence!,graphVersion:2}}))})).toThrow("Stale/unreviewed feasible evidence");
    expect(scoreEvent({...x,components:x.components.map(c=>({...c,evidence:null}))})
      .every(r=>r.maximum===null)).toBe(true);
  });
});

it("omits unknown application factors so settled large brackets still have exact maxima",()=>{
  const manifest=buildApplicationManifest("nba-2027",start,1,"UTC");
  const x=input(manifest),picks:Record<string,string>={};
  x.components=manifest.lifecycle.components;
  expect(x.components).toEqual([]);
  x.participants=[{id:"P",graphVersion:1,picks}];
  for(const m of manifest.markets) {
    const s=m.inputs[0];
    if(s.kind==="entrant") picks[m.id]=s.entrantId;
    else if(s.kind==="winner") picks[m.id]=picks[s.marketId];
    else throw new Error("Unexpected NBA source");
  }
  expect(scoreEvent(x)[0].maximum).toBeNull();
  x.outcomes=Object.fromEntries(Object.entries(picks).map(([id,entrant])=>[id,{kind:"winner" as const,entrant}]));
  expect(rows(x)).toEqual([["P",15,15,0,1]]);
});
