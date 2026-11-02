-- Final schema expects PT409; historical-prefix runners explicitly set bracket.test_business_sqlstate.
begin;
select no_plan();
select has_function('public','admit_event_notification',array['uuid','uuid'],'durable admission exists');
select is((select count(*)::integer from event_notification_policies),9,'all nine trigger policies');
select ok((select global_stopped and not notifications_enabled and not real_sends_enabled from event_runtime_control),'default off');
insert into organizations(id,organization_key,name,kind) values('a3300000-0000-4000-8000-000000000001','db33-unit-org','Synthetic DB32','governing_body');
insert into competitions(id,organization_id,competition_key,name,domain,sport_code) values('a3300000-0000-4000-8000-000000000002','a3300000-0000-4000-8000-000000000001','db33-unit-cup','Synthetic DB32','sport','soccer');
insert into event_editions(id,competition_id,edition_key,name,season_label) values('a3300000-0000-4000-8000-000000000003','a3300000-0000-4000-8000-000000000002','db33','Synthetic DB32','2026');
insert into stages(id,event_edition_id,stage_key,name,kind,ordinal) values('a3300000-0000-4000-8000-000000000009','a3300000-0000-4000-8000-000000000003','db33-stage','Synthetic DB32','knockout',1);
insert into contests(id,event_edition_id,stage_id,contest_key,name,kind) values('a3300000-0000-4000-8000-000000000004','a3300000-0000-4000-8000-000000000003','a3300000-0000-4000-8000-000000000009','db33-match','Synthetic DB32','match');
insert into competitors(id,competitor_key,kind,canonical_name) values
 ('a3300000-0000-4000-8000-000000000005','db33-unit-a','team','Synthetic A'),('a3300000-0000-4000-8000-000000000006','db33-unit-b','team','Synthetic B');
insert into event_entries(id,event_edition_id,competitor_id,role) values
 ('a3300000-0000-4000-8000-000000000007','a3300000-0000-4000-8000-000000000003','a3300000-0000-4000-8000-000000000005','team'),
 ('a3300000-0000-4000-8000-000000000008','a3300000-0000-4000-8000-000000000003','a3300000-0000-4000-8000-000000000006','team');
insert into contest_entries(event_edition_id,contest_id,event_entry_id,role,side,ordinal) values
 ('a3300000-0000-4000-8000-000000000003','a3300000-0000-4000-8000-000000000004','a3300000-0000-4000-8000-000000000007','competitor','home',1),
 ('a3300000-0000-4000-8000-000000000003','a3300000-0000-4000-8000-000000000004','a3300000-0000-4000-8000-000000000008','competitor','away',2);
insert into templates(id,name,type,event_edition_id) values('a3300000-0000-4000-8000-000000000010','Synthetic DB32','bracket','a3300000-0000-4000-8000-000000000003');
insert into event_template_configs(template_id,version,sealed,manifest) values('a3300000-0000-4000-8000-000000000010',1,true,
'{"markets":[{"id":"m","windowId":"w","choices":["home","draw","away"],"required":true,"scored":true,"outcomeDomain":"regulation-home-draw-away","contestId":"a3300000-0000-4000-8000-000000000004"}],
"lifecycle":{"binding":{"reviewed":true,"graphVersion":1,"markets":[{"marketId":"m","eligibleEntrantIds":["a3300000-0000-4000-8000-000000000007","a3300000-0000-4000-8000-000000000008"],"orientation":["a3300000-0000-4000-8000-000000000007","a3300000-0000-4000-8000-000000000008"]}]}}}');
insert into leagues(id,name,template_id,organizer_token) values
 ('a3300000-0000-4000-8000-000000000011','Synthetic A','a3300000-0000-4000-8000-000000000010','a3300000-0000-4000-8000-000000000021'),
 ('a3300000-0000-4000-8000-000000000012','Synthetic B','a3300000-0000-4000-8000-000000000010','a3300000-0000-4000-8000-000000000022'),
 ('a3300000-0000-4000-8000-000000000013','Synthetic C','a3300000-0000-4000-8000-000000000010','a3300000-0000-4000-8000-000000000023');
insert into event_league_evaluations(league_id,configuration_version) select id,1 from leagues where template_id='a3300000-0000-4000-8000-000000000010';
select configure_event_window(id,'w',0,'open',clock_timestamp()-interval '1 second',true,array['m']) from leagues where template_id='a3300000-0000-4000-8000-000000000010';
select advance_event_windows(id) from leagues where template_id='a3300000-0000-4000-8000-000000000010';

insert into participants(id,league_id,display_name,magic_token) values
 ('a3300000-0000-4000-8000-000000000101','a3300000-0000-4000-8000-000000000011','Synthetic recipient','a3300000-0000-4000-8000-000000000201');
-- FIXTURE_END
create function pg_temp.reconcile() returns jsonb language plpgsql as $$
declare c jsonb; begin
 c:=capture_event_lifecycle('a3300000-0000-4000-8000-000000000011');
 return commit_event_lifecycle('a3300000-0000-4000-8000-000000000011',(c->>'generation')::bigint,c->>'basisToken',
 jsonb_build_array(jsonb_build_object('id','a3300000-0000-4000-8000-000000000101','earned',
 case when c->'basis'->'effective'->'m'->'outcome'->>'kind'='draw' then 1 else 0 end,
 'maximum',1,'wrong',0,'pending',case when c->'basis'->'effective'->'m'->'outcome'->>'kind'='unresolved' then 1 else 0 end,'rank',1)));
end $$;
create function pg_temp.emit(k text,label text) returns uuid language plpgsql as $$
declare c jsonb; oid uuid; begin
 c:=capture_event_lifecycle('a3300000-0000-4000-8000-000000000011');
 perform emit_event_notification('a3300000-0000-4000-8000-000000000011',k,label,c->>'basisToken',null,'a3300000-0000-4000-8000-000000000021');
 select id into oid from notification_outbox where idempotency_key like '%:'||label||':%';
 return oid;
end $$;
create temp table work(oid uuid,permit jsonb);
grant all on work to service_role;

-- Synthetic registry authority; calls below remain SECURITY INVOKER.
insert into event_operator_principals(id) values(md5('fixture-operator-33')::uuid);
insert into event_operator_credentials values(encode(extensions.digest('fixture-scoped-operator-33','sha256'),'hex'),md5('fixture-operator-33')::uuid,true,now()+interval '1 hour');
insert into event_operator_grants(principal_id,environment,event_edition_id,action)
select md5('fixture-operator-33')::uuid,'local',null,a from unnest(array['global.stop','notification.control']) a;
create temp table fixture_control_version as select version from event_runtime_control where singleton;
grant all on fixture_control_version to service_role;
create function pg_temp.notification_control(stopped boolean,enabled boolean) returns jsonb language plpgsql as $$
declare v bigint; r jsonb; begin
 select version into v from fixture_control_version;
 r:=event_operator_command('fixture-scoped-operator-33','local',null,'global.stop',v,'Synthetic control fixture',jsonb_build_object('stopped',stopped));
 v:=(r->>'version')::bigint;
 r:=event_operator_command('fixture-scoped-operator-33','local',null,'notification.control',v,'Synthetic control fixture',jsonb_build_object('enabled',enabled));
 update fixture_control_version set version=(r->>'version')::bigint;
 return r; end $$;

set local role service_role;
select throws_ok($$select set_event_notification_consent('a3300000-0000-4000-8000-000000000011','a3300000-0000-4000-8000-000000000022',null,'fake://organizer',array['provider_stale'],true)$$,'42501','invalid credential','cross-league organizer denied');
select throws_ok($$select set_event_notification_consent('a3300000-0000-4000-8000-000000000011','a3300000-0000-4000-8000-000000000201','a3300000-0000-4000-8000-000000000101','https://real.invalid',array['broadcast'],true)$$,'22023','invalid fake subscription','real endpoints rejected');
select lives_ok($$select set_event_notification_consent('a3300000-0000-4000-8000-000000000011','a3300000-0000-4000-8000-000000000201','a3300000-0000-4000-8000-000000000101','fake://recipient',array['lock_reminder','contest_live','result_final','score_change','schedule_change','result_correction','league_complete','broadcast'],true)$$,'participant explicit opt-in');
select lives_ok($$select set_event_notification_consent('a3300000-0000-4000-8000-000000000011','a3300000-0000-4000-8000-000000000021',null,'fake://organizer',array['provider_stale'],true)$$,'organizer stale opt-in');
select throws_ok($$select enqueue_event_notification(gen_random_uuid(),'broadcast','forge')$$,'42501',null,'internal enqueue denied');
select throws_ok($$update event_runtime_control set global_stopped=false$$,'42501',null,'service cannot bypass control RPC');
select throws_ok($$select emit_event_notification('a3300000-0000-4000-8000-000000000011','broadcast','unauthorized','x',null,null)$$,'42501','invalid credential','broadcast exact credential required');
select throws_ok($$select pg_temp.emit('contest_live','dirty')$$,coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409'),'notification basis changed','dirty basis cannot produce notices');
select pg_temp.reconcile();
select is((select count(*)::integer from notification_outbox where subscription_id is not null),0,'unresolved evaluation produces no spurious final');
select pg_temp.emit('lock_reminder','reminder');
select pg_temp.emit('contest_live','live');
select pg_temp.emit('schedule_change','schedule');
select pg_temp.emit('provider_stale','stale');
select pg_temp.emit('broadcast','broadcast');
select pg_temp.emit('broadcast','broadcast');
select is((select count(*)::integer from notification_outbox where subscription_id is not null),5,'five producer kinds stable dedup');
select ok((select bool_and(expires_at>created_at and destination_path ~ '^/l/' and payload - array['kind','leagueId']='{}'::jsonb) from notification_outbox where subscription_id is not null),'bounded expiry safe route and payload');
select is(emit_event_notification('a3300000-0000-4000-8000-000000000011','broadcast','message',
 capture_event_lifecycle('a3300000-0000-4000-8000-000000000011')->>'basisToken',null,'a3300000-0000-4000-8000-000000000021','Synthetic announcement'),1,'broadcast content and intent atomic');
select is(emit_event_notification('a3300000-0000-4000-8000-000000000011','broadcast','message',
 capture_event_lifecycle('a3300000-0000-4000-8000-000000000011')->>'basisToken',null,'a3300000-0000-4000-8000-000000000021','Synthetic announcement'),0,'broadcast retry no recipient replay');
select throws_ok($$select emit_event_notification('a3300000-0000-4000-8000-000000000011','broadcast','message',
 capture_event_lifecycle('a3300000-0000-4000-8000-000000000011')->>'basisToken',null,'a3300000-0000-4000-8000-000000000021','Different announcement')$$,coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409'),'notification idempotency conflict','changed body cannot reuse broadcast key');
select is((select announcement_text from leagues where id='a3300000-0000-4000-8000-000000000011'),'Synthetic announcement','conflicting replay leaves announcement unchanged');
select is((select payload->>'body' from notification_outbox where idempotency_key like '%:message:%'),'Synthetic announcement','persisted allowlisted broadcast body');
insert into work select pg_temp.emit('broadcast','work'),null;
select is(admit_event_notification(oid,'a3300000-0000-4000-8000-000000000301')->>'reason','stopped','stop before admission gives zero permit') from work;
select is((select count(*)::integer from notification_attempts),0,'zero attempts while stopped');
select pg_temp.notification_control(false,true);
update work set permit=admit_event_notification(oid,'a3300000-0000-4000-8000-000000000301');
select is((permit->>'admitted')::boolean,true,'durable admitted') from work;
select is(admit_event_notification((select id from notification_outbox where idempotency_key like '%:message:%'),
 'a3300000-0000-4000-8000-000000000302')->>'reason','prior-outstanding','later notices wait for known earlier attempt disposition');
select is(admit_event_notification(oid,'a3300000-0000-4000-8000-000000000302')->>'reason','outstanding','concurrent worker cannot reuse claim') from work;
select is(start_event_notification((permit->>'attemptId')::uuid,'a3300000-0000-4000-8000-000000000302')->>'started','false','restart incarnation rejects old permit') from work;
select is(pg_temp.notification_control(true,true)->>'drained','false','stop acknowledges outstanding not drained');
select is(start_event_notification((permit->>'attemptId')::uuid,'a3300000-0000-4000-8000-000000000301')->>'started','false','immediate control recheck zero send') from work;
select pg_temp.notification_control(false,true);
update work set permit=admit_event_notification(oid,'a3300000-0000-4000-8000-000000000301');
select is(start_event_notification((permit->>'attemptId')::uuid,'a3300000-0000-4000-8000-000000000301')->>'started','true','second new permit starts') from work;
select is(start_event_notification((permit->>'attemptId')::uuid,'a3300000-0000-4000-8000-000000000301')->>'started','false','permit consumed once') from work;
select is(finish_event_notification((permit->>'attemptId')::uuid,'a3300000-0000-4000-8000-000000000301',201)->>'outcome','sent','fake success durable') from work;
select is((select status from notification_outbox where id=(select oid from work)),'sent','outbox sent');
reset role;
insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,source_type,idempotency_key)
values('a3300000-0000-4000-8000-000000000030','a3300000-0000-4000-8000-000000000004','a3300000-0000-4000-8000-000000000003',1,'final','draw','operator','db33-result');
set local role service_role;
select is(pg_temp.reconcile()->>'coronation','true','first coronation');
select is(pg_temp.reconcile()->>'replayed','true','lifecycle retry no duplicate');
select is((select count(*)::integer from notification_outbox where intent_type='league_complete'),1,'one durable completion recipient intent');
select is((select count(*)::integer from notification_outbox where intent_type='result_final'),1,'final result atomic intent');
select is(admit_event_notification((select id from notification_outbox where idempotency_key like '%:live:%'),'a3300000-0000-4000-8000-000000000301')->>'reason','superseded','old unadmitted basis canceled');
reset role;
insert into contest_results(contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,source_type,idempotency_key,supersedes_result_id,correction_reason)
values('a3300000-0000-4000-8000-000000000004','a3300000-0000-4000-8000-000000000003',2,'final','winner','a3300000-0000-4000-8000-000000000007','operator','db33-correction','a3300000-0000-4000-8000-000000000030','Synthetic correction');
set local role service_role;
select is(pg_temp.reconcile()->>'coronation','false','correction never recrowns');
select is((select count(*)::integer from notification_outbox where intent_type='result_correction'),1,'correction intent persisted');
select is((select count(*)::integer from notification_outbox where intent_type='score_change'),2,'score changes derive from evaluated boards');
select is((select count(distinct intent_type)::integer from notification_outbox),9,'all nine triggers persisted with opted-in audiences');
select throws_ok($$update notification_outbox set status='sent',processed_at=clock_timestamp() where subscription_id is not null$$,'42501','durable notification RPC required','service cannot forge delivery');
select throws_ok($$update notification_attempts set disposition='finished' where worker_incarnation is not null$$,'42501','durable notification RPC required','service cannot forge attempt completion');

delete from work;
insert into work select pg_temp.emit('broadcast','retry'),null;
update work set permit=admit_event_notification(oid,'a3300000-0000-4000-8000-000000000301');
select start_event_notification((permit->>'attemptId')::uuid,'a3300000-0000-4000-8000-000000000301') from work;
select is(finish_event_notification((permit->>'attemptId')::uuid,'a3300000-0000-4000-8000-000000000301',503)->>'outcome','transient_failure','503 durable retry') from work;
select is(admit_event_notification(oid,'a3300000-0000-4000-8000-000000000301')->>'reason','not-due','backoff enforced') from work;
reset role;
update notification_outbox set available_at=clock_timestamp() where id=(select oid from work);
set local role service_role;
update work set permit=admit_event_notification(oid,'a3300000-0000-4000-8000-000000000302');
select start_event_notification((permit->>'attemptId')::uuid,'a3300000-0000-4000-8000-000000000302') from work;
select is(finish_event_notification((permit->>'attemptId')::uuid,'a3300000-0000-4000-8000-000000000302',null,true)->>'outcome','transient_failure','lost remote ack uncertain not canceled') from work;
select is(pg_temp.notification_control(false,true)->>'drained','false','uncertain remains outstanding');
reset role;
update notification_outbox set available_at=clock_timestamp() where id=(select oid from work);
set local role service_role;
update work set permit=admit_event_notification(oid,'a3300000-0000-4000-8000-000000000303');
select start_event_notification((permit->>'attemptId')::uuid,'a3300000-0000-4000-8000-000000000303') from work;
select finish_event_notification((permit->>'attemptId')::uuid,'a3300000-0000-4000-8000-000000000303',503) from work;
select is((select status from notification_outbox where id=(select oid from work)),'failed','third failure deadletters');
select is((select count(distinct basis_token)::integer from notification_attempts where outbox_id=(select oid from work)),1,'retry preserves basis');
select is((select count(*)::integer from notification_attempts where outbox_id=(select oid from work)),3,'bounded attempts');
delete from work;
insert into work select pg_temp.emit('broadcast','prune'),null;
update work set permit=admit_event_notification(oid,'a3300000-0000-4000-8000-000000000301');
select start_event_notification((permit->>'attemptId')::uuid,'a3300000-0000-4000-8000-000000000301') from work;
select is(finish_event_notification((permit->>'attemptId')::uuid,'a3300000-0000-4000-8000-000000000301',410)->>'outcome','pruned','410 prunes consent endpoint') from work;
select ok(not (select enabled from event_notification_subscriptions where audience='participant'),'subscription disabled durably');
select is((select count(*)::integer from notification_outbox where intent_type='league_complete'),1,'completion never duplicated by retry/correction');
reset role;
set local role anon;
select throws_ok($$select set_event_notification_control(false,true)$$,'42501',null,'anonymous cannot enable sends');
select throws_ok($$select admit_event_notification(gen_random_uuid(),gen_random_uuid())$$,'42501',null,'anonymous cannot admit');
reset role;
select * from finish();
rollback;
