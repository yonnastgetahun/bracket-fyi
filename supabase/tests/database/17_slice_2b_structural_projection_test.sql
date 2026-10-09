begin;

select plan(18);

select has_table('public', 'canonical_structural_projection_state', 'structural projection records observation provenance');
select is((select relrowsecurity from pg_class where oid = 'public.canonical_structural_projection_state'::regclass), true, 'structural provenance is protected by RLS');
select is((select count(*) from information_schema.role_routine_grants where specific_schema='public' and routine_name='project_structural_observation' and grantee in ('anon','authenticated')), 0::bigint, 'browser roles cannot execute structural projection');

insert into data_providers (id, adapter_key, display_name) values ('97000000-0000-4000-8000-000000000001','structural-fixture','Structural Fixture');
insert into organizations (id, organization_key, name, kind) values ('97000000-0000-4000-8000-000000000002','structural-org','Structural Organization','league');
insert into competitions (id, organization_id, competition_key, name, domain, sport_code) values ('97000000-0000-4000-8000-000000000003','97000000-0000-4000-8000-000000000002','structural-cup','Structural Cup','sport','synthetic');
insert into event_editions (id, competition_id, edition_key, name, season_label) values ('97000000-0000-4000-8000-000000000004','97000000-0000-4000-8000-000000000003','2026','Structural Cup 2026','2026');
insert into competitors (id, competitor_key, kind, canonical_name) values
  ('97000000-0000-4000-8000-000000000005','structural-team-a','team','Structural Team A'),
  ('97000000-0000-4000-8000-000000000006','structural-team-b','team','Structural Team B');
insert into event_entries (id,event_edition_id,competitor_id,role) values
  ('97000000-0000-4000-8000-000000000007','97000000-0000-4000-8000-000000000004','97000000-0000-4000-8000-000000000005','team'),
  ('97000000-0000-4000-8000-000000000008','97000000-0000-4000-8000-000000000004','97000000-0000-4000-8000-000000000006','team');
insert into provider_bindings (id,provider_id,event_edition_id,binding_key,mode,health_status) values ('97000000-0000-4000-8000-000000000009','97000000-0000-4000-8000-000000000001','97000000-0000-4000-8000-000000000004','structural-primary','shadow','healthy');
insert into ingestion_runs (id,binding_id,provider_id,event_edition_id,claim_key,trigger_kind,claimed_by,lease_expires_at) values ('97000000-0000-4000-8000-000000000010','97000000-0000-4000-8000-000000000009','97000000-0000-4000-8000-000000000001','97000000-0000-4000-8000-000000000004','structural-run','replay','structural-test',now()+interval '10 minutes');

insert into provider_entity_refs (binding_id,provider_id,event_edition_id,entity_kind,external_id,canonical_id,resolution_status,reviewed_by,reviewed_at) values
  ('97000000-0000-4000-8000-000000000009','97000000-0000-4000-8000-000000000001','97000000-0000-4000-8000-000000000004','event_edition','edition-1','97000000-0000-4000-8000-000000000004','reviewed','structural-operator',now()),
  ('97000000-0000-4000-8000-000000000009','97000000-0000-4000-8000-000000000001','97000000-0000-4000-8000-000000000004','competitor','team-a','97000000-0000-4000-8000-000000000005','reviewed','structural-operator',now()),
  ('97000000-0000-4000-8000-000000000009','97000000-0000-4000-8000-000000000001','97000000-0000-4000-8000-000000000004','competitor','team-b','97000000-0000-4000-8000-000000000006','reviewed','structural-operator',now());
select is((select count(*) from provider_entity_refs where entity_kind='event_edition'),1::bigint,'root event edition mapping is pre-provisioned');

create temporary table slice_2b_structural_observations (name text primary key, observation_id uuid);

insert into slice_2b_structural_observations
select 'entry-a', observation_id from record_provider_observation(
  '97000000-0000-4000-8000-000000000010','97000000-0000-4000-8000-000000000009','event_entry','entry-a','entry-a-1','2026-10-08T17:00:00Z','2026-10-08T17:01:00Z',1,'{"synthetic":true}'::jsonb,
  jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','structural-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition-1','competitorExternalId','team-a','role','team','status','confirmed','metadata',jsonb_build_object('synthetic',true)),'semanticHash',repeat('1',64))
);
insert into slice_2b_structural_observations
select 'entry-b', observation_id from record_provider_observation(
  '97000000-0000-4000-8000-000000000010','97000000-0000-4000-8000-000000000009','event_entry','entry-b','entry-b-1','2026-10-08T17:00:00Z','2026-10-08T17:02:00Z',1,'{"synthetic":true}'::jsonb,
  jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','structural-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition-1','competitorExternalId','team-b','role','team','status','confirmed','metadata',jsonb_build_object('synthetic',true)),'semanticHash',repeat('2',64))
);
select is((select outcome from project_structural_observation((select observation_id from slice_2b_structural_observations where name='entry-a'))),'projected','edition-scoped event entry projects atomically');
select is((select outcome from project_structural_observation((select observation_id from slice_2b_structural_observations where name='entry-b'))),'projected','second event entry projects atomically');
select is((select count(*) from provider_entity_refs where entity_kind='event_entry'),2::bigint,'event entry mappings are created with their structures');

insert into slice_2b_structural_observations
select 'round-before-stage', observation_id from record_provider_observation(
  '97000000-0000-4000-8000-000000000010','97000000-0000-4000-8000-000000000009','round','round-1','round-1','2026-10-08T17:00:00Z','2026-10-08T17:03:00Z',1,'{"synthetic":true}'::jsonb,
  jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','structural-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition-1','stageExternalId','stage-1','roundKey','round-1','name','Round 1','ordinal',1,'metadata',jsonb_build_object('synthetic',true)),'semanticHash',repeat('3',64))
);
select is((select outcome from project_structural_observation((select observation_id from slice_2b_structural_observations where name='round-before-stage'))),'quarantined','child arriving before its stage is quarantined');

insert into slice_2b_structural_observations
select 'stage-1', observation_id from record_provider_observation(
  '97000000-0000-4000-8000-000000000010','97000000-0000-4000-8000-000000000009','stage','stage-1','stage-1','2026-10-08T18:00:00Z','2026-10-08T18:04:00Z',1,'{"synthetic":true}'::jsonb,
  jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','structural-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition-1','stageKey','knockout','name','Knockout','stageKind','knockout','ordinal',1,'metadata',jsonb_build_object('synthetic',true)),'semanticHash',repeat('4',64))
);
select is((select outcome from project_structural_observation((select observation_id from slice_2b_structural_observations where name='stage-1'))),'projected','parent stage projects after the child quarantine');
select is((select outcome from project_structural_observation((select observation_id from slice_2b_structural_observations where name='round-before-stage'))),'projected','replaying a quarantined child projects after its dependency arrives');

insert into slice_2b_structural_observations
select 'contest-1', observation_id from record_provider_observation(
  '97000000-0000-4000-8000-000000000010','97000000-0000-4000-8000-000000000009','contest','contest-1','contest-1','2026-10-08T19:00:00Z','2026-10-08T19:01:00Z',1,'{"synthetic":true}'::jsonb,
  jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','structural-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition-1','stageExternalId','stage-1','contestKey','game-1','name','Synthetic Game','contestKind','game','status','scheduled','requiredForCompletion',true,'entries',jsonb_build_array(jsonb_build_object('eventEntryExternalId','entry-a','role','home','ordinal',1,'metadata','{}'::jsonb),jsonb_build_object('eventEntryExternalId','entry-b','role','away','ordinal',2,'metadata','{}'::jsonb)),'metadata',jsonb_build_object('synthetic',true)),'semanticHash',repeat('5',64))
);
select is((select outcome from project_structural_observation((select observation_id from slice_2b_structural_observations where name='contest-1'))),'projected','contest and contest entries project after dependencies');
select is((select count(*) from contest_entries),2::bigint,'contest entries are complete after atomic projection');

insert into slice_2b_structural_observations
select 'contest-1-partial', observation_id from record_provider_observation(
  '97000000-0000-4000-8000-000000000010','97000000-0000-4000-8000-000000000009','contest','contest-1','contest-1-partial','2026-10-08T20:00:00Z','2026-10-08T20:01:00Z',1,'{"synthetic":true}'::jsonb,
  jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','structural-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','partial','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition-1','stageExternalId','stage-1','contestKey','game-1','name','Synthetic Game Updated','contestKind','game','status','live','requiredForCompletion',true,'entries',jsonb_build_array(jsonb_build_object('eventEntryExternalId','entry-a','role','home','ordinal',1,'metadata','{}'::jsonb)),'metadata',jsonb_build_object('synthetic',true)),'semanticHash',repeat('6',64))
);
select is((select outcome from project_structural_observation((select observation_id from slice_2b_structural_observations where name='contest-1-partial'))),'projected','partial structural update projects without deletion');
select is((select count(*) from contest_entries),2::bigint,'partial structural snapshots never delete unseen contest entries');

insert into slice_2b_structural_observations
select 'contest-2', observation_id from record_provider_observation(
  '97000000-0000-4000-8000-000000000010','97000000-0000-4000-8000-000000000009','contest','contest-2','contest-2-1','2026-10-08T19:30:00Z','2026-10-08T20:03:00Z',1,'{"synthetic":true}'::jsonb,
  jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','structural-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition-1','stageExternalId','stage-1','contestKey','game-2','name','Synthetic Game 2','contestKind','game','status','scheduled','requiredForCompletion',true,'entries',jsonb_build_array(jsonb_build_object('eventEntryExternalId','entry-a','role','home','ordinal',1,'metadata','{}'::jsonb),jsonb_build_object('eventEntryExternalId','entry-b','role','away','ordinal',2,'metadata','{}'::jsonb)),'metadata',jsonb_build_object('synthetic',true)),'semanticHash',repeat('9',64))
);
select is((select outcome from project_structural_observation((select observation_id from slice_2b_structural_observations where name='contest-2'))),'projected','second contest projects for graph-cycle validation');

insert into slice_2b_structural_observations
select 'contest-1-older', observation_id from record_provider_observation(
  '97000000-0000-4000-8000-000000000010','97000000-0000-4000-8000-000000000009','contest','contest-1','contest-1-older','2026-10-08T19:30:00Z','2026-10-08T20:02:00Z',1,'{"synthetic":true}'::jsonb,
  jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','structural-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition-1','stageExternalId','stage-1','contestKey','game-1','name','Older Name','contestKind','game','status','scheduled','requiredForCompletion',true,'entries',jsonb_build_array(jsonb_build_object('eventEntryExternalId','entry-a','role','home','ordinal',1,'metadata','{}'::jsonb),jsonb_build_object('eventEntryExternalId','entry-b','role','away','ordinal',2,'metadata','{}'::jsonb)),'metadata',jsonb_build_object('synthetic',true)),'semanticHash',repeat('7',64))
);
select is((select outcome from project_structural_observation((select observation_id from slice_2b_structural_observations where name='contest-1-older'))),'quarantined','older structural updates are quarantined');

insert into slice_2b_structural_observations
select 'cycle-bracket', observation_id from record_provider_observation(
  '97000000-0000-4000-8000-000000000010','97000000-0000-4000-8000-000000000009','bracket','cycle-bracket','cycle-bracket-1','2026-10-08T21:00:00Z','2026-10-08T21:01:00Z',1,'{"synthetic":true}'::jsonb,
  jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','structural-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition-1','bracketKey','cycle','name','Cycle','bracketKind','knockout','edges',jsonb_build_array(jsonb_build_object('fromContestExternalId','contest-1','toContestExternalId','contest-2','outcome','winner','targetRole','cycle-a','priority',1,'metadata','{}'::jsonb),jsonb_build_object('fromContestExternalId','contest-2','toContestExternalId','contest-1','outcome','winner','targetRole','cycle-b','priority',2,'metadata','{}'::jsonb)),'metadata',jsonb_build_object('synthetic',true)),'semanticHash',repeat('8',64))
);
select is((select outcome from project_structural_observation((select observation_id from slice_2b_structural_observations where name='cycle-bracket'))),'quarantined','cyclic bracket structure is quarantined before writes');
select is((select count(*) from brackets where bracket_key='cycle'),0::bigint,'cyclic bracket projection leaves no partial bracket row');

select * from finish();
rollback;
