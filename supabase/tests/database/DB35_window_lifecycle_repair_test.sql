-- Final schema expects PT409; historical-prefix runners explicitly set bracket.test_business_sqlstate.
-- WL-01/02/03 original synthetic regressions; all fixtures roll back.
begin;
select no_plan();
insert into templates(id,name,type) values
 ('a3510000-0000-4000-8000-000000000001','Synthetic DB35 enrollment','bracket');
insert into event_template_configs(template_id,version,sealed,manifest) values
 ('a3510000-0000-4000-8000-000000000001',1,true,
 '{"markets":[{"id":"early","windowId":"first","choices":["a"]},{"id":"late","windowId":"second","choices":["a"]}]}');
insert into leagues(id,name,template_id,organizer_token,join_token) values
 ('a3510000-0000-4000-8000-000000000002','Synthetic DB35','a3510000-0000-4000-8000-000000000001','a3510000-0000-4000-8000-000000000003','a3510000-0000-4000-8000-000000000004');
insert into event_league_evaluations(league_id,configuration_version) values ('a3510000-0000-4000-8000-000000000002',1);
set local role service_role;
select configure_event_window('a3510000-0000-4000-8000-000000000002','first',0,'open',clock_timestamp()+interval '1 second',true,array['early']);
select configure_event_window('a3510000-0000-4000-8000-000000000002','second',0,'open',clock_timestamp()+interval '1 day',true,array['late']);
select configure_event_window('a3510000-0000-4000-8000-000000000002','first',1,null,null,null,null,true);
select lives_ok($$select * from join_event_league('a3510000-0000-4000-8000-000000000002','a3510000-0000-4000-8000-000000000004','Before cutoff')$$,'WL-01 legitimate pre-cutoff enrollment');
reset role;
-- Picks/membership sealing must not be mistaken for the enrollment deadline.
insert into picks(league_id,participant_id,slot_id,team_id,event_configuration_version)
 select league_id,id,'late','a',1 from participants where league_id='a3510000-0000-4000-8000-000000000002';
set local role service_role;
select lives_ok($$select * from join_event_league('a3510000-0000-4000-8000-000000000002','a3510000-0000-4000-8000-000000000004','After first pick')$$,'WL-01 first pick does not close enrollment');
select pg_sleep(1.1);
select ok(event_membership_closed('a3510000-0000-4000-8000-000000000002'),'WL-01 history deadline elapsed');
select throws_ok($$select * from join_event_league('a3510000-0000-4000-8000-000000000002','a3510000-0000-4000-8000-000000000004','Late')$$,coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409'),'entry closed','WL-01 deleted first/live second rejects late enrollment');
select is((select count(*)::integer from participants where league_id='a3510000-0000-4000-8000-000000000002'),2,'WL-01 rejected join writes nothing');
reset role;
insert into organizations(id,organization_key,name,kind) values('a3500000-0000-4000-8000-000000000001','db35-unit-org','Synthetic DB32','governing_body');
insert into competitions(id,organization_id,competition_key,name,domain,sport_code) values('a3500000-0000-4000-8000-000000000002','a3500000-0000-4000-8000-000000000001','db35-unit-cup','Synthetic DB32','sport','soccer');
insert into event_editions(id,competition_id,edition_key,name,season_label) values('a3500000-0000-4000-8000-000000000003','a3500000-0000-4000-8000-000000000002','db35','Synthetic DB32','2026');
insert into stages(id,event_edition_id,stage_key,name,kind,ordinal) values('a3500000-0000-4000-8000-000000000009','a3500000-0000-4000-8000-000000000003','db35-stage','Synthetic DB32','knockout',1);
insert into contests(id,event_edition_id,stage_id,contest_key,name,kind) values('a3500000-0000-4000-8000-000000000004','a3500000-0000-4000-8000-000000000003','a3500000-0000-4000-8000-000000000009','db35-match','Synthetic DB32','match');
insert into competitors(id,competitor_key,kind,canonical_name) values
 ('a3500000-0000-4000-8000-000000000005','db35-unit-a','team','Synthetic A'),('a3500000-0000-4000-8000-000000000006','db35-unit-b','team','Synthetic B');
insert into event_entries(id,event_edition_id,competitor_id,role) values
 ('a3500000-0000-4000-8000-000000000007','a3500000-0000-4000-8000-000000000003','a3500000-0000-4000-8000-000000000005','team'),
 ('a3500000-0000-4000-8000-000000000008','a3500000-0000-4000-8000-000000000003','a3500000-0000-4000-8000-000000000006','team');
insert into contest_entries(event_edition_id,contest_id,event_entry_id,role,side,ordinal) values
 ('a3500000-0000-4000-8000-000000000003','a3500000-0000-4000-8000-000000000004','a3500000-0000-4000-8000-000000000007','competitor','home',1),
 ('a3500000-0000-4000-8000-000000000003','a3500000-0000-4000-8000-000000000004','a3500000-0000-4000-8000-000000000008','competitor','away',2);
insert into templates(id,name,type,event_edition_id) values('a3500000-0000-4000-8000-000000000010','Synthetic DB32','bracket','a3500000-0000-4000-8000-000000000003');
insert into event_template_configs(template_id,version,sealed,manifest) values('a3500000-0000-4000-8000-000000000010',1,true,
'{"markets":[{"id":"m","windowId":"w","choices":["home","draw","away"],"required":true,"scored":true,"outcomeDomain":"regulation-home-draw-away","contestId":"a3500000-0000-4000-8000-000000000004"}],
"lifecycle":{"binding":{"reviewed":true,"graphVersion":1,"markets":[{"marketId":"m","eligibleEntrantIds":["a3500000-0000-4000-8000-000000000007","a3500000-0000-4000-8000-000000000008"],"orientation":["a3500000-0000-4000-8000-000000000007","a3500000-0000-4000-8000-000000000008"]}]}}}');
insert into leagues(id,name,template_id,organizer_token) values
 ('a3500000-0000-4000-8000-000000000011','Synthetic A','a3500000-0000-4000-8000-000000000010','a3500000-0000-4000-8000-000000000021'),
 ('a3500000-0000-4000-8000-000000000012','Synthetic B','a3500000-0000-4000-8000-000000000010','a3500000-0000-4000-8000-000000000022'),
 ('a3500000-0000-4000-8000-000000000013','Synthetic C','a3500000-0000-4000-8000-000000000010','a3500000-0000-4000-8000-000000000023');
insert into event_league_evaluations(league_id,configuration_version) select id,1 from leagues where template_id='a3500000-0000-4000-8000-000000000010';
select configure_event_window(id,'w',0,'open',clock_timestamp()-interval '1 second',true,array['m']) from leagues where template_id='a3500000-0000-4000-8000-000000000010';
select advance_event_windows(id) from leagues where template_id='a3500000-0000-4000-8000-000000000010';

create temp table db35_capture(lid uuid primary key,snap jsonb);
create temp table db35_scan(item jsonb);
grant all on db35_capture,db35_scan to service_role;
insert into participants(id,league_id,display_name) values
 ('a3500000-0000-4000-8000-000000000060','a3500000-0000-4000-8000-000000000011','Synthetic legacy pick');
insert into picks(league_id,participant_id,slot_id,team_id,event_configuration_version) values
 ('a3500000-0000-4000-8000-000000000011','a3500000-0000-4000-8000-000000000060','m','home',null);
insert into contest_results(contest_id,event_edition_id,version,result_status,outcome_type,source_type,idempotency_key)
values('a3500000-0000-4000-8000-000000000004','a3500000-0000-4000-8000-000000000003',1,'final','draw','system','db35-result');
set local role service_role;
insert into db35_capture select league_id,capture_event_lifecycle(league_id) from event_league_evaluations
 where league_id in ('a3500000-0000-4000-8000-000000000012','a3500000-0000-4000-8000-000000000013');
select is(commit_event_lifecycle(lid,(snap->>'generation')::bigint,snap->>'basisToken','[]')->>'state','complete','WL-03 initial completion') from db35_capture;
reset role;
insert into league_completion_holds(league_id,event_edition_id,hold_key,reason,created_by_fingerprint,idempotency_key,expires_at)
values('a3500000-0000-4000-8000-000000000012','a3500000-0000-4000-8000-000000000003','db35','Synthetic expiry',repeat('a',64),'db35-hold',clock_timestamp()+interval '1 second');
set local role service_role;
update db35_capture set snap=capture_event_lifecycle(lid) where lid='a3500000-0000-4000-8000-000000000012';
select is(commit_event_lifecycle(lid,(snap->>'generation')::bigint,snap->>'basisToken','[]')->>'state','held','WL-03 active hold') from db35_capture where lid='a3500000-0000-4000-8000-000000000012';
select pg_sleep(1.1);
select lives_ok($$insert into db35_scan select to_jsonb(s) from scan_event_lifecycle_work('a3500000-0000-4000-8000-000000000010',3) s$$,'WL-02 poison basis does not abort page');
select is((select count(*)::integer from db35_scan),3,'WL-02 every visited ID advances cursor');
select is((select item->>'error_code' from db35_scan where item->>'league_id'='a3500000-0000-4000-8000-000000000011'),'invalid-basis','WL-02 per-league sanitized error');
select ok((select (item->>'generation')::bigint>0 from db35_scan where item->>'league_id'='a3500000-0000-4000-8000-000000000012'),'WL-02 healthy expiry work discovered behind poison');
select ok((select item->>'generation' is null and item->>'error_code' is null from db35_scan where item->>'league_id'='a3500000-0000-4000-8000-000000000013'),'WL-02 clean league still returns cursor without work');
select ok((select generation>evaluated_generation from event_league_evaluations where league_id='a3500000-0000-4000-8000-000000000011'),'WL-02 poison obligation remains pending');
select is((capture_event_lifecycle(lid)->>'generation'),snap->>'generation','WL-03 expiry does not need a generation increment') from db35_capture where lid='a3500000-0000-4000-8000-000000000012';
update db35_capture set snap=capture_event_lifecycle(lid) where lid='a3500000-0000-4000-8000-000000000012';
select is(commit_event_lifecycle(lid,(snap->>'generation')::bigint,snap->>'basisToken','[]')->>'state','complete','WL-03 healthy expiry reconciles') from db35_capture where lid='a3500000-0000-4000-8000-000000000012';
select is(commit_event_lifecycle(lid,(snap->>'generation')::bigint,snap->>'basisToken','[]')->>'replayed','true','WL-03 lost ack is replay') from db35_capture where lid='a3500000-0000-4000-8000-000000000012';
select is((select count(*)::integer from event_lifecycle_audit where league_id='a3500000-0000-4000-8000-000000000012' and kind='evaluated'),3,'WL-03 all three evaluation occurrences survive replay');
select is((select count(*)::integer from event_lifecycle_audit where league_id='a3500000-0000-4000-8000-000000000012' and kind='evaluated' and details='{"from":"held","to":"complete"}'),1,'WL-03 exactly one recompletion audit');
select is((select count(*)::integer from event_lifecycle_audit where league_id='a3500000-0000-4000-8000-000000000012' and kind='coronation'),1,'WL-03 one coronation');
select is(read_event_lifecycle('a3500000-0000-4000-8000-000000000012')->>'state','complete','WL-03 reader is complete');
select is((select count(*)::integer from event_notification_snapshots where league_id='a3500000-0000-4000-8000-000000000012'),1,'00007 notification hook remains installed and successful');
reset role;
select ok(not has_function_privilege('anon','scan_event_lifecycle_work(uuid,integer)','execute') and not has_function_privilege('authenticated','scan_event_lifecycle_work(uuid,integer)','execute'),'scan stays service-only');
select ok(has_function_privilege('service_role','scan_event_lifecycle_work(uuid,integer)','execute'),'worker scan grant retained');
select ok(not has_table_privilege('service_role','event_lifecycle_audit','insert,update,delete,truncate'),'audit remains immutable to service');
select ok(not has_table_privilege('service_role','contest_results','insert'),'00008 operator ACL retained');
select * from finish();
rollback;
