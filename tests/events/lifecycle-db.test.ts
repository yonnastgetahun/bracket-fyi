import { describe,it,expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { sqlFailure } from "./sql-failure";
import { getEventDefinition } from "@/lib/events/catalog";
import { createLifecycleRepository } from "@/lib/events/lifecycle-repository";
import { reconcileEventLifecycle, reconcileEventLifecycleSweep } from "@/lib/events/lifecycle";

const quote=(value:unknown)=>value===null?"null":"'"+String(typeof value==="object"?JSON.stringify(value):value).replaceAll("'","''")+"'";
function sql(statement:string) {
 const database=process.env.EVENT_LIFECYCLE_TEST_DATABASE??"";
 if(!/^bracket_lifecycle_[0-9a-f]{12}$/.test(database)) throw new Error("Explicit disposable lifecycle database required");
 return execFileSync("docker",["exec","-i","supabase_db_bracket-fyi","psql","-X","-U","postgres","-d",database,"-Atq","-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose"],
  {input:statement,encoding:"utf8",timeout:30_000,stdio:["pipe","pipe","pipe"]}).trim();
}
// Explicit opt-in; ordinary unit runs never touch a DB or load .env.local.
describe.runIf(process.env.RUN_EVENT_LIFECYCLE_DB==="1")("real lifecycle repository → SQL → scoreEvent → durable read",()=>{
 it("three leagues canonical/active/released, correction/reopen/recomplete and lost ack",async()=>{
  const prefix=randomUUID().slice(0,8),id=(n:number)=>prefix+"-0000-4000-8000-"+String(n).padStart(12,"0");
  const base=getEventDefinition("wwc-2027")!;
  const inputs=[id(7),id(8)].map(entrantId=>({kind:"entrant" as const,entrantId}));
  const market={...base.markets[0],id:"m",windowId:"w",inputs,contestId:id(4),choices:["home","draw","away"],required:true};
  const manifest={...base,markets:[market],windows:[{...base.windows[0],id:"w"}],entrants:[{id:id(7)},{id:id(8)}],edges:[],championMarketId:null,
   lifecycle:{binding:{reviewed:true,graphVersion:1,markets:[{marketId:"m",inputs,eligibleEntrantIds:[id(7),id(8)],orientation:[id(7),id(8)]}]},components:[]}};
  let fixture=readFileSync(new URL("../../supabase/tests/database/DB32_event_lifecycle_test.sql",import.meta.url),"utf8");
  fixture=fixture.slice(fixture.indexOf("insert into organizations"),fixture.indexOf("create temp table"));
  const start=fixture.indexOf("insert into event_template_configs"),end=fixture.indexOf("insert into leagues");
  fixture=fixture.slice(0,start)+"insert into event_template_configs(template_id,version,sealed,manifest) values("+quote(id(10))+",1,true,"+quote(manifest)+");\n"+fixture.slice(end);
  fixture=fixture.replaceAll("a3200000",prefix).replaceAll("db32","db32-"+prefix);
  sql("begin;"+fixture+"commit;");
  for(const n of [11,12,13]){
   sql("begin;insert into participants(id,league_id,display_name) values("+quote(id(n+100))+","+quote(id(n))+",'Synthetic P'),("+quote(id(n+200))+","+quote(id(n))+",'Synthetic Q');"+
    "insert into picks(league_id,participant_id,slot_id,team_id,locked,event_configuration_version) values("+
    [quote(id(n)),quote(id(n+100)),"'m'","'home'","true","1"].join(",")+"),("+
    [quote(id(n)),quote(id(n+200)),"'m'","'draw'","true","1"].join(",")+");commit;");
  }
  const repo=createLifecycleRepository({rpc:async(name,args)=>{
   try{
    const call=name+"("+Object.values(args).map(quote).join(",")+")";
    const query=name==="scan_event_lifecycle_work"?"select coalesce(jsonb_agg(to_jsonb(s)), '[]') from "+call+" s;":"select "+call+";";
    return {data:JSON.parse(sql("set role service_role; "+query)),error:null};
   }
   catch(error){return sqlFailure(error);}
  }});
  async function override(n:number,key:string) {
   const c=await repo.capture(id(n));
   await repo.mutate(id(n),id(n+10),{marketId:"m",action:"override",payload:{outcome:{kind:"draw"}},reason:"Synthetic override",expectedEffectiveToken:c.basis.effective.m.effectiveToken,idempotencyKey:key});
  }
  async function release(n:number,key:string) {
   const c=await repo.capture(id(n));
   await repo.mutate(id(n),id(n+10),{marketId:"m",action:"release",payload:{},reason:"Synthetic release",expectedEffectiveToken:c.basis.effective.m.effectiveToken,expectedCanonicalToken:c.basis.effective.m.canonicalToken,idempotencyKey:key});
  }
  function canonical(version:number,kind:"winner"|"draw"|"pending") {
   const previous=version===1?null:id(30+version-1);
   sql("insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,source_type,idempotency_key,supersedes_result_id,correction_reason) values("+
    [quote(id(30+version)),quote(id(4)),quote(id(3)),String(version),quote(kind==="pending"?"unresolved":"final"),quote(kind),quote(kind==="winner"?id(7):null),"'operator'",quote(prefix+":"+version),quote(previous),quote(version===1?null:"Synthetic correction")].join(",")+");");
  }
  await override(12,"B-override");await override(13,"C-override");await release(13,"C-release");
  canonical(1,"winner");
  for(const n of [11,12,13]) {
   expect((await repo.read(id(n))).state).toBe("reconciliation-pending");
   expect((await reconcileEventLifecycle(repo,id(n))).state).toBe("complete");
   const rows=(await repo.read(id(n))).leaderboard;
   expect(rows.map(r=>[r.id,r.earned,r.maximum,r.wrong,r.rank])).toEqual(n===12?
    [[id(n+200),1,1,0,1],[id(n+100),0,0,1,2]]:
    [[id(n+100),1,1,0,1],[id(n+200),0,0,1,2]]);
  }
  const masked=(await repo.capture(id(12))).basis.effective.m;
  canonical(2,"draw");
  const updated=(await repo.capture(id(12))).basis.effective.m;
  expect(updated.effectiveToken).toBe(masked.effectiveToken);expect(updated.provenanceToken).not.toBe(masked.provenanceToken);
  for(const n of [11,12,13]) {
   expect((await reconcileEventLifecycle(repo,id(n))).coronation).toBe(false);
   expect((await repo.read(id(n))).leaderboard.map(r=>[r.earned,r.maximum,r.wrong,r.rank])).toEqual([[1,1,0,1],[0,0,1,2]]);
  }
  await release(12,"B-release");await reconcileEventLifecycle(repo,id(12));
  canonical(3,"pending");
  for(const n of [11,12,13]) expect((await reconcileEventLifecycle(repo,id(n))).state).toBe("locked");
  canonical(4,"draw");
  for(const n of [11,12,13]) {
   const result=await reconcileEventLifecycle(repo,id(n));expect(result.state).toBe("complete");expect(result.coronation).toBe(false);
   expect((await reconcileEventLifecycle(repo,id(n))).replayed).toBe(true);
   expect(sql("select count(*) from event_lifecycle_audit where league_id="+quote(id(n))+" and kind='coronation';")).toBe("1");
  }
  expect(sql("select count(*) from picks where league_id in ("+[11,12,13].map(n=>quote(id(n))).join(",")+");")).toBe("6");
  // A supported legacy NULL basis cannot starve independent expiry-driven work.
  sql("update picks set event_configuration_version=null where league_id="+quote(id(11))+";");
  sql("insert into league_completion_holds(league_id,event_edition_id,hold_key,reason,created_by_fingerprint,idempotency_key,expires_at) values("+
   [quote(id(12)),quote(id(3)),"'db35'","'Synthetic expiry'","repeat('a',64)",quote(prefix+"-expiry"),"clock_timestamp()+interval '1 second'"].join(",")+");");
  expect((await reconcileEventLifecycle(repo,id(12))).state).toBe("held");
  const generation=(await repo.capture(id(12))).generation;
  const before=Number(sql("select count(*) from event_lifecycle_audit where league_id="+quote(id(12))+" and kind='evaluated';"));
  sql("select pg_sleep(1.1);");
  const work=await repo.scan(id(10),3);
  expect(work).toEqual([
   {league_id:id(11),generation:expect.any(Number),error_code:"invalid-basis"},
   {league_id:id(12),generation,error_code:null},
   {league_id:id(13),generation:null,error_code:null},
  ]);
  expect(await reconcileEventLifecycleSweep(repo,{after:id(10),batchSize:3,maxBatches:1}))
   .toEqual({nextCursor:id(13),reconciled:1,conflicts:0,failed:[{leagueId:id(11),code:"invalid-basis"}]});
  expect((await repo.read(id(12))).state).toBe("complete");
  expect((await reconcileEventLifecycle(repo,id(12))).replayed).toBe(true);
  expect(Number(sql("select count(*) from event_lifecycle_audit where league_id="+quote(id(12))+" and kind='evaluated';"))).toBe(before+1);
  expect(sql("select count(*) from event_lifecycle_audit where league_id="+quote(id(12))+" and kind='coronation';")).toBe("1");
  expect((await repo.scan(id(10),3))[0].error_code).toBe("invalid-basis");

 },30_000);
});
