import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApplicationManifest } from "./application-manifest";
import { EventCommandError } from "./repository";
/** Independent synthetic ceremony; immutable nomination UUIDs, never real-event mapping. */
export async function provisionApplicationAwards(db:SupabaseClient,base:ApplicationManifest) {
 const competitionId=randomUUID(),editionId=randomUUID(),stageId=randomUUID();
 async function insert(table:string,values:Record<string,unknown>|Record<string,unknown>[]) {
  const {error}=await db.from(table).insert(values);if(error)throw new EventCommandError("unavailable");
 }
 await insert("competitions",{id:competitionId,competition_key:"synthetic-"+competitionId,name:"Synthetic local awards rehearsal",domain:"awards"});
 await insert("event_editions",{id:editionId,competition_id:competitionId,edition_key:"synthetic-"+editionId,name:"Synthetic local ceremony — not official",season_label:"Synthetic 2027",timezone:base.application.timeZone,metadata:{synthetic:true}});
 await insert("stages",{id:stageId,event_edition_id:editionId,stage_key:"ceremony",name:"Synthetic ceremony",kind:"ceremony",ordinal:1});
 const entrants=new Map(base.entrants.map(e=>[e.id,randomUUID()]));
 const categories=new Map(base.markets.map(m=>[m.categoryId!,randomUUID()]));
 for(const [index,m] of base.markets.entries()){
  const contestId=categories.get(m.categoryId!)!;
  await insert("contests",{id:contestId,event_edition_id:editionId,stage_id:stageId,contest_key:"synthetic-category-"+(index+1),name:"Synthetic category "+(index+1),kind:"category",metadata:{synthetic:true}});
  await insert("award_nominations",base.entrants.filter(e=>e.categoryId===m.categoryId).map((e,index)=>({
   id:entrants.get(e.id),event_edition_id:editionId,contest_id:contestId,nomination_key:"synthetic-nomination-"+(index+1),name:e.name,
  })));
 }
 const markets=base.markets.map(m=>({...m,contestId:categories.get(m.categoryId!)!,categoryId:categories.get(m.categoryId!)!,
  inputs:m.inputs.map(s=>s.kind==="entrant"?{kind:"entrant" as const,entrantId:entrants.get(s.entrantId)!}:s),
  entrants:m.entrants.map(e=>({...e,id:entrants.get(e.id)!,categoryId:categories.get(e.categoryId!)!})),
  choices:m.choices.map(id=>entrants.get(id)!)}));
 // Rename identities in existing exhaustive worlds without creating or upgrading evidence.
 const components=base.lifecycle.components.map(component=>({...component,
  worlds:component.worlds?.map(world=>Object.fromEntries(Object.entries(world).map(([marketId,winners])=>
   [marketId,winners.map(id=>entrants.get(id)??id)])))??null}));
 const manifest:ApplicationManifest={...base,entrants:base.entrants.map(e=>({...e,id:entrants.get(e.id)!,categoryId:categories.get(e.categoryId!)!})),markets,
  lifecycle:{binding:{...base.lifecycle.binding,markets:markets.map(m=>({marketId:m.id,inputs:m.inputs,eligibleEntrantIds:m.choices,orientation:null}))},components}};
 return {editionId,manifest};
}
