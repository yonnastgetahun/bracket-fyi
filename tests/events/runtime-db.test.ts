import { randomUUID } from "node:crypto";
import { readFileSync,readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe,it,expect } from "vitest";
import { buildSyntheticManifest } from "@/lib/events/catalog";
import { createEventRuntime } from "@/lib/events/runtime";
import { createNotificationRepository } from "@/lib/events/notifications-repository";
import { createOperatorRepository } from "@/lib/events/operator-repository";
import type { EventRpcClient } from "@/lib/events/repository";
import { evaluateLifecycle, type LifecycleCapture } from "@/lib/events/lifecycle";

// JSON arrays (notably p_leaderboard) are not PostgreSQL text arrays.
const quoteSql=(v:unknown):string=>v===null?"null":"'"+String(typeof v==="object"?JSON.stringify(v):v).replaceAll("'","''")+"'";
function rpcArgument(key:string,value:unknown):string {
 return key==="p_kinds" && Array.isArray(value)
  ? "ARRAY["+value.map(quoteSql).join(",")+"]::text[]"
  : quoteSql(value);
}
const id=(n:number)=>"a3300000-0000-4000-8000-"+String(n).padStart(12,"0");
function runtimeManifest() {
 const base=buildSyntheticManifest("wwc-2027",{startsAt:new Date(Date.now()+3600000).toISOString()});
 const entrantIds:[string,string]=[id(7),id(8)];
 const entrants=base.entrants.slice(0,2).map((e,i)=>({...e,id:entrantIds[i]}));
 const market={...base.markets[0],id:"m",windowId:"w",contestId:id(4),required:true,entrants,
  inputs:entrantIds.map(entrantId=>({kind:"entrant" as const,entrantId}))};
 return {...base,markets:[market],windows:[{...base.windows[0],id:"w"}],edges:[],championMarketId:null,entrants,
  lifecycle:{binding:{reviewed:true as const,graphVersion:1,markets:[{marketId:"m",inputs:market.inputs,eligibleEntrantIds:entrantIds,orientation:entrantIds}]},components:[]}};
}
describe("runtime SQL fixture contracts (no database)",()=>{
 it("scores the remapped sealed manifest and serializes populated/empty leaderboard JSON arrays",()=>{
  const manifest=runtimeManifest();
  expect(manifest.markets[0].entrants).toEqual(manifest.entrants);
  const token="a".repeat(64);
  const capture:LifecycleCapture={leagueId:id(11),generation:1,basisToken:token,basis:{
   configurationVersion:1,manifest,windows:[{id:"w",version:1,state:"locked"}],
   participants:[{id:id(101),graphVersion:1,picks:{}}],holds:[],quarantines:[],locked:true,frozen:false,disabled:false,
   effective:{m:{outcome:{kind:"unresolved"},source:"unresolved",canonicalResultId:null,canonicalVersion:0,
    canonicalToken:token,overrideId:null,overrideRevision:0,expiresAt:null,derivedProvenance:null,
    held:false,excluded:false,effectiveToken:token,provenanceToken:token}},
  }};
  const board=evaluateLifecycle(capture);
  expect(board).toEqual([{id:id(101),earned:0,maximum:0,wrong:1,pending:0,rank:1}]);
  expect(rpcArgument("p_leaderboard",board)).toBe("'"+JSON.stringify(board)+"'");
  expect(rpcArgument("p_leaderboard",[])).toBe("'[]'");
  expect(rpcArgument("p_kinds",["contest_live","provider_stale"])).toBe("ARRAY['contest_live','provider_stale']::text[]");
 });
});

const lane=process.env.BRACKET_RUNTIME_DB_TEST==="1"?describe:describe.skip;
lane("fresh local SQL runtime integration",()=>{
 it("real scorer sweep → four producers → stopped then authorized fake worker → durable replay",async()=>{
  const root=resolve(import.meta.dirname,"../..");
  const db="bracket_runtime_"+randomUUID().replaceAll("-","").slice(0,12);
  const container="supabase_db_bracket-fyi";
  function command(args:string[],input?:string){
   const r=spawnSync("docker",args,{input,encoding:"utf8",timeout:120000});
   if(r.status!==0) throw new Error("Local DB subprocess failed: status="+r.status+" signal="+r.signal+" "+(r.error?.message??"")+" "+r.stderr);
   return r.stdout.trim();
  }
  const sql=(input:string)=>command(["exec","-i",container,"psql","-X","-U","postgres","-d",db,"-Atq","-v","ON_ERROR_STOP=1"],input);
  const q=quoteSql;
  console.info("Disposable runtime proof DB:",db);
  command(["exec",container,"createdb","-U","postgres","--template=template0",db]);
  sql(`create schema extensions;create extension pgcrypto with schema extensions;create extension pgtap with schema extensions;create extension supabase_vault;
grant usage on schema public,extensions to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on functions to anon,authenticated,service_role;
alter database "${db}" set search_path=public,extensions;`);
  for(const name of readdirSync(resolve(root,"supabase/migrations")).sort()){
   if(name.endsWith(".sql")&&name.slice(0,14)<="20261027000014") sql(readFileSync(resolve(root,"supabase/migrations",name),"utf8"));
  }
  const manifest=runtimeManifest();
  let fixture=readFileSync(resolve(root,"supabase/tests/database/DB33_event_notifications_test.sql"),"utf8");
  fixture=fixture.slice(fixture.indexOf("insert into organizations"),fixture.indexOf("-- FIXTURE_END"));
  const start=fixture.indexOf("'{\"markets\"");
  const end=fixture.indexOf("insert into leagues",start);
  fixture=fixture.slice(0,start)+q(JSON.stringify(manifest))+");\n"+fixture.slice(end);
  sql(fixture);
  sql(`insert into event_operator_principals(id) values('${id(501)}');
insert into event_operator_credentials values(encode(extensions.digest('runtime-synthetic-operator','sha256'),'hex'),'${id(501)}',true,now()+interval '1 hour');
insert into event_operator_grants(principal_id,environment,action) values('${id(501)}','local','global.stop'),('${id(501)}','local','notification.control');`);
  const names:string[]=[];
  const client:EventRpcClient={async rpc(name,args){
   names.push(name);
   try{
    const call=name+"("+Object.entries(args).map(([k,v])=>k+" => "+rpcArgument(k,v)).join(",")+")";
    const query=name==="scan_event_notifications"||name==="scan_event_lifecycle_work"
      ?"select coalesce(jsonb_agg(x),'[]') from "+call+" x":"select to_jsonb("+call+")";
    return {data:JSON.parse(sql("set role service_role;"+query+";")),error:null};
   }catch(error){console.error("Runtime fixture RPC failed:",name,String(error));return {data:null,error:{message:String(error)}};}
  }};
  const repo=createNotificationRepository(client);
  await repo.consent(id(11),id(201),id(101),"fake://runtime-participant",["lock_reminder","contest_live","schedule_change"],true);
  await repo.consent(id(11),id(21),null,"fake://runtime-organizer",["provider_stale"],true);
  const now=new Date();
  const signals=[
   {kind:"lock_reminder",leagueId:id(11),windowId:"w",revision:1,cutoff:new Date(now.getTime()+1800000).toISOString()},
   {kind:"contest_live",leagueId:id(11),contestId:id(4),revision:1,startsAt:now.toISOString()},
   {kind:"schedule_change",leagueId:id(11),contestId:id(4),revision:2,changedAt:now.toISOString()},
   {kind:"provider_stale",leagueId:id(11),bindingId:"synthetic",episodeStartedAt:now.toISOString()},
  ];
  const runtime=createEventRuntime(client);
  const stopped=await runtime.tick({signals,now,batchSize:10});
  expect(stopped.sweep).toMatchObject({reconciled:3,conflicts:0,failed:[]});
  expect(stopped.produced).toEqual({emitted:4,skipped:0,failed:[]});
  expect(stopped.fakeCalls).toBe(0);
  expect(sql("select count(*) from notification_attempts")).toBe("0");
  const operator=createOperatorRepository(client);
  await operator.execute("runtime-synthetic-operator",{action:"notification.control",eventId:null,expectedVersion:0,reason:"Synthetic fake worker proof",payload:{enabled:true}});
  expect((await runtime.tick()).fakeCalls).toBe(0); // Enabling notification delivery cannot resume global stop.
  await operator.execute("runtime-synthetic-operator",{action:"global.stop",eventId:null,expectedVersion:1,reason:"Synthetic fake worker proof",payload:{stopped:false}});
  const delivered=await runtime.tick({signals,now});
  expect(delivered.notifications.sent).toBe(4);
  expect(delivered.fakeCalls).toBe(4);
  expect(delivered.produced.emitted).toBe(0);
  expect((await createEventRuntime(client).tick({signals,now})).fakeCalls).toBe(0);
  expect(sql("select count(*) from notification_attempts")).toBe("4");
  expect(sql("select count(*) from event_operator_audit")).toBe("2");
  expect(names).not.toContain("set_event_notification_control");
  await operator.execute("runtime-synthetic-operator",{action:"global.stop",eventId:null,expectedVersion:2,reason:"Leave isolated proof stopped",payload:{stopped:true}});
  expect(sql("select global_stopped and not real_sends_enabled from event_runtime_control")).toBe("t");
  console.info("Retained disposable runtime proof DB:",db);
 },120000);
});
