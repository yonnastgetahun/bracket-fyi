import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "../supabase/admin";
import { getEventDefinition, type SlotSource } from "./catalog";
function publicSource(s:SlotSource):SlotSource {
 if(s.kind==="entrant")return {kind:s.kind,entrantId:s.entrantId};
 if(s.kind==="reviewed-placement")return {kind:s.kind,placement:s.placement,marketIds:[...s.marketIds]};
 if(s.kind==="reseed")return {kind:s.kind,rank:s.rank,order:s.order,pool:s.pool.map(publicSource)};
 return {kind:s.kind,marketId:s.marketId};
}
import { seedEventTemplates } from "./template-seeder";
import { SupabaseTemplateSeedRepository, type TemplateSeedSupabaseClient } from "./template-seed-repository";
import { buildApplicationManifest, initiallyOpen, type ApplicationManifest } from "./application-manifest";
import { provisionApplicationAwards } from "./application-awards";
import { createApplicationInput } from "./application-contract";
import { createEventRepository, EventCommandError } from "./repository";
import { createLifecycleRepository, type LifecycleCommand } from "./lifecycle-repository";
import { reconcileEventLifecycle, lifecycleViewSchema } from "./lifecycle";
import { scoreEvent } from "./scoring-bridge";
import type { WindowSubmission } from "./windows";

export function localEventApplicationEnabled():boolean {
 try {return process.env.BRACKET_LOCAL_EVENT_PREVIEW==="1" && ["localhost","127.0.0.1"].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL??"").hostname);} catch{return false;}
}
export function applicationClient() {
 if(!localEventApplicationEnabled()) throw new EventCommandError("unavailable");
 return getAdminClient();
}
function checked<T>(result:{data:T;error:unknown}):T {
 if(result.error) throw new EventCommandError("unavailable");
 return result.data;
}
export async function rpc(db:SupabaseClient,name:string,args:Record<string,unknown>) {
 const {data,error}=await db.rpc(name,args);
 if(error) throw new EventCommandError(error.code==="42501"?"unauthorized":(error.code==="PT409" || error.code==="40001")?"conflict":["23514","22023"].includes(error.code)?"invalid":"unavailable");
 return data;
}
/** Predicate authenticates exactly this league before any private selection. */
export async function verifyApplicationCredential(db:SupabaseClient,id:string,role:"organizer"|"participant",token:string|undefined) {
 if(!token || !/^[0-9a-f-]{36}$/i.test(token)) throw new EventCommandError("unauthorized");
 const table=role==="organizer"?"leagues":"participants";
 const query=db.from(table).select("id").eq(role==="organizer"?"id":"league_id",id).eq(role==="organizer"?"organizer_token":"magic_token",token);
 const {data,error}=await query.maybeSingle();
 if(error||!data) throw new EventCommandError("unauthorized");
 return {id:data.id as string,credential:token};
}
export async function configuration(db:SupabaseClient,id:string) {
 const league=checked(await db.from("leagues").select("id,name,template_id").eq("id",id).single());
 const evaluation=checked(await db.from("event_league_evaluations").select("configuration_version,frozen").eq("league_id",id).single());
 if(!league||!evaluation) throw new EventCommandError("unavailable");
 const config=checked(await db.from("event_template_configs").select("manifest").eq("template_id",league.template_id).eq("version",evaluation.configuration_version).eq("sealed",true).single());
 const manifest=config?.manifest as ApplicationManifest;
 if(manifest?.application?.label!=="Synthetic local rehearsal — not official fixtures" || !manifest.lifecycle) throw new EventCommandError("unavailable");
 return {league,evaluation,manifest};
}
async function windows(db:SupabaseClient,id:string) {
 return checked(await db.from("event_league_windows").select("window_key,version,state,cutoff,pairings_reviewed,market_ids").eq("league_id",id).order("window_key"))??[];
}
export async function createApplicationLeague(db:SupabaseClient,input:unknown) {
 const data=createApplicationInput.parse(input),definition=getEventDefinition(data.templateKey);
 if(!definition || Date.parse(data.startsAt)<=Date.now()) throw new EventCommandError("invalid");
 // Stable catalog rows stay draft. A private rehearsal receives its own
 // immutable template/config; concurrent creates cannot reinterpret other leagues.
 const seed=new SupabaseTemplateSeedRepository(db as unknown as TemplateSeedSupabaseClient);
 await seedEventTemplates(seed);
 const templateId=randomUUID(),version=1;
 let manifest=buildApplicationManifest(definition.key,data.startsAt,version,data.timeZone,data.categories);
 let editionId:string|null=null;
 if(definition.key==="oscars-2027"){const award=await provisionApplicationAwards(db,manifest);manifest=award.manifest;editionId=award.editionId;}
 checked(await db.from("templates").insert({id:templateId,name:"Synthetic rehearsal — "+definition.label,type:definition.key==="oscars-2027"?"pickem":"bracket",topology:null,team_registry:[],schedule:null,scoring_defaults:{},results_provider:null,event_edition_id:editionId}));
 checked(await db.from("event_template_configs").insert({template_id:templateId,version,sealed:true,manifest}));
 const id=randomUUID(),organizerCredential=randomUUID(),invitation=randomUUID();
 checked(await db.from("leagues").insert({id,name:data.name,template_id:templateId,organizer_token:organizerCredential,join_token:invitation,status:"active",scoring_config:{type:"pickem",points_per_correct:1}}));
 checked(await db.from("event_league_evaluations").insert({league_id:id,configuration_version:version}));
 for(const w of manifest.windows) {
  await rpc(db,"configure_event_window",{p_league_id:id,p_window_key:w.id,p_expected_version:0,
   p_state:initiallyOpen(manifest,w.id)?"open":"unopened",p_cutoff:manifest.lockMode==="per-window"&&!initiallyOpen(manifest,w.id)?null:data.startsAt,p_pairings_reviewed:initiallyOpen(manifest,w.id),
   p_market_ids:manifest.markets.filter(m=>m.windowId===w.id).map(m=>m.id)});
 }
 await reconcileEventLifecycle(createLifecycleRepository(db),id);
 return {id,organizerCredential};
}
export async function readApplication(db:SupabaseClient,id:string,credentials:{organizer?:string;participant?:string}={}) {
 let organizer=false,participantId:string|null=null;
 // A supplied invalid cookie is not silently promoted into a privileged read.
 if(credentials.organizer){await verifyApplicationCredential(db,id,"organizer",credentials.organizer);organizer=true;}
 if(credentials.participant) participantId=(await verifyApplicationCredential(db,id,"participant",credentials.participant)).id;
 const {league,evaluation,manifest}=await configuration(db,id);
 const repo=createEventRepository(db),lifecycle=createLifecycleRepository(db);
 await repo.advanceWindows(id);
 // Server-only reconciliation; no capture/commit/scan endpoint or browser DTO.
 try {await reconcileEventLifecycle(lifecycle,id);} catch { /* safe reader reports pending; never stale scores */ }
 const view=await lifecycle.read(id);
 const ws=await windows(db,id);
 const picks=await repo.readPicks(id,credentials.participant??null);
 const people=checked(await db.from("participants").select("id,display_name").eq("league_id",id))??[];
 let invitation:string|null=null;
 let effective=view.effective;
 if(organizer) {
  // Exact organizer predicate above precedes selecting the invitation or capture.
  const privateLeague=checked(await db.from("leagues").select("join_token").eq("id",id).eq("organizer_token",credentials.organizer!).single());
  if(!privateLeague) throw new EventCommandError("unauthorized");
  invitation=privateLeague.join_token;
  const capture=await lifecycle.capture(id);
  effective=lifecycleViewSchema.shape.effective.parse(Object.fromEntries(Object.entries(capture.basis.effective).map(([key,r])=>[key,{
   outcome:r.outcome,source:r.source,canonicalResultId:r.canonicalResultId,canonicalVersion:r.canonicalVersion,canonicalToken:r.canonicalToken,
   overrideId:r.overrideId,overrideRevision:r.overrideRevision,expiresAt:r.expiresAt,
   configurationVersion:capture.basis.configurationVersion,requiredSetRevision:r.overrideRevision,derivedProvenance:r.derivedProvenance,
   held:r.held,excluded:r.excluded,effectiveToken:r.effectiveToken,provenanceToken:r.provenanceToken,
  }])));
 }
 return {id:league.id as string,name:league.name as string,label:manifest.application.label,timeZone:manifest.application.timeZone,
  organizer,participantId,invitation,pairingReviewSupported:["ucl-2026-27","wwc-2027"].includes(manifest.editionKey),structuralQualifierReviewSupported:["ncaa-men-2027","nba-2027"].includes(manifest.editionKey),configurationVersion:evaluation.configuration_version as number,basisToken:organizer?(await lifecycle.capture(id)).basisToken:null,frozen:evaluation.frozen as boolean,view:{...view,effective},
  entrants:manifest.entrants.map(e=>({id:e.id,name:e.name})),
  participants:people.map(p=>({id:p.id as string,name:p.display_name as string})),picks,
  windows:manifest.windows.map(w=>{const row=ws.find(r=>r.window_key===w.id);if(!row) throw new EventCommandError("unavailable");return {id:w.id,label:w.label,pairingsReviewed:row.pairings_reviewed as boolean,version:row.version as number,state:row.state as "open"|"unopened"|"locked",cutoff:row.cutoff as string|null,
   markets:manifest.markets.filter(m=>m.windowId===w.id).map(m=>({id:m.id,stage:m.stage,scored:m.scored,domain:m.outcomeDomain,actualPairing:manifest.lockMode==="per-window" || ["ncaa-men-2027","nba-2027"].includes(manifest.editionKey)?manifest.lifecycle.binding.markets.find(b=>b.marketId===m.id)!.orientation:null,sources:m.inputs.map(publicSource),choices:[...m.choices],eligible:[...manifest.lifecycle.binding.markets.find(b=>b.marketId===m.id)!.eligibleEntrantIds]}))};})};
}
export type ApplicationView=Awaited<ReturnType<typeof readApplication>>;
export async function submitApplicationPicks(db:SupabaseClient,id:string,token:string,submission:WindowSubmission) {
 const person=await verifyApplicationCredential(db,id,"participant",token);
 const {manifest,evaluation}=await configuration(db,id),ws=await windows(db,id);
 if(manifest.markets.some(m=>!m.scored && Object.hasOwn(submission.picks,m.id))) throw new EventCommandError("invalid");
 const own=await createEventRepository(db).readPicks(id,token);
 const picks=Object.fromEntries(own.filter(p=>p.participantId===person.id).map(p=>[p.marketId,p.choice]));
 // Validate hypothetical advancement using saved picks, not actual winners.
 try {scoreEvent({edition:{catalog:manifest,graphVersion:evaluation.configuration_version},binding:manifest.lifecycle.binding,components:[],outcomes:{},
  windows:Object.fromEntries(ws.map(w=>[w.window_key,w.state])),participants:[{id:person.id,graphVersion:evaluation.configuration_version,picks:{...picks,...submission.picks}}]});}
 catch {throw new EventCommandError("invalid");}
 await createEventRepository(db).submit(id,token,submission);
}
export async function changeApplicationWindow(db:SupabaseClient,id:string,token:string,input:{windowId:string;version:number;operation:"open"|"lock";cutoff?:string}) {
 await verifyApplicationCredential(db,id,"organizer",token);
 const {manifest}=await configuration(db,id),ws=await windows(db,id),w=ws.find(r=>r.window_key===input.windowId),definition=manifest.windows.find(r=>r.id===input.windowId);
 if(!w||!definition) throw new EventCommandError("invalid");
 if(input.operation==="open") {
  const capture=await createLifecycleRepository(db).capture(id);
  if(manifest.markets.filter(m=>m.windowId===w.window_key).some(m=>m.inputs.some(s=>s.kind==="reviewed-placement")&&!w.pairings_reviewed) ||
   definition.prerequisiteMarketIds.some(mid=>!["winner","winner-set","draw"].includes(capture.basis.effective[mid]?.outcome.kind)||capture.basis.effective[mid]?.held||capture.basis.effective[mid]?.excluded) ||
   manifest.markets.filter(m=>m.windowId===w.window_key&&manifest.lockMode==="per-window").some(m=>!manifest.lifecycle.binding.markets.find(b=>b.marketId===m.id)?.orientation))
    throw new EventCommandError("conflict");
  try {scoreEvent({edition:{catalog:manifest,graphVersion:capture.basis.configurationVersion},binding:manifest.lifecycle.binding,components:[],
   windows:Object.fromEntries(ws.map(row=>[row.window_key,row.state])),participants:[],
   outcomes:Object.fromEntries(Object.entries(capture.basis.effective).map(([mid,r])=>[mid,r.outcome]))});}
  catch {throw new EventCommandError("conflict");}
 }
 const cutoff=input.operation==="lock"?new Date(w.cutoff?Math.min(Date.now(),Date.parse(w.cutoff)):Date.now()).toISOString():(input.cutoff??w.cutoff);
 if(input.operation==="open"&&(!cutoff||!Number.isFinite(Date.parse(cutoff))||Date.parse(cutoff)<=Date.now()))throw new EventCommandError("invalid");
 await rpc(db,"configure_event_window",{p_league_id:id,p_window_key:w.window_key,p_expected_version:input.version,p_state:input.operation==="open"?"open":w.state,
  p_cutoff:cutoff,p_pairings_reviewed:input.operation==="open"?true:w.pairings_reviewed,p_market_ids:w.market_ids});
 await createEventRepository(db).advanceWindows(id);
}
export async function mutateApplicationResult(db:SupabaseClient,id:string,token:string,command:LifecycleCommand) {
 await verifyApplicationCredential(db,id,"organizer",token);
 await createLifecycleRepository(db).mutate(id,token,command);
 // The mutation is already durable. A failed scorer must not imply rollback;
 // the safe reader exposes reconciliation-pending and the worker can retry.
 try {await reconcileEventLifecycle(createLifecycleRepository(db),id);} catch { /* durable dirty generation retained */ }
}
