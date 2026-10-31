#!/usr/bin/env -S node --import ./scripts/event-runtime-register.mjs
/**
 * Parent-run only. No dotenv, DB creation, migration, deletion, providers or sends.
 * Required env: BRACKET_FIXTURE_DATABASE=bracket_..., BRACKET_FIXTURE_DISPOSABLE=same,
 * BRACKET_FIXTURE_ORIGIN=http://127.0.0.1:3137.
 * node --import ./scripts/event-runtime-register.mjs scripts/seed-event-browser-fixtures.ts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync,writeFileSync,lstatSync,chmodSync } from "node:fs";
import { resolve,dirname } from "node:path";
import { fileURLToPath,pathToFileURL } from "node:url";
import { buildApplicationManifest,initiallyOpen,type ApplicationManifest } from "../lib/events/application-manifest";
import { changeApplicationWindow,submitApplicationPicks,readApplication,rpc } from "../lib/events/application";
import { createEventRepository } from "../lib/events/repository";
import { createLifecycleRepository } from "../lib/events/lifecycle-repository";
import { reconcileEventLifecycle } from "../lib/events/lifecycle";
import { createOperatorRepository } from "../lib/events/operator-repository";
import type { Outcome } from "../lib/events/outcomes";
import { fixtureDatabase,quote as q } from "./browser/fixture-sql";
import { validateTarget,laterPlan,sharedRows,scoreRow,fixtureOrigin } from "./browser/fixture-plan";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
type Room={id:string;url:string;organizerCookie:{name:string;value:string};participantCookie?:{name:string;value:string}};
const reason="Original disposable synthetic browser fixture";
export async function seed(env:Record<string,string|undefined>) {
 const {database}=validateTarget(env);
 const {sql,client:db}=fixtureDatabase(database,env.BRACKET_FIXTURE_CONTAINER);
 // Fail closed before mutation; no workers/bindings/senders may be active.
 assert.equal(sql("select current_database();"),database);
 assert.equal(sql("select global_stopped and not notifications_enabled and not real_sends_enabled from event_runtime_control where singleton;"),"t");
 assert.equal(sql("select count(*) from provider_bindings;"),"0");
 assert.equal(sql("select count(*) from notification_attempts where disposition in ('authorized','issued','uncertain');"),"0");
 const run=randomUUID();
 const base=resolve(root,"tmp","browser-fixtures");
 // Reject symlinked ancestors and outputs; never overwrite a previous fixture.
 for(const path of [resolve(root,"tmp"),base]){
  try{assert(!lstatSync(path).isSymbolicLink());assert(lstatSync(path).isDirectory());}
  catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;mkdirSync(path,{mode:0o700});}
 }
 const out=resolve(base,run);mkdirSync(out,{mode:0o700});chmodSync(out,0o700);
 const privateFile=(name:string,value:unknown)=>writeFileSync(resolve(out,name),JSON.stringify(value,null,2)+"\n",{mode:0o600,flag:"wx"});
 privateFile("status.json",{status:"started",database,run});
 const repo=createEventRepository(db),life=createLifecycleRepository(db),operator=createOperatorRepository(db);
 const startsAt=new Date(Date.now()+7*86400000).toISOString();
 const evidence:{kind:string;[key:string]:unknown}[]=[];
 async function template(manifest:ApplicationManifest,editionId:string|null=null){
  const id=randomUUID();
  sql("insert into templates(id,name,type,event_edition_id) values("+[q(id),q(reason),"'bracket'",q(editionId)].join(",")+");"+
   "insert into event_template_configs(template_id,version,sealed,manifest) values("+q(id)+",1,true,"+q(manifest)+");");
  return id;
 }
 async function room(tid:string,manifest:ApplicationManifest,label:string):Promise<Room>{
  const id=randomUUID(),organizer=randomUUID(),invitation=randomUUID();
  sql("insert into leagues(id,name,template_id,organizer_token,join_token,status,scoring_config) values("+[q(id),q("Browser "+label),q(tid),q(organizer),q(invitation),"'active'",q({type:"pickem",points_per_correct:1})].join(",")+");"+
   "insert into event_league_evaluations(league_id,configuration_version) values("+q(id)+",1);");
  for(const w of manifest.windows){
   const open=initiallyOpen(manifest,w.id);
   await rpc(db,"configure_event_window",{p_league_id:id,p_window_key:w.id,p_expected_version:0,p_state:open?"open":"unopened",
    p_cutoff:open?startsAt:null,p_pairings_reviewed:open,p_market_ids:manifest.markets.filter(m=>m.windowId===w.id).map(m=>m.id)});
  }
  return {id,url:fixtureOrigin+"/events/"+id,organizerCookie:{name:"event_organizer_"+id,value:organizer}};
 }
 async function join(r:Room,name:string){
  const invitation=sql("select join_token from leagues where id="+q(r.id));
  const person=await repo.join(r.id,invitation,name);
  if(!r.participantCookie)r.participantCookie={name:"event_participant_"+r.id,value:person.credential};
  return {...person,name};
 }
 const view=(r:Room)=>readApplication(db,r.id,{organizer:r.organizerCookie.value});
 async function override(r:Room,marketId:string,outcome:Outcome){
  const c=await life.capture(r.id),current=c.basis.effective[marketId];
  await life.mutate(r.id,r.organizerCookie.value,{action:"override",marketId,payload:{outcome},reason,
   expectedEffectiveToken:current.effectiveToken,expectedCanonicalToken:current.canonicalToken,idempotencyKey:randomUUID()});
 }
 async function checkBoard(r:Room,expected:ReturnType<typeof scoreRow>[],state:string){
  await reconcileEventLifecycle(life,r.id);
  const actual=await view(r);
  assert.equal(actual.view.state,state);
  assert.deepEqual(actual.view.leaderboard.map(row=>({id:row.id,rank:row.rank,earned:row.earned,wrong:row.wrong})).sort((a,b)=>a.id.localeCompare(b.id)),
   expected.map(({id,rank,earned,wrong})=>({id,rank,earned,wrong})).sort((a,b)=>a.id.localeCompare(b.id)));
  // Confirm the browser app is attached to this same DB, not another local runtime.
  // Synchronous docker/psql work can outlive the server keep-alive timeout while
  // preventing Node from observing socket close. Do not pool these sparse probes.
  const response=await fetch(r.url+"/data",{redirect:"error",headers:{Connection:"close"},signal:AbortSignal.timeout(30000)});
  assert(response.ok);
  const publicView=await response.json();
  assert.equal(publicView.id,r.id);assert.equal(publicView.view.state,state);
  assert.deepEqual(publicView.participants.map((p:{id:string})=>p.id).sort(),expected.map(p=>p.id).sort());
  assert(!JSON.stringify(publicView).includes(r.organizerCookie.value));
 }
 // Shared: two regulation markets; one intentionally unresolved keeps state locked.
 // Initial draw -> active away override -> canonical home correction, versions 1/2.
 const org=randomUUID(),competition=randomUUID(),edition=randomUUID(),stage=randomUUID(),contest=randomUUID();
 const entries=[randomUUID(),randomUUID()],competitors=[randomUUID(),randomUUID()];
 sql("begin;insert into organizations(id,organization_key,name,kind) values("+q(org)+","+q(run)+",'Browser synthetic','governing_body');"+
  "insert into competitions(id,organization_id,competition_key,name,domain,sport_code) values("+q(competition)+","+q(org)+","+q(run)+",'Browser synthetic','sport','soccer');"+
  "insert into event_editions(id,competition_id,edition_key,name,season_label) values("+q(edition)+","+q(competition)+","+q(run)+",'Browser synthetic','synthetic');"+
  "insert into stages(id,event_edition_id,stage_key,name,kind,ordinal) values("+q(stage)+","+q(edition)+","+q(run)+",'Browser synthetic','league',1);"+
  "insert into contests(id,event_edition_id,stage_id,contest_key,name,kind) values("+q(contest)+","+q(edition)+","+q(stage)+","+q(run)+",'Browser synthetic','match');"+
  entries.map((entry,i)=>"insert into competitors(id,competitor_key,kind,canonical_name) values("+q(competitors[i])+","+q(run+"-"+i)+",'team',"+q("Synthetic "+i)+");"+
   "insert into event_entries(id,event_edition_id,competitor_id,role) values("+q(entry)+","+q(edition)+","+q(competitors[i])+",'team');"+
   "insert into contest_entries(event_edition_id,contest_id,event_entry_id,role,side,ordinal) values("+q(edition)+","+q(contest)+","+q(entry)+",'competitor',"+q(i===0?"home":"away")+","+(i+1)+");").join("")+"commit;");
 const baseManifest=buildApplicationManifest("ucl-2026-27",startsAt,1,"UTC"),windowId=baseManifest.windows[0].id;
 const entrants=baseManifest.entrants.slice(0,2).map((e,i)=>({...e,id:entries[i]}));
 const inputs=entries.map(entrantId=>({kind:"entrant" as const,entrantId}));
 const markets=baseManifest.markets.slice(0,2).map((m,i)=>({...m,id:"browser-shared-"+(i===0?"result":"pending"),windowId,inputs,entrants,...(i===0?{contestId:contest}:{})}));
 const sharedManifest:ApplicationManifest={...baseManifest,entrants,markets,windows:[baseManifest.windows[0]],edges:[],championMarketId:null,
  lifecycle:{binding:{reviewed:true,graphVersion:1,markets:markets.map(m=>({marketId:m.id,inputs,eligibleEntrantIds:entries,orientation:entries as [string,string]}))},components:[]}};
 const tid=await template(sharedManifest,edition),marketId=markets[0].id,pending=markets[1].id;
 const sharedRooms=[];
 for(const mode of ["canonical","override","release"] as const){
  const r=await room(tid,sharedManifest,mode),people=[];
  for(const choice of ["home","away","draw"]){
   const person=await join(r,"Browser "+choice);people.push({...person,choice});
   await submitApplicationPicks(db,r.id,person.credential,{windowId,version:1,picks:{[marketId]:choice,[pending]:"draw"}});
  }
  await changeApplicationWindow(db,r.id,r.organizerCookie.value,{windowId,version:1,operation:"lock"});
  sharedRooms.push({r,people,mode});
 }
 const principal=randomUUID(),credential=randomUUID();
 sql("insert into event_operator_principals(id) values("+q(principal)+");"+
  "insert into event_operator_credentials values(encode(extensions.digest("+q(credential)+",'sha256'),'hex'),"+q(principal)+",true,now()+interval '1 hour');"+
  "insert into event_operator_grants(principal_id,environment,event_edition_id,action) values("+q(principal)+",'local',"+q(edition)+",'result.record'),("+q(principal)+",'local',null,'global.stop');");
 async function stop(stopped:boolean){
  const version=Number(sql("select version from event_runtime_control where singleton"));
  await operator.execute(credential,{action:"global.stop",eventId:null,expectedVersion:version,reason,payload:{stopped}});
 }
 let first:Record<string,unknown>,second:Record<string,unknown>;
 try{
  await stop(false);
  first=await operator.execute(credential,{action:"result.record",eventId:edition,expectedVersion:0,reason,
   payload:{contestId:contest,status:"final",outcome:"draw",winnerEntryId:null,winningNominationIds:[]}});
  for(const {r,mode} of sharedRooms)if(mode!=="canonical"){
   assert.equal((await life.capture(r.id)).basis.effective[marketId].canonicalVersion,1);
   await override(r,marketId,{kind:"winner",entrant:entries[1]});
  }
  second=await operator.execute(credential,{action:"result.record",eventId:edition,expectedVersion:1,reason:reason+" canonical correction",
   payload:{contestId:contest,status:"final",outcome:"winner",winnerEntryId:entries[0],winningNominationIds:[]}});
 }finally{
  await stop(true);
  sql("update event_operator_credentials set active=false where principal_id="+q(principal)+";");
 }
 assert.equal(first.version,1);assert.equal(second.version,2);
 const latestOutcome={kind:"winner",entrant:entries[0]};
 const leagues=[];
 for(const {r,people,mode} of sharedRooms){
  const beforeRows=sharedRows(people,mode==="canonical"?"home":"away");
  await checkBoard(r,beforeRows,"locked");
  const current=(await life.capture(r.id)).basis.effective[marketId];
  assert.equal(current.canonicalVersion,2);assert.equal(current.source,mode==="canonical"?"canonical":"override");
  if(mode!=="canonical")evidence.push({kind:"override",leagueId:r.id,overrideId:current.overrideId,overrideRevision:current.overrideRevision,basisCanonicalVersion:1,currentCanonicalVersion:2});
  const before={source:mode==="canonical"?"canonical":"override",outcome:mode==="canonical"?latestOutcome:{kind:"winner",entrant:entries[1]},canonicalVersion:2,state:"locked"};
  leagues.push({...r,mode,before,beforeRows,...(mode==="release"?{after:{source:"canonical",outcome:latestOutcome,canonicalVersion:2,state:"locked"},afterRows:sharedRows(people,"home")}:{})});
 }
 const audits=JSON.parse(sql("select coalesce(jsonb_agg(id),'[]') from event_operator_audit where principal_id="+q(principal)+" and action='result.record';"));
 assert.equal(audits.length,2);
 evidence.push({kind:"shared",templateId:tid,editionId:edition,contestId:contest,firstResult:first,correction:second,publicationAuditIds:audits,overrideBasisVersion:1});
 privateFile("shared.json",{schemaVersion:1,synthetic:true,origin:fixtureOrigin,marketId,overrideBasisVersion:1,latestCanonicalVersion:2,latestOutcome,leagues});
 for(const key of ["ucl-2026-27","wwc-2027"] as const){
  const plan=laterPlan(key,startsAt),tid=await template(plan.manifest),r=await room(tid,plan.manifest,key);
  const person=await join(r,"Browser later player");
  for(const w of plan.manifest.windows){
   if(w.id===plan.windowId)continue;
   let current=await view(r),window=current.windows.find(x=>x.id===w.id)!;
   const members=plan.manifest.markets.filter(m=>m.windowId===w.id);
   if(window.state==="unopened"){
    await rpc(db,"review_event_pairings",{p_league:r.id,p_organizer:r.organizerCookie.value,p_window:w.id,
     p_window_version:window.version,p_configuration_version:current.configurationVersion,p_basis:current.basisToken,
     p_pairings:Object.fromEntries(members.map(m=>[m.id,plan.pairings[m.id]])),p_reason:reason});
    current=await view(r);window=current.windows.find(x=>x.id===w.id)!;
    await changeApplicationWindow(db,r.id,r.organizerCookie.value,{windowId:w.id,version:window.version,operation:"open",cutoff:startsAt});
    current=await view(r);window=current.windows.find(x=>x.id===w.id)!;
   }
   await submitApplicationPicks(db,r.id,person.credential,{windowId:w.id,version:window.version,picks:Object.fromEntries(members.filter(m=>m.scored).map(m=>[m.id,plan.picks[m.id]]))});
   await changeApplicationWindow(db,r.id,r.organizerCookie.value,{windowId:w.id,version:window.version,operation:"lock"});
   for(const m of members)await override(r,m.id,{kind:"winner",entrant:plan.winners[m.id]});
   await reconcileEventLifecycle(life,r.id);
  }
  const expected=[scoreRow(person.participantId,person.name,plan.baselineEarned,1)];
  await checkBoard(r,expected,"locked");
  const priorPicks=sql("select count(*) from picks where league_id="+q(r.id)+" and locked;");
  assert.equal(Number(priorPicks),plan.priorCount);
  const final=(await view(r)).windows.find(w=>w.id===plan.windowId)!;assert.equal(final.state,"unopened");
  // Catalog order is final then bronze. Expected totals are literal independent constants.
  const target=plan.manifest.markets.filter(m=>m.windowId===plan.windowId);
  const results=target.map((m,i)=>({marketId:m.id,choice:plan.winners[m.id],state:i===target.length-1?"complete":"locked",
   rows:[scoreRow(person.participantId,person.name,plan.resultEarned[i],1)]}));
  privateFile(key==="ucl-2026-27"?"ucl-final.json":"wwc-medals.json",{schemaVersion:1,synthetic:true,origin:fixtureOrigin,templateKey:key,league:r,
   windowId:plan.windowId,pairings:Object.fromEntries(target.map(m=>[m.id,plan.pairings[m.id]])),
   picks:Object.fromEntries(target.map(m=>[m.id,plan.picks[m.id]])),results});
  evidence.push({kind:key,templateId:tid,leagueId:r.id,priorLockedPicks:plan.priorCount,expectedBaseline:expected,
   oracle:"All prior winners picked except first regulation draw miss; final and bronze picks correct. No scorer output used to construct expected rows."});
 }
 privateFile("evidence.json",{database,run,evidence,limitations:["Prepared shared publication, not browser-temporal propagation","Synthetic local only; parent must run browser lanes","No provider, sender, live or deployed acceptance"]});
 privateFile("complete.json",{status:"ready",run});
 return out;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{assert.equal(process.argv.length,2);const out=await seed(process.env);console.log("Private synthetic fixtures ready: "+out);}
 catch(error){
  // No stack, SQL, HTTP body, cookies, invitation or credential reflection.
  console.error("Fixture seed failed; partial disposable data retained. No automatic retry. Error type: "+(error instanceof Error?error.name:"unknown"));
  process.exitCode=1;
 }
}
