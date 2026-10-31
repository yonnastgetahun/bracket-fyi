import type { SlotSource } from "./catalog";
export type PickMarket={id:string;domain:string;choices:readonly string[];sources:readonly SlotSource[];actualPairing?:readonly string[]|null};
/** Predicted paths are computed from this participant's draft, never actual winners. */
export function applicationChoices(market:PickMarket,markets:readonly PickMarket[],picks:Readonly<Record<string,string>>):string[] {
 if(market.domain==="regulation-home-draw-away")return [...market.choices];
 if(market.actualPairing)return market.choices.filter(id=>market.actualPairing!.includes(id));
 const visited=new Set<string>();
 function source(s:SlotSource):string[] {
  if(s.kind==="entrant")return [s.entrantId];
  if(s.kind==="reviewed-placement")return [...market.choices];
  if(s.kind==="reseed")return [...new Set(s.pool.flatMap(source))];
  const upstream=markets.find(m=>m.id===s.marketId);
  if(!upstream||visited.has(s.marketId))return [];
  visited.add(s.marketId);const members=upstream.sources.flatMap(source);visited.delete(s.marketId);
  if(s.kind==="winner")return picks[s.marketId]?[picks[s.marketId]]:members;
  return members.filter(id=>id!==picks[s.marketId]);
 }
 const eligible=new Set(market.sources.flatMap(source));
 return market.choices.filter(id=>eligible.has(id));
}
