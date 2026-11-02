begin;
-- Explicit synthetic fixture activation; production remains stopped by default.
update event_runtime_control set global_stopped=false;
select no_plan();
-- Original synthetic fixtures; no production or hosted data.
insert into templates(id,name,type) values('b3000000-0000-4000-8000-000000000001','Security synthetic','bracket');
insert into template_matches(id,template_id,round,match_number,home_slot,away_slot) values('b3000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000001',1,1,'home','away');
insert into leagues(id,name,template_id,join_token,organizer_token) values
('b3000000-0000-4000-8000-000000000010','Security A','b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000012'),
('b3000000-0000-4000-8000-000000000020','Security B','b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000021','b3000000-0000-4000-8000-000000000022');
insert into participants(id,league_id,display_name,magic_token,push_subscription) values
('b3000000-0000-4000-8000-000000000030','b3000000-0000-4000-8000-000000000010','Synthetic A','b3000000-0000-4000-8000-000000000031','{"endpoint":"synthetic"}'),
('b3000000-0000-4000-8000-000000000040','b3000000-0000-4000-8000-000000000020','Synthetic B','b3000000-0000-4000-8000-000000000041',null);
insert into league_result_overrides(league_id,template_match_id,winner_team_id) values
('b3000000-0000-4000-8000-000000000010','b3000000-0000-4000-8000-000000000002','synthetic-private');
set local role anon;
set local request.headers='{}';
select throws_ok('select count(*) from effective_results where league_id=''b3000000-0000-4000-8000-000000000010''','42501',null,'anon: no-token effective_results denied');
select throws_ok('select count(*) from v_pick_results where league_id=''b3000000-0000-4000-8000-000000000010''','42501',null,'anon: no-token v_pick_results denied');
select throws_ok('select count(*) from v_champion_status where league_id=''b3000000-0000-4000-8000-000000000010''','42501',null,'anon: no-token v_champion_status denied');
select throws_ok('select count(*) from v_leaderboard where league_id=''b3000000-0000-4000-8000-000000000010''','42501',null,'anon: no-token v_leaderboard denied');
set local request.headers='{"x-league-token":"b3000000-0000-4000-8000-000000000011"}';
select throws_ok('select organizer_token from leagues where id=''b3000000-0000-4000-8000-000000000010''','42501',null,'anon: join authority cannot read organizer_token');
select throws_ok('select join_token from leagues where id=''b3000000-0000-4000-8000-000000000010''','42501',null,'anon: join authority cannot read join_token');
select throws_ok('select magic_token from participants where id=''b3000000-0000-4000-8000-000000000030''','42501',null,'anon: join authority cannot read magic_token');
select throws_ok('select push_subscription from participants where id=''b3000000-0000-4000-8000-000000000030''','42501',null,'anon: join authority cannot read push_subscription');
select throws_ok($q$insert into picks(league_id,participant_id,slot_id,team_id) values('b3000000-0000-4000-8000-000000000010','b3000000-0000-4000-8000-000000000030','anon-non-owner','synthetic-forged')$q$,'42501',null,'anon: non-owner insert denied');
select throws_ok($q$insert into picks(league_id,participant_id,slot_id,team_id) values('b3000000-0000-4000-8000-000000000010','b3000000-0000-4000-8000-000000000040','anon-cross-tenant','synthetic-forged')$q$,'42501',null,'anon: cross-tenant insert denied');
reset role;
set local role authenticated;
set local request.headers='{}';
select throws_ok('select count(*) from effective_results where league_id=''b3000000-0000-4000-8000-000000000010''','42501',null,'authenticated: no-token effective_results denied');
select throws_ok('select count(*) from v_pick_results where league_id=''b3000000-0000-4000-8000-000000000010''','42501',null,'authenticated: no-token v_pick_results denied');
select throws_ok('select count(*) from v_champion_status where league_id=''b3000000-0000-4000-8000-000000000010''','42501',null,'authenticated: no-token v_champion_status denied');
select throws_ok('select count(*) from v_leaderboard where league_id=''b3000000-0000-4000-8000-000000000010''','42501',null,'authenticated: no-token v_leaderboard denied');
set local request.headers='{"x-league-token":"b3000000-0000-4000-8000-000000000011"}';
select throws_ok('select organizer_token from leagues where id=''b3000000-0000-4000-8000-000000000010''','42501',null,'authenticated: join authority cannot read organizer_token');
select throws_ok('select join_token from leagues where id=''b3000000-0000-4000-8000-000000000010''','42501',null,'authenticated: join authority cannot read join_token');
select throws_ok('select magic_token from participants where id=''b3000000-0000-4000-8000-000000000030''','42501',null,'authenticated: join authority cannot read magic_token');
select throws_ok('select push_subscription from participants where id=''b3000000-0000-4000-8000-000000000030''','42501',null,'authenticated: join authority cannot read push_subscription');
select throws_ok($q$insert into picks(league_id,participant_id,slot_id,team_id) values('b3000000-0000-4000-8000-000000000010','b3000000-0000-4000-8000-000000000030','authenticated-non-owner','synthetic-forged')$q$,'42501',null,'authenticated: non-owner insert denied');
select throws_ok($q$insert into picks(league_id,participant_id,slot_id,team_id) values('b3000000-0000-4000-8000-000000000010','b3000000-0000-4000-8000-000000000040','authenticated-cross-tenant','synthetic-forged')$q$,'42501',null,'authenticated: cross-tenant insert denied');
reset role;
set local role service_role;
select is((select count(*) from leagues where id='b3000000-0000-4000-8000-000000000010'),1::bigint,'server service can validate league credentials');
select is((select count(*) from participants where id='b3000000-0000-4000-8000-000000000030'),1::bigint,'server service can validate participant credentials');
select is((select winner_team_id from effective_results where league_id='b3000000-0000-4000-8000-000000000010'),'synthetic-private','server effective-result reader retained');
select lives_ok($q$insert into picks(league_id,participant_id,slot_id,team_id) values('b3000000-0000-4000-8000-000000000010','b3000000-0000-4000-8000-000000000030','service-pick','synthetic')$q$,'authorized service pick persistence retained');
reset role;


-- Reviewed-only projection: actual service-role RPCs, not a resolver mock.
insert into data_providers (id, adapter_key, display_name)
values ('b3010000-0000-4000-8000-000000000001', 'sec30-fixture', 'Security Fixture');
insert into organizations (id, organization_key, name, kind)
values ('b3010000-0000-4000-8000-000000000002', 'sec30-org', 'Security Organization', 'league');
insert into competitions (id, organization_id, competition_key, name, domain, sport_code)
values ('b3010000-0000-4000-8000-000000000003', 'b3010000-0000-4000-8000-000000000002', 'sec30-cup', 'Security Cup', 'sport', 'synthetic');
insert into event_editions (id, competition_id, edition_key, name, season_label)
values ('b3010000-0000-4000-8000-000000000004', 'b3010000-0000-4000-8000-000000000003', '2026', 'Security Cup 2026', '2026');
insert into stages (id, event_edition_id, stage_key, name, kind, ordinal)
values ('b3010000-0000-4000-8000-000000000005', 'b3010000-0000-4000-8000-000000000004', 'finals', 'Finals', 'knockout', 1);
insert into contests (id, event_edition_id, stage_id, contest_key, name, kind)
values
  ('b3010000-0000-4000-8000-000000000006', 'b3010000-0000-4000-8000-000000000004', 'b3010000-0000-4000-8000-000000000005', 'final', 'Final', 'match'),
  ('b3010000-0000-4000-8000-000000000007', 'b3010000-0000-4000-8000-000000000004', 'b3010000-0000-4000-8000-000000000005', 'rollback', 'Rollback', 'match'),
  ('b3010000-0000-4000-8000-000000000014', 'b3010000-0000-4000-8000-000000000004', 'b3010000-0000-4000-8000-000000000005', 'rollback-failure', 'Rollback Failure', 'match');
insert into competitors (id, competitor_key, kind, canonical_name)
values
  ('b3010000-0000-4000-8000-000000000008', 'sec30-team-a', 'team', 'Security Team A'),
  ('b3010000-0000-4000-8000-000000000009', 'sec30-team-b', 'team', 'Security Team B');
insert into event_entries (id, event_edition_id, competitor_id, role)
values
  ('b3010000-0000-4000-8000-000000000010', 'b3010000-0000-4000-8000-000000000004', 'b3010000-0000-4000-8000-000000000008', 'team'),
  ('b3010000-0000-4000-8000-000000000011', 'b3010000-0000-4000-8000-000000000004', 'b3010000-0000-4000-8000-000000000009', 'team');
insert into contest_entries (contest_id, event_edition_id, event_entry_id, role, ordinal)
values
  ('b3010000-0000-4000-8000-000000000006', 'b3010000-0000-4000-8000-000000000004', 'b3010000-0000-4000-8000-000000000010', 'home', 1),
  ('b3010000-0000-4000-8000-000000000006', 'b3010000-0000-4000-8000-000000000004', 'b3010000-0000-4000-8000-000000000011', 'away', 2),
  ('b3010000-0000-4000-8000-000000000007', 'b3010000-0000-4000-8000-000000000004', 'b3010000-0000-4000-8000-000000000010', 'home', 1),
  ('b3010000-0000-4000-8000-000000000007', 'b3010000-0000-4000-8000-000000000004', 'b3010000-0000-4000-8000-000000000011', 'away', 2);
insert into provider_bindings (id, provider_id, event_edition_id, binding_key, mode, health_status, adapter_config)
values ('b3010000-0000-4000-8000-000000000012', 'b3010000-0000-4000-8000-000000000001', 'b3010000-0000-4000-8000-000000000004', 'sec30-primary', 'write', 'healthy', '{"allowTrustedCorrections":true}'::jsonb);
insert into ingestion_runs (id, binding_id, provider_id, event_edition_id, claim_key, trigger_kind, claimed_by, lease_expires_at)
values ('b3010000-0000-4000-8000-000000000013', 'b3010000-0000-4000-8000-000000000012', 'b3010000-0000-4000-8000-000000000001', 'b3010000-0000-4000-8000-000000000004', 'sec30-run', 'replay', 'sec30-test', now() + interval '10 minutes');

create function pg_temp.security_observation(p_name text,p_kind text,p_external text,p_data jsonb)
returns uuid language sql as $$
 select observation_id from record_provider_observation(
 'b3010000-0000-4000-8000-000000000013','b3010000-0000-4000-8000-000000000012',
 p_kind,p_external,p_name,now(),now(),1,jsonb_build_object('syntheticCase',p_name),
 jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','sec30-fixture','adapterConfigVersion',1,
 'normalizationPolicyVersion','identity-normalization-v1','completeness','full',
 'semanticHash',repeat('a',64),'normalizedEntity',p_data))
$$;
create temporary table security_observations(name text primary key,id uuid);
grant all on security_observations to service_role;


-- Synthetic registry authority; calls below remain SECURITY INVOKER.
insert into event_operator_principals(id) values(md5('fixture-operator-30')::uuid);
insert into event_operator_credentials values(encode(extensions.digest('fixture-scoped-operator-30','sha256'),'hex'),md5('fixture-operator-30')::uuid,true,now()+interval '1 hour');
insert into event_operator_grants(principal_id,environment,event_edition_id,action)
select md5('fixture-operator-30')::uuid,'local','b3010000-0000-4000-8000-000000000004'::uuid,a from unnest(array['mapping.review']) a;
create function pg_temp.review_mapping(b uuid,k text,e text,c uuid,s text) returns text language plpgsql as $$
declare v bigint; r jsonb; begin
 select operator_version into v from provider_bindings where id=b;
 r:=event_operator_command('fixture-scoped-operator-30','local','b3010000-0000-4000-8000-000000000004','mapping.review',v,'Synthetic reviewed fixture',
 jsonb_build_object('bindingId',b,'entityKind',k,'externalId',e,'canonicalId',c,'status',s));
 return r->>'outcome'; end $$;

set local role service_role;
select outcome from upsert_provider_entity_mapping('b3010000-0000-4000-8000-000000000012','organization','org','b3010000-0000-4000-8000-000000000002','automatic',1,null,null,'{}');
insert into security_observations values('root',pg_temp.security_observation('root','organization','org','{"name":"Unreviewed rewrite","organizationKind":"league","metadata":{}}'));
select is((select outcome from project_structural_observation((select id from security_observations where name='root'))),'quarantined','legacy automatic root is quarantined');
select is((select name from organizations where id='b3010000-0000-4000-8000-000000000002'),'Security Organization','unreviewed root does not mutate canonical name');

select pg_temp.review_mapping('b3010000-0000-4000-8000-000000000012','competition','competition','b3010000-0000-4000-8000-000000000003','reviewed');
insert into security_observations values('parent',pg_temp.security_observation('parent','competition','competition','{"organizationExternalId":"org","competitionKey":"sec30-cup","name":"Reviewed competition","domain":"sport","sportCode":"synthetic","rulesMetadata":{},"metadata":{}}'));
select is((select outcome from project_structural_observation((select id from security_observations where name='parent'))),'quarantined','reviewed child cannot use automatic parent');
select is((select name from competitions where id='b3010000-0000-4000-8000-000000000003'),'Security Cup','unreviewed parent does not mutate child');

select pg_temp.review_mapping('b3010000-0000-4000-8000-000000000012','organization','org','b3010000-0000-4000-8000-000000000002','reviewed');
select is((select outcome from project_structural_observation((select id from security_observations where name='root'))),'projected','reviewed root replay projects');
select is((select name from organizations where id='b3010000-0000-4000-8000-000000000002'),'Unreviewed rewrite','reviewed root canonical write retained');
select is((select outcome from project_structural_observation((select id from security_observations where name='parent'))),'projected','reviewed parent and child project');

-- Even supported-policy metadata is not a verified association.
select outcome from upsert_provider_entity_mapping('b3010000-0000-4000-8000-000000000012','competitor','wrong-team','b3010000-0000-4000-8000-000000000008','automatic',1,null,null,'{"verifiedDeterministicBootstrap":true,"normalizationPolicyVersion":"identity-normalization-v1"}');
insert into security_observations values('forged',pg_temp.security_observation('forged','competitor','wrong-team','{"canonicalName":"Forged rewrite","competitorKind":"team","metadata":{}}'));
select is((select outcome from project_structural_observation((select id from security_observations where name='forged'))),'quarantined','caller bootstrap flag cannot authorize same-edition wrong association');
select is((select canonical_name from competitors where id='b3010000-0000-4000-8000-000000000008'),'Security Team A','forged bootstrap does not mutate eligible canonical target');

select pg_temp.review_mapping('b3010000-0000-4000-8000-000000000012','contest','contest','b3010000-0000-4000-8000-000000000006','reviewed');
select outcome from upsert_provider_entity_mapping('b3010000-0000-4000-8000-000000000012','event_entry','winner','b3010000-0000-4000-8000-000000000010','automatic',1,null,null,'{"verifiedDeterministicBootstrap":true,"normalizationPolicyVersion":"unsupported"}');
insert into security_observations values('result',pg_temp.security_observation('result','result','result','{"contestExternalId":"contest","resultStatus":"final","outcomeType":"winner","winnerEventEntryExternalId":"winner","resultData":{"synthetic":true}}'));
select is((select outcome from project_provider_result((select id from security_observations where name='result'))),'quarantined','result cannot use automatic winner');
select is((select count(*) from contest_results where contest_id='b3010000-0000-4000-8000-000000000006'),0::bigint,'unreviewed winner creates no canonical result');
select pg_temp.review_mapping('b3010000-0000-4000-8000-000000000012','event_entry','winner','b3010000-0000-4000-8000-000000000010','reviewed');
select is((select outcome from project_provider_result((select id from security_observations where name='result'))),'projected','reviewed contest and winner project');
select is((select count(*) from contest_results where contest_id='b3010000-0000-4000-8000-000000000006'),1::bigint,'reviewed result persisted once');
select is((select outcome from project_provider_result((select id from security_observations where name='result'))),'duplicate','reviewed result replay stays idempotent');

select outcome from upsert_provider_entity_mapping('b3010000-0000-4000-8000-000000000012','contest','unreviewed-contest','b3010000-0000-4000-8000-000000000007','automatic',1,null,null,'{}');
insert into security_observations values('contest-result',pg_temp.security_observation('contest-result','result','contest-result','{"contestExternalId":"unreviewed-contest","resultStatus":"final","outcomeType":"winner","winnerEventEntryExternalId":"winner","resultData":{"synthetic":true}}'));
select is((select outcome from project_provider_result((select id from security_observations where name='contest-result'))),'quarantined','result cannot use automatic contest');
select is((select count(*) from contest_results where contest_id='b3010000-0000-4000-8000-000000000007'),0::bigint,'unreviewed contest creates no result');


-- Nested structural identities are admission dependencies, not just the subject.
select pg_temp.review_mapping('b3010000-0000-4000-8000-000000000012','event_edition','edition','b3010000-0000-4000-8000-000000000004','reviewed');
select outcome from upsert_provider_entity_mapping('b3010000-0000-4000-8000-000000000012','stage','stage','b3010000-0000-4000-8000-000000000005','automatic',1,null,null,'{}');
select outcome from upsert_provider_entity_mapping('b3010000-0000-4000-8000-000000000012','event_entry','nested-entry','b3010000-0000-4000-8000-000000000011','automatic',1,null,null,'{}');
insert into security_observations values('nested',pg_temp.security_observation('nested','contest','contest','{"eventEditionExternalId":"edition","stageExternalId":"stage","contestKey":"final","name":"Nested rewrite","contestKind":"match","status":"scheduled","requiredForCompletion":true,"entries":[{"eventEntryExternalId":"nested-entry","role":"away","ordinal":2,"metadata":{}}],"metadata":{}}'));
select is((select outcome from project_structural_observation((select id from security_observations where name='nested'))),'quarantined','reviewed contest cannot use automatic stage');
select pg_temp.review_mapping('b3010000-0000-4000-8000-000000000012','stage','stage','b3010000-0000-4000-8000-000000000005','reviewed');
select is((select outcome from project_structural_observation((select id from security_observations where name='nested'))),'quarantined','reviewed contest cannot use nested automatic entry');
select is((select name from contests where id='b3010000-0000-4000-8000-000000000006'),'Final','nested identity rejection leaves canonical contest unchanged');


insert into security_observations values('drift',pg_temp.security_observation('drift','stage','stage','{"eventEditionExternalId":"edition","stageKey":"impostor","name":"Impostor","stageKind":"knockout","ordinal":2,"metadata":{}}'));
select is((select outcome from project_structural_observation((select id from security_observations where name='drift'))),'quarantined','reviewed subject cannot drift to a different canonical natural key');
select is((select count(*) from stages where event_edition_id='b3010000-0000-4000-8000-000000000004' and stage_key='impostor'),0::bigint,'canonical identity mismatch rolls back all structural writes');
insert into security_observations values('stage-valid',pg_temp.security_observation('stage-valid','stage','stage','{"eventEditionExternalId":"edition","stageKey":"finals","name":"Reviewed Finals","stageKind":"knockout","ordinal":1,"metadata":{}}'));
select is((select outcome from project_structural_observation((select id from security_observations where name='stage-valid'))),'projected','reviewed non-root structural projection retained');

insert into security_observations values('missing-subject',pg_temp.security_observation('missing-subject','stage','missing-subject','{"eventEditionExternalId":"edition","stageKey":"new-unreviewed","name":"Unreviewed","stageKind":"knockout","ordinal":3,"metadata":{}}'));
select is((select outcome from project_structural_observation((select id from security_observations where name='missing-subject'))),'quarantined','missing subject cannot bootstrap a new association');
select is((select count(*) from stages where event_edition_id='b3010000-0000-4000-8000-000000000004' and stage_key='new-unreviewed'),0::bigint,'missing subject creates no canonical object');
select throws_ok($q$select security_reviewed_observation_identity((select id from security_observations where name='root'))$q$,'42501',null,'service cannot call internal identity admission helper');
select throws_ok($q$select * from project_structural_observation_unchecked((select id from security_observations where name='forged'))$q$,'42501',null,'service cannot bypass structural admission');
select throws_ok($q$select * from project_provider_result_unchecked((select id from security_observations where name='contest-result'),null)$q$,'42501',null,'service cannot bypass result admission');
reset role;
select is((select count(*) from picks where league_id='b3000000-0000-4000-8000-000000000010' and team_id='synthetic-forged'),0::bigint,'no rejected browser insertion persisted');
select ok(not has_function_privilege('anon','project_structural_observation(uuid)','execute'),'anon cannot project');
select ok(not has_function_privilege('authenticated','project_provider_result(uuid,text)','execute'),'authenticated cannot project');
select * from finish();
rollback;
