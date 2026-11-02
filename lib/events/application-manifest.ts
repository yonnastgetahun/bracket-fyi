import { buildSyntheticManifest, type SlotSource, type SyntheticManifest } from "./catalog";
import { scoreEvent, type ReviewedGraphBinding, type TrustedFeasibleComponent } from "./scoring-bridge";
import { buildSyntheticFeasibility } from "./synthetic-feasibility";

export type ApplicationManifest = SyntheticManifest & {
  lifecycle: { binding: ReviewedGraphBinding; components: readonly TrustedFeasibleComponent[] };
  application: { label: "Synthetic local rehearsal — not official fixtures"; timeZone: string };
};
/** Trusted local fixture builder. No browser-supplied graphs, memberships or feasibility attestations. */
export function buildApplicationManifest(key:string, startsAt:string, version:number, timeZone:string, categories?:string[]):ApplicationManifest {
  new Intl.DateTimeFormat("en", { timeZone }).format();
  let base = buildSyntheticManifest(key,{ startsAt, categories });
  // External qualification is a reviewed placement, never a predicted Play-In path.
  // Share canonical synthetic team IDs with the separate Play-In edition.
  if(key==="nba-2027") {
    const playIn=buildSyntheticManifest("nba-play-in-2027",{startsAt});
    base={...base,entrants:[...base.entrants.filter(e=>!e.seed || e.seed<7),...playIn.entrants],
      markets:base.markets.map(m=>({...m,inputs:m.inputs.map(s=>{
        if(s.kind!=="entrant")return s;
        const entrant=base.entrants.find(e=>e.id===s.entrantId)!;
        return entrant.seed && entrant.seed>=7
          ? {kind:"reviewed-placement" as const,placement:entrant.group+":"+entrant.seed,marketIds:[]}
          : s;
      })}))};
  }
  const byId = new Map(base.markets.map(m=>[m.id,m]));
  const memo = new Map<string,string[]>();
  function pool(source:SlotSource):string[] {
    if(source.kind==="entrant") return [source.entrantId];
    if(source.kind==="reviewed-placement") return base.entrants.filter(e=>key!=="nba-2027" || (e.group===source.placement.split(":")[0] && (e.seed??0)>=7)).map(e=>e.id);
    if(source.kind==="reseed") return [...new Set(source.pool.flatMap(pool))];
    return eligible(source.marketId);
  }
  function eligible(id:string):string[] {
    if(memo.has(id)) return memo.get(id)!;
    const m=byId.get(id)!;
    const ids=[...new Set(m.inputs.flatMap(pool))]; memo.set(id,ids); return ids;
  }
  const binding:ReviewedGraphBinding={reviewed:true,graphVersion:version,markets:base.markets.map(m=>({
    marketId:m.id,inputs:m.inputs,eligibleEntrantIds:eligible(m.id),
    orientation:m.inputs.length===2 && m.inputs.every(s=>s.kind==="entrant")
      ? m.inputs.map(s=>(s as {entrantId:string}).entrantId) as [string,string] : null,
  }))};
  // Structural qualifiers never become scored participant predictions. A separate
  // non-picking window keeps complete logical SQL membership without leaking them
  // into scoreEvent's scored-only participant contract.
  const structural=base.markets.filter(m=>!m.scored);
  const structuralId=`synthetic-${key}:window:structure`;
  const windows=structural.length ? [...base.windows,{id:structuralId,label:"Structural qualification (not scored)",opensWhen:"reviewed-membership" as const,prerequisiteMarketIds:[],cutoff:"first-scored-start" as const}] : base.windows;
  // Omit unknown factors: uncovered unresolved markets stay unverified, while
  // fully settled markets retain the scorer's exact earned-score fallback.
  const components=buildSyntheticFeasibility(base,version).filter(c=>c.evidence!==null);
  const manifest:ApplicationManifest={...base,windows,markets:base.markets.map(m=>({
    ...m,windowId:m.scored?m.windowId:structuralId,
    choices:m.outcomeDomain==="regulation-home-draw-away"?["home","draw","away"]:eligible(m.id),
  })),lifecycle:{binding,components},application:{label:"Synthetic local rehearsal — not official fixtures",timeZone}};
  scoreEvent({edition:{catalog:manifest,graphVersion:version},binding,components,outcomes:{},
    windows:Object.fromEntries(windows.map(w=>[w.id,"unopened"])),participants:[]});
  return manifest;
}
export function initiallyOpen(manifest:ApplicationManifest, windowId:string):boolean {
  const window=manifest.windows.find(w=>w.id===windowId)!;
  return window.prerequisiteMarketIds.length===0 && manifest.markets.filter(m=>m.windowId===windowId).every(m=>m.scored && !m.inputs.some(s=>s.kind==="reviewed-placement")) &&
    manifest.markets.filter(m=>m.windowId===windowId && m.outcomeDomain==="regulation-home-draw-away")
      .every(m=>manifest.lifecycle.binding.markets.find(b=>b.marketId===m.id)?.orientation!==null);
}
