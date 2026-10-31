#!/usr/bin/env -S node --import ./scripts/event-runtime-register.mjs
/**
 * Parent-only opt-in seeding; inert import, no HTTP, providers, workers or sends.
 * See phase-2-legacy-recovery-fixture-seeding.md. Never accepts credentials on argv.
 */
import assert from "node:assert/strict";
import { createHash,randomUUID } from "node:crypto";
import { dirname,resolve } from "node:path";
import { fileURLToPath,pathToFileURL } from "node:url";
import { fixtureDatabase,quote as q } from "./browser/fixture-sql";
import { validateLegacyRecoveryTarget,privateOutput,legacyPlan,firstWindowPicks,assertPreserved,origin,catalogName } from "./browser/legacy-recovery-fixture-plan";
import { createApplicationLeague,readApplication,submitApplicationPicks,verifyApplicationCredential } from "../lib/events/application";
import { createEventRepository } from "../lib/events/repository";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
export async function seedLegacyRecovery(env:Record<string,string|undefined>) {
 const {database,container}=validateLegacyRecoveryTarget(env);
 // Adapter pins unix socket AND container; env cannot redirect to a remote Docker host.
 const {sql,client:db}=fixtureDatabase(database,container);
 assert.equal(sql("select current_database();"),database);
 assert.equal(sql("select global_stopped and not notifications_enabled and not real_sends_enabled from event_runtime_control where singleton;"),"t");
 assert.equal(sql("select count(*) from provider_bindings;"),"0");
 assert.equal(sql("select count(*) from notification_attempts where disposition in ('authorized','issued','uncertain');"),"0");
 assert.equal(sql("select to_regclass('public.league_competitor_names') is not null;"),"t");
 // Exact catalog label is globally selected by the legacy UI. Never clobber/duplicate it.
 assert.equal(sql("select count(*) from templates where name="+q(catalogName)+";"),"0","Catalog collision: use a fresh disposable database");
 const run=randomUUID(),output=privateOutput(root,run);
 output.write("status.json",{status:"started",database,run});
 const plan=legacyPlan(),pickemId=randomUUID(),customId=randomUUID();
 const scoring={round_points:{"1":1,"2":1},champion_bonus:0,has_third_place:false,tiebreakers:["co_champions"]};
 const renameRooms=["A","B"].map(label=>({id:randomUUID(),organizerToken:randomUUID(),label}));
 function matches(tid:string,rows:typeof plan.customMatches) {
  return rows.map(m=>"insert into template_matches(template_id,round,match_number,home_slot,away_slot) values("+[q(tid),m.round,m.match_number,q(m.home_slot),q(m.away_slot)].join(",")+");").join("");
 }
 // One atomic legacy setup. Entire fixture owns new IDs; no UPDATE/DELETE of preexisting data.
 sql("begin;"+
  "insert into templates(id,name,type,topology,team_registry,scoring_defaults) values("+[q(pickemId),q(catalogName),"'pickem'",q(plan.topology),q(plan.registry),q({scheme:"pickem_flat"})].join(",")+");"+
  matches(pickemId,plan.pickemMatches)+
  "insert into templates(id,name,type,topology,team_registry,scoring_defaults) values("+[q(customId),q("Synthetic shared rename "+run),"'bracket'",q(plan.customTopology),q(plan.teams),q(scoring)].join(",")+");"+
  matches(customId,plan.customMatches)+
  renameRooms.map(r=>"insert into leagues(id,name,template_id,organizer_token,scoring_config) values("+[q(r.id),q("Synthetic rename "+r.label),q(customId),q(r.organizerToken),q(scoring)].join(",")+");").join("")+"commit;");
 const renameIds=renameRooms.map(r=>q(r.id)).join(",");
 assert.equal(sql("select count(*) from leagues where id in ("+renameIds+") and template_id="+q(customId)+" and locked_at is null;"),"2");
 assert.equal(sql("select count(*) from league_competitor_names where league_id in ("+renameIds+");"),"0");
 assert.deepEqual(JSON.parse(sql("select team_registry from templates where id="+q(customId))),plan.teams);
 assert.equal(sql("select count(*) from template_matches where template_id="+q(pickemId)),"2");

 const repo=createEventRepository(db);
 const startsAt=new Date(Date.now()+7*86400000).toISOString();
 async function create(label:string,two:boolean) {
  // Actual synthetic create/join/submit application workflows, not handcrafted event rows.
  const made=await createApplicationLeague(db,{templateKey:"wwc-2027",name:"Synthetic recovery "+label,startsAt,timeZone:"UTC",syntheticAcknowledged:true});
  const organizer=made.organizerCredential,id=made.id;
  const org=await readApplication(db,id,{organizer});
  assert(org.invitation);assert.equal(org.participantId,null);assert.deepEqual(org.picks,[]);
  const a=await repo.join(id,org.invitation,"Synthetic recovery A");
  const b=two?await repo.join(id,org.invitation,"Synthetic recovery B"):null;
  const w=org.windows[0];assert.equal(w.state,"open");
  const picks=firstWindowPicks(w.markets);
  await submitApplicationPicks(db,id,a.credential,{windowId:w.id,version:w.version,picks:picks.a});
  if(b){
   await submitApplicationPicks(db,id,b.credential,{windowId:w.id,version:w.version,picks:picks.b});
   const bView=await readApplication(db,id,{participant:b.credential});
   assert.equal(bView.participantId,b.participantId);
   assert(bView.picks.every(p=>p.participantId===b.participantId));
   assert.deepEqual(Object.fromEntries(bView.picks.map(p=>[p.marketId,p.choice])),picks.b);
  }
  const view=await readApplication(db,id,{participant:a.credential});
  assert.equal(view.participantId,a.participantId);assert.equal(view.participants.length,two?2:1);
  assert(view.windows.every(w=>w.state!=="locked"));
  assert.equal(view.picks.length,Object.keys(picks.a).length);
  assert.deepEqual(Object.fromEntries(view.picks.map(p=>[p.marketId,p.choice])),picks.a);
  assert(view.picks.every(p=>p.participantId===a.participantId));
  assert.deepEqual((await readApplication(db,id,{organizer})).picks,[]);
  return {id,organizer,a,b,picks,view};
 }
 const room=await create("primary",true),other=await create("foreign",false);
 // Credential-neutral persistence snapshot includes exact pick UUIDs/timestamps and B's picks.
 function snapshot(id:string) {
  return JSON.parse(sql("select jsonb_build_object('league',(select to_jsonb(l)-'organizer_token' from leagues l where id="+q(id)+"),"+
   "'participants',(select jsonb_agg(to_jsonb(p)-'magic_token' order by p.id) from participants p where league_id="+q(id)+"),"+
   "'picks',(select jsonb_agg(to_jsonb(p) order by p.id) from picks p where league_id="+q(id)+"));"));
 }
 // Verify real former authorization before mutation; guessed random invalid tokens are forbidden.
 assert.equal((await verifyApplicationCredential(db,room.id,"organizer",room.organizer)).id,room.id);
 assert.equal((await verifyApplicationCredential(db,room.id,"participant",room.a.credential)).id,room.a.participantId);
 const before=snapshot(room.id),newOrganizer=randomUUID(),newParticipant=randomUUID();
 // Compare-and-set both credentials in one transaction, with row-count assertions.
 sql("begin;do $$ declare n integer; begin "+
  "update leagues set organizer_token="+q(newOrganizer)+" where id="+q(room.id)+" and organizer_token="+q(room.organizer)+";get diagnostics n=row_count;if n<>1 then raise exception 'rotation failed';end if;"+
  "update participants set magic_token="+q(newParticipant)+" where id="+q(room.a.participantId)+" and league_id="+q(room.id)+" and magic_token="+q(room.a.credential)+";get diagnostics n=row_count;if n<>1 then raise exception 'rotation failed';end if;"+
  "end $$;commit;");
 assertPreserved(before,snapshot(room.id));
 for(const [role,token] of [["organizer",room.organizer],["participant",room.a.credential]] as const)
  await assert.rejects(()=>verifyApplicationCredential(db,room.id,role,token),{code:"unauthorized"});
 assert.equal((await verifyApplicationCredential(db,room.id,"organizer",newOrganizer)).id,room.id);
 assert.equal((await verifyApplicationCredential(db,room.id,"participant",newParticipant)).id,room.a.participantId);
 const after=await readApplication(db,room.id,{participant:newParticipant});
 // SQL row order is unspecified and credential UPDATE can move a tuple.
 // Identity/name preservation is independent of incidental physical order.
 assert.deepEqual([...after.participants].sort((a,b)=>a.id.localeCompare(b.id)),[...room.view.participants].sort((a,b)=>a.id.localeCompare(b.id)));assert.deepEqual(after.picks,room.view.picks);
 assert.equal(after.participantId,room.a.participantId);assert(!after.organizer);
 const organizerAfter=await readApplication(db,room.id,{organizer:newOrganizer});
 assert(organizerAfter.organizer&&organizerAfter.invitation);assert.equal(organizerAfter.participantId,null);assert.deepEqual(organizerAfter.picks,[]);
 assert.equal(organizerAfter.invitation,(before as {league:{join_token:string}}).league.join_token);
 assert.equal(sql("select count(*) from picks where league_id="+q(room.id)+" and locked;"),"0");
 for(const [role,token] of [["organizer",other.organizer],["participant",other.a.credential]] as const) {
  await verifyApplicationCredential(db,other.id,role,token);
  await assert.rejects(()=>verifyApplicationCredential(db,room.id,role,token),{code:"unauthorized"});
 }
 assertPreserved(before,snapshot(room.id));
 const cookieRoom=(id:string,organizer:string,participant:string)=>({url:origin+"/events/"+id,
  organizerCookie:{name:"event_organizer_"+id,value:organizer},participantCookie:{name:"event_participant_"+id,value:participant}});
 assert(room.b);
 // Independent intended B picks, not a snapshot derived from the response under test.
 const expectedBPicks=Object.entries(room.picks.b).map(([marketId,choice])=>({marketId,choice}));
 const bAfter=await readApplication(db,room.id,{participant:room.b.credential});
 assert.equal(bAfter.participantId,room.b.participantId);
 assert.equal(bAfter.organizer,false);
 assert(bAfter.picks.every(p=>p.participantId===room.b!.participantId));
 assert.deepEqual(Object.fromEntries(bAfter.picks.map(p=>[p.marketId,p.choice])),room.picks.b);
 const header={schemaVersion:1,synthetic:true,origin};
 output.write("legacy.json",{...header,pickem:{templateId:pickemId,categories:plan.expectedCategories},
  sharedRename:{templateId:customId,teamId:"seed-0",before:plan.teams[0].name,after:"Synthetic isolated rename",
   a:{url:origin+"/l/"+renameRooms[0].id,organizerToken:renameRooms[0].organizerToken},
   b:{url:origin+"/l/"+renameRooms[1].id,organizerToken:renameRooms[1].organizerToken}}});
 output.write("own-recovery.json",{...header,league:cookieRoom(room.id,newOrganizer,newParticipant),
  otherLeague:cookieRoom(other.id,other.organizer,other.a.credential),expectedParticipantId:room.a.participantId,
  otherParticipant:{participantCookie:{name:"event_participant_"+room.id,value:room.b.credential},
   expectedParticipantId:room.b.participantId,expectedOwnPicks:expectedBPicks},
  expectedOwnPicks:after.picks.map(({marketId,choice})=>({marketId,choice})),
  revoked:{organizer:room.organizer,participant:room.a.credential}});
 // Evidence is deliberately private too. Do not persist the raw snapshot: it contains join tokens.
 output.write("evidence.json",{run,database,status:"fixture-assertions-passed",leagueId:room.id,participantId:room.a.participantId,
  priorAuthorization:{organizer:true,participant:true},mutation:"atomic compare-and-set organizer_token + magic_token",
  formerCredentialsRejected:true,currentCredentialsAuthorized:true,foreignCredentialsAuthorizedOnlyInForeignLeague:true,
  preserved:{beforeDigest:createHash("sha256").update(JSON.stringify(before)).digest("hex"),
   afterDigest:createHash("sha256").update(JSON.stringify(snapshot(room.id))).digest("hex"),
   leagueExceptOrganizerCredential:true,participantsExceptOwnCredential:true,allPickRowsIncludingIdsTimestamps:true,
   rosterCount:after.participants.length,ownPickCount:after.picks.length,otherParticipantPickCount:bAfter.picks.length},organizerOpenPicks:0,lockedPicks:0,
  limitations:["Application-service/SQL fixture setup, not HTTP/browser acceptance","No provider/send/device/live acceptance","Run each browser lane once against these fixtures; recreate disposable DB for a new seed"]});
 output.write("complete.json",{status:"ready",run});
 return output.out;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 try {assert.equal(process.argv.length,2);const out=await seedLegacyRecovery(process.env);console.log("Private synthetic fixtures ready: "+out);}
 catch(error) {console.error("Legacy/recovery fixture seed failed; partial disposable data retained. No automatic retry.");
  const frame=error instanceof Error?error.stack?.match(/seed-legacy-recovery-browser-fixtures\.ts:\d+:\d+/)?.[0]:undefined;
  console.error("Safe diagnostic:",error instanceof Error?error.name:"unknown",frame??"unknown frame");process.exitCode=1;}
}
