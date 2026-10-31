import { buildApplicationManifest, type ApplicationManifest } from "../../lib/events/application-manifest";
import { buildSyntheticManifest, type SlotSource, type SyntheticManifest } from "../../lib/events/catalog";
import { buildSyntheticFeasibility } from "../../lib/events/synthetic-feasibility";
import type { EventScoreInput } from "../../lib/events/scoring-bridge";
import type { Outcome } from "../../lib/events/outcomes";

export type OracleRow = readonly [name:string,earned:number,maximum:number|null,wrong:number,rank:number];
export interface NumericPhase {
 name:string; outcomes:Record<string,Outcome>; picks:Record<string,Record<string,string>>;
 windows:Record<string,"locked"|"unopened">; expected:readonly OracleRow[];
 state:"locked"|"complete"; pending?:number[];
}
export interface NumericFixture { name:string; manifest:ApplicationManifest; phases:NumericPhase[] }
const startsAt="2099-01-01T00:00:00Z";
const locked=(m:SyntheticManifest)=>Object.fromEntries(m.windows.map(w=>[w.id,"locked" as const]));
const win=(entrant:string):Outcome=>({kind:"winner",entrant});

// Compact original synthetic identities bound the full 65,536-world WWC JSON.
// This changes labels/IDs only, never graph topology or expected numbers.
function compact(base:SyntheticManifest):SyntheticManifest {
 const ids=new Map([...base.markets.map((m,i)=>[m.id,"m"+i]),...base.entrants.map((e,i)=>[e.id,"e"+i]),...base.windows.map((w,i)=>[w.id,"w"+i])] as [string,string][]);
 function visit(v:unknown):unknown {
  if(typeof v==="string")return ids.get(v)??v;
  if(Array.isArray(v))return v.map(visit);
  if(v&&typeof v==="object")return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,visit(x)]));
  return v;
 }
 return visit(base) as SyntheticManifest;
}
function trusted(base:SyntheticManifest,limit=4096):ApplicationManifest {
 const byId=new Map(base.markets.map(m=>[m.id,m]));
 function pool(s:SlotSource):string[] {
  if(s.kind==="entrant")return [s.entrantId];
  if(s.kind==="reviewed-placement")return base.entrants.map(e=>e.id);
  if(s.kind==="reseed")return s.pool.flatMap(pool);
  return byId.get(s.marketId)!.inputs.flatMap(pool);
 }
 const binding={reviewed:true as const,graphVersion:1,markets:base.markets.map(m=>{
  const eligibleEntrantIds=[...new Set(m.inputs.flatMap(pool))];
  return {marketId:m.id,inputs:m.inputs,eligibleEntrantIds,orientation:m.inputs.every(s=>s.kind==="entrant")&&eligibleEntrantIds.length===2?eligibleEntrantIds as [string,string]:null};
 })};
 return {...base,markets:base.markets.map(m=>({...m,choices:m.outcomeDomain==="regulation-home-draw-away"?["home","draw","away"]:binding.markets.find(b=>b.marketId===m.id)!.eligibleEntrantIds})),
  lifecycle:{binding,components:buildSyntheticFeasibility(base,1,limit).filter(c=>c.evidence!==null)},
  application:{label:"Synthetic local rehearsal — not official fixtures",timeZone:"UTC"}};
}
export function playInFixture():NumericFixture {
 const manifest=buildApplicationManifest("nba-play-in-2027",startsAt,1,"UTC");
 const [s,n,t,ws,wn,wt]=manifest.markets.map(m=>m.id);
 const [a,b,c,,wa,wb,wc]=manifest.entrants.map(e=>e.id);
 const west={[ws]:wa,[wn]:wc,[wt]:wb};
 const picks={P:{[s]:a,[n]:c,[t]:b,...west},Q:{[s]:b,[n]:c,[t]:c,...west}};
 const first={[s]:win(a),[n]:win(c)};
 const settledWest=Object.fromEntries(Object.entries(west).map(([id,e])=>[id,win(e)]));
 const windows=locked(manifest);
 return {name:"play-in",manifest,phases:[
  {name:"before",outcomes:{},picks,windows,expected:[["P",0,6,0,1],["Q",0,6,0,1]],state:"locked"},
  {name:"first",outcomes:first,picks,windows,expected:[["P",2,6,0,1],["Q",1,5,1,2]],state:"locked"},
  {name:"complete",outcomes:{...first,...settledWest,[t]:win(b)},picks,windows,expected:[["P",6,6,0,1],["Q",4,4,2,2]],state:"complete"},
  {name:"corrected",outcomes:{...first,...settledWest,[t]:win(c)},picks,windows,expected:[["P",5,5,1,1],["Q",5,5,1,1]],state:"complete"},
  {name:"invalidated",outcomes:{...first,...settledWest,[t]:{kind:"unresolved"}},picks,windows,expected:[["P",5,6,0,1],["Q",4,5,1,2]],state:"locked"},
  {name:"recomplete",outcomes:{...first,...settledWest,[t]:win(b)},picks,windows,expected:[["P",6,6,0,1],["Q",4,4,2,2]],state:"complete"},
 ]};
}
export function eliminatedFixture():NumericFixture {
 const f=playInFixture(),[s,n]=f.manifest.markets.map(m=>m.id),[a,,,d]=f.manifest.entrants.map(e=>e.id);
 return {...f,name:"eliminated-forfeited",phases:[{...f.phases[0],name:"eliminated-forfeited",
  // C loses the 9–10 game to D: Q's saved C decider pick is eliminated.
  outcomes:{[s]:win(a),[n]:win(d)},picks:{...f.phases[0].picks,F:{}},
  expected:[["P",1,5,1,1],["Q",0,3,2,2],["F",0,0,6,3]]}]};
}
export function uclFixture(unknown=false):NumericFixture {
 const base=compact(buildSyntheticManifest("ucl-2026-27",{startsAt})),[a,b]=base.entrants.map(e=>e.id);
 const tie=base.markets.find(m=>m.tieId)!.tieId;
 const markets=base.markets.filter(m=>m.tieId===tie).map(m=>({...m,inputs:(m.leg===2?[b,a]:[a,b]).map(entrantId=>({kind:"entrant" as const,entrantId}))}));
 const ids=new Set(markets.map(m=>m.id));
 const manifest=trusted({...base,markets,windows:base.windows.filter(w=>markets.some(m=>m.windowId===w.id)),edges:base.edges.filter(e=>ids.has(e.from)&&ids.has(e.to)),championMarketId:null});
 if(unknown)manifest.lifecycle.components=[];
 const [l1,l2,q]=markets.map(m=>m.id);
 return {name:unknown?"ucl-unknown":"ucl-coupled",manifest,phases:[{name:"leg-one",outcomes:{[l1]:win(a)},windows:locked(manifest),state:"locked",
  picks:{P:{[l1]:"away",[l2]:"draw",[q]:b},Q:{[l1]:"home",[l2]:"draw",[q]:a}},
  expected:unknown?[["Q",1,null,0,1],["P",0,null,1,2]]:[["Q",1,3,0,1],["P",0,1,1,2]]}]};
}
export function wwcFixture(unknown=false):NumericFixture {
 let base=compact(buildSyntheticManifest("wwc-2027",{startsAt}));
 if(!unknown){
  const markets=base.markets.map(m=>({...m,inputs:m.inputs.map(s=>{
   if(s.kind!=="reviewed-placement")return s;
   return {kind:"entrant" as const,entrantId:base.entrants.find(e=>e.group===s.placement[0]&&e.seed===Number(s.placement[1]))!.id};
  })}));
  base={...base,markets,edges:base.edges.filter(e=>e.relation!=="reviewed-placement")};
 }
 const manifest=trusted(base,65536),groups=manifest.markets.filter(m=>m.stage==="group");
 const groupOutcomes=Object.fromEntries(groups.map(m=>[m.id,{kind:"draw" as const}]));
 const groupPicks=Object.fromEntries(groups.map(m=>[m.id,"draw"]));
 const future:NumericPhase={name:"48-of-64",outcomes:groupOutcomes,picks:{P:groupPicks,Q:{...groupPicks,[groups[0].id]:"home"}},
  windows:Object.fromEntries(manifest.windows.map(w=>[w.id,groups.some(m=>m.windowId===w.id)?"locked":"unopened"])),
  expected:unknown?[["P",48,null,0,1],["Q",47,null,1,2]]:[["P",48,64,0,1],["Q",47,63,1,2]],state:"locked",pending:[16,16]};
 if(unknown)return {name:"wwc-unknown-placement",manifest,phases:[future]};
 const winners:Record<string,string>={},pairings:Record<string,[string,string]>={},picks={...groupPicks},outcomes={...groupOutcomes} as Record<string,Outcome>;
 function actual(s:SlotSource):string {
  if(s.kind==="entrant")return s.entrantId;
  if(s.kind==="winner")return winners[s.marketId];
  if(s.kind==="loser")return pairings[s.marketId].find(e=>e!==winners[s.marketId])!;
  throw Error("Unsupported fixture source");
 }
 for(const m of manifest.markets){
  pairings[m.id]=m.inputs.map(actual) as [string,string];
  if(m.stage!=="group"){winners[m.id]=pairings[m.id][m.role==="bronze"?1:0];picks[m.id]=winners[m.id];outcomes[m.id]=win(winners[m.id]);}
 }
 // Round-window submissions require reviewed actual orientations. These are
 // explicit original test placements, not qualification from group pick outcomes.
 manifest.lifecycle.binding={...manifest.lifecycle.binding,markets:manifest.lifecycle.binding.markets.map(m=>({...m,orientation:pairings[m.marketId]}))};
 return {name:"wwc-trusted",manifest,phases:[future,{name:"64-of-64",outcomes,picks:{P:picks,Q:{...picks}},windows:locked(manifest),
  expected:[["P",64,64,0,1],["Q",64,64,0,1]],state:"complete",pending:[0,0]}]};
}
export function scoreInput(f:NumericFixture,p:NumericPhase):EventScoreInput {
 return {edition:{catalog:f.manifest,graphVersion:1},...f.manifest.lifecycle,outcomes:p.outcomes,windows:p.windows,
  participants:Object.entries(p.picks).map(([id,picks])=>({id,picks,graphVersion:1}))};
}
