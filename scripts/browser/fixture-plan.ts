/** Original, deterministic synthetic outcomes. No scorer is imported here. */
import { buildApplicationManifest } from "../../lib/events/application-manifest";
import type { SlotSource } from "../../lib/events/catalog";

export const fixtureOrigin = "http://127.0.0.1:3137";
export function validateTarget(env: Record<string,string|undefined>) {
 const database=env.BRACKET_FIXTURE_DATABASE;
 if(!database || !/^bracket_[a-z0-9_]{6,50}$/.test(database) || env.BRACKET_FIXTURE_DISPOSABLE!==database)
  throw new Error("Explicit disposable database acknowledgment required");
 if(env.BRACKET_FIXTURE_ORIGIN!==fixtureOrigin) throw new Error("Fixed local application origin required");
 return {database,origin:fixtureOrigin};
}
export function laterPlan(key:"ucl-2026-27"|"wwc-2027",startsAt:string) {
 const manifest=buildApplicationManifest(key,startsAt,1,"UTC");
 const pairings:Record<string,[string,string]>={},winners:Record<string,string>={},picks:Record<string,string>={};
 const placements=new Map<string,string>();
 const finalWindow=manifest.windows.at(-1)!;
 function source(s:SlotSource):string {
  if(s.kind==="entrant") return s.entrantId;
  if(s.kind==="winner") {if(!winners[s.marketId])throw new Error("Unordered winner");return winners[s.marketId];}
  if(s.kind==="loser") {const loser=pairings[s.marketId]?.find(e=>e!==winners[s.marketId]);if(!loser)throw new Error("Missing loser");return loser;}
  if(s.kind!=="reviewed-placement")throw new Error("Unexpected reseed");
  if(placements.has(s.placement))return placements.get(s.placement)!;
  let entrant:string;
  if(key==="wwc-2027") entrant=manifest.entrants.find(e=>e.id.endsWith(":entrant:"+s.placement[0]+"."+s.placement[1]))!.id;
  else {
   const match=/^(play-off|round-of-16)\.tie-(\d+)\.(home|away)$/.exec(s.placement);
   if(!match)throw new Error("Unknown UCL placement");
   const index=Number(match[2])-1;
   if(match[1]==="play-off") entrant=manifest.entrants[8+index*2+(match[3]==="away"?1:0)].id;
   else entrant=match[3]==="home"?manifest.entrants[index].id:winners[manifest.markets.find(m=>m.stage==="play-off"&&m.role==="qualifier"&&m.id.includes(".tie-"+(index+1)+"."))!.id];
  }
  placements.set(s.placement,entrant);return entrant;
 }
 for(const m of manifest.markets){
  const pair=m.inputs.map(source);
  if(pair.length!==2 || pair[0]===pair[1])throw new Error("Invalid synthetic pairing");
  pairings[m.id]=pair as [string,string];
  // Both legs favor the same team: leg 1 home / leg 2 away; qualifier agrees.
  // WWC group lower seed wins all its games: seed 1 and seed 2 advance.
  const winner=m.leg===2?pair[1]:pair[0];
  winners[m.id]=winner;
  picks[m.id]=m.outcomeDomain==="regulation-home-draw-away"?(winner===pair[0]?"home":"away"):winner;
 }
 // Deliberately one wrong first-round prediction. Everything else is correct.
 picks[manifest.markets[0].id]="draw";
 const target=manifest.markets.filter(m=>m.windowId===finalWindow.id);
 const priorCount=key==="ucl-2026-27"?210:62;
 if(manifest.markets.length!==priorCount+target.length || target.length!==(key==="ucl-2026-27"?1:2))
  throw new Error("Catalog changed: re-review hand oracle");
 return {manifest,pairings,winners,picks,windowId:finalWindow.id,priorCount,
  // Literal hand oracle: 210 older UCL units - 1 miss; 62 older WWC units - 1 miss.
  baselineEarned:key==="ucl-2026-27"?209:61,
  resultEarned:key==="ucl-2026-27"?[210]:[62,63]};
}
export function scoreRow(id:string,name:string,earned:number,wrong:number,rank=1){return {id,name,rank,earned,wrong};}
export function sharedRows(people:{participantId:string;name:string;choice:string}[],winner:"home"|"away"){
 return people.map(p=>scoreRow(p.participantId,p.name,p.choice===winner?1:0,p.choice===winner?0:1,p.choice===winner?1:2));
}
