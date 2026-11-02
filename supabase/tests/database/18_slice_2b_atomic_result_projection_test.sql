begin;
-- Explicit synthetic fixture activation; production remains stopped by default.
update event_runtime_control set global_stopped=false;

select plan(39);

select is(
  (select count(*) from information_schema.role_routine_grants
   where specific_schema = 'public'
     and routine_name = 'project_provider_result'
     and grantee in ('anon', 'authenticated')),
  0::bigint,
  'browser roles cannot execute atomic result projection'
);

select is(
  (select count(*) from information_schema.role_routine_grants
   where specific_schema = 'public'
     and routine_name = 'project_provider_result'
     and grantee = 'service_role'),
  1::bigint,
  'only service_role receives atomic result projection execution'
);

insert into data_providers (id, adapter_key, display_name)
values ('98000000-0000-4000-8000-000000000001', 'result-fixture', 'Result Fixture');
insert into organizations (id, organization_key, name, kind)
values ('98000000-0000-4000-8000-000000000002', 'result-org', 'Result Organization', 'league');
insert into competitions (id, organization_id, competition_key, name, domain, sport_code)
values ('98000000-0000-4000-8000-000000000003', '98000000-0000-4000-8000-000000000002', 'result-cup', 'Result Cup', 'sport', 'synthetic');
insert into event_editions (id, competition_id, edition_key, name, season_label)
values ('98000000-0000-4000-8000-000000000004', '98000000-0000-4000-8000-000000000003', '2026', 'Result Cup 2026', '2026');
insert into stages (id, event_edition_id, stage_key, name, kind, ordinal)
values ('98000000-0000-4000-8000-000000000005', '98000000-0000-4000-8000-000000000004', 'finals', 'Finals', 'knockout', 1);
insert into contests (id, event_edition_id, stage_id, contest_key, name, kind)
values
  ('98000000-0000-4000-8000-000000000006', '98000000-0000-4000-8000-000000000004', '98000000-0000-4000-8000-000000000005', 'final', 'Final', 'match'),
  ('98000000-0000-4000-8000-000000000007', '98000000-0000-4000-8000-000000000004', '98000000-0000-4000-8000-000000000005', 'rollback', 'Rollback', 'match'),
  ('98000000-0000-4000-8000-000000000014', '98000000-0000-4000-8000-000000000004', '98000000-0000-4000-8000-000000000005', 'rollback-failure', 'Rollback Failure', 'match');
insert into competitors (id, competitor_key, kind, canonical_name)
values
  ('98000000-0000-4000-8000-000000000008', 'result-team-a', 'team', 'Result Team A'),
  ('98000000-0000-4000-8000-000000000009', 'result-team-b', 'team', 'Result Team B');
insert into event_entries (id, event_edition_id, competitor_id, role)
values
  ('98000000-0000-4000-8000-000000000010', '98000000-0000-4000-8000-000000000004', '98000000-0000-4000-8000-000000000008', 'team'),
  ('98000000-0000-4000-8000-000000000011', '98000000-0000-4000-8000-000000000004', '98000000-0000-4000-8000-000000000009', 'team');
insert into contest_entries (contest_id, event_edition_id, event_entry_id, role, ordinal)
values
  ('98000000-0000-4000-8000-000000000006', '98000000-0000-4000-8000-000000000004', '98000000-0000-4000-8000-000000000010', 'home', 1),
  ('98000000-0000-4000-8000-000000000006', '98000000-0000-4000-8000-000000000004', '98000000-0000-4000-8000-000000000011', 'away', 2),
  ('98000000-0000-4000-8000-000000000007', '98000000-0000-4000-8000-000000000004', '98000000-0000-4000-8000-000000000010', 'home', 1),
  ('98000000-0000-4000-8000-000000000007', '98000000-0000-4000-8000-000000000004', '98000000-0000-4000-8000-000000000011', 'away', 2);
insert into provider_bindings (id, provider_id, event_edition_id, binding_key, mode, health_status, adapter_config)
values ('98000000-0000-4000-8000-000000000012', '98000000-0000-4000-8000-000000000001', '98000000-0000-4000-8000-000000000004', 'result-primary', 'write', 'healthy', '{"allowTrustedCorrections":true}'::jsonb);
insert into ingestion_runs (id, binding_id, provider_id, event_edition_id, claim_key, trigger_kind, claimed_by, lease_expires_at)
values ('98000000-0000-4000-8000-000000000013', '98000000-0000-4000-8000-000000000012', '98000000-0000-4000-8000-000000000001', '98000000-0000-4000-8000-000000000004', 'result-run', 'replay', 'result-test', now() + interval '10 minutes');
insert into provider_entity_refs (binding_id, provider_id, event_edition_id, entity_kind, external_id, canonical_id, resolution_status, reviewed_by, reviewed_at)
values
  ('98000000-0000-4000-8000-000000000012', '98000000-0000-4000-8000-000000000001', '98000000-0000-4000-8000-000000000004', 'contest', 'contest-1', '98000000-0000-4000-8000-000000000006', 'reviewed', 'result-operator', now()),
  ('98000000-0000-4000-8000-000000000012', '98000000-0000-4000-8000-000000000001', '98000000-0000-4000-8000-000000000004', 'contest', 'rollback-contest', '98000000-0000-4000-8000-000000000007', 'reviewed', 'result-operator', now()),
  ('98000000-0000-4000-8000-000000000012', '98000000-0000-4000-8000-000000000001', '98000000-0000-4000-8000-000000000004', 'contest', 'rollback-failure-contest', '98000000-0000-4000-8000-000000000014', 'reviewed', 'result-operator', now()),
  ('98000000-0000-4000-8000-000000000012', '98000000-0000-4000-8000-000000000001', '98000000-0000-4000-8000-000000000004', 'event_entry', 'entry-a', '98000000-0000-4000-8000-000000000010', 'reviewed', 'result-operator', now()),
  ('98000000-0000-4000-8000-000000000012', '98000000-0000-4000-8000-000000000001', '98000000-0000-4000-8000-000000000004', 'event_entry', 'entry-b', '98000000-0000-4000-8000-000000000011', 'reviewed', 'result-operator', now());

create temporary table slice_2b_result_observations (name text primary key, observation_id uuid);

insert into slice_2b_result_observations
select 'invalid-state', observation_id from record_provider_observation(
  '98000000-0000-4000-8000-000000000013', '98000000-0000-4000-8000-000000000012', 'result', 'result-invalid-state', 'revision-invalid', '2026-10-08T17:59:00Z', '2026-10-08T17:59:30Z', 1, '{"synthetic":true}'::jsonb,
  jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','result-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition-1','contestExternalId','contest-1','resultStatus','final','outcomeType','pending','resultData',jsonb_build_object('source','sports'),'providerEffectiveAt','2026-10-08T17:59:00Z'),'semanticHash',repeat('0',64))
);
insert into slice_2b_result_observations
select 'final-a', observation_id from record_provider_observation(
  '98000000-0000-4000-8000-000000000013', '98000000-0000-4000-8000-000000000012', 'result', 'result-final-a', 'revision-1', '2026-10-08T18:00:00Z', '2026-10-08T18:01:00Z', 1, '{"synthetic":true}'::jsonb,
  jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','result-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition-1','contestExternalId','contest-1','resultStatus','final','outcomeType','winner','winnerEventEntryExternalId','entry-a','resultData',jsonb_build_object('source','sports'),'score',jsonb_build_object('home',2,'away',1),'providerEffectiveAt','2026-10-08T18:00:00Z'),'semanticHash',repeat('1',64))
);
insert into slice_2b_result_observations
select 'semantic-duplicate', observation_id from record_provider_observation(
  '98000000-0000-4000-8000-000000000013', '98000000-0000-4000-8000-000000000012', 'result', 'result-final-a-duplicate', 'revision-2', '2026-10-08T18:01:00Z', '2026-10-08T18:02:00Z', 1, '{"synthetic":true,"delivery":2}'::jsonb,
  jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','result-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition-1','contestExternalId','contest-1','resultStatus','final','outcomeType','winner','winnerEventEntryExternalId','entry-a','resultData',jsonb_build_object('source','sports'),'score',jsonb_build_object('away',1,'home',2),'providerEffectiveAt','2026-10-08T18:00:00Z'),'semanticHash',repeat('1',64))
);
insert into slice_2b_result_observations
select 'stale', observation_id from record_provider_observation(
  '98000000-0000-4000-8000-000000000013', '98000000-0000-4000-8000-000000000012', 'result', 'result-stale', 'revision-3', '2026-10-08T17:00:00Z', '2026-10-08T18:03:00Z', 1, '{"synthetic":true}'::jsonb,
  jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','result-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition-1','contestExternalId','contest-1','resultStatus','final','outcomeType','winner','winnerEventEntryExternalId','entry-b','resultData',jsonb_build_object('source','sports'),'score',jsonb_build_object('home',3,'away',0),'providerEffectiveAt','2026-10-08T17:00:00Z'),'semanticHash',repeat('2',64))
);
insert into slice_2b_result_observations
select 'changed-terminal', observation_id from record_provider_observation(
  '98000000-0000-4000-8000-000000000013', '98000000-0000-4000-8000-000000000012', 'result', 'result-changed-terminal', 'revision-4', '2026-10-08T19:00:00Z', '2026-10-08T19:01:00Z', 1, '{"synthetic":true}'::jsonb,
  jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','result-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition-1','contestExternalId','contest-1','resultStatus','final','outcomeType','winner','winnerEventEntryExternalId','entry-b','resultData',jsonb_build_object('source','sports'),'score',jsonb_build_object('home',0,'away',4),'providerEffectiveAt','2026-10-08T19:00:00Z'),'semanticHash',repeat('3',64))
);
insert into slice_2b_result_observations
select 'accepted-correction', observation_id from record_provider_observation(
  '98000000-0000-4000-8000-000000000013', '98000000-0000-4000-8000-000000000012', 'result', 'result-accepted-correction', 'revision-5', '2026-10-08T20:00:00Z', '2026-10-08T20:01:00Z', 1, '{"synthetic":true}'::jsonb,
  jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','result-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','correctionProvenance','operator-approved synthetic correction','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition-1','contestExternalId','contest-1','resultStatus','final','outcomeType','winner','winnerEventEntryExternalId','entry-b','resultData',jsonb_build_object('source','sports'),'score',jsonb_build_object('home',0,'away',4),'providerEffectiveAt','2026-10-08T20:00:00Z','correctionReason','official score correction'),'semanticHash',repeat('4',64))
);
insert into slice_2b_result_observations
select 'unresolved-correction', observation_id from record_provider_observation(
  '98000000-0000-4000-8000-000000000013', '98000000-0000-4000-8000-000000000012', 'result', 'result-unresolved-correction', 'revision-6', '2026-10-08T21:00:00Z', '2026-10-08T21:01:00Z', 1, '{"synthetic":true}'::jsonb,
  jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','result-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','correctionProvenance','operator-approved synthetic correction','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition-1','contestExternalId','contest-1','resultStatus','unresolved','outcomeType','pending','resultData',jsonb_build_object('source','sports'),'providerEffectiveAt','2026-10-08T21:00:00Z','correctionReason','official review reopened result'),'semanticHash',repeat('5',64))
);
insert into slice_2b_result_observations
select 'rollback', observation_id from record_provider_observation(
  '98000000-0000-4000-8000-000000000013', '98000000-0000-4000-8000-000000000012', 'result', 'result-rollback', 'revision-7', '2026-10-08T22:00:00Z', '2026-10-08T22:01:00Z', 1, '{"synthetic":true}'::jsonb,
  jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','result-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition-1','contestExternalId','rollback-contest','resultStatus','final','outcomeType','draw','resultData',jsonb_build_object('source','rollback'),'providerEffectiveAt','2026-10-08T22:00:00Z'),'semanticHash',repeat('6',64))
);
insert into slice_2b_result_observations
select 'rollback-failure', observation_id from record_provider_observation(
  '98000000-0000-4000-8000-000000000013', '98000000-0000-4000-8000-000000000012', 'result', 'result-rollback-failure', 'revision-8', '2026-10-08T23:00:00Z', '2026-10-08T23:01:00Z', 1, '{"synthetic":true}'::jsonb,
  jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','result-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition-1','contestExternalId','rollback-failure-contest','resultStatus','final','outcomeType','draw','resultData',jsonb_build_object('source','rollback'),'providerEffectiveAt','2026-10-08T23:00:00Z'),'semanticHash',repeat('7',64))
);

select is((select outcome from project_provider_result((select observation_id from slice_2b_result_observations where name = 'invalid-state'))), 'quarantined', 'incompatible result status and outcome are quarantined');
select is((select count(*) from contest_results where contest_id = '98000000-0000-4000-8000-000000000006'), 0::bigint, 'invalid result state creates no canonical result');
select is((select outcome from project_provider_result((select observation_id from slice_2b_result_observations where name = 'final-a'))), 'projected', 'first final result projects');
select is((select count(*) from contest_results where contest_id = '98000000-0000-4000-8000-000000000006'), 1::bigint, 'first projection creates one immutable result version');
select is((select count(*) from result_audit_events where contest_id = '98000000-0000-4000-8000-000000000006'), 1::bigint, 'first projection creates one audit event');
select is((select count(*) from notification_outbox where contest_id = '98000000-0000-4000-8000-000000000006' and intent_type = 'result_final'), 1::bigint, 'first final creates one operator result_final intent');
select is((select outcome from project_provider_result((select observation_id from slice_2b_result_observations where name = 'final-a'))), 'duplicate', 'exact replay returns the prior outcome');
select is((select outcome from project_provider_result((select observation_id from slice_2b_result_observations where name = 'semantic-duplicate'))), 'duplicate', 'semantic replay from a different observation is idempotent');
select is((select count(*) from contest_results where contest_id = '98000000-0000-4000-8000-000000000006'), 1::bigint, 'exact and semantic replay create no duplicate result');
select is((select outcome from project_provider_result((select observation_id from slice_2b_result_observations where name = 'stale'))), 'ignored_stale', 'older result update is ignored and quarantined');
select is((select outcome from project_provider_result((select observation_id from slice_2b_result_observations where name = 'changed-terminal'))), 'quarantined', 'changed terminal result defaults to quarantine');
select is((select outcome from project_provider_result((select observation_id from slice_2b_result_observations where name = 'accepted-correction'))), 'projected', 'newer attributable correction with binding policy is accepted');
select is((select max(version) from contest_results where contest_id = '98000000-0000-4000-8000-000000000006'), 2, 'accepted correction appends exactly one result version');
select is((select count(*) from notification_outbox where contest_id = '98000000-0000-4000-8000-000000000006' and intent_type = 'result_final'), 1::bigint, 'accepted correction does not emit another result_final intent');
select is((select count(*) from notification_outbox where contest_id = '98000000-0000-4000-8000-000000000006' and intent_type = 'result_correction'), 1::bigint, 'accepted correction emits one result_correction intent');
select is((select outcome from project_provider_result((select observation_id from slice_2b_result_observations where name = 'unresolved-correction'))), 'projected', 'accepted correction to unresolved is append-only');
select is((select max(version) from contest_results where contest_id = '98000000-0000-4000-8000-000000000006'), 3, 'unresolved correction appends a later version');
select is((select count(*) from notification_outbox where contest_id = '98000000-0000-4000-8000-000000000006' and intent_type = 'result_correction'), 2::bigint, 'each accepted correction emits exactly one correction intent');
select is((select count(*) from result_audit_events where contest_id = '98000000-0000-4000-8000-000000000006'), 3::bigint, 'accepted versions have exactly one audit event each');
select is((select outcome from project_provider_result((select observation_id from slice_2b_result_observations where name = 'rollback'))), 'projected', 'rollback fixture reaches the transaction boundary');
select is((select count(*) from notification_outbox where contest_id = '98000000-0000-4000-8000-000000000007'), 1::bigint, 'a final draw creates one operator intent');
select throws_ok(
  $$select * from project_provider_result((select observation_id from slice_2b_result_observations where name = 'rollback'), 'wrong-key')$$,
  '22023', null,
  'caller idempotency key is verified rather than trusted'
);
select is((select count(*) from contest_results where contest_id = '98000000-0000-4000-8000-000000000007'), 1::bigint, 'failed replay validation does not add a result');
select is((select count(*) from ingestion_quarantine where issue_code in ('stale_update','conflicting_terminal_result')), 2::bigint, 'stale and terminal-conflict decisions preserve quarantine evidence');
select is((select count(*) from notification_outbox where audience_kind <> 'operator'), 0::bigint, 'Slice 2B result intents remain operator-only');
select is((select count(*) from result_audit_events where event_type = 'result.corrected'), 2::bigint, 'correction audit classification is derived in SQL');
select is((select count(*) from notification_outbox where intent_type = 'result_correction' and contest_id = '98000000-0000-4000-8000-000000000006'), 2::bigint, 'no duplicate correction intents exist');
select is((select count(*) from contest_results where source_type <> 'provider'), 0::bigint, 'result projection writes provider-sourced results only');
select is((select count(*) from result_audit_events where actor_type <> 'provider'), 0::bigint, 'result projection derives provider actor provenance');
select is((select count(*) from notification_outbox where intent_type not in ('result_final','result_correction')), 0::bigint, 'result projection creates no out-of-scope intent types');
select is((select count(*) from contest_results where contest_id = '98000000-0000-4000-8000-000000000006' and version = 3 and result_status = 'unresolved'), 1::bigint, 'unresolved correction remains an explicit result state');
select is((select count(*) from contest_results where contest_id = '98000000-0000-4000-8000-000000000006' and supersedes_result_id is null), 1::bigint, 'append-only versions have one root result');
select is((select count(*) from contest_results where contest_id = '98000000-0000-4000-8000-000000000006' and correction_reason is not null), 2::bigint, 'accepted corrections persist nonblank correction reasons');

create function slice_2b_fail_result_audit() returns trigger
language plpgsql
as $$
begin
  raise exception 'synthetic audit failure';
end;
$$;
create trigger slice_2b_fail_result_audit_trigger
before insert on result_audit_events
for each row execute function slice_2b_fail_result_audit();
select throws_ok(
  $$select * from project_provider_result((select observation_id from slice_2b_result_observations where name = 'rollback-failure'))$$,
  'P0001', 'synthetic audit failure',
  'audit failure rolls back the result and outbox atomically'
);
drop trigger slice_2b_fail_result_audit_trigger on result_audit_events;
drop function slice_2b_fail_result_audit();
select is((select count(*) from contest_results where contest_id = '98000000-0000-4000-8000-000000000014'), 0::bigint, 'transaction rollback leaves no partial result');
select is((select count(*) from notification_outbox where contest_id = '98000000-0000-4000-8000-000000000014'), 0::bigint, 'transaction rollback leaves no partial outbox intent');

set local role anon;
select throws_ok(
  $$select * from project_provider_result((select observation_id from slice_2b_result_observations where name = 'rollback'))$$,
  '42501', null,
  'anonymous execution is denied by the function grant boundary'
);
reset role;

select * from finish();
rollback;
