import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe,it,expect } from "vitest";
import { buildApplicationManifest,initiallyOpen } from "../../lib/events/application-manifest";
import { evaluateLifecycle, type LifecycleCapture } from "../../lib/events/lifecycle";
const q=(v:unknown)=>"'"+String(typeof v==="object"?JSON.stringify(v):v).replaceAll("'","''")+"'";
describe.runIf(process.env.RUN_EVENT_APPLICATION_DB==="1")("full synthetic manifests → actual SQL transition → real scorer",()=>{
 for(const key of ["ucl-2026-27","wwc-2027"])it(key,()=>{
  const manifest=buildApplicationManifest(key,"2035-01-01T00:00:00Z",1,"UTC");
  const tid=randomUUID(),lid=randomUUID(),actor=randomUUID(),pid=randomUUID(),magic=randomUUID();
  const early=manifest.windows.find(w=>initiallyOpen(manifest,w.id))!;
  const next=manifest.windows.find(w=>!initiallyOpen(manifest,w.id))!;
  const maps=new Map<string,string>();let i=0;
  const pairings=Object.fromEntries(manifest.markets.filter(m=>m.windowId===next.id).map(m=>[m.id,m.inputs.map(s=>{
   const k=JSON.stringify(s);if(maps.has(k))return maps.get(k)!;
   const entrant=key==="wwc-2027"&&s.kind==="reviewed-placement"?manifest.entrants.find(e=>e.id.endsWith(":entrant:"+s.placement[0]+"."+s.placement[1]))!.id:manifest.entrants[i++].id;
   maps.set(k,entrant);return entrant;
  })]));
  const picks=Object.fromEntries(manifest.markets.filter(m=>m.windowId===early.id).map(m=>[m.id,"draw"]));
  const late=Object.fromEntries(manifest.markets.filter(m=>m.windowId===next.id).map(m=>[m.id,m.outcomeDomain==="regulation-home-draw-away"?"draw":pairings[m.id][0]]));
  const script=`begin; do $fixture$ declare mid text; snap jsonb; before_picks jsonb; begin
insert into templates(id,name,type) values(${q(tid)},'Synthetic manifest review','bracket');
insert into event_template_configs(template_id,version,sealed,manifest) values(${q(tid)},1,true,${q(manifest)});
insert into leagues(id,name,template_id,organizer_token) values(${q(lid)},'Synthetic review',${q(tid)},${q(actor)});
insert into event_league_evaluations(league_id,configuration_version) values(${q(lid)},1);
${manifest.windows.map(w=>`perform configure_event_window(${q(lid)},${q(w.id)},0,${q(initiallyOpen(manifest,w.id)?"open":"unopened")},${initiallyOpen(manifest,w.id)?"'2035-01-01'":"null"},${initiallyOpen(manifest,w.id)},ARRAY[${manifest.markets.filter(m=>m.windowId===w.id).map(m=>q(m.id)).join(",")}]);`).join("\n")}
insert into participants(id,league_id,display_name,magic_token) values(${q(pid)},${q(lid)},'Synthetic',${q(magic)});
perform submit_event_window(${q(lid)},${q(magic)},${q(early.id)},1,${q(picks)});
select jsonb_agg(to_jsonb(p) order by slot_id) into before_picks from picks p where league_id=${q(lid)};
-- Fixture setup only: DB36 independently exercises the authenticated mutation RPC.
insert into event_lifecycle_revisions(league_id,market_id,revision,outcome,action,reason,actor_fingerprint,idempotency_key,request)
select ${q(lid)},mid,1,'{"kind":"draw"}','override','Synthetic prerequisite',repeat('a',64),'prereq:'||mid,'{}'
from unnest(ARRAY[${next.prerequisiteMarketIds.map(q).join(",")}]) mid;
snap:=capture_event_lifecycle(${q(lid)});
perform review_event_pairings(${q(lid)},${q(actor)},${q(next.id)},1,1,snap->>'basisToken',${q(pairings)},'Explicit synthetic review');
if before_picks is distinct from (select jsonb_agg(to_jsonb(p) order by slot_id) from picks p where league_id=${q(lid)}) then raise exception 'old picks mutated'; end if;
perform configure_event_window(${q(lid)},${q(next.id)},2,'open','2034-01-01',true,ARRAY[${Object.keys(pairings).map(q).join(",")}]);
perform submit_event_window(${q(lid)},${q(magic)},${q(next.id)},3,${q(late)});
perform configure_event_window(${q(lid)},${q(early.id)},2,'open',clock_timestamp(),true,ARRAY[${Object.keys(picks).map(q).join(",")}]);
perform configure_event_window(${q(lid)},${q(next.id)},3,'open',clock_timestamp(),true,ARRAY[${Object.keys(pairings).map(q).join(",")}]);
perform advance_event_windows(${q(lid)});
end $fixture$;
select capture_event_lifecycle(${q(lid)}); rollback;`;
  const output=execFileSync("docker",["exec","-i","supabase_db_bracket-fyi","psql","-X","-U","postgres","-d","postgres","-Atq","-v","ON_ERROR_STOP=1"],{input:script,encoding:"utf8",timeout:120000,maxBuffer:8*1024*1024,stdio:["pipe","pipe","pipe"]}).trim();
  const capture=JSON.parse(output) as LifecycleCapture;
  expect(capture.basis.configurationVersion).toBe(2);
  const board=evaluateLifecycle(capture);
  expect(board[0].earned).toBe(Object.keys(picks).length);
  expect(board[0].wrong).toBe(0);
 },150000);
});
