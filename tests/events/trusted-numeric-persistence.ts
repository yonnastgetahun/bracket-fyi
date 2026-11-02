import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixtureDatabase, quote as q } from "../../scripts/browser/fixture-sql";
import { createLifecycleRepository } from "../../lib/events/lifecycle-repository";
import { reconcileEventLifecycle } from "../../lib/events/lifecycle";
import { readApplication } from "../../lib/events/application";
import { playInFixture,eliminatedFixture,uclFixture,wwcFixture,type NumericFixture,type NumericPhase,type OracleRow } from "./trusted-numeric-fixture";

export interface NumericCheckpoint {name:string;leagueId:string;state:string;expected:readonly OracleRow[];pending?:number[]}
export function numericTarget(env:Record<string,string|undefined>) {
 const database=env.BRACKET_NUMERIC_DATABASE,container=env.BRACKET_NUMERIC_CONTAINER;
 assert(database&&/^bracket_(numeric|http)_[a-f0-9]{12}$/.test(database),"Explicit owned numeric or HTTP database required");
 assert.equal(env.BRACKET_NUMERIC_DISPOSABLE,database,"Matching disposable acknowledgment required");
 assert(container==="supabase_db_bracket-fyi"||!!container&&/^bracket-p11-db-[a-f0-9]{12}$/.test(container),"Explicit local container required");
 return {database,container};
}
/** Real SQL only when explicitly called by runtime owner. No DB creation, Docker
 * startup, server startup, browser launch, .env loading, provider or send path.
 * Fixtures seed historical picks directly; this is not a submission-journey proof.
 */
export async function runNumericPersistence(env:Record<string,string|undefined>,onCheckpoint?:(c:NumericCheckpoint)=>Promise<void>) {
 const {database,container}=numericTarget(env),{sql,client}=fixtureDatabase(database,container);
 assert.equal(sql("select current_database();"),database);
 assert.equal(sql("select global_stopped and not notifications_enabled and not real_sends_enabled from event_runtime_control where singleton;"),"t");
 assert.equal(sql("select count(*) from provider_bindings;"),"0");
 assert.equal(sql("select count(*) from notification_attempts where disposition in ('authorized','issued','uncertain');"),"0");
 const life=createLifecycleRepository(client),checks:NumericCheckpoint[]=[];
 // Build one family at a time; retain at most one full WWC domain in memory.
 const builders=[playInFixture,eliminatedFixture,()=>uclFixture(),()=>uclFixture(true),()=>wwcFixture(),()=>wwcFixture(true)];
 for(const build of builders) {
  const f=build(),tid=randomUUID();
  assert(Buffer.byteLength(JSON.stringify(f.manifest))<24*1024*1024,"Fixture exceeds bounded SQL JSON budget");
  // COPY avoids SQL parser copies of the exhaustive JSON literal. The complete
  // manifest still enters the same jsonb column and is checked by capture below.
  const copyManifest=JSON.stringify(f.manifest).replaceAll("\\","\\\\").replaceAll("\t","\\t").replaceAll("\n","\\n").replaceAll("\r","\\r");
  sql("begin;insert into templates(id,name,type) values("+q(tid)+",'Trusted numeric synthetic','bracket');\n"+
   "COPY event_template_configs(template_id,version,sealed,manifest) FROM STDIN;\n"+
   tid+"\t1\tt\t"+copyManifest+"\n\\.\ncommit;");
  let room:ReturnType<typeof seedRoom>|undefined,previous:NumericPhase|undefined;
  function seedRoom(f:NumericFixture,p:NumericPhase) {
   const id=randomUUID(),organizer=randomUUID(),people=Object.fromEntries(Object.keys(p.picks).map(name=>[name,randomUUID()]));
   sql("begin;insert into leagues(id,name,template_id,organizer_token,join_token,status,scoring_config) values("+
    [q(id),q("Trusted numeric "+f.name),q(tid),q(organizer),q(randomUUID()),"'active'",q({type:"pickem",points_per_correct:1})].join(",")+");"+
    "insert into event_league_evaluations(league_id,configuration_version) values("+q(id)+",1);"+
    f.manifest.windows.map(w=>"insert into event_league_windows(league_id,window_key,state,market_ids) values("+q(id)+","+q(w.id)+",'unopened',ARRAY["+f.manifest.markets.filter(m=>m.windowId===w.id).map(m=>q(m.id)).join(",")+"]::text[]);").join("")+
    Object.entries(people).map(([name,pid])=>"insert into participants(id,league_id,display_name) values("+q(pid)+","+q(id)+","+q(name)+");"+
     Object.entries(p.picks[name]).map(([market,choice])=>"insert into picks(league_id,participant_id,slot_id,team_id,locked,event_configuration_version) values("+[q(id),q(pid),q(market),q(choice),"true","1"].join(",")+");").join("")).join("")+
    Object.entries(p.windows).filter(([,state])=>state==="locked").map(([key])=>"update event_league_windows set state='locked',cutoff='2099-01-01',pairings_reviewed=true where league_id="+q(id)+" and window_key="+q(key)+";").join("")+
    "update leagues set status='locked',locked_at=clock_timestamp() where id="+q(id)+";commit;");
   return {id,organizer,people};
  }
  let savedPicks="";
  for(const p of f.phases) {
   const same=previous&&JSON.stringify(previous.picks)===JSON.stringify(p.picks)&&JSON.stringify(previous.windows)===JSON.stringify(p.windows);
   if(!room||!same){room=seedRoom(f,p);previous=undefined;savedPicks=sql("select jsonb_agg(to_jsonb(p) order by participant_id,slot_id) from picks p where league_id="+q(room.id));}
   // Read actual persisted manifest and picks through the production capture RPC.
   const captured=await life.capture(room.id);
   assert.deepEqual(captured.basis.manifest.lifecycle,f.manifest.lifecycle);
   for(const [market,outcome] of Object.entries(p.outcomes)) {
    if(previous&&JSON.stringify(previous.outcomes[market])===JSON.stringify(outcome))continue;
    await life.mutate(room.id,room.organizer,{action:"override",marketId:market,payload:{outcome},
     reason:"Original synthetic numeric oracle "+p.name,expectedEffectiveToken:captured.basis.effective[market].effectiveToken,idempotencyKey:randomUUID()});
   }
   const result=await reconcileEventLifecycle(life,room.id);
   assert.equal(result.state,p.state);
   // Fresh repository instance: assertions cannot accidentally use worker memory.
   const durable=await createLifecycleRepository(client).read(room.id);
   const names=new Map<string,string>(Object.entries(room.people).map(([name,id])=>[id,name]));
   const rows=durable.leaderboard.map(r=>[names.get(r.id),r.earned,r.maximum,r.wrong,r.rank]);
   const byName=(a:unknown[],b:unknown[])=>String(a[0]).localeCompare(String(b[0]));
   assert.deepEqual(rows.sort(byName),p.expected.map(r=>[...r]).sort(byName),f.name+"/"+p.name);
   if(p.pending)assert.deepEqual(durable.leaderboard.map(r=>r.pending),p.pending);
   assert.equal(durable.state,p.state);
   assert.equal((await reconcileEventLifecycle(life,room.id)).replayed,true);
   assert.equal(sql("select jsonb_agg(to_jsonb(p) order by participant_id,slot_id) from picks p where league_id="+q(room.id)),savedPicks,"Results must not rewrite saved picks");
   assert.equal(sql("select count(*) from event_lifecycle_audit where league_id="+q(room.id)+" and kind='coronation';"),p.state==="complete"||f.name==="play-in"&&["invalidated","recomplete"].includes(p.name)?"1":"0");
   // The real application DTO must preserve numeric maxima and null separately.
   const application=await readApplication(client,room.id);
   assert.deepEqual(application.view.leaderboard,durable.leaderboard);
   assert.equal(application.organizer,false);
   const checkpoint={name:f.name+"/"+p.name,leagueId:room.id,state:p.state,expected:p.expected,...(p.pending?{pending:p.pending}:{})};
   if(onCheckpoint)await onCheckpoint(checkpoint);
   checks.push(checkpoint);previous=p;
  }
 }
 return {schemaVersion:1,synthetic:true,database,sqlExecuted:true,checkpointHookExecuted:Boolean(onCheckpoint),checks};
}
