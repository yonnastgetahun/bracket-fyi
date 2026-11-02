import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe,it,expect } from "vitest";
import { buildApplicationManifest,initiallyOpen,type ApplicationManifest } from "../../lib/events/application-manifest";
import type { SlotSource } from "../../lib/events/catalog";
import { evaluateLifecycle,type LifecycleCapture } from "../../lib/events/lifecycle";

const q=(v:unknown)=>"'"+String(typeof v==="object"?JSON.stringify(v):v).replaceAll("'","''")+"'";
function database(sql:string):string {
 const name=process.env.BRACKET_SERIES_TEST_DATABASE;
 if(!name || !/^bracket_series_[a-zA-Z0-9_]+$/.test(name))throw Error("BRACKET_SERIES_TEST_DATABASE must start bracket_series_; postgres forbidden");
 return execFileSync("docker",["exec","-i","supabase_db_bracket-fyi","psql","-X","-U","postgres","-d",name,"-Atq","-v","ON_ERROR_STOP=1"],{input:sql,encoding:"utf8",timeout:120000,maxBuffer:16*1024*1024,stdio:["pipe","pipe","pipe"]}).trim();
}
function fixture(m:ApplicationManifest,lid:string,tid:string,actor:string) {
 return `insert into templates(id,name,type) values(${q(tid)},'Synthetic structural qualification','bracket');
 insert into event_template_configs(template_id,version,sealed,manifest) values(${q(tid)},1,true,${q(m)});
 insert into leagues(id,name,template_id,organizer_token) values(${q(lid)},'Synthetic structural qualification',${q(tid)},${q(actor)});
 insert into event_league_evaluations(league_id,configuration_version) values(${q(lid)},1);
 ${m.windows.map(w=>`perform configure_event_window(${q(lid)},${q(w.id)},0,${q(initiallyOpen(m,w.id)?"open":"unopened")},'2035-01-01',${initiallyOpen(m,w.id)},ARRAY[${m.markets.filter(x=>x.windowId===w.id).map(x=>q(x.id)).join(",")}]);`).join("\n")}`;
}
function result(lid:string,mid:string,winner:string,revision:number) {
 return `insert into event_lifecycle_revisions(league_id,market_id,revision,outcome,action,reason,actor_fingerprint,idempotency_key,request)
 values(${q(lid)},${q(mid)},${revision},${q({kind:"winner",entrant:winner})},'override','Synthetic actual qualification',repeat('a',64),${q(mid+":"+revision)},'{}');`;
}

describe.runIf(process.env.RUN_STRUCTURAL_QUALIFIERS_DB==="1")("synthetic actual qualification SQL boundary",()=>{
 for(const key of ["ncaa-men-2027","nba-2027"])it(key+" replay, correction, cutoff hold and immutable predictions",()=>{
  const m=buildApplicationManifest(key,"2035-01-01T00:00:00Z",1,"UTC");
  const nba=key==="nba-2027";
  const src=nba?buildApplicationManifest("nba-play-in-2027","2035-01-01T00:00:00Z",1,"UTC"):m;
  const lid=randomUUID(),tid=randomUUID(),actor=randomUUID(),source=nba?randomUUID():lid,sourceTid=randomUUID(),sourceActor=nba?randomUUID():actor;
  const pid=randomUUID(),magic=randomUUID(),sourcePid=randomUUID(),sourceMagic=randomUUID();
  const scoredWindow=m.markets.find(x=>x.scored)!.windowId;
  const actual:Record<string,string>={};
  for(const market of src.markets.filter(x=>nba || !x.scored)){
   const direct=market.inputs[0];
   actual[market.id]=direct.kind==="entrant"?direct.entrantId:
    src.entrants.find(e=>e.group===(market.id.includes(":east.")?"east":"west") && e.seed===9)!.id;
  }
  const qualifiers:Record<string,string>=nba?Object.fromEntries(["east","west"].flatMap(c=>[
   [c+":7",actual["synthetic-nba-play-in-2027:market:"+c+".seven-eight"]],
   [c+":8",actual["synthetic-nba-play-in-2027:market:"+c+".eighth-seed-decider"]],
  ])):actual;
  const picks:Record<string,string>={};
  function pickSource(s:SlotSource):string {
   if(s.kind==="entrant")return s.entrantId;
   if(s.kind==="reviewed-placement")return qualifiers[s.placement];
   if(s.kind==="winner")return actual[s.marketId]??pickMarket(s.marketId);
   throw Error("Unexpected fixture source");
  }
  function pickMarket(mid:string):string {
   if(picks[mid])return picks[mid];
   const market=m.markets.find(x=>x.id===mid)!;
   return picks[mid]=pickSource(market.inputs[market.inputs.length-1]);
  }
  m.markets.filter(x=>x.scored).forEach(x=>pickMarket(x.id));
  const correction=src.markets.find(x=>nba?x.id.endsWith("east.seven-eight"):!x.scored)!;
  const alternate=correction.inputs[1];
  if(alternate.kind!=="entrant")throw Error("fixture");
  const review=(key:string,version:number,basis="snap->>'basisToken'",sourceBasis="source_snap->>'basisToken'")=>
   `review_event_structural_qualifiers(${q(lid)},${q(actor)},${version},${basis},${q(key)},'Synthetic reviewed actual qualification',${nba?q(source):"null"},${nba?q(sourceActor):"null"},${nba?sourceBasis:"null"})`;
  const sql=`begin; create temporary table structural_test_capture(capture jsonb) on commit drop; do $fixture$ declare snap jsonb; source_snap jsonb; first_basis text; first_source_basis text; first_result jsonb; before_picks jsonb; before_source jsonb; held_cfg jsonb; r jsonb; begin
 ${fixture(m,lid,tid,actor)}
 ${nba?fixture(src,source,sourceTid,sourceActor):""}
 ${Object.entries(actual).map(([mid,winner])=>result(source,mid,winner,1)).join("\n")}
 ${nba?`insert into participants(id,league_id,display_name,magic_token) values(${q(sourcePid)},${q(source)},'Separate Play-In entry',${q(sourceMagic)});
 perform submit_event_window(${q(source)},${q(sourceMagic)},${q(src.windows[0].id)},1,${q(actual)});
 select jsonb_agg(to_jsonb(p) order by slot_id) into before_source from picks p where league_id=${q(source)};`:""}
 snap:=capture_event_lifecycle(${q(lid)}); source_snap:=capture_event_lifecycle(${q(source)});
 first_basis:=snap->>'basisToken'; first_source_basis:=source_snap->>'basisToken';
 begin
  perform review_event_structural_qualifiers(${q(lid)},'00000000-0000-4000-8000-000000000001',1,first_basis,'unauthorized','Synthetic review');
  raise exception 'invalid credential accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform ${review("stale",99)};
  raise exception 'stale configuration accepted';
 exception when sqlstate 'PT409' then null; end;
 first_result:=${review("initial",1)};
 if first_result->>'status'<>'adopted' then raise exception 'not adopted'; end if;
 if ${review("initial",1,"first_basis","first_source_basis")} is distinct from first_result then raise exception 'replay changed'; end if;
 begin
  perform ${review("initial",2,"first_basis","first_source_basis")};
  raise exception 'conflicting idempotency key accepted';
 exception when sqlstate 'PT409' then null; end;
 snap:=capture_event_lifecycle(${q(lid)}); source_snap:=capture_event_lifecycle(${q(source)});
 r:=${review("unchanged",2)};
 if r->>'status'<>'unchanged' then raise exception 'same qualifiers churned'; end if;
 insert into participants(id,league_id,display_name,magic_token) values(${q(pid)},${q(lid)},'Synthetic prediction',${q(magic)});
 perform configure_event_window(${q(lid)},${q(scoredWindow)},2,'open','2035-01-01',true,ARRAY[${m.markets.filter(x=>x.scored).map(x=>q(x.id)).join(",")}]);
 perform submit_event_window(${q(lid)},${q(magic)},${q(scoredWindow)},3,${q(picks)});
 select jsonb_agg(to_jsonb(p) order by slot_id) into before_picks from picks p where league_id=${q(lid)};
 ${result(source,correction.id,alternate.entrantId,2)}
 snap:=capture_event_lifecycle(${q(lid)}); source_snap:=capture_event_lifecycle(${q(source)});
 r:=${review("correction",2)};
 if r->>'status'<>'adopted' or r->>'configurationVersion'<>'3' then raise exception 'prelock correction not adopted'; end if;
 insert into structural_test_capture values(capture_event_lifecycle(${q(lid)}));
 if before_picks is distinct from (select jsonb_agg(to_jsonb(p) order by slot_id) from picks p where league_id=${q(lid)}) then raise exception 'predictions rewritten'; end if;
 ${nba?`if (select count(*) from participants where league_id=${q(source)})<>1 or (select count(*) from participants where league_id=${q(lid)})<>1 then raise exception 'entry transfer'; end if;
 if before_source is distinct from (select jsonb_agg(to_jsonb(p) order by slot_id) from picks p where league_id=${q(source)}) then raise exception 'source picks changed'; end if;
 if exists(select 1 from picks where league_id=${q(lid)} and slot_id like 'synthetic-nba-play-in%') then raise exception 'source picks transferred'; end if;
 if (select leaderboard from event_league_evaluations where league_id=${q(lid)})<>'[]'::jsonb then raise exception 'source points transferred'; end if;`:""}
 perform configure_event_window(${q(lid)},${q(scoredWindow)},4,'open',clock_timestamp(),true,ARRAY[${m.markets.filter(x=>x.scored).map(x=>q(x.id)).join(",")}]);
 -- Deliberately do not advance windows: expired cutoff alone must enforce the hold.
 select manifest into held_cfg from event_template_configs where template_id=${q(tid)} and version=3;
 ${result(source,correction.id,actual[correction.id],3)}
 snap:=capture_event_lifecycle(${q(lid)}); source_snap:=capture_event_lifecycle(${q(source)});
 r:=${review("postlock",3)};
 if r->>'status'<>'held' then raise exception 'postlock correction not held'; end if;
 if not (select frozen from event_league_evaluations where league_id=${q(lid)}) then raise exception 'not frozen'; end if;
 if held_cfg is distinct from (select manifest from event_template_configs where template_id=${q(tid)} and version=3) then raise exception 'locked configuration rewritten'; end if;
 if before_picks is distinct from (select jsonb_agg(to_jsonb(p) order by slot_id) from picks p where league_id=${q(lid)}) then raise exception 'locked picks rewritten'; end if;
 if exists(select 1 from jsonb_each(event_lifecycle_effective(${q(lid)},clock_timestamp())) x where x.key in (select value->>'id' from jsonb_array_elements(held_cfg->'markets') where value->>'scored'='true') and not (x.value->>'held')::boolean) then raise exception 'affected market not held'; end if;
 end $fixture$;
 select jsonb_build_object('prelock',(select capture from structural_test_capture),'held',capture_event_lifecycle(${q(lid)})); rollback;`;
  const output=database(sql);
  const evidence=JSON.parse(output) as {prelock:LifecycleCapture;held:LifecycleCapture};
  const board=evaluateLifecycle(evidence.prelock);
  expect(board).toHaveLength(1);
  expect(board[0].earned).toBe(0);
  const capture=evidence.held;
  expect(capture.basis.configurationVersion).toBe(3);
  expect(capture.basis.frozen).toBe(true);
  expect(capture.basis.participants[0].picks).toEqual(picks);
  // A frozen pending correction intentionally does not claim a ready board.
  expect(capture.basis.manifest.markets.filter(x=>x.scored)).toHaveLength(nba?15:63);
 },150000);
});
