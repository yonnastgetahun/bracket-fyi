-- NO01: actual denied TRUNCATE, not just an ACL observation. Entire fixture rolls back.
begin;
select no_plan();
insert into organizations(id,organization_key,name,kind) values('e1100000-0000-4000-8000-000000000001','no11-notify-unit-org','Synthetic DB32','governing_body');
insert into competitions(id,organization_id,competition_key,name,domain,sport_code) values('e1100000-0000-4000-8000-000000000002','e1100000-0000-4000-8000-000000000001','no11-notify-unit-cup','Synthetic DB32','sport','soccer');
insert into event_editions(id,competition_id,edition_key,name,season_label) values('e1100000-0000-4000-8000-000000000003','e1100000-0000-4000-8000-000000000002','no11-notify','Synthetic DB32','2026');
insert into stages(id,event_edition_id,stage_key,name,kind,ordinal) values('e1100000-0000-4000-8000-000000000009','e1100000-0000-4000-8000-000000000003','no11-notify-stage','Synthetic DB32','knockout',1);
insert into contests(id,event_edition_id,stage_id,contest_key,name,kind) values('e1100000-0000-4000-8000-000000000004','e1100000-0000-4000-8000-000000000003','e1100000-0000-4000-8000-000000000009','no11-notify-match','Synthetic DB32','match');
insert into competitors(id,competitor_key,kind,canonical_name) values
 ('e1100000-0000-4000-8000-000000000005','no11-notify-unit-a','team','Synthetic A'),('e1100000-0000-4000-8000-000000000006','no11-notify-unit-b','team','Synthetic B');
insert into event_entries(id,event_edition_id,competitor_id,role) values
 ('e1100000-0000-4000-8000-000000000007','e1100000-0000-4000-8000-000000000003','e1100000-0000-4000-8000-000000000005','team'),
 ('e1100000-0000-4000-8000-000000000008','e1100000-0000-4000-8000-000000000003','e1100000-0000-4000-8000-000000000006','team');
insert into contest_entries(event_edition_id,contest_id,event_entry_id,role,side,ordinal) values
 ('e1100000-0000-4000-8000-000000000003','e1100000-0000-4000-8000-000000000004','e1100000-0000-4000-8000-000000000007','competitor','home',1),
 ('e1100000-0000-4000-8000-000000000003','e1100000-0000-4000-8000-000000000004','e1100000-0000-4000-8000-000000000008','competitor','away',2);
insert into templates(id,name,type,event_edition_id) values('e1100000-0000-4000-8000-000000000010','Synthetic DB32','bracket','e1100000-0000-4000-8000-000000000003');
insert into event_template_configs(template_id,version,sealed,manifest) values('e1100000-0000-4000-8000-000000000010',1,true,
'{"markets":[{"id":"m","windowId":"w","choices":["home","draw","away"],"required":true,"scored":true,"outcomeDomain":"regulation-home-draw-away","contestId":"e1100000-0000-4000-8000-000000000004"}],
"lifecycle":{"binding":{"reviewed":true,"graphVersion":1,"markets":[{"marketId":"m","eligibleEntrantIds":["e1100000-0000-4000-8000-000000000007","e1100000-0000-4000-8000-000000000008"],"orientation":["e1100000-0000-4000-8000-000000000007","e1100000-0000-4000-8000-000000000008"]}]}}}');
insert into leagues(id,name,template_id,organizer_token) values
 ('e1100000-0000-4000-8000-000000000011','Synthetic A','e1100000-0000-4000-8000-000000000010','e1100000-0000-4000-8000-000000000021'),
 ('e1100000-0000-4000-8000-000000000012','Synthetic B','e1100000-0000-4000-8000-000000000010','e1100000-0000-4000-8000-000000000022'),
 ('e1100000-0000-4000-8000-000000000013','Synthetic C','e1100000-0000-4000-8000-000000000010','e1100000-0000-4000-8000-000000000023');
insert into event_league_evaluations(league_id,configuration_version) select id,1 from leagues where template_id='e1100000-0000-4000-8000-000000000010';
select configure_event_window(id,'w',0,'open',clock_timestamp()-interval '1 second',true,array['m']) from leagues where template_id='e1100000-0000-4000-8000-000000000010';
select advance_event_windows(id) from leagues where template_id='e1100000-0000-4000-8000-000000000010';

insert into participants(id,league_id,display_name,magic_token) values
 ('e1100000-0000-4000-8000-000000000101','e1100000-0000-4000-8000-000000000011','Synthetic recipient','e1100000-0000-4000-8000-000000000201');

update event_runtime_control set global_stopped=false,notifications_enabled=true;
select set_event_notification_consent('e1100000-0000-4000-8000-000000000011','e1100000-0000-4000-8000-000000000201',
 'e1100000-0000-4000-8000-000000000101','fake://no11',array['broadcast'],true);
do $$
declare c jsonb;
begin
 c:=capture_event_lifecycle('e1100000-0000-4000-8000-000000000011');
 perform commit_event_lifecycle('e1100000-0000-4000-8000-000000000011',(c->>'generation')::bigint,c->>'basisToken',
 '[{"id":"e1100000-0000-4000-8000-000000000101","earned":0,"maximum":1,"wrong":0,"pending":1,"rank":1}]');
end $$;
select emit_event_notification('e1100000-0000-4000-8000-000000000011','broadcast','no11-history',
 capture_event_lifecycle('e1100000-0000-4000-8000-000000000011')->>'basisToken',null,'e1100000-0000-4000-8000-000000000021');
create temp table no11_intent as select id from notification_outbox where league_id='e1100000-0000-4000-8000-000000000011';
grant select on no11_intent to service_role;
set local role service_role;
select is(admit_event_notification((select id from no11_intent),'e1100000-0000-4000-8000-000000000301')->>'admitted','true','legitimate service notification admission remains functional');
reset role;
select ok(exists(select 1 from notification_outbox where id in(select id from no11_intent) and subscription_id is not null),'nonempty protected intent fixture');
select ok(exists(select 1 from notification_attempts where worker_incarnation='e1100000-0000-4000-8000-000000000301'),'nonempty protected attempt fixture');
create temp table no11_history as select
 (select jsonb_agg(to_jsonb(o) order by id) from notification_outbox o) as outbox,
 (select jsonb_agg(to_jsonb(a) order by id) from notification_attempts a) as attempts;
select ok(not has_table_privilege(r,t,'TRUNCATE'),r||' effective TRUNCATE denied on '||t)
from unnest(array['anon','authenticated','service_role']) r
cross join unnest(array['public.notification_outbox','public.notification_attempts']) t;
select ok(not exists(select 1 from pg_class c cross join lateral aclexplode(c.relacl) a
 where c.oid in ('public.notification_outbox'::regclass,'public.notification_attempts'::regclass)
 and a.grantee=0 and a.privilege_type='TRUNCATE'),'PUBLIC has no TRUNCATE ACL');
set local role service_role;
select throws_ok('truncate public.notification_attempts','42501',null,'service attempts TRUNCATE is denied');
select throws_ok('truncate public.notification_attempts,public.notification_outbox','42501',null,'service joint TRUNCATE is denied');
reset role;
select is((select jsonb_agg(to_jsonb(o) order by id) from notification_outbox o),(select outbox from no11_history),'all intent identities/content preserved');
select is((select jsonb_agg(to_jsonb(a) order by id) from notification_attempts a),(select attempts from no11_history),'all attempt identities/content preserved');
select ok(has_table_privilege('service_role','notification_outbox','INSERT') and has_table_privilege('service_role','notification_outbox','UPDATE'),'legacy outbox DML ACL retained');
select ok(not has_function_privilege('service_role','public.assert_event_operator(text,text,uuid,text)','EXECUTE'),'registry helper stays private');
select ok(has_function_privilege('service_role','public.event_operator_command(text,text,uuid,text,bigint,text,jsonb)','EXECUTE'),'service command entry stays callable');
select * from finish();
rollback;
