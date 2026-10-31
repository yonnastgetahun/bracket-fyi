import { describe,it,expect } from "vitest";
import { applicationChoices } from "../../lib/events/application-picks";
import { buildApplicationManifest } from "../../lib/events/application-manifest";
import { scoreEvent } from "../../lib/events/scoring-bridge";
describe("participant hypothetical routes",()=>{
 it("Play-In decider excludes predicted seventh qualifier and eliminated ninth/tenth seed",()=>{
  const m=buildApplicationManifest("nba-play-in-2027","2030-01-01T00:00:00Z",1,"UTC");
  const markets=m.markets.map(m=>({id:m.id,domain:m.outcomeDomain,choices:m.choices,sources:m.inputs}));
  const [seven,nine,decider]=markets;
  const picks={[seven.id]:seven.choices[0],[nine.id]:nine.choices[0]};
  expect(applicationChoices(decider,markets,picks)).toEqual([seven.choices[1],nine.choices[0]]);
 });
 it("can construct a complete valid whole-bracket submission for every whole-bracket template",()=>{
  for(const key of ["nba-play-in-2027","nba-2027","mlb-2027","cfp-2026-27","nfl-2026-postseason","ncaa-men-2027"]){
   const m=buildApplicationManifest(key,"2030-01-01T00:00:00Z",1,"UTC");
   const markets=m.markets.map(m=>({id:m.id,domain:m.outcomeDomain,choices:m.choices,sources:m.inputs}));
   const picks:Record<string,string>={};
   for(const market of m.markets.filter(m=>m.scored))picks[market.id]=applicationChoices(markets.find(m=>m.id===market.id)!,markets,picks)[0];
   expect(()=>scoreEvent({edition:{catalog:m,graphVersion:1},binding:m.lifecycle.binding,components:[],outcomes:{},
    windows:Object.fromEntries(m.windows.map(w=>[w.id,"open"])),participants:[{id:"p",graphVersion:1,picks}]}),key).not.toThrow();
  }
 });
});
