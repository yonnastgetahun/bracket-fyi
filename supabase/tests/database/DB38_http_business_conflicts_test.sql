-- PT409 runtime regression; all synthetic fixture changes roll back.
begin;
select no_plan();
insert into organizations(id,organization_key,name,kind) values('a3800000-0000-4000-8000-000000000001','db38-unit-org','Synthetic DB38','governing_body');
insert into competitions(id,organization_id,competition_key,name,domain,sport_code) values('a3800000-0000-4000-8000-000000000002','a3800000-0000-4000-8000-000000000001','db38-unit-cup','Synthetic DB38','sport','soccer');
insert into event_editions(id,competition_id,edition_key,name,season_label) values('a3800000-0000-4000-8000-000000000003','a3800000-0000-4000-8000-000000000002','db38','Synthetic DB38','2026');
insert into stages(id,event_edition_id,stage_key,name,kind,ordinal) values('a3800000-0000-4000-8000-000000000009','a3800000-0000-4000-8000-000000000003','db38-stage','Synthetic DB38','knockout',1);
insert into contests(id,event_edition_id,stage_id,contest_key,name,kind) values('a3800000-0000-4000-8000-000000000004','a3800000-0000-4000-8000-000000000003','a3800000-0000-4000-8000-000000000009','db38-match','Synthetic DB38','match');
insert into competitors(id,competitor_key,kind,canonical_name) values
 ('a3800000-0000-4000-8000-000000000005','db38-unit-a','team','Synthetic A'),('a3800000-0000-4000-8000-000000000006','db38-unit-b','team','Synthetic B');
insert into event_entries(id,event_edition_id,competitor_id,role) values
 ('a3800000-0000-4000-8000-000000000007','a3800000-0000-4000-8000-000000000003','a3800000-0000-4000-8000-000000000005','team'),
 ('a3800000-0000-4000-8000-000000000008','a3800000-0000-4000-8000-000000000003','a3800000-0000-4000-8000-000000000006','team');
insert into contest_entries(event_edition_id,contest_id,event_entry_id,role,side,ordinal) values
 ('a3800000-0000-4000-8000-000000000003','a3800000-0000-4000-8000-000000000004','a3800000-0000-4000-8000-000000000007','competitor','home',1),
 ('a3800000-0000-4000-8000-000000000003','a3800000-0000-4000-8000-000000000004','a3800000-0000-4000-8000-000000000008','competitor','away',2);
insert into templates(id,name,type,event_edition_id) values('a3800000-0000-4000-8000-000000000010','Synthetic DB38','bracket','a3800000-0000-4000-8000-000000000003');
insert into event_template_configs(template_id,version,sealed,manifest) values('a3800000-0000-4000-8000-000000000010',1,true,
'{"markets":[{"id":"m","windowId":"w","choices":["home","draw","away"],"required":true,"scored":true,"outcomeDomain":"regulation-home-draw-away","contestId":"a3800000-0000-4000-8000-000000000004"}],
"lifecycle":{"binding":{"reviewed":true,"graphVersion":1,"markets":[{"marketId":"m","eligibleEntrantIds":["a3800000-0000-4000-8000-000000000007","a3800000-0000-4000-8000-000000000008"],"orientation":["a3800000-0000-4000-8000-000000000007","a3800000-0000-4000-8000-000000000008"]}]}}}');
insert into leagues(id,name,template_id,organizer_token) values
 ('a3800000-0000-4000-8000-000000000011','Synthetic A','a3800000-0000-4000-8000-000000000010','a3800000-0000-4000-8000-000000000021'),
 ('a3800000-0000-4000-8000-000000000012','Synthetic B','a3800000-0000-4000-8000-000000000010','a3800000-0000-4000-8000-000000000022'),
 ('a3800000-0000-4000-8000-000000000013','Synthetic C','a3800000-0000-4000-8000-000000000010','a3800000-0000-4000-8000-000000000023');
insert into event_league_evaluations(league_id,configuration_version) select id,1 from leagues where template_id='a3800000-0000-4000-8000-000000000010';
select configure_event_window(id,'w',0,'open',clock_timestamp()-interval '1 second',true,array['m']) from leagues where template_id='a3800000-0000-4000-8000-000000000010';
select advance_event_windows(id) from leagues where template_id='a3800000-0000-4000-8000-000000000010';

insert into participants(id,league_id,display_name,magic_token) values
 ('a3800000-0000-4000-8000-000000000101','a3800000-0000-4000-8000-000000000011','Synthetic PT409','a3800000-0000-4000-8000-000000000201');
create temp table conflict_before as select
 (select count(*) from picks) picks,(select count(*) from event_lifecycle_revisions) revisions,
 (select count(*) from event_lifecycle_audit) audit,(select count(*) from notification_outbox) outbox;
grant select on conflict_before to service_role;
set local role service_role;
select throws_ok($q$select submit_event_window('a3800000-0000-4000-8000-000000000011','a3800000-0000-4000-8000-000000000201','w',1,'{"m":"home"}')$q$,'PT409','window unavailable or stale','locked submit is non-retryable');
select throws_ok($q$select configure_event_window('a3800000-0000-4000-8000-000000000011','w',999,'locked',null,true,array['m'])$q$,'PT409','window unavailable or stale','stale window version is non-retryable');
select throws_ok($q$select mutate_event_lifecycle('a3800000-0000-4000-8000-000000000011','a3800000-0000-4000-8000-000000000021','m','override','{"outcome":{"kind":"draw"}}','Synthetic stale','stale',null,'db38-stale')$q$,'PT409','effective result changed','stale lifecycle result is non-retryable');
select throws_ok($q$select commit_event_lifecycle('a3800000-0000-4000-8000-000000000011',-1,'stale','[]')$q$,'PT409','lifecycle basis changed','stale worker is non-retryable');
select throws_ok($q$select emit_event_notification('a3800000-0000-4000-8000-000000000011','contest_live','db38-stale','stale',null)$q$,'PT409','notification basis changed','notification conflict is non-retryable');
select throws_ok($q$select mutate_event_lifecycle('a3800000-0000-4000-8000-000000000011','a3800000-0000-4000-8000-000000000022','m','override','{"outcome":{"kind":"draw"}}','Synthetic unauthorized','stale',null,'db38-forged')$q$,'42501','invalid organizer credential','unauthorized stays unauthorized');
reset role;
select is((select count(*) from picks),(select picks from conflict_before),'failed requests preserve picks');
select is((select count(*) from event_lifecycle_revisions),(select revisions from conflict_before),'failed requests preserve revision history');
select is((select count(*) from event_lifecycle_audit),(select audit from conflict_before),'failed requests preserve audit history');
select is((select count(*) from notification_outbox),(select outbox from conflict_before),'failed requests preserve outbox');
-- Exercise the series stop guard as the real service caller on schemas that
-- include series. The query remains valid on the through-12/13 prefix.
create temp table series_conflict_before as select
 (select count(*) from contest_results) results,
 (select count(*) from result_audit_events) audit;
update event_runtime_control set global_stopped=true where singleton;
set local role service_role;
select throws_ok($q$select commit_event_series('a3800000-0000-4000-8000-000000000004','stale','{"kind":"unresolved"}')$q$,
 'PT409','runtime stopped','stopped series worker is non-retryable')
where to_regprocedure('public.commit_event_series(uuid,text,jsonb)') is not null;
reset role;
select is((select count(*) from contest_results),(select results from series_conflict_before),'stopped series preserves results');
select is((select count(*) from result_audit_events),(select audit from series_conflict_before),'stopped series preserves result audit');
-- Inventory catches missed nested helpers/triggers, without rewriting any schema.
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prosrc like '%errcode=''40001''%'),0::bigint,'no deliberate retryable business raises remain');
select is((select sum((length(prosrc)-length(replace(prosrc,'errcode=''PT409''','')))/length('errcode=''PT409'''))::bigint
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),(23
 + case when to_regclass('public.event_series_reviews') is not null then 5 else 0 end
 + case when to_regclass('public.event_structural_qualifier_reviews') is not null then 7 else 0 end)::bigint,
 'exact non-retryable raise inventory: core 23, installed series 5, structural qualifiers 7');
select * from finish();
rollback;
