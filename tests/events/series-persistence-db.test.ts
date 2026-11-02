import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe,it,expect } from "vitest";
import { sql,quote as q,dbAdapter } from "./series-db-harness";
import { createSeriesRepository } from "../../lib/events/series-repository";
import { createLifecycleRepository } from "../../lib/events/lifecycle-repository";
import { createEventRepository } from "../../lib/events/repository";
import { readApplication,submitApplicationPicks,changeApplicationWindow } from "../../lib/events/application";
import { buildApplicationManifest } from "../../lib/events/application-manifest";

function fixture(bestOf:3|5|7) {
 const org=randomUUID(),competition=randomUUID(),edition=randomUUID(),stage=randomUUID(),parent=randomUUID();
 const entrants=[randomUUID(),randomUUID()],competitors=[randomUUID(),randomUUID()],games=Array.from({length:bestOf+1},()=>randomUUID());
 const principal=randomUUID(),credential="synthetic-series-"+randomUUID(),template=randomUUID(),league=randomUUID(),organizer=randomUUID(),invite=randomUUID();
 const base=buildApplicationManifest("mlb-2027",new Date(Date.now()+86400000).toISOString(),1,"UTC");
 const inputs=entrants.map(entrantId=>({kind:"entrant" as const,entrantId}));
 const market={...base.markets[0],id:"series",windowId:"bracket",inputs,choices:entrants,entrants:entrants.map(id=>({id,name:id})),contestId:parent,
  series:{id:parent,membershipVersion:1,bestOf,winsRequired:(bestOf+1)/2,stopAtClinch:true}};
 const manifest={...base,markets:[market],entrants:market.entrants,windows:[{...base.windows[0],id:"bracket"}],edges:[],championMarketId:null,
 lifecycle:{binding:{reviewed:true,graphVersion:1,markets:[{marketId:"series",inputs,eligibleEntrantIds:entrants,orientation:entrants}]},components:[]}};
 sql(`begin;
 update event_runtime_control set global_stopped=false;
 insert into organizations(id,organization_key,name,kind) values(${q(org)},${q(org)},'Synthetic series','governing_body');
 insert into competitions(id,organization_id,competition_key,name,domain) values(${q(competition)},${q(org)},${q(competition)},'Synthetic series','sport');
 insert into event_editions(id,competition_id,edition_key,name,season_label) values(${q(edition)},${q(competition)},'synthetic','Synthetic series','2027');
 insert into stages(id,event_edition_id,stage_key,name,kind,ordinal) values(${q(stage)},${q(edition)},'series','Series','knockout',1);
 insert into contests(id,event_edition_id,stage_id,contest_key,name,kind,best_of) values(${q(parent)},${q(edition)},${q(stage)},'parent','Series','series',${bestOf});
 ${games.map((id,i)=>`insert into contests(id,event_edition_id,stage_id,parent_contest_id,contest_key,name,kind) values(${q(id)},${q(edition)},${q(stage)},${q(parent)},'game-${i}','Game','game');`).join("\n")}
 ${entrants.map((id,i)=>`insert into competitors(id,competitor_key,kind,canonical_name) values(${q(competitors[i])},${q(competitors[i])},'team','Synthetic');
 insert into event_entries(id,event_edition_id,competitor_id,role) values(${q(id)},${q(edition)},${q(competitors[i])},'team');
 insert into contest_entries(event_edition_id,contest_id,event_entry_id,role,ordinal) select ${q(edition)},unnest(ARRAY[${[parent,...games].map(q).join(",")}]::uuid[]),${q(id)},'competitor',${i+1};`).join("\n")}
 insert into event_operator_principals(id) values(${q(principal)});
 insert into event_operator_credentials(credential_hash,principal_id,expires_at) values(encode(extensions.digest(${q(credential)},'sha256'),'hex'),${q(principal)},'infinity');
 insert into event_operator_grants(principal_id,environment,event_edition_id,action) values(${q(principal)},'local',${q(edition)},'manifest.review'),(${q(principal)},'local',${q(edition)},'result.record');
 insert into templates(id,name,type,event_edition_id) values(${q(template)},'Synthetic series','bracket',${q(edition)});
 insert into event_template_configs(template_id,version,sealed,manifest) values(${q(template)},1,true,${q(manifest)});
 insert into leagues(id,name,template_id,organizer_token,join_token) values(${q(league)},'Synthetic series',${q(template)},${q(organizer)},${q(invite)});
 insert into event_league_evaluations(league_id,configuration_version) values(${q(league)},1);
 select configure_event_window(${q(league)},'bracket',0,'open',clock_timestamp()+interval '1 day',true,ARRAY['series']);
 commit;`,true);
 const children=games.slice(0,bestOf).map(id=>({id}));
 const result=(game:number,winner:string|null)=>sql(`select event_operator_command(${q(credential)},'local',${q(edition)},'result.record',
 (select coalesce(max(version),0) from contest_results where contest_id=${q(games[game])}), 'Synthetic child correction',
 ${q({contestId:games[game],status:winner?'final':'pending',outcome:winner?'winner':'pending',winnerEntryId:winner,winningNominationIds:[]})});`);

 return {edition,parent,entrants,games,children,credential,league,organizer,invite,result};
}

function connection() {
 const database=process.env.BRACKET_SERIES_TEST_DATABASE;
 if(!database || !/^bracket_series_[a-f0-9]{12}$/.test(database))throw Error("Owned database required");
 const child=spawn("docker",["exec","-i","supabase_db_bracket-fyi","psql","-X","-U","postgres","-d",database,"-Atq","-v","ON_ERROR_STOP=1"],{stdio:["pipe","pipe","pipe"]});
 let buffer="",failure="";
 let pending:{marker:string;resolve:(s:string)=>void;reject:(e:Error)=>void}|null=null;
 child.stdout.on("data",chunk=>{buffer+=String(chunk);if(pending&&buffer.includes(pending.marker)){const job=pending;pending=null;const output=buffer;buffer="";job.resolve(output);}});
 child.stderr.on("data",chunk=>{failure+=String(chunk);});
 child.on("close",code=>{pending?.reject(Error("Database connection ended: "+code+" "+failure));});
 return {async send(statement:string){
  if(pending)throw Error("Concurrent commands on one connection");
  const marker="barrier-"+randomUUID();
  return new Promise<string>((resolve,reject)=>{pending={marker,resolve,reject};child.stdin.write(statement+";select '"+marker+"';\n");});
 },close(){child.stdin.end();}};
}

describe.runIf(!!process.env.BRACKET_SERIES_TEST_DATABASE)("persisted series → application lifecycle",()=>{
 for(const bestOf of [3,5,7] as const)it(`best of ${bestOf}: clinch ${(bestOf+1)/2}, unused games, correction retract/recomplete`,async()=>{
  const f=fixture(bestOf),db=dbAdapter(),repo=createSeriesRepository(db),life=createLifecycleRepository(db);
  await expect(repo.review(f.organizer,f.parent,0,f.children,"No organizer escalation")).rejects.toMatchObject({code:"unauthorized"});
  expect(await repo.review(f.credential,f.parent,0,f.children,"Reviewed synthetic membership")).toMatchObject({version:1,status:"adopted"});
  const player=await createEventRepository(db).join(f.league,f.invite,"Series player");
  await submitApplicationPicks(db,f.league,player.credential,{windowId:"bracket",version:1,picks:{series:f.entrants[0]}});
  await changeApplicationWindow(db,f.league,f.organizer,{windowId:"bracket",version:1,operation:"lock"});
  const saved=sql(`select jsonb_agg(to_jsonb(p)) from picks p where league_id=${q(f.league)}`);
  const threshold=(bestOf+1)/2;
  for(let i=0;i<threshold-1;i++)f.result(i,f.entrants[0]);
  let state=await readApplication(db,f.league,{organizer:f.organizer});
  expect(state.view.state).toBe("locked");expect(state.view.leaderboard[0].earned).toBe(0);
  f.result(threshold-1,f.entrants[0]);
  // Child commit itself updates the parent and durable fanout, before a worker can run.
  expect((await life.capture(f.league)).basis.effective.series.outcome).toEqual({kind:"winner",entrant:f.entrants[0]});
  expect((await life.read(f.league)).state).toBe("reconciliation-pending");
  expect(await repo.reconcile(f.parent)).toMatchObject({replayed:true});
  state=await readApplication(db,f.league,{organizer:f.organizer});
  expect(state.view.state).toBe("complete");expect(state.view.leaderboard[0]).toMatchObject({earned:1,maximum:1,rank:1});
  expect(state.view.effective.series.derivedProvenance.children).toHaveLength(threshold);
  // Same winner with a newer child version changes provenance, not lifecycle state.
  f.result(0,f.entrants[0]);
  expect((await readApplication(db,f.league,{organizer:f.organizer})).view.state).toBe("complete");
  f.result(threshold-1,null);
  state=await readApplication(db,f.league,{organizer:f.organizer});
  expect(state.view.state).toBe("locked");expect(state.view.leaderboard[0].earned).toBe(0);
  f.result(threshold-1,f.entrants[0]);
  state=await readApplication(db,f.league,{organizer:f.organizer});expect(state.view.state).toBe("complete");
  expect(sql(`select count(*) from event_lifecycle_audit where league_id=${q(f.league)} and kind='coronation'`)).toBe("1");
  expect(sql(`select jsonb_agg(to_jsonb(p)) from picks p where league_id=${q(f.league)}`)).toBe(saved);
  expect(sql(`select count(*) from contest_results where contest_id=any(ARRAY[${f.games.slice(threshold).map(q).join(",")}]::uuid[])`)).toBe("0");
 },120000);
 it("same-ID resume is one win; reviewed replacement excludes old evidence; ambiguity holds",async()=>{
  const f=fixture(3),db=dbAdapter(),repo=createSeriesRepository(db);
  await repo.review(f.credential,f.parent,0,f.children,"Original membership");
  f.result(0,null);f.result(0,f.entrants[0]);f.result(0,f.entrants[0]);
  expect((await createLifecycleRepository(db).capture(f.league)).basis.effective.series.outcome.kind).toBe("unresolved");
  await expect(repo.review(f.credential,f.parent,1,[f.children[0],f.children[0]],"Duplicate")).rejects.toMatchObject({code:"invalid"});
  f.result(1,f.entrants[0]);
  const stale=JSON.parse(sql(`select capture_event_series(${q(f.parent)})`));
  const replacement=[{id:f.games[3],replaces:f.games[0]},...f.children.slice(1)];
  expect(await repo.review(f.credential,f.parent,1,replacement,"Explicit replacement association")).toMatchObject({version:2,status:"adopted"});
  let captured=await createLifecycleRepository(db).capture(f.league);expect(captured.basis.effective.series.outcome.kind).toBe("unresolved");
  expect(await repo.review(f.credential,f.parent,2,replacement,"Replay")).toMatchObject({version:2,replayed:true});
  const rejected=await db.rpc("commit_event_series",{p_parent:f.parent,p_basis:stale.basisToken,p_outcome:{kind:"winner",entrant:f.entrants[0]}});
  expect(rejected.error?.code).toBe("PT409");
  f.result(3,f.entrants[0]);
  expect(await repo.review(f.credential,f.parent,2,f.children,"Unassociated cross-ID change")).toMatchObject({status:"held",version:3});
  expect(await repo.review(f.credential,f.parent,3,f.children,"Ambiguity cannot be laundered by retry")).toMatchObject({status:"held",version:3,replayed:true});
  captured=await createLifecycleRepository(db).capture(f.league);
  expect(captured.basis.effective.series.held).toBe(true);expect(captured.basis.effective.series.outcome.kind).toBe("unresolved");
  expect((await readApplication(db,f.league,{organizer:f.organizer})).view.state).toBe("held");
 },120000);
 it("contradictory authoritative parent cannot bypass reviewed child derivation",async()=>{
  const f=fixture(3),db=dbAdapter(),repo=createSeriesRepository(db);
  await repo.review(f.credential,f.parent,0,f.children,"Reviewed children");
  f.result(0,f.entrants[0]);f.result(1,f.entrants[0]);
  const response=await db.rpc("event_operator_command",{p_credential:f.credential,p_environment:"local",p_event_id:f.edition,
   p_action:"result.record",p_expected_version:Number(sql(`select max(version) from contest_results where contest_id=${q(f.parent)}`)),
   p_reason:"Conflicting synthetic authoritative winner",p_payload:{contestId:f.parent,status:"final",outcome:"winner",winnerEntryId:f.entrants[1],winningNominationIds:[]}});
  expect(response.error).toBeNull();
  const view=await readApplication(db,f.league,{organizer:f.organizer});
  expect(view.view.state).toBe("held");expect(view.view.effective.series.outcome.kind).toBe("unresolved");
 },120000);

 it("retired replacement cannot be appended to count the same fixture twice",async()=>{
  const f=fixture(3),db=dbAdapter(),repo=createSeriesRepository(db);
  await repo.review(f.credential,f.parent,0,f.children.slice(0,2),"Partial schedule");
  const replaced=[{id:f.games[3],replaces:f.games[0]},f.children[1]];
  await repo.review(f.credential,f.parent,1,replaced,"Reviewed replacement");
  f.result(0,f.entrants[0]);f.result(3,f.entrants[0]);
  expect(await repo.review(f.credential,f.parent,2,[...replaced,f.children[0]],"Retired fixture re-added")).toMatchObject({status:"held"});
  expect((await createLifecycleRepository(db).capture(f.league)).basis.effective.series.outcome.kind).toBe("unresolved");
 },120000);
 it("masked canonical ambiguity changes provenance but not an active override token",async()=>{
  const f=fixture(3),db=dbAdapter(),repo=createSeriesRepository(db),life=createLifecycleRepository(db);
  await repo.review(f.credential,f.parent,0,f.children,"Reviewed membership");
  let snap=await life.capture(f.league);
  await life.mutate(f.league,f.organizer,{action:"override",marketId:"series",payload:{outcome:{kind:"winner",entrant:f.entrants[1]}},
   expectedEffectiveToken:snap.basis.effective.series.effectiveToken,reason:"Independent local outcome",idempotencyKey:randomUUID()});
  snap=await life.capture(f.league);
  await repo.review(f.credential,f.parent,1,[{id:f.games[3]},...f.children.slice(1)],"Ambiguous shared replacement");
  const changed=await life.capture(f.league);
  expect(changed.basis.effective.series.effectiveToken).toBe(snap.basis.effective.series.effectiveToken);
  expect(changed.basis.effective.series.provenanceToken).not.toBe(snap.basis.effective.series.provenanceToken);
  expect(changed.basis.effective.series.held).toBe(false);
 },120000);

 it("first review and concurrent child projection serialize before atomic clinch",async()=>{
  const f=fixture(3),db=dbAdapter(),reviewer=connection(),writer=connection(),name="series-race-"+randomUUID();
  f.result(0,f.entrants[0]);
  let writing:Promise<string>|undefined;
  try{
   await reviewer.send("begin");
   await reviewer.send(`select review_event_series(${q(f.credential)},${q(f.parent)},0,${q(f.children)},'First review barrier')`);
   await writer.send(`set application_name=${q(name)};set lock_timeout='10s'`);
   writing=writer.send(`insert into contest_results(contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,source_type,idempotency_key)
    values(${q(f.games[1])},${q(f.edition)},1,'final','winner',${q(f.entrants[0])},'operator',${q(randomUUID())})`);
   let blocked=false;
   for(let attempt=0;attempt<20&&!blocked;attempt++)blocked=sql(`select exists(select 1 from pg_stat_activity where application_name=${q(name)} and cardinality(pg_blocking_pids(pid))>0)`,true)==="t";
   expect(blocked,"child must block on first uncommitted membership, not skip invisible review").toBe(true);
   await reviewer.send("commit");await writing;
   expect((await createLifecycleRepository(db).capture(f.league)).basis.effective.series.outcome).toEqual({kind:"winner",entrant:f.entrants[0]});
  }finally{
   await reviewer.send("rollback").catch(()=>{});await writing?.catch(()=>{});reviewer.close();writer.close();
  }
 },120000);

});
