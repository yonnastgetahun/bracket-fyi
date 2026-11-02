begin;
-- Explicit synthetic fixture activation; production remains stopped by default.
update event_runtime_control set global_stopped=false;

select plan(52);

select ok(to_regprocedure('public.record_provider_observation(uuid,uuid,text,text,text,timestamptz,timestamptz,integer,jsonb,jsonb)') is not null, 'observation evidence boundary exists');
select ok(to_regprocedure('public.project_structural_observation(uuid)') is not null, 'structural projection boundary exists');
select ok(to_regprocedure('public.project_provider_result(uuid,text)') is not null, 'result projection boundary exists');

insert into data_providers (id, adapter_key, display_name)
values ('a0000000-0000-4000-8000-000000000001', 'remediation-fixture', 'Remediation Fixture');
insert into organizations (id, organization_key, name, kind)
values ('a0000000-0000-4000-8000-000000000002', 'remediation-org', 'Remediation Organization', 'league');
insert into competitions (id, organization_id, competition_key, name, domain)
values ('a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002', 'remediation-cup', 'Remediation Cup', 'sport');
insert into event_editions (id, competition_id, edition_key, name, season_label)
values ('a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000003', '2026', 'Remediation Cup 2026', '2026');
insert into stages (id, event_edition_id, stage_key, name, kind, ordinal)
values ('a0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000004', 'finals', 'Finals', 'knockout', 1);
insert into contests (id, event_edition_id, stage_id, contest_key, name, kind)
values ('a0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000005', 'final', 'Final', 'match');
insert into competitors (id, competitor_key, kind, canonical_name)
values
  ('a0000000-0000-4000-8000-000000000007', 'remediation-team', 'team', 'Remediation Team'),
  ('a0000000-0000-4000-8000-000000000023', 'remediation-team-new', 'team', 'Remediation Team New');
insert into event_entries (id, event_edition_id, competitor_id, role)
values ('a0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000007', 'team');
insert into contest_entries (contest_id, event_edition_id, event_entry_id, role, ordinal)
values ('a0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000008', 'home', 1);

insert into provider_bindings (id, provider_id, event_edition_id, binding_key, role, mode, health_status, adapter_config)
values
  ('a0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'remediation-shadow', 'primary', 'shadow', 'healthy', '{"allowTrustedCorrections":true}'::jsonb),
  ('a0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'remediation-disabled', 'shadow', 'disabled', 'healthy', '{"allowTrustedCorrections":true}'::jsonb);
insert into ingestion_runs (id, binding_id, provider_id, event_edition_id, claim_key, trigger_kind, claimed_by, lease_expires_at)
values
  ('a0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'shadow-run', 'replay', 'test', now() + interval '10 minutes'),
  ('a0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'disabled-run', 'replay', 'test', now() + interval '10 minutes');
insert into provider_entity_refs (binding_id, provider_id, event_edition_id, entity_kind, external_id, canonical_id, resolution_status, reviewed_by, reviewed_at)
values
  ('a0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'event_entry', 'entry-1', 'a0000000-0000-4000-8000-000000000008', 'reviewed', 'test', now()),
  ('a0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'competitor', 'competitor', 'a0000000-0000-4000-8000-000000000007', 'reviewed', 'test', now()),
  ('a0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'contest', 'contest-1', 'a0000000-0000-4000-8000-000000000006', 'reviewed', 'test', now());

select lives_ok($sql$
  select * from record_provider_observation(
    'a0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000009', 'event_entry', 'entry-shadow', 'rev-1',
    '2026-10-08T18:00:00Z', '2026-10-08T18:01:00Z', 1, '{"fixture":"shadow"}'::jsonb,
    jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition','competitorExternalId','competitor','role','team','status','confirmed','metadata',jsonb_build_object()),'semanticHash',repeat('1',64))
  )
$sql$, 'shadow mode retains observation evidence');

select is((select outcome from project_structural_observation((select id from provider_observations where external_object_id = 'entry-shadow'))), 'skipped_non_write', 'shadow structural projection skips canonical mutation');
select is((select count(*) from event_entries where id = 'a0000000-0000-4000-8000-000000000008'), 1::bigint, 'shadow structural projection does not add canonical rows');

-- Explicit synthetic mapping-review authority; the legacy uncredentialed RPC stays denied.
insert into event_operator_principals(id) values ('a0000000-0000-4000-8000-000000000099');
insert into event_operator_credentials(credential_hash,principal_id,expires_at)
values (encode(extensions.digest('db20-synthetic-mapping-review-only','sha256'),'hex'),
 'a0000000-0000-4000-8000-000000000099','infinity');
insert into event_operator_grants(principal_id,environment,event_edition_id,action)
values ('a0000000-0000-4000-8000-000000000099','local','a0000000-0000-4000-8000-000000000004','mapping.review');
select lives_ok($sql$
  select event_operator_command(
    'db20-synthetic-mapping-review-only','local','a0000000-0000-4000-8000-000000000004',
    'mapping.review',0,'synthetic global competitor mapping',
    '{"bindingId":"a0000000-0000-4000-8000-000000000009","entityKind":"competitor","externalId":"competitor-global","canonicalId":"a0000000-0000-4000-8000-000000000007","status":"reviewed"}'::jsonb
  )
$sql$, 'global competitor mapping does not require an edition entry');

select lives_ok($sql$
  select * from record_provider_observation(
    'a0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000009', 'result', 'result-conflict', 'same-revision',
    '2026-10-08T18:00:00Z', '2026-10-08T18:02:00Z', 1, '{"fixture":"first"}'::jsonb,
    jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition','contestExternalId','contest-1','resultStatus','final','outcomeType','draw','resultData',jsonb_build_object()),'semanticHash',repeat('2',64))
  )
$sql$, 'first same-revision evidence is retained');

select lives_ok($sql$
  select * from record_provider_observation(
    'a0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000009', 'result', 'result-conflict', 'same-revision',
    '2026-10-08T18:00:00Z', '2026-10-08T18:03:00Z', 1, '{"fixture":"second"}'::jsonb,
    jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',2,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition','contestExternalId','contest-1','resultStatus','final','outcomeType','draw','resultData',jsonb_build_object('changed',true)),'semanticHash',repeat('3',64))
  )
$sql$, 'same-revision payload conflict preserves attempted evidence');

select lives_ok($sql$
  select * from record_provider_observation(
    'a0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000009', 'result', 'result-conflict', 'same-revision',
    '2026-10-08T18:00:00Z', '2026-10-08T18:04:00Z', 1, '{"fixture":"second"}'::jsonb,
    jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',3,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition','contestExternalId','contest-1','resultStatus','final','outcomeType','draw','resultData',jsonb_build_object('changed','again')),'semanticHash',repeat('5',64))
  )
$sql$, 'same raw payload with a changed normalized snapshot preserves distinct evidence');

select lives_ok($sql$
  select * from record_provider_observation(
    'a0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000009', 'result', 'result-conflict', 'same-revision',
    '2026-10-08T18:00:00Z', '2026-10-08T18:03:00Z', 1, '{"fixture":"second"}'::jsonb,
    jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',2,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition','contestExternalId','contest-1','resultStatus','final','outcomeType','draw','resultData',jsonb_build_object('changed',true)),'semanticHash',repeat('3',64))
  )
$sql$, 'replaying an identical conflict returns its original conflict evidence');
select is((select count(*) from provider_observation_conflicts), 2::bigint, 'identical conflict replay does not update or duplicate immutable evidence');

select lives_ok($sql$
  select * from record_provider_observation(
    'a0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000009', 'result', 'revisionless', null,
    null, '2026-10-08T18:05:00Z', 1, '{"fixture":"revisionless"}'::jsonb,
    jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition','contestExternalId','contest-1','resultStatus','final','outcomeType','draw','resultData',jsonb_build_object()),'semanticHash',repeat('6',64))
  )
$sql$, 'revisionless evidence is inserted');
select is((select outcome from record_provider_observation('a0000000-0000-4000-8000-000000000011','a0000000-0000-4000-8000-000000000009','result','revisionless',null,null,'2026-10-08T18:05:00Z',1,'{"fixture":"revisionless"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition','contestExternalId','contest-1','resultStatus','final','outcomeType','draw','resultData',jsonb_build_object()),'semanticHash',repeat('6',64)))), 'exact_replay', 'revisionless exact replay compares its normalized snapshot');
select is((select outcome from record_provider_observation('a0000000-0000-4000-8000-000000000011','a0000000-0000-4000-8000-000000000009','result','revisionless',null,null,'2026-10-08T18:06:00Z',1,'{"fixture":"revisionless"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',2,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition','contestExternalId','contest-1','resultStatus','final','outcomeType','draw','resultData',jsonb_build_object()),'semanticHash',repeat('7',64)))), 'revision_conflict', 'revisionless normalized snapshot changes are preserved as conflict evidence');
select is((select count(*) from provider_observation_conflicts), 3::bigint, 'revisionless normalized changes add immutable evidence');

insert into provider_entity_refs (binding_id, provider_id, event_edition_id, entity_kind, external_id, canonical_id, resolution_status, reviewed_by, reviewed_at)
values ('a0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'contest', 'contest-disabled', 'a0000000-0000-4000-8000-000000000006', 'reviewed', 'test', now());
select lives_ok($sql$
  select * from record_provider_observation(
    'a0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000010', 'result', 'contest-disabled', 'disabled-rev',
    '2026-10-08T19:00:00Z', '2026-10-08T19:01:00Z', 1, '{"fixture":"disabled"}'::jsonb,
    jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition','contestExternalId','contest-disabled','resultStatus','final','outcomeType','draw','resultData',jsonb_build_object()),'semanticHash',repeat('4',64))
  )
$sql$, 'disabled mode retains result evidence');
select is((select outcome from project_provider_result((select id from provider_observations where external_object_id = 'contest-disabled'))), 'skipped_non_write', 'disabled result projection skips canonical mutation');

insert into provider_bindings (id, provider_id, event_edition_id, binding_key, role, mode, health_status, adapter_config)
values ('a0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'remediation-write', 'fallback', 'write', 'healthy', '{"allowTrustedCorrections":true}'::jsonb);
insert into ingestion_runs (id, binding_id, provider_id, event_edition_id, claim_key, trigger_kind, claimed_by, lease_expires_at)
values ('a0000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'write-run', 'replay', 'test', now() + interval '10 minutes');
insert into provider_entity_refs (binding_id, provider_id, event_edition_id, entity_kind, external_id, canonical_id, resolution_status, reviewed_by, reviewed_at)
values
  ('a0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'organization', 'root-org', 'a0000000-0000-4000-8000-000000000002', 'reviewed', 'test', now()),
  ('a0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'competition', 'root-comp', 'a0000000-0000-4000-8000-000000000003', 'reviewed', 'test', now()),
  ('a0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'event_edition', 'root-edition', 'a0000000-0000-4000-8000-000000000004', 'reviewed', 'test', now()),
  ('a0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'competitor', 'root-team', 'a0000000-0000-4000-8000-000000000007', 'reviewed', 'test', now()),
  ('a0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'stage', 'lifecycle-stage', 'a0000000-0000-4000-8000-000000000005', 'reviewed', 'test', now()),
  ('a0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'contest', 'lifecycle-contest', 'a0000000-0000-4000-8000-000000000006', 'reviewed', 'test', now()),
  ('a0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'event_entry', 'lifecycle-entry', 'a0000000-0000-4000-8000-000000000008', 'reviewed', 'test', now());
insert into provider_entity_refs (binding_id, provider_id, event_edition_id, entity_kind, external_id, canonical_id, resolution_status, reviewed_by, reviewed_at)
values ('a0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'competitor', 'competitor-global-new', 'a0000000-0000-4000-8000-000000000023', 'reviewed', 'test', now());

-- Explicit operator provisioning replaces the former implicit automatic bootstrap.
insert into event_entries (id,event_edition_id,competitor_id,role,status)
values ('a0000000-0000-4000-8000-000000000024','a0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000023','team','invited');
insert into provider_entity_refs (binding_id,provider_id,event_edition_id,entity_kind,external_id,canonical_id,resolution_status,reviewed_by,reviewed_at) values
  ('a0000000-0000-4000-8000-000000000013','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000004','event_entry','entry-from-global-competitor','a0000000-0000-4000-8000-000000000024','reviewed','test',now()),
  ('a0000000-0000-4000-8000-000000000013','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000004','event_edition','edition','a0000000-0000-4000-8000-000000000004','reviewed','test',now());

create temporary table slice_2b_remediation_observations (name text primary key, observation_id uuid);
insert into slice_2b_remediation_observations
select 'root-org', observation_id from record_provider_observation('a0000000-0000-4000-8000-000000000014','a0000000-0000-4000-8000-000000000013','organization','root-org','org-1','2026-10-08T20:00:00Z','2026-10-08T20:01:00Z',1,'{"fixture":"root"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('organizationKind','league','name','Updated Organization','officialUrl','https://example.test/org','metadata',jsonb_build_object('synthetic',true)),'semanticHash',repeat('a',64)));
insert into slice_2b_remediation_observations
select 'root-comp', observation_id from record_provider_observation('a0000000-0000-4000-8000-000000000014','a0000000-0000-4000-8000-000000000013','competition','root-comp','comp-1','2026-10-08T20:01:00Z','2026-10-08T20:02:00Z',1,'{"fixture":"root"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('name','Updated Cup','domain','sport','organizationExternalId','root-org','sportCode','synthetic','rulesMetadata',jsonb_build_object('bestOf',3)),'semanticHash',repeat('b',64)));
insert into slice_2b_remediation_observations
select 'root-edition', observation_id from record_provider_observation('a0000000-0000-4000-8000-000000000014','a0000000-0000-4000-8000-000000000013','event_edition','root-edition','edition-1','2026-10-08T20:02:00Z','2026-10-08T20:03:00Z',1,'{"fixture":"root"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('competitionExternalId','root-comp','editionKey','2026','name','Updated Cup 2026','seasonLabel','2026','timezone','UTC','status','active','metadata',jsonb_build_object('synthetic',true)),'semanticHash',repeat('c',64)));
insert into slice_2b_remediation_observations
select 'root-team', observation_id from record_provider_observation('a0000000-0000-4000-8000-000000000014','a0000000-0000-4000-8000-000000000013','competitor','root-team','team-1','2026-10-08T20:03:00Z','2026-10-08T20:04:00Z',1,'{"fixture":"root"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('competitorKind','team','canonicalName','Updated Team','shortName','UT','countryCode','US','metadata',jsonb_build_object('synthetic',true)),'semanticHash',repeat('d',64)));
select is((select outcome from project_structural_observation((select observation_id from slice_2b_remediation_observations where name='root-org'))),'projected','approved organization root projects');
select is((select name from organizations where id='a0000000-0000-4000-8000-000000000002'),'Updated Organization','organization mutable fields update without key mutation');
select is((select outcome from project_structural_observation((select observation_id from slice_2b_remediation_observations where name='root-comp'))),'projected','approved competition root projects');
select is((select name from competitions where id='a0000000-0000-4000-8000-000000000003'),'Updated Cup','competition mutable fields update');
select is((select outcome from project_structural_observation((select observation_id from slice_2b_remediation_observations where name='root-edition'))),'projected','approved edition root projects');
select is((select status from event_editions where id='a0000000-0000-4000-8000-000000000004'),'active','edition mutable fields update while its key remains approved');
select is((select outcome from project_structural_observation((select observation_id from slice_2b_remediation_observations where name='root-team'))),'projected','approved competitor root projects');
select is((select competitor_key from competitors where id='a0000000-0000-4000-8000-000000000007'),'remediation-team','competitor canonical key is never provider-generated or mutated');
insert into slice_2b_remediation_observations
select 'entry-from-global-competitor', observation_id from record_provider_observation('a0000000-0000-4000-8000-000000000014','a0000000-0000-4000-8000-000000000013','event_entry','entry-from-global-competitor','entry-1','2026-10-08T20:04:30Z','2026-10-08T20:04:31Z',1,'{"fixture":"global-competitor"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','root-edition','competitorExternalId','competitor-global-new','role','team','status','confirmed','metadata',jsonb_build_object()),'semanticHash',repeat('f',64)));
select is((select outcome from project_structural_observation((select observation_id from slice_2b_remediation_observations where name='entry-from-global-competitor'))),'projected','reviewed event entry projects from a reviewed global competitor');
select is((select count(*) from event_entries where event_edition_id='a0000000-0000-4000-8000-000000000004' and competitor_id='a0000000-0000-4000-8000-000000000023'),1::bigint,'edition entry projection retains exactly one scoped entry');
select is((select resolution_status from provider_entity_refs where binding_id='a0000000-0000-4000-8000-000000000013' and entity_kind='event_entry' and external_id='entry-from-global-competitor'),'reviewed','event entry projection preserves explicit reviewed authority');

insert into event_editions (id, competition_id, edition_key, name, season_label)
values ('a0000000-0000-4000-8000-000000000015','a0000000-0000-4000-8000-000000000003','2027','Remediation Cup 2027','2027');
insert into provider_bindings (id, provider_id, event_edition_id, binding_key, role, mode, health_status)
values ('a0000000-0000-4000-8000-000000000017','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015','remediation-second-edition','primary','write','healthy');
insert into ingestion_runs (id,binding_id,provider_id,event_edition_id,claim_key,trigger_kind,claimed_by,lease_expires_at)
values ('a0000000-0000-4000-8000-000000000018','a0000000-0000-4000-8000-000000000017','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015','second-edition-run','replay','test',now()+interval '10 minutes');
insert into provider_entity_refs (binding_id,provider_id,event_edition_id,entity_kind,external_id,canonical_id,resolution_status,reviewed_by,reviewed_at)
values ('a0000000-0000-4000-8000-000000000017','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015','competitor','shared-team','a0000000-0000-4000-8000-000000000007','reviewed','test',now());
insert into slice_2b_remediation_observations
select 'shared-team-second-edition', observation_id from record_provider_observation('a0000000-0000-4000-8000-000000000018','a0000000-0000-4000-8000-000000000017','competitor','shared-team','team-2027','2026-10-08T20:05:00Z','2026-10-08T20:06:00Z',1,'{"fixture":"cross-edition"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('competitorKind','team','canonicalName','Shared Team 2027','metadata',jsonb_build_object('edition','2027')),'semanticHash',repeat('e',64)));
select is((select outcome from project_structural_observation((select observation_id from slice_2b_remediation_observations where name='shared-team-second-edition'))),'projected','shared competitor projects in a second edition');
select is((select count(*) from canonical_structural_projection_scope where entity_kind='competitor' and canonical_id='a0000000-0000-4000-8000-000000000007'),2::bigint,'structural provenance is scoped independently per edition');

insert into slice_2b_remediation_observations
select 'lifecycle-scheduled', observation_id from record_provider_observation('a0000000-0000-4000-8000-000000000014','a0000000-0000-4000-8000-000000000013','contest','lifecycle-contest','life-1','2026-10-08T21:00:00Z','2026-10-08T21:01:00Z',1,'{"fixture":"lifecycle"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition','stageExternalId','lifecycle-stage','contestKey','final','name','Final','contestKind','match','status','scheduled','requiredForCompletion',true,'entries',jsonb_build_array(jsonb_build_object('eventEntryExternalId','lifecycle-entry','role','home','ordinal',1,'metadata',jsonb_build_object())),'metadata',jsonb_build_object()),'semanticHash',repeat('1',64)));
insert into slice_2b_remediation_observations
select 'lifecycle-live', observation_id from record_provider_observation('a0000000-0000-4000-8000-000000000014','a0000000-0000-4000-8000-000000000013','contest','lifecycle-contest','life-2','2026-10-08T22:00:00Z','2026-10-08T22:01:00Z',1,'{"fixture":"lifecycle"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition','stageExternalId','lifecycle-stage','contestKey','final','name','Final','contestKind','match','status','live','requiredForCompletion',true,'entries',jsonb_build_array(jsonb_build_object('eventEntryExternalId','lifecycle-entry','role','home','ordinal',1,'metadata',jsonb_build_object())),'metadata',jsonb_build_object()),'semanticHash',repeat('2',64)));
insert into slice_2b_remediation_observations
select 'lifecycle-final', observation_id from record_provider_observation('a0000000-0000-4000-8000-000000000014','a0000000-0000-4000-8000-000000000013','contest','lifecycle-contest','life-3','2026-10-08T23:00:00Z','2026-10-08T23:01:00Z',1,'{"fixture":"lifecycle"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition','stageExternalId','lifecycle-stage','contestKey','final','name','Final','contestKind','match','status','final','requiredForCompletion',true,'entries',jsonb_build_array(jsonb_build_object('eventEntryExternalId','lifecycle-entry','role','home','ordinal',1,'metadata',jsonb_build_object())),'metadata',jsonb_build_object()),'semanticHash',repeat('3',64)));
select is((select outcome from project_structural_observation((select observation_id from slice_2b_remediation_observations where name='lifecycle-scheduled'))),'projected','scheduled lifecycle state projects');
select is((select outcome from project_structural_observation((select observation_id from slice_2b_remediation_observations where name='lifecycle-live'))),'projected','live lifecycle state advances');
select is((select outcome from project_structural_observation((select observation_id from slice_2b_remediation_observations where name='lifecycle-final'))),'projected','final lifecycle state advances');

insert into slice_2b_remediation_observations
select 'lifecycle-regress-live', observation_id from record_provider_observation('a0000000-0000-4000-8000-000000000014','a0000000-0000-4000-8000-000000000013','contest','lifecycle-contest','life-4','2026-10-09T00:00:00Z','2026-10-09T00:01:00Z',1,'{"fixture":"lifecycle"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition','stageExternalId','lifecycle-stage','contestKey','final','name','Final','contestKind','match','status','live','requiredForCompletion',true,'entries',jsonb_build_array(jsonb_build_object('eventEntryExternalId','lifecycle-entry','role','home','ordinal',1,'metadata',jsonb_build_object())),'metadata',jsonb_build_object()),'semanticHash',repeat('4',64)));
insert into slice_2b_remediation_observations
select 'lifecycle-regress-scheduled', observation_id from record_provider_observation('a0000000-0000-4000-8000-000000000014','a0000000-0000-4000-8000-000000000013','contest','lifecycle-contest','life-5','2026-10-09T01:00:00Z','2026-10-09T01:01:00Z',1,'{"fixture":"lifecycle"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition','stageExternalId','lifecycle-stage','contestKey','final','name','Final','contestKind','match','status','scheduled','requiredForCompletion',true,'entries',jsonb_build_array(jsonb_build_object('eventEntryExternalId','lifecycle-entry','role','home','ordinal',1,'metadata',jsonb_build_object())),'metadata',jsonb_build_object()),'semanticHash',repeat('5',64)));
insert into slice_2b_remediation_observations
select 'lifecycle-equal-change', observation_id from record_provider_observation('a0000000-0000-4000-8000-000000000014','a0000000-0000-4000-8000-000000000013','contest','lifecycle-contest','life-6','2026-10-08T23:00:00Z','2026-10-09T02:01:00Z',1,'{"fixture":"lifecycle"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition','stageExternalId','lifecycle-stage','contestKey','final','name','Final','contestKind','match','status','live','requiredForCompletion',true,'entries',jsonb_build_array(jsonb_build_object('eventEntryExternalId','lifecycle-entry','role','home','ordinal',1,'metadata',jsonb_build_object())),'metadata',jsonb_build_object()),'semanticHash',repeat('6',64)));
select is((select outcome from project_structural_observation((select observation_id from slice_2b_remediation_observations where name='lifecycle-regress-live'))),'quarantined','final to live lifecycle regression quarantines');
select is((select outcome from project_structural_observation((select observation_id from slice_2b_remediation_observations where name='lifecycle-regress-scheduled'))),'quarantined','final to scheduled lifecycle regression quarantines');
select is((select outcome from project_structural_observation((select observation_id from slice_2b_remediation_observations where name='lifecycle-equal-change'))),'quarantined','equal timestamp lifecycle change quarantines');
select is((select status from contests where id='a0000000-0000-4000-8000-000000000006'),'final','lifecycle quarantine never mutates the canonical contest');

select is(slice_2b_canonical_json('{"ordinary":42,"large":1e21,"tiny":1e-7,"threshold":0.000001,"negativeZero":-0,"safeMin":-9007199254740991,"safeMax":9007199254740991}'::jsonb), '{"large":1e+21,"negativeZero":0,"ordinary":42,"safeMax":9007199254740991,"safeMin":-9007199254740991,"threshold":0.000001,"tiny":1e-7}', 'SQL canonical JSON matches the TypeScript numeric vector');

insert into contests (id,event_edition_id,stage_id,contest_key,name,kind)
values
  ('a0000000-0000-4000-8000-000000000019','a0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000005','matrix-final','Matrix Final','match'),
  ('a0000000-0000-4000-8000-000000000020','a0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000005','matrix-awarded','Matrix Awarded','award'),
  ('a0000000-0000-4000-8000-000000000021','a0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000005','matrix-canceled','Matrix Canceled','match'),
  ('a0000000-0000-4000-8000-000000000022','a0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000005','matrix-void','Matrix Void','match');
insert into contest_entries (contest_id,event_edition_id,event_entry_id,role,ordinal)
select id,'a0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000008','home',1
from contests where id in ('a0000000-0000-4000-8000-000000000019','a0000000-0000-4000-8000-000000000020','a0000000-0000-4000-8000-000000000021','a0000000-0000-4000-8000-000000000022');
insert into provider_entity_refs (binding_id,provider_id,event_edition_id,entity_kind,external_id,canonical_id,resolution_status,reviewed_by,reviewed_at)
values
  ('a0000000-0000-4000-8000-000000000013','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000004','contest','matrix-final','a0000000-0000-4000-8000-000000000019','reviewed','test',now()),
  ('a0000000-0000-4000-8000-000000000013','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000004','contest','matrix-awarded','a0000000-0000-4000-8000-000000000020','reviewed','test',now()),
  ('a0000000-0000-4000-8000-000000000013','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000004','contest','matrix-canceled','a0000000-0000-4000-8000-000000000021','reviewed','test',now()),
  ('a0000000-0000-4000-8000-000000000013','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000004','contest','matrix-void','a0000000-0000-4000-8000-000000000022','reviewed','test',now()),
  ('a0000000-0000-4000-8000-000000000013','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000004','event_entry','matrix-entry','a0000000-0000-4000-8000-000000000008','reviewed','test',now());

insert into slice_2b_remediation_observations
select 'matrix-final-initial', observation_id from record_provider_observation('a0000000-0000-4000-8000-000000000014','a0000000-0000-4000-8000-000000000013','result','matrix-final','matrix-final-1','2026-10-10T10:00:00Z','2026-10-10T10:01:00Z',1,'{"fixture":"matrix"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition','contestExternalId','matrix-final','resultStatus','final','outcomeType','draw','resultData',jsonb_build_object(),'providerEffectiveAt','2026-10-10T10:00:00Z'),'semanticHash',repeat('7',64)));
insert into slice_2b_remediation_observations
select 'matrix-awarded-initial', observation_id from record_provider_observation('a0000000-0000-4000-8000-000000000014','a0000000-0000-4000-8000-000000000013','result','matrix-awarded','matrix-awarded-1','2026-10-10T11:00:00Z','2026-10-10T11:01:00Z',1,'{"fixture":"matrix"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition','contestExternalId','matrix-awarded','resultStatus','awarded','outcomeType','winner','winnerEventEntryExternalId','matrix-entry','resultData',jsonb_build_object(),'providerEffectiveAt','2026-10-10T11:00:00Z'),'semanticHash',repeat('8',64)));
insert into slice_2b_remediation_observations
select 'matrix-canceled-initial', observation_id from record_provider_observation('a0000000-0000-4000-8000-000000000014','a0000000-0000-4000-8000-000000000013','result','matrix-canceled','matrix-canceled-1','2026-10-10T12:00:00Z','2026-10-10T12:01:00Z',1,'{"fixture":"matrix"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition','contestExternalId','matrix-canceled','resultStatus','canceled','outcomeType','no_contest','resultData',jsonb_build_object(),'providerEffectiveAt','2026-10-10T12:00:00Z'),'semanticHash',repeat('9',64)));
insert into slice_2b_remediation_observations
select 'matrix-void-initial', observation_id from record_provider_observation('a0000000-0000-4000-8000-000000000014','a0000000-0000-4000-8000-000000000013','result','matrix-void','matrix-void-1','2026-10-10T13:00:00Z','2026-10-10T13:01:00Z',1,'{"fixture":"matrix"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition','contestExternalId','matrix-void','resultStatus','void','outcomeType','no_contest','resultData',jsonb_build_object(),'providerEffectiveAt','2026-10-10T13:00:00Z'),'semanticHash',repeat('a',64)));
select is((select outcome from project_provider_result((select observation_id from slice_2b_remediation_observations where name='matrix-final-initial'))),'projected','final terminal matrix state projects');
select is((select outcome from project_provider_result((select observation_id from slice_2b_remediation_observations where name='matrix-awarded-initial'))),'projected','awarded terminal matrix state projects');
select is((select outcome from project_provider_result((select observation_id from slice_2b_remediation_observations where name='matrix-canceled-initial'))),'projected','canceled terminal matrix state projects');
select is((select outcome from project_provider_result((select observation_id from slice_2b_remediation_observations where name='matrix-void-initial'))),'projected','void terminal matrix state projects');

insert into slice_2b_remediation_observations
select 'matrix-final-correction', observation_id from record_provider_observation('a0000000-0000-4000-8000-000000000014','a0000000-0000-4000-8000-000000000013','result','matrix-final','matrix-final-2','2026-10-10T14:00:00Z','2026-10-10T14:01:00Z',1,'{"fixture":"matrix","correction":true}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','correctionProvenance','synthetic-operator','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition','contestExternalId','matrix-final','resultStatus','unresolved','outcomeType','pending','resultData',jsonb_build_object(),'correctionReason','synthetic correction','providerEffectiveAt','2026-10-10T14:00:00Z'),'semanticHash',repeat('b',64)));
insert into slice_2b_remediation_observations
select 'matrix-awarded-correction', observation_id from record_provider_observation('a0000000-0000-4000-8000-000000000014','a0000000-0000-4000-8000-000000000013','result','matrix-awarded','matrix-awarded-2','2026-10-10T15:00:00Z','2026-10-10T15:01:00Z',1,'{"fixture":"matrix","correction":true}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','correctionProvenance','synthetic-operator','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition','contestExternalId','matrix-awarded','resultStatus','unresolved','outcomeType','pending','resultData',jsonb_build_object(),'correctionReason','synthetic correction','providerEffectiveAt','2026-10-10T15:00:00Z'),'semanticHash',repeat('c',64)));
insert into slice_2b_remediation_observations
select 'matrix-canceled-correction', observation_id from record_provider_observation('a0000000-0000-4000-8000-000000000014','a0000000-0000-4000-8000-000000000013','result','matrix-canceled','matrix-canceled-2','2026-10-10T16:00:00Z','2026-10-10T16:01:00Z',1,'{"fixture":"matrix","correction":true}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','correctionProvenance','synthetic-operator','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition','contestExternalId','matrix-canceled','resultStatus','unresolved','outcomeType','pending','resultData',jsonb_build_object(),'correctionReason','synthetic correction','providerEffectiveAt','2026-10-10T16:00:00Z'),'semanticHash',repeat('d',64)));
insert into slice_2b_remediation_observations
select 'matrix-void-correction', observation_id from record_provider_observation('a0000000-0000-4000-8000-000000000014','a0000000-0000-4000-8000-000000000013','result','matrix-void','matrix-void-2','2026-10-10T17:00:00Z','2026-10-10T17:01:00Z',1,'{"fixture":"matrix","correction":true}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','correctionProvenance','synthetic-operator','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition','contestExternalId','matrix-void','resultStatus','unresolved','outcomeType','pending','resultData',jsonb_build_object(),'correctionReason','synthetic correction','providerEffectiveAt','2026-10-10T17:00:00Z'),'semanticHash',repeat('e',64)));
select is((select outcome from project_provider_result((select observation_id from slice_2b_remediation_observations where name='matrix-final-correction'))),'projected','final to unresolved correction is accepted');
select is((select outcome from project_provider_result((select observation_id from slice_2b_remediation_observations where name='matrix-awarded-correction'))),'projected','awarded to unresolved correction is accepted');
select is((select outcome from project_provider_result((select observation_id from slice_2b_remediation_observations where name='matrix-canceled-correction'))),'projected','canceled to unresolved correction is accepted');
select is((select outcome from project_provider_result((select observation_id from slice_2b_remediation_observations where name='matrix-void-correction'))),'projected','void to unresolved correction is accepted');
select is((select count(*) from contest_results where contest_id in ('a0000000-0000-4000-8000-000000000019','a0000000-0000-4000-8000-000000000020','a0000000-0000-4000-8000-000000000021','a0000000-0000-4000-8000-000000000022') and result_status='unresolved'),4::bigint,'every terminal status correction reaches unresolved');
select is((select count(*) from notification_outbox where intent_type='result_correction' and contest_id in ('a0000000-0000-4000-8000-000000000019','a0000000-0000-4000-8000-000000000020','a0000000-0000-4000-8000-000000000021','a0000000-0000-4000-8000-000000000022')),4::bigint,'each accepted correction creates exactly one correction intent');
select is((select count(*) from notification_outbox where intent_type='result_final' and contest_id in ('a0000000-0000-4000-8000-000000000019','a0000000-0000-4000-8000-000000000020','a0000000-0000-4000-8000-000000000021','a0000000-0000-4000-8000-000000000022')),2::bigint,'corrections do not also emit final intents');

insert into slice_2b_remediation_observations
select 'matrix-illegal-provisional', observation_id from record_provider_observation('a0000000-0000-4000-8000-000000000014','a0000000-0000-4000-8000-000000000013','result','matrix-final','matrix-final-3','2026-10-10T18:00:00Z','2026-10-10T18:01:00Z',1,'{"fixture":"matrix","correction":true}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','remediation-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','correctionProvenance','synthetic-operator','normalizedEntity',jsonb_build_object('eventEditionExternalId','edition','contestExternalId','matrix-final','resultStatus','provisional','outcomeType','pending','resultData',jsonb_build_object(),'correctionReason','illegal regression','providerEffectiveAt','2026-10-10T18:00:00Z'),'semanticHash',repeat('f',64)));
select is((select outcome from project_provider_result((select observation_id from slice_2b_remediation_observations where name='matrix-illegal-provisional'))),'quarantined','terminal to provisional remains illegal');

select is((select status from event_entries where id='a0000000-0000-4000-8000-000000000024'),'confirmed','reviewed entry projection updates the provisioned invited state');

select * from finish();
rollback;
