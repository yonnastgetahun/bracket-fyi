import { reviewApplicationPairings, reviewApplicationQualifiers, applicationConsent, applicationBroadcast } from "@/lib/events/application-pairings";
import { NextRequest, NextResponse } from "next/server";
import { applicationClient,readApplication,verifyApplicationCredential,submitApplicationPicks,changeApplicationWindow,mutateApplicationResult } from "@/lib/events/application";
import { applicationCommand,credentialCookie,credentialOptions,eventId } from "@/lib/events/application-contract";
import { applicationBody,applicationError,privateHeaders } from "@/lib/events/application-http";
import { createEventRepository,EventCommandError } from "@/lib/events/repository";
type Context={params:Promise<{id:string}>};
export async function GET(request:NextRequest,context:Context) {
 try {const id=eventId.parse((await context.params).id);
  return NextResponse.json(await readApplication(applicationClient(),id,{organizer:request.cookies.get(credentialCookie(id,"organizer"))?.value,
   participant:request.cookies.get(credentialCookie(id,"participant"))?.value}),{headers:privateHeaders});
 }catch(error){return applicationError(error);}
}
export async function POST(request:NextRequest,context:Context) {
 try {
  const id=eventId.parse((await context.params).id),body=applicationCommand.parse(await applicationBody(request)),db=applicationClient();
  const organizer=request.cookies.get(credentialCookie(id,"organizer"))?.value;
  const participant=request.cookies.get(credentialCookie(id,"participant"))?.value;
  const response=NextResponse.json({ok:true},{headers:privateHeaders});
  if(body.action==="join") {
   if(participant) throw new EventCommandError("conflict");
   const own=await createEventRepository(db).join(id,body.invitation,body.displayName);
   response.cookies.set(credentialCookie(id,"participant"),own.credential,credentialOptions(id));
  }else if(body.action==="recover") {
   await verifyApplicationCredential(db,id,body.role,body.credential);
   response.cookies.set(credentialCookie(id,body.role),body.credential,credentialOptions(id));
  }else if(body.action==="submit") {
   if(!participant)throw new EventCommandError("unauthorized");
   await submitApplicationPicks(db,id,participant,body);
  }else if(body.action==="consent") {
   const actor=body.role==="organizer"?organizer:participant;
   if(!actor)throw new EventCommandError("unauthorized");
   await applicationConsent(db,id,actor,body);
  }else {
   if(!organizer)throw new EventCommandError("unauthorized");
   await verifyApplicationCredential(db,id,"organizer",organizer);
   if(body.action==="qualifiers") {
    // SQL captures a source basis once under both league locks, after checking
    // exact replay. No fresh server-injected token changes an identical retry.
    if(Boolean(body.sourceLeagueId)!==Boolean(body.sourceOrganizerToken))throw new EventCommandError("invalid");
    await reviewApplicationQualifiers(db,id,organizer,body);
   }
   if(body.action==="pairings")await reviewApplicationPairings(db,id,organizer,body);
   if(body.action==="broadcast")await applicationBroadcast(db,id,organizer,body);
   if(body.action==="freeze")await createEventRepository(db).freeze(id,organizer,body.frozen);
   if(body.action==="window")await changeApplicationWindow(db,id,organizer,body);
   if(body.action==="result")await mutateApplicationResult(db,id,organizer,body.command);
  }
  return response;
 }catch(error){return applicationError(error);}
}
