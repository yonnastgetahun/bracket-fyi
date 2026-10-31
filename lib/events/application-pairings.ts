import type { SupabaseClient } from "@supabase/supabase-js";
import { configuration, rpc, verifyApplicationCredential } from "./application";
import { createLifecycleRepository } from "./lifecycle-repository";
import { createNotificationRepository } from "./notifications-repository";
import type { NotificationKind } from "./notifications";
import { EventCommandError } from "./repository";
export async function reviewApplicationPairings(db:SupabaseClient,id:string,token:string,input:{
 windowId:string;version:number;configurationVersion:number;basisToken:string;pairings:Record<string,[string,string]>;reason:string;
}) {
 await verifyApplicationCredential(db,id,"organizer",token);
 await configuration(db,id);
 return rpc(db,"review_event_pairings",{p_league:id,p_organizer:token,p_window:input.windowId,p_window_version:input.version,
 p_configuration_version:input.configurationVersion,p_basis:input.basisToken,p_pairings:input.pairings,p_reason:input.reason});
}
/** SQL derives qualifiers from effective actual results; callers cannot submit a manifest or winners. */
export async function reviewApplicationQualifiers(db:SupabaseClient,id:string,token:string,input:{
 configurationVersion:number;basisToken:string;idempotencyKey:string;reason:string;
 sourceLeagueId?:string;sourceOrganizerToken?:string;sourceBasisToken?:string;
}) {
 await verifyApplicationCredential(db,id,"organizer",token);
 const {manifest}=await configuration(db,id);
 if(!["ncaa-men-2027","nba-2027"].includes(manifest.editionKey))throw new EventCommandError("invalid");
 if(manifest.editionKey==="nba-2027") {
  if(!input.sourceLeagueId || !input.sourceOrganizerToken)throw new EventCommandError("invalid");
  await verifyApplicationCredential(db,input.sourceLeagueId,"organizer",input.sourceOrganizerToken);
 } else if(input.sourceLeagueId || input.sourceOrganizerToken || input.sourceBasisToken)throw new EventCommandError("invalid");
 return rpc(db,"review_event_structural_qualifiers",{
  p_league:id,p_organizer:token,p_configuration_version:input.configurationVersion,p_basis:input.basisToken,
  p_idempotency_key:input.idempotencyKey,p_reason:input.reason,
  p_source_league:input.sourceLeagueId??null,p_source_organizer:input.sourceOrganizerToken??null,p_source_basis:input.sourceBasisToken??null,
 });
}
export async function applicationConsent(db:SupabaseClient,id:string,token:string,input:{role:"organizer"|"participant";kinds:NotificationKind[];enabled:boolean}) {
 const actor=await verifyApplicationCredential(db,id,input.role,token);
 await configuration(db,id);
 if(input.kinds.some(k=>input.role==="organizer"?k!=="provider_stale":k==="provider_stale"))throw new EventCommandError("invalid");
 // Stable non-secret fake identity; browser cannot supply an endpoint or transport.
 return createNotificationRepository(db).consent(id,token,input.role==="participant"?actor.id:null,
  "fake://events/"+id+"/"+input.role+"/"+actor.id,input.kinds,input.enabled);
}
export async function applicationBroadcast(db:SupabaseClient,id:string,token:string,input:{message:string;idempotencyKey:string}) {
 await verifyApplicationCredential(db,id,"organizer",token);
 await configuration(db,id);
 const capture=await createLifecycleRepository(db).capture(id);
 return createNotificationRepository(db).emit(id,"broadcast",input.idempotencyKey,capture.basisToken,null,token,input.message);
}
