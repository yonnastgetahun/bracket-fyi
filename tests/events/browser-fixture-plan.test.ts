import { describe,it,expect } from "vitest";
import { readFileSync } from "node:fs";
import { laterPlan,validateTarget,sharedRows } from "../../scripts/browser/fixture-plan";
import { scoreEvent } from "../../lib/events/scoring-bridge";

describe("durable browser fixtures: pure synthetic plans (no DB/HTTP)",()=>{
 it("requires explicit disposable DB and fixed local app, with no inherited/default DB",()=>{
  const valid={BRACKET_FIXTURE_DATABASE:"bracket_http_012345abcdef",BRACKET_FIXTURE_DISPOSABLE:"bracket_http_012345abcdef",BRACKET_FIXTURE_ORIGIN:"http://127.0.0.1:3137"};
  expect(validateTarget(valid).database).toBe(valid.BRACKET_FIXTURE_DATABASE);
  for(const patch of [{BRACKET_FIXTURE_DATABASE:undefined},{BRACKET_FIXTURE_DATABASE:"postgres"},{BRACKET_FIXTURE_DISPOSABLE:"other"},
   {BRACKET_FIXTURE_ORIGIN:"http://localhost:3137"},{BRACKET_FIXTURE_ORIGIN:"https://127.0.0.1.evil.test:3137"},{BRACKET_FIXTURE_DATABASE:"bracket_x;select"}])
   expect(()=>validateTarget({...valid,...patch})).toThrow();
 });
 for(const key of ["ucl-2026-27","wwc-2027"] as const){
  const p=laterPlan(key,"2035-01-01T00:00:00Z");
  it(key+" retains full catalog and hand-counted nonempty prior picks",()=>{
   expect(p.manifest.markets).toHaveLength(key==="ucl-2026-27"?211:64);
   expect(p.priorCount).toBe(key==="ucl-2026-27"?210:62);
   expect(p.baselineEarned).toBe(key==="ucl-2026-27"?209:61);
   expect(p.resultEarned).toEqual(key==="ucl-2026-27"?[210]:[62,63]);
   expect(Object.keys(p.picks)).toHaveLength(p.manifest.markets.length);
   expect(p.picks[p.manifest.markets[0].id]).toBe("draw");
   expect(Object.values(p.picks).filter(c=>c==="draw")).toHaveLength(1);
  });
  it(key+" resolves winners/losers and preserves reversed leg orientation",()=>{
   for(const m of p.manifest.markets){
    const pair=p.pairings[m.id];
    expect(new Set(pair).size).toBe(2);
    expect(pair).toContain(p.winners[m.id]);
    m.inputs.forEach((s,i)=>{
     if(s.kind==="entrant")expect(pair[i]).toBe(s.entrantId);
     else if(s.kind==="winner")expect(pair[i]).toBe(p.winners[s.marketId]);
     else if(s.kind==="loser"){
      expect(p.pairings[s.marketId]).toContain(pair[i]);
      expect(pair[i]).not.toBe(p.winners[s.marketId]);
     }
    });
    if(m.legMarketIds){
     const [a,b]=m.legMarketIds;
     expect(p.pairings[a]).toEqual(pair);expect(p.pairings[b]).toEqual([...pair].reverse());
     expect(p.winners[a]).toBe(p.winners[m.id]);expect(p.winners[b]).toBe(p.winners[m.id]);
     expect(p.picks[a]).toBe("home");expect(p.picks[b]).toBe("away");
    }
   }
  });
  it(key+" production graph/scorer accepts the independent hand oracle (not its source)",()=>{
   const target=p.manifest.markets.filter(m=>m.windowId===p.windowId);
   const prior=p.manifest.markets.filter(m=>m.windowId!==p.windowId);
   const baseline=scoreEvent({
    edition:{catalog:p.manifest,graphVersion:1},
    binding:{...p.manifest.lifecycle.binding,markets:p.manifest.lifecycle.binding.markets.map(b=>({...b,
     orientation:target.some(m=>m.id===b.marketId)?null:p.pairings[b.marketId]}))},
    components:[],
    windows:Object.fromEntries(p.manifest.windows.map(w=>[w.id,w.id===p.windowId?"unopened":"locked"])),
    outcomes:Object.fromEntries(prior.map(m=>[m.id,{kind:"winner" as const,entrant:p.winners[m.id]}])),
    participants:[{id:"player",graphVersion:1,picks:Object.fromEntries(prior.map(m=>[m.id,p.picks[m.id]]))}],
   });
   expect(baseline).toMatchObject([{id:"player",earned:key==="ucl-2026-27"?209:61,wrong:1,rank:1}]);
   for(let step=0;step<target.length;step++){
    const board=scoreEvent({
     edition:{catalog:p.manifest,graphVersion:1},
     binding:{...p.manifest.lifecycle.binding,markets:p.manifest.lifecycle.binding.markets.map(b=>({...b,orientation:p.pairings[b.marketId]}))},
     components:[],
     windows:Object.fromEntries(p.manifest.windows.map(w=>[w.id,"locked"])),
     outcomes:Object.fromEntries([...prior,...target.slice(0,step+1)].map(m=>[m.id,{kind:"winner" as const,entrant:p.winners[m.id]}])),
     participants:[{id:"player",graphVersion:1,picks:p.picks}],
    });
    expect(board).toMatchObject([{id:"player",earned:key==="ucl-2026-27"?210:step===0?62:63,wrong:1,rank:1}]);
   }
  });
  it(key+" has complete target membership and prerequisites",()=>{
   const target=p.manifest.markets.filter(m=>m.windowId===p.windowId);
   expect(target.map(m=>m.role)).toEqual(key==="ucl-2026-27"?["champion"]:["champion","bronze"]);
   const final=p.manifest.windows.find(w=>w.id===p.windowId)!;
   expect(final.prerequisiteMarketIds).toHaveLength(2);
   for(const id of final.prerequisiteMarketIds)expect(p.winners[id]).toBeTruthy();
   if(key==="wwc-2027")expect(new Set(target.flatMap(m=>p.pairings[m.id])).size).toBe(4);
  });
 }
 it("WWC reviewed group placements match the synthetic lower-seed-wins group outcomes",()=>{
  const p=laterPlan("wwc-2027","2035-01-01T00:00:00Z");
  for(const m of p.manifest.markets.filter(m=>m.stage==="group")){
   const pair=p.pairings[m.id];
   expect(Number(p.winners[m.id].split(".").at(-1))).toBe(Math.min(...pair.map(e=>Number(e.split(".").at(-1)))));
  }
  for(const m of p.manifest.markets.filter(m=>m.stage==="round-of-16")){
   m.inputs.forEach((s,i)=>{if(s.kind!=="reviewed-placement")throw Error("Expected placement");expect(p.pairings[m.id][i]).toBe("synthetic-wwc-2027:entrant:"+s.placement[0]+"."+s.placement[1]);});
  }
 });
 it("shared correction/release oracle changes winner and has tied losing ranks",()=>{
  const people=["home","away","draw"].map(choice=>({participantId:choice,name:choice,choice}));
  expect(sharedRows(people,"home")).toEqual([
   {id:"home",name:"home",rank:1,earned:1,wrong:0},{id:"away",name:"away",rank:2,earned:0,wrong:1},{id:"draw",name:"draw",rank:2,earned:0,wrong:1}]);
  expect(sharedRows(people,"away")[1]).toMatchObject({rank:1,earned:1,wrong:0});
 });
 it("oracle source never calls the production score or lifecycle evaluator",()=>{
  const source=readFileSync(new URL("../../scripts/browser/fixture-plan.ts",import.meta.url),"utf8");
  expect(source).not.toMatch(/(?:import|from).*scoring-bridge|evaluateLifecycle|scoreEvent\(/);
 });
});
