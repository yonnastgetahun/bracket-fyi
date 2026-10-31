-- Committed real adopted pairing plus incompatible held correction; no pgTAP rollback.
begin;
insert into templates(id,name,type) values('b3610000-0000-4000-8000-000000000001','Synthetic transition pairing','bracket');
insert into event_template_configs(template_id,version,sealed,manifest) values('b3610000-0000-4000-8000-000000000001',1,true,
'{"editionKey":"ucl-2026-27","lockMode":"per-window","application":{"label":"Synthetic local rehearsal — not official fixtures"},
"windows":[{"id":"early","prerequisiteMarketIds":[]},{"id":"later","prerequisiteMarketIds":["e"]}],
"markets":[{"id":"e","windowId":"early","choices":["home","draw","away"],"scored":true,"outcomeDomain":"regulation-home-draw-away","inputs":[{"kind":"entrant","entrantId":"A"},{"kind":"entrant","entrantId":"B"}]},
{"id":"m","windowId":"later","choices":["A","B","C"],"scored":true,"outcomeDomain":"aggregate-qualifier","inputs":[{"kind":"reviewed-placement","placement":"one","marketIds":["e"]},{"kind":"reviewed-placement","placement":"two","marketIds":["e"]}]}],
"lifecycle":{"binding":{"reviewed":true,"graphVersion":1,"markets":[{"marketId":"e","eligibleEntrantIds":["A","B"],"orientation":["A","B"]},{"marketId":"m","eligibleEntrantIds":["A","B","C"],"orientation":null}]}}}');
insert into leagues(id,name,template_id,organizer_token) values('b3610000-0000-4000-8000-000000000002','Synthetic transition pairing','b3610000-0000-4000-8000-000000000001','b3610000-0000-4000-8000-000000000003');
insert into event_league_evaluations(league_id,configuration_version) values('b3610000-0000-4000-8000-000000000002',1);
select configure_event_window('b3610000-0000-4000-8000-000000000002','early',0,'open',now()+interval '1 hour',true,array['e']);
select configure_event_window('b3610000-0000-4000-8000-000000000002','later',0,'unopened',null,false,array['m']);
insert into participants(id,league_id,display_name,magic_token) values('b3610000-0000-4000-8000-000000000004','b3610000-0000-4000-8000-000000000002','Synthetic','b3610000-0000-4000-8000-000000000005');
select submit_event_window('b3610000-0000-4000-8000-000000000002','b3610000-0000-4000-8000-000000000005','early',1,'{"e":"draw"}');

set local role service_role;
select mutate_event_lifecycle('b3610000-0000-4000-8000-000000000002','b3610000-0000-4000-8000-000000000003','e','override','{"outcome":{"kind":"draw"}}','Synthetic prior result',
 capture_event_lifecycle('b3610000-0000-4000-8000-000000000002')->'basis'->'effective'->'e'->>'effectiveToken',null,'transition-pairing-prior');
do $$
declare result jsonb;
begin
 result:=review_event_pairings('b3610000-0000-4000-8000-000000000002','b3610000-0000-4000-8000-000000000003',
 'later',1,1,capture_event_lifecycle('b3610000-0000-4000-8000-000000000002')->>'basisToken','{"m":["A","B"]}','Synthetic adopted pairing');
 if result->>'status' is distinct from 'adopted' then raise exception 'expected adopted review'; end if;
end $$;
select configure_event_window('b3610000-0000-4000-8000-000000000002','later',2,'open',now()+interval '30 minutes',true,array['m']);
select submit_event_window('b3610000-0000-4000-8000-000000000002','b3610000-0000-4000-8000-000000000005','later',3,'{"m":"B"}');
do $$
declare result jsonb;
begin
 result:=review_event_pairings('b3610000-0000-4000-8000-000000000002','b3610000-0000-4000-8000-000000000003',
 'later',3,2,capture_event_lifecycle('b3610000-0000-4000-8000-000000000002')->>'basisToken','{"m":["A","C"]}','Synthetic held correction');
 if result->>'status' is distinct from 'held' then raise exception 'expected held correction'; end if;
end $$;
commit;
