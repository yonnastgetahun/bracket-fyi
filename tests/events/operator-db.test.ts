import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { describe, it, expect } from "vitest";

// Explicit disposable local DB lane; no hosted URL, .env, credentials or real HTTP.
// BRACKET_OPERATOR_DB_TEST=1 npx vitest run tests/events/operator-db.test.ts
const root=resolve(import.meta.dirname,"../..");
const container="supabase_db_bracket-fyi";
const lane=process.env.BRACKET_OPERATOR_DB_TEST==="1"?describe:describe.skip;
lane("operator local database and deterministic stop barriers",()=>{
 it("fresh migration, scoped commands, stop races, uncertainty, additive repair",async()=>{
  const db="bracket_operator_"+randomUUID().replaceAll("-","").slice(0,12);
  const base=["exec","-i",container,"psql","-X","-U","postgres","-d",db,"-Atq","-v","ON_ERROR_STOP=1"];
  const processes:ChildProcessWithoutNullStreams[]=[];
  function command(args:string[],input?:string) {
   const result=spawnSync("docker",args,{input,encoding:"utf8",timeout:120000});
   if(result.status!==0) throw new Error("Disposable database operation failed: "+result.stderr);
   return result.stdout.trim();
  }
  const sql=(source:string)=>command(base,source);
  const file=(path:string)=>sql(readFileSync(resolve(root,path),"utf8"));
  const quote=(value:string)=>"'"+value.replaceAll("'","''")+"'";
  command(["exec",container,"createdb","-U","postgres","--template=template0",db]);
  try {
   sql(`create schema extensions;create extension pgcrypto with schema extensions;create extension pgtap with schema extensions;create extension supabase_vault;
grant usage on schema public,extensions to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on functions to anon,authenticated,service_role;`);
   sql('alter database "'+db+'" set search_path=public,extensions;');
   for(const name of readdirSync(resolve(root,"supabase/migrations")).sort()){
    if(name.endsWith(".sql") && name.slice(0,14)<="20261027000008") file("supabase/migrations/"+name);
   }
   const tap=file("supabase/tests/database/DB34_event_operator_controls_test.sql");
   expect(tap).not.toContain("not ok");
   expect(tap).toContain("1..");
   // Same original synthetic fixtures as DB34; committed only in this owned database.
   const fixture=readFileSync(resolve(root,"supabase/tests/database/DB34_event_operator_controls_test.sql"),"utf8")
    .split("create function pg_temp.op34(")[0].replace("begin;","").replace("select no_plan();","");
   sql(fixture);
   const run="b3400000-0000-4000-8000-000000000008";
   const binding="b3400000-0000-4000-8000-000000000007";
   const provider="b3400000-0000-4000-8000-000000000001";
   const key=sql("select 'v1:request:"+run+":0:'||slice_2c_page_key(id,checkpoint_generation,provider_cursor,provider_etag) from provider_bindings where id='"+binding+"';");
   sql(`insert into provider_rate_budgets(provider_id,scope_key,configured_limit_count,configured_window_seconds,available_count,trusted_reset_at)
values('${provider}','provider',10,60,9,now()+interval '1 hour');
select * from reserve_provider_budget('${run}','synthetic-lease',${quote(key)},1);`);
   const admit="select admit_event_provider_attempt('"+run+"','synthetic-lease',"+quote(key)+");";
   const stop="select event_operator_command('synthetic-operator-credential-34','local',null,'global.stop',0,'Synthetic race','{\"stopped\":true}');";
   const projection="select outcome from project_provider_result('b3400000-0000-4000-8000-000000000099');";
   // Start psql transaction, wait for a marker proving locks were acquired.
   async function hold(source:string) {
    const child=spawn("docker",base,{stdio:"pipe"}); processes.push(child);
    let out="";let err="";
    child.stderr.on("data",d=>err+=d);
    const held=new Promise<void>((yes,no)=>{
     child.stdout.on("data",d=>{out+=d;if(out.includes("BARRIER_HELD"))yes();});
     child.once("exit",code=>{if(!out.includes("BARRIER_HELD"))no(new Error("Barrier failed "+code+err));});
    });
    child.stdin.write("begin;\n"+source+"\n\\echo BARRIER_HELD\n");
    await held;
    return child;
   }
   function worker(source:string) {
    const name="op34-"+randomUUID();
    const child=spawn("docker",base,{stdio:"pipe"});processes.push(child);
    let out="";let err="";
    child.stdout.on("data",d=>out+=d);child.stderr.on("data",d=>err+=d);
    const done=new Promise<string>((yes,no)=>child.once("exit",code=>code===0?yes(out.trim()):no(new Error("worker failed "+err))));
    child.stdin.end("set application_name="+quote(name)+";set role service_role;"+source);
    return {name,done};
   }
   async function blocked(names:string[]) {
    const deadline=Date.now()+15000;
    while(sql("select count(*) from pg_stat_activity where application_name in ("+names.map(quote).join(",")+") and wait_event_type='Lock';")!==String(names.length)){
     if(Date.now()>deadline)throw new Error("workers did not reach observed lock barrier");
     await new Promise(r=>setTimeout(r,15));
    }
   }
   async function release(child:ChildProcessWithoutNullStreams) {
    const done=new Promise<void>((yes,no)=>child.once("exit",code=>code===0?yes():no(new Error("barrier release failed"))));
    child.stdin.end("commit;\n");await done;
   }
   // Stop owns global before both admission and projection. Neither may pass it.
   let blocker=await hold("update event_runtime_control set global_stopped=true where singleton;");
   const a=worker(admit),p=worker(projection);
   await blocked([a.name,p.name]);
   await release(blocker);
   expect(JSON.parse(await a.done).allowed).toBe(false);
   expect(await p.done).toBe("skipped_non_write");
   expect(sql("select count(*) from event_provider_attempts;")).toBe("0");

   // Permit admitted before stop: stop waits and then reports outstanding, not drained.
   sql("update event_runtime_control set global_stopped=false where singleton;");
   blocker=await hold(admit);
   const s=worker(stop);
   await blocked([s.name]);
   await release(blocker);
   const stopped=JSON.parse(await s.done);
   expect(stopped.providerDrained).toBe(false);
   expect(stopped.providerOutstanding).toHaveLength(1);
   const permit=stopped.providerOutstanding[0].permitId;
   expect(sql("set role service_role;select start_event_provider_attempt('"+permit+"','"+run+"','synthetic-lease');")).toBe("f");
   expect(sql("select state from event_provider_attempts where id='"+permit+"';")).toBe("canceled");

   // A separate next-page reservation obtains a fresh, one-use permit.
   sql("update event_runtime_control set global_stopped=false where singleton;update provider_bindings set checkpoint_generation=checkpoint_generation+1 where id='"+binding+"';");
   const nextKey=sql("select 'v1:request:"+run+":0:'||slice_2c_page_key(id,checkpoint_generation,provider_cursor,provider_etag) from provider_bindings where id='"+binding+"';");
   sql("set role service_role;select * from reserve_provider_budget('"+run+"','synthetic-lease',"+quote(nextKey)+",1);");
   const nextPermit=JSON.parse(sql(admit.replace(quote(key),quote(nextKey)))).permitId;
   expect(sql("set role service_role;select start_event_provider_attempt('"+nextPermit+"','"+run+"','synthetic-lease');")).toBe("t");
   expect(sql("set role service_role;select start_event_provider_attempt('"+nextPermit+"','"+run+"','synthetic-lease');")).toBe("f");
   const issuedStop=JSON.parse(sql(stop.replace("'global.stop',0","'global.stop',1")));
   expect(issuedStop.providerOutstanding[0].state).toBe("issued");
   // Lost transport acknowledgement remains uncertain, not canceled by timeout.
   sql("set role service_role;select complete_event_provider_attempt('"+nextPermit+"','"+run+"','synthetic-lease',true);");
   const uncertain=JSON.parse(sql(stop.replace("'global.stop',0","'global.stop',2")));
   expect(uncertain.providerDrained).toBe(false);
   expect(uncertain.providerOutstanding[0].state).toBe("uncertain");
   // Forward repair retains populated data exactly; only control version/stop changes.
   const retained=()=>sql("select jsonb_build_object('audit',(select jsonb_agg(t) from event_operator_audit t),'attempts',(select jsonb_agg(t) from event_provider_attempts t),'credentials',(select jsonb_agg(t) from event_operator_credentials t));");
   const before=retained();
   file("supabase/rollbacks/20261027000008_event_operator_controls_forward_repair.sql");
   file("supabase/rollbacks/20261027000008_event_operator_controls_forward_repair.sql");
   expect(retained()).toBe(before);
   expect(sql("select global_stopped from event_runtime_control;")).toBe("t");
  } finally {
   for(const child of processes) if(child.exitCode===null)child.kill();
   // Only this random DB created above, never reset/copy/drop the shared postgres DB.
   command(["exec",container,"dropdb","-U","postgres","--force",db]);
  }
 },120000);
});
