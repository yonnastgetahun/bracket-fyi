-- Final schema expects PT409; historical-prefix runners explicitly set bracket.test_business_sqlstate.
begin;
select no_plan();
insert into templates(id,name,type) values('b3600000-0000-4000-8000-000000000001','Synthetic DB36','bracket');
insert into event_template_configs(template_id,version,sealed,manifest) values('b3600000-0000-4000-8000-000000000001',1,true,
'{"editionKey":"ucl-2026-27","lockMode":"per-window","application":{"label":"Synthetic local rehearsal — not official fixtures"},
"windows":[{"id":"early","prerequisiteMarketIds":[]},{"id":"later","prerequisiteMarketIds":["e"]}],
"markets":[{"id":"e","windowId":"early","choices":["home","draw","away"],"scored":true,"outcomeDomain":"regulation-home-draw-away","inputs":[{"kind":"entrant","entrantId":"A"},{"kind":"entrant","entrantId":"B"}]},
{"id":"m","windowId":"later","choices":["A","B","C"],"scored":true,"outcomeDomain":"aggregate-qualifier","inputs":[{"kind":"reviewed-placement","placement":"one","marketIds":["e"]},{"kind":"reviewed-placement","placement":"two","marketIds":["e"]}]}],
"lifecycle":{"binding":{"reviewed":true,"graphVersion":1,"markets":[{"marketId":"e","eligibleEntrantIds":["A","B"],"orientation":["A","B"]},{"marketId":"m","eligibleEntrantIds":["A","B","C"],"orientation":null}]}}}');
insert into leagues(id,name,template_id,organizer_token) values('b3600000-0000-4000-8000-000000000002','Synthetic DB36','b3600000-0000-4000-8000-000000000001','b3600000-0000-4000-8000-000000000003');
insert into event_league_evaluations(league_id,configuration_version) values('b3600000-0000-4000-8000-000000000002',1);
select configure_event_window('b3600000-0000-4000-8000-000000000002','early',0,'open',now()+interval '1 hour',true,array['e']);
select configure_event_window('b3600000-0000-4000-8000-000000000002','later',0,'unopened',null,false,array['m']);
insert into participants(id,league_id,display_name,magic_token) values('b3600000-0000-4000-8000-000000000004','b3600000-0000-4000-8000-000000000002','Synthetic','b3600000-0000-4000-8000-000000000005');
select submit_event_window('b3600000-0000-4000-8000-000000000002','b3600000-0000-4000-8000-000000000005','early',1,'{"e":"draw"}');
create temp table db36_saved as select to_jsonb(p) value from picks p where league_id='b3600000-0000-4000-8000-000000000002';
create function pg_temp.review36(pairings jsonb default '{"m":["A","B"]}',actor uuid default 'b3600000-0000-4000-8000-000000000003',version integer default 1)
returns jsonb language sql as $$
 select review_event_pairings('b3600000-0000-4000-8000-000000000002',actor,'later',
 (select version from event_league_windows where league_id='b3600000-0000-4000-8000-000000000002' and window_key='later'),
 version,capture_event_lifecycle('b3600000-0000-4000-8000-000000000002')->>'basisToken',pairings,'Synthetic review');
$$;
set local role anon;
select throws_ok($$select review_event_pairings(null,null,null,null,null,null,null,null)$$,'42501',null,'anonymous has no review capability');
reset role;
set local role service_role;
select throws_ok($$insert into event_pairing_reviews values(null)$$,'42501',null,'service cannot forge compatibility ledger');
select throws_ok($$select pg_temp.review36('{"m":["A","B"]}','b3600000-0000-4000-8000-000000000005')$$,'42501',null,'participant cannot review');
select throws_ok($$select pg_temp.review36()$$,coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409'),'unresolved prerequisite','outcome picks are not qualification evidence');
select mutate_event_lifecycle('b3600000-0000-4000-8000-000000000002','b3600000-0000-4000-8000-000000000003','e','override','{"outcome":{"kind":"draw"}}','Synthetic prior result',
 capture_event_lifecycle('b3600000-0000-4000-8000-000000000002')->'basis'->'effective'->'e'->>'effectiveToken',null,'prior');
select throws_ok($$select pg_temp.review36('{}')$$,'22023',null,'missing target market rejected');
select throws_ok($$select pg_temp.review36('{"m":["A","alien"]}')$$,'22023',null,'nonmember rejected');
select throws_ok($$select pg_temp.review36('{"m":["A","A"]}')$$,'22023',null,'duplicate entrant rejected');
select mutate_event_lifecycle('b3600000-0000-4000-8000-000000000002','b3600000-0000-4000-8000-000000000003','m','override','{"outcome":{"kind":"winner","entrant":"C"}}','Synthetic prior target',
 capture_event_lifecycle('b3600000-0000-4000-8000-000000000002')->'basis'->'effective'->'m'->>'effectiveToken',null,'prior-target');
select throws_ok($$select pg_temp.review36()$$,coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409'),'pairing conflicts with existing target result','review cannot exclude an existing target winner');
select mutate_event_lifecycle('b3600000-0000-4000-8000-000000000002','b3600000-0000-4000-8000-000000000003','m','release','{}','Clear synthetic target',
 capture_event_lifecycle('b3600000-0000-4000-8000-000000000002')->'basis'->'effective'->'m'->>'effectiveToken',
 capture_event_lifecycle('b3600000-0000-4000-8000-000000000002')->'basis'->'effective'->'m'->>'canonicalToken','clear-target');
select is(pg_temp.review36()->>'status','adopted','versioned review survives sealed early picks');
select throws_ok($$select pg_temp.review36()$$,coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409'),null,'stale configuration rejected');
select is((capture_event_lifecycle('b3600000-0000-4000-8000-000000000002')->'basis'->>'configurationVersion'),'2','old pick basis remains readable under proven compatible revision');
select is((select manifest->'lifecycle'->'binding'->'markets'->1->'orientation' from event_template_configs where template_id='b3600000-0000-4000-8000-000000000001' and version=1),'null'::jsonb,'old sealed graph never overwritten');
select is((select manifest->'markets'->0 from event_template_configs where template_id='b3600000-0000-4000-8000-000000000001' and version=1),
(select manifest->'markets'->0 from event_template_configs where template_id='b3600000-0000-4000-8000-000000000001' and version=2),'old scoring unit unchanged');
reset role;
select is((select to_jsonb(p) from picks p where league_id='b3600000-0000-4000-8000-000000000002'),(select value from db36_saved),'saved picks byte-identical including original version');
set local role service_role;
select lives_ok($$select configure_event_window('b3600000-0000-4000-8000-000000000002','later',2,'open',now()+interval '30 minutes',true,array['m'])$$,'reviewed window opens');
select throws_ok($$select submit_event_window('b3600000-0000-4000-8000-000000000002','b3600000-0000-4000-8000-000000000005','later',3,'{"m":"C"}')$$,'22023',null,'unpaired entrant cannot be picked through SQL');
select lives_ok($$select submit_event_window('b3600000-0000-4000-8000-000000000002','b3600000-0000-4000-8000-000000000005','later',3,'{"m":"B"}')$$,'existing participant submits next round');
select is(pg_temp.review36('{"m":["A","C"]}','b3600000-0000-4000-8000-000000000003',2)->>'status','held','incompatible post-open correction held without reinterpretation');
select is((capture_event_lifecycle('b3600000-0000-4000-8000-000000000002')->'basis'->'effective'->'m'->>'held'),'true','durable market hold');
select is((select configuration_version from event_league_evaluations where league_id='b3600000-0000-4000-8000-000000000002'),2,'held correction does not adopt graph');
select is((select team_id from picks where league_id='b3600000-0000-4000-8000-000000000002' and slot_id='m'),'B','later saved pick retained');
select is((select pairings from event_pairing_corrections where league_id='b3600000-0000-4000-8000-000000000002'),'{"m":["A","C"]}'::jsonb,'exact held correction retained for review');
select throws_ok($$update event_pairing_corrections set reason='rewrite'$$,'42501',null,'service cannot rewrite correction evidence');
select * from finish();
rollback;
