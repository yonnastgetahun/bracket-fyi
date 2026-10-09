begin;

select plan(66);

select ok(has_function_privilege('service_role', 'public.project_structural_observation(uuid)', 'execute'), 'service_role can execute only the structural wrapper');
select ok(has_function_privilege('service_role', 'public.project_provider_result(uuid,text)', 'execute'), 'service_role can execute only the result wrapper');
select ok(not has_function_privilege('service_role', 'public.project_structural_observation_unchecked(uuid)', 'execute'), 'service_role cannot execute structural unchecked helper');
select ok(not has_function_privilege('service_role', 'public.project_provider_result_unchecked(uuid,text)', 'execute'), 'service_role cannot execute result unchecked helper');
select ok(not has_function_privilege('service_role', 'public.slice_2b_project_root_observation(uuid)', 'execute'), 'service_role cannot execute root helper');
select ok(not has_function_privilege('service_role', 'public.slice_2b_resolve_quarantine(uuid)', 'execute'), 'service_role cannot execute quarantine helper');
select ok(has_table_privilege('service_role', 'public.canonical_structural_projection_scope', 'select'), 'service_role retains read access to structural provenance');
select ok(not has_table_privilege('service_role', 'public.canonical_structural_projection_scope', 'insert'), 'service_role cannot directly insert structural provenance');
select ok(not has_table_privilege('service_role', 'public.canonical_structural_projection_scope', 'update'), 'service_role cannot directly update structural provenance');
select ok(not has_table_privilege('service_role', 'public.canonical_structural_projection_scope', 'delete'), 'service_role cannot delete structural provenance');
select ok(not has_table_privilege('service_role', 'public.canonical_structural_projection_scope', 'truncate'), 'service_role cannot truncate structural provenance');
select is((select attgenerated from pg_attribute where attrelid='public.provider_observation_conflicts'::regclass and attname='normalized_snapshot_hash'), 's', 'conflict hash is generated rather than backfilled by UPDATE');
select is(slice_2b_canonical_json('{"value":1.2345678901234568e+21}'::jsonb), '{"value":1.2345678901234568e+21}', 'SQL canonical number matches the JavaScript-serialized RPC vector');

insert into data_providers (id, adapter_key, display_name)
values ('b0000000-0000-4000-8000-000000000001', 'r2-fixture', 'R2 Fixture');
insert into organizations (id, organization_key, name, kind, official_url, metadata)
values ('b0000000-0000-4000-8000-000000000002', 'r2-org', 'Original Organization', 'league', 'https://old.example/org', '{"old":true,"keep":"yes"}');
insert into competitions (id, organization_id, competition_key, name, domain, sport_code, official_url, rules_metadata)
values ('b0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002', 'r2-cup', 'Original Cup', 'sport', 'synthetic', 'https://old.example/cup', '{"oldRule":true}');
insert into event_editions (id, competition_id, edition_key, name, season_label, timezone, status, starts_at, ends_at, official_url, metadata)
values ('b0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000003', '2026', 'Original Edition', '2026', 'UTC', 'scheduled', '2026-11-01T10:00:00Z', '2026-11-30T10:00:00Z', 'https://old.example/edition', '{"oldEdition":true}');
insert into event_editions (id, competition_id, edition_key, name, season_label)
values ('b0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000003', '2027', 'Second Edition', '2027');
insert into competitors (id, organization_id, competitor_key, kind, canonical_name, short_name, country_code, metadata)
values ('b0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000002', 'r2-team', 'team', 'Original Team', 'OT', 'US', '{"oldTeam":true}');
insert into stages (id, event_edition_id, stage_key, name, kind, ordinal, starts_at, ends_at, metadata)
values
  ('b0000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000004', 'parent', 'Parent Stage', 'knockout', 1, '2026-11-02T10:00:00Z', '2026-11-03T10:00:00Z', '{"oldStage":true}'),
  ('b0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000004', 'child', 'Child Stage', 'knockout', 2, '2026-11-04T10:00:00Z', '2026-11-05T10:00:00Z', '{"oldChild":true}');
update stages set parent_stage_id='b0000000-0000-4000-8000-000000000008' where id='b0000000-0000-4000-8000-000000000009';
insert into rounds (id, event_edition_id, stage_id, round_key, name, ordinal, provider_label, starts_at, ends_at, metadata)
values
  ('b0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000008', 'parent-round', 'Parent Round', 1, 'old-parent', '2026-11-06T10:00:00Z', '2026-11-07T10:00:00Z', '{"oldRound":true}'),
  ('b0000000-0000-4000-8000-000000000016', 'b0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000009', 'child-round', 'Child Round', 1, 'old-child', '2026-11-08T10:00:00Z', '2026-11-09T10:00:00Z', '{"oldChildRound":true}');
insert into contests (id, event_edition_id, stage_id, round_id, contest_key, name, kind, status, scheduled_at, starts_at, ends_at, parent_contest_id, metadata)
values
  ('b0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000016', 'lifecycle', 'Lifecycle Contest', 'match', 'scheduled', '2026-11-10T10:00:00Z', null, null, null, '{"oldContest":true}'),
  ('b0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000016', 'child-contest', 'Child Contest', 'match', 'scheduled', '2026-11-11T10:00:00Z', null, null, 'b0000000-0000-4000-8000-000000000012', '{"oldContest":true}');
insert into event_entries (id, event_edition_id, competitor_id, seed, role, status, metadata)
values ('b0000000-0000-4000-8000-000000000014', 'b0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000006', 7, 'team', 'confirmed', '{"oldEntry":true}');
insert into contest_entries (contest_id, event_edition_id, event_entry_id, role, ordinal, metadata)
values ('b0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000014', 'home', 1, '{"oldEntry":true}');
insert into brackets (id, event_edition_id, stage_id, bracket_key, name, kind, metadata)
values ('b0000000-0000-4000-8000-000000000013', 'b0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000009', 'r2-bracket', 'R2 Bracket', 'knockout', '{"oldBracket":true}');
insert into bracket_edges (bracket_id, event_edition_id, from_contest_id, to_contest_id, outcome, target_role, priority, metadata)
values ('b0000000-0000-4000-8000-000000000013', 'b0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000011', 'winner', 'home', 1, '{"oldEdge":true}');

insert into provider_bindings (id, provider_id, event_edition_id, binding_key, role, mode, health_status, adapter_config)
values
  ('b0000000-0000-4000-8000-000000000020', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'r2-shadow', 'primary', 'shadow', 'healthy', '{"allowTrustedCorrections":true}'),
  ('b0000000-0000-4000-8000-000000000022', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'r2-disabled', 'shadow', 'disabled', 'healthy', '{"allowTrustedCorrections":true}'),
  ('b0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'r2-write', 'fallback', 'write', 'healthy', '{"allowTrustedCorrections":true}'),
  ('b0000000-0000-4000-8000-000000000026', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000005', 'r2-second-edition', 'fallback', 'write', 'healthy', '{"allowTrustedCorrections":true}');
insert into ingestion_runs (id, binding_id, provider_id, event_edition_id, claim_key, trigger_kind, claimed_by, lease_expires_at)
values
  ('b0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000020', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'r2-shadow-run', 'replay', 'r2-test', now()+interval '10 minutes'),
  ('b0000000-0000-4000-8000-000000000023', 'b0000000-0000-4000-8000-000000000022', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'r2-disabled-run', 'replay', 'r2-test', now()+interval '10 minutes'),
  ('b0000000-0000-4000-8000-000000000025', 'b0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'r2-write-run', 'replay', 'r2-test', now()+interval '10 minutes'),
  ('b0000000-0000-4000-8000-000000000027', 'b0000000-0000-4000-8000-000000000026', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000005', 'r2-second-run', 'replay', 'r2-test', now()+interval '10 minutes');

insert into provider_entity_refs (binding_id, provider_id, event_edition_id, entity_kind, external_id, canonical_id, resolution_status, reviewed_by, reviewed_at)
values
  ('b0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'organization', 'root-org', 'b0000000-0000-4000-8000-000000000002', 'reviewed', 'r2', now()),
  ('b0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'competition', 'root-comp', 'b0000000-0000-4000-8000-000000000003', 'reviewed', 'r2', now()),
  ('b0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'event_edition', 'root-edition', 'b0000000-0000-4000-8000-000000000004', 'reviewed', 'r2', now()),
  ('b0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'competitor', 'root-team', 'b0000000-0000-4000-8000-000000000006', 'reviewed', 'r2', now()),
  ('b0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'stage', 'parent-stage', 'b0000000-0000-4000-8000-000000000008', 'reviewed', 'r2', now()),
  ('b0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'stage', 'child-stage', 'b0000000-0000-4000-8000-000000000009', 'reviewed', 'r2', now()),
  ('b0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'round', 'parent-round', 'b0000000-0000-4000-8000-000000000010', 'reviewed', 'r2', now()),
  ('b0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'round', 'child-round', 'b0000000-0000-4000-8000-000000000016', 'reviewed', 'r2', now()),
  ('b0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'contest', 'lifecycle-contest', 'b0000000-0000-4000-8000-000000000012', 'reviewed', 'r2', now()),
  ('b0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'contest', 'child-contest', 'b0000000-0000-4000-8000-000000000011', 'reviewed', 'r2', now()),
  ('b0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'event_entry', 'entry-1', 'b0000000-0000-4000-8000-000000000014', 'reviewed', 'r2', now()),
  ('b0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'bracket', 'r2-bracket', 'b0000000-0000-4000-8000-000000000013', 'reviewed', 'r2', now()),
  ('b0000000-0000-4000-8000-000000000026', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000005', 'competitor', 'shared-team', 'b0000000-0000-4000-8000-000000000006', 'reviewed', 'r2', now());

create temporary table slice_2b_r2_observations (name text primary key, observation_id uuid);

-- Conflict evidence is immutable and replay-stable, including same raw payload with changed normalized evidence.
insert into slice_2b_r2_observations
select 'conflict-original', observation_id from record_provider_observation('b0000000-0000-4000-8000-000000000025','b0000000-0000-4000-8000-000000000024','result','conflict','rev-1','2026-11-01T10:00:00Z','2026-11-01T10:01:00Z',1,'{"raw":1}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','root-edition','contestExternalId','child-contest','resultStatus','final','outcomeType','draw','resultData',jsonb_build_object()),'semanticHash',repeat('1',64)));
select lives_ok($sql$ select * from record_provider_observation('b0000000-0000-4000-8000-000000000025','b0000000-0000-4000-8000-000000000024','result','conflict','rev-1','2026-11-01T10:00:00Z','2026-11-01T10:02:00Z',1,'{"raw":2}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',2,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','root-edition','contestExternalId','child-contest','resultStatus','final','outcomeType','draw','resultData',jsonb_build_object('changed',true)),'semanticHash',repeat('2',64))) $sql$, 'first revision conflict is retained');
select lives_ok($sql$ select * from record_provider_observation('b0000000-0000-4000-8000-000000000025','b0000000-0000-4000-8000-000000000024','result','conflict','rev-1','2026-11-01T10:00:00Z','2026-11-01T10:03:00Z',1,'{"raw":2}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',2,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','root-edition','contestExternalId','child-contest','resultStatus','final','outcomeType','draw','resultData',jsonb_build_object('changed',true)),'semanticHash',repeat('2',64))) $sql$, 'identical revision conflict replay is idempotent');
select is((select count(*) from provider_observation_conflicts where original_observation_id=(select observation_id from slice_2b_r2_observations where name='conflict-original')), 1::bigint, 'identical conflict replay does not duplicate immutable evidence');
select lives_ok($sql$
  alter table provider_observation_conflicts
    drop constraint if exists provider_observation_conflicts_snapshot_hash_valid,
    drop constraint if exists provider_observation_conflicts_identity_unique,
    drop column if exists normalized_snapshot_hash;
  alter table provider_observation_conflicts
    add column normalized_snapshot_hash text generated always as (
      encode(extensions.digest(slice_2b_canonical_json(normalized_snapshot), 'sha256'), 'hex')
    ) stored;
  alter table provider_observation_conflicts
    add constraint provider_observation_conflicts_snapshot_hash_valid
      check (normalized_snapshot_hash ~ '^[a-f0-9]{64}$'),
    add constraint provider_observation_conflicts_identity_unique
      unique (original_observation_id, payload_hash, normalized_snapshot_hash);
$sql$, 'safe conflict-hash migration rehearsal tolerates a pre-existing conflict row');
select is((select count(*) from provider_observation_conflicts where original_observation_id=(select observation_id from slice_2b_r2_observations where name='conflict-original')), 1::bigint, 'migration rehearsal preserves pre-existing immutable conflict evidence');

-- Non-write bindings retain observations but have no canonical projection side effects.
insert into slice_2b_r2_observations
select 'shadow-structural', observation_id from record_provider_observation('b0000000-0000-4000-8000-000000000021','b0000000-0000-4000-8000-000000000020','event_entry','shadow-entry','shadow-1','2026-11-01T11:00:00Z','2026-11-01T11:01:00Z',1,'{"fixture":"shadow"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','root-edition','competitorExternalId','root-team','role','team','status','confirmed','metadata',jsonb_build_object()),'semanticHash',repeat('3',64)));
insert into slice_2b_r2_observations
select 'disabled-structural', observation_id from record_provider_observation('b0000000-0000-4000-8000-000000000023','b0000000-0000-4000-8000-000000000022','event_entry','disabled-entry','disabled-1','2026-11-01T11:00:00Z','2026-11-01T11:01:00Z',1,'{"fixture":"disabled"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','root-edition','competitorExternalId','root-team','role','team','status','confirmed','metadata',jsonb_build_object()),'semanticHash',repeat('4',64)));
select is((select outcome from project_structural_observation((select observation_id from slice_2b_r2_observations where name='shadow-structural'))), 'skipped_non_write', 'shadow structural projection is explicitly skipped');
select is((select outcome from project_structural_observation((select observation_id from slice_2b_r2_observations where name='disabled-structural'))), 'skipped_non_write', 'disabled structural projection is explicitly skipped');

-- Partial root observations preserve omitted scalar fields and merge metadata.
insert into slice_2b_r2_observations
select 'root-org-partial', observation_id from record_provider_observation('b0000000-0000-4000-8000-000000000025','b0000000-0000-4000-8000-000000000024','organization','root-org','org-1','2026-11-01T12:00:00Z','2026-11-01T12:01:00Z',1,'{"fixture":"root"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','partial','normalizedEntity',jsonb_build_object('organizationKind','league','name','Patched Organization','metadata',jsonb_build_object('new',true)),'semanticHash',repeat('5',64)));
select is((select outcome from project_structural_observation((select observation_id from slice_2b_r2_observations where name='root-org-partial'))), 'projected', 'partial organization projects');
select is((select official_url from organizations where id='b0000000-0000-4000-8000-000000000002'), 'https://old.example/org', 'partial organization preserves omitted URL');
select is((select metadata from organizations where id='b0000000-0000-4000-8000-000000000002'), '{"keep":"yes","new":true,"old":true}'::jsonb, 'partial organization merges metadata');
insert into slice_2b_r2_observations
select 'root-comp-partial', observation_id from record_provider_observation('b0000000-0000-4000-8000-000000000025','b0000000-0000-4000-8000-000000000024','competition','root-comp','comp-1','2026-11-01T12:02:00Z','2026-11-01T12:03:00Z',1,'{"fixture":"root"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','partial','normalizedEntity',jsonb_build_object('name','Patched Cup','domain','sport','organizationExternalId','root-org','metadata',jsonb_build_object('new',true)),'semanticHash',repeat('6',64)));
select is((select outcome from project_structural_observation((select observation_id from slice_2b_r2_observations where name='root-comp-partial'))), 'projected', 'partial competition projects');
select is((select official_url from competitions where id='b0000000-0000-4000-8000-000000000003'), 'https://old.example/cup', 'partial competition preserves omitted URL');
select is((select rules_metadata from competitions where id='b0000000-0000-4000-8000-000000000003'), '{"oldRule":true}'::jsonb, 'partial competition preserves omitted rules metadata');
insert into slice_2b_r2_observations
select 'root-edition-partial', observation_id from record_provider_observation('b0000000-0000-4000-8000-000000000025','b0000000-0000-4000-8000-000000000024','event_edition','root-edition','edition-1','2026-11-01T12:04:00Z','2026-11-01T12:05:00Z',1,'{"fixture":"root"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','partial','normalizedEntity',jsonb_build_object('competitionExternalId','root-comp','editionKey','2026','name','Patched Edition','seasonLabel','2026','timezone','UTC','status','active','metadata',jsonb_build_object('new',true)),'semanticHash',repeat('7',64)));
select is((select outcome from project_structural_observation((select observation_id from slice_2b_r2_observations where name='root-edition-partial'))), 'projected', 'partial edition projects');
select is((select starts_at from event_editions where id='b0000000-0000-4000-8000-000000000004'), '2026-11-01T10:00:00Z'::timestamptz, 'partial edition preserves start date');
select is((select official_url from event_editions where id='b0000000-0000-4000-8000-000000000004'), 'https://old.example/edition', 'partial edition preserves omitted URL');
insert into slice_2b_r2_observations
select 'root-team-partial', observation_id from record_provider_observation('b0000000-0000-4000-8000-000000000025','b0000000-0000-4000-8000-000000000024','competitor','root-team','team-1','2026-11-01T12:06:00Z','2026-11-01T12:07:00Z',1,'{"fixture":"root"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','partial','normalizedEntity',jsonb_build_object('competitorKind','team','canonicalName','Patched Team','metadata',jsonb_build_object('new',true)),'semanticHash',repeat('8',64)));
select is((select outcome from project_structural_observation((select observation_id from slice_2b_r2_observations where name='root-team-partial'))), 'projected', 'partial competitor projects');
select is((select short_name from competitors where id='b0000000-0000-4000-8000-000000000006'), 'OT', 'partial competitor preserves short name');
select is((select country_code from competitors where id='b0000000-0000-4000-8000-000000000006'), 'US', 'partial competitor preserves country');
select is((select metadata from competitors where id='b0000000-0000-4000-8000-000000000006'), '{"new":true,"oldTeam":true}'::jsonb, 'partial competitor merges metadata');

-- Edition-scoped structural updates preserve optional values and child rows.
insert into slice_2b_r2_observations
select 'entry-partial', observation_id from record_provider_observation('b0000000-0000-4000-8000-000000000025','b0000000-0000-4000-8000-000000000024','event_entry','entry-1','entry-1','2026-11-01T13:00:00Z','2026-11-01T13:01:00Z',1,'{"fixture":"entry"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','partial','normalizedEntity',jsonb_build_object('eventEditionExternalId','root-edition','competitorExternalId','root-team','role','team','status','confirmed','metadata',jsonb_build_object('new',true)),'semanticHash',repeat('9',64)));
select is((select outcome from project_structural_observation((select observation_id from slice_2b_r2_observations where name='entry-partial'))), 'projected', 'partial event entry projects');
select is((select seed from event_entries where id='b0000000-0000-4000-8000-000000000014'), 7, 'partial event entry preserves seed');
select is((select metadata from event_entries where id='b0000000-0000-4000-8000-000000000014'), '{"new":true,"oldEntry":true}'::jsonb, 'partial event entry merges metadata');
insert into slice_2b_r2_observations
select 'stage-partial', observation_id from record_provider_observation('b0000000-0000-4000-8000-000000000025','b0000000-0000-4000-8000-000000000024','stage','child-stage','stage-1','2026-11-01T13:02:00Z','2026-11-01T13:03:00Z',1,'{"fixture":"stage"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','partial','normalizedEntity',jsonb_build_object('eventEditionExternalId','root-edition','stageKey','child','name','Patched Child Stage','stageKind','knockout','ordinal',2,'metadata',jsonb_build_object('new',true)),'semanticHash',repeat('a',64)));
select is((select outcome from project_structural_observation((select observation_id from slice_2b_r2_observations where name='stage-partial'))), 'projected', 'partial stage projects');
select is((select parent_stage_id from stages where id='b0000000-0000-4000-8000-000000000009'), 'b0000000-0000-4000-8000-000000000008'::uuid, 'partial stage preserves parent');
select is((select starts_at from stages where id='b0000000-0000-4000-8000-000000000009'), '2026-11-04T10:00:00Z'::timestamptz, 'partial stage preserves dates');
insert into slice_2b_r2_observations
select 'round-partial', observation_id from record_provider_observation('b0000000-0000-4000-8000-000000000025','b0000000-0000-4000-8000-000000000024','round','child-round','round-1','2026-11-01T13:04:00Z','2026-11-01T13:05:00Z',1,'{"fixture":"round"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','partial','normalizedEntity',jsonb_build_object('stageExternalId','child-stage','roundKey','child-round','name','Patched Child Round','ordinal',1,'metadata',jsonb_build_object('new',true)),'semanticHash',repeat('b',64)));
select is((select outcome from project_structural_observation((select observation_id from slice_2b_r2_observations where name='round-partial'))), 'projected', 'partial round projects');
select is((select starts_at from rounds where id='b0000000-0000-4000-8000-000000000016'), '2026-11-08T10:00:00Z'::timestamptz, 'partial round preserves dates');
insert into slice_2b_r2_observations
select 'contest-partial', observation_id from record_provider_observation('b0000000-0000-4000-8000-000000000025','b0000000-0000-4000-8000-000000000024','contest','child-contest','contest-1','2026-11-01T13:06:00Z','2026-11-01T13:07:00Z',1,'{"fixture":"contest"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','partial','normalizedEntity',jsonb_build_object('eventEditionExternalId','root-edition','stageExternalId','child-stage','roundExternalId','child-round','contestKey','child-contest','name','Patched Child Contest','contestKind','match','status','live','entries',jsonb_build_array(),'metadata',jsonb_build_object('new',true)),'semanticHash',repeat('c',64)));
select is((select outcome from project_structural_observation((select observation_id from slice_2b_r2_observations where name='contest-partial'))), 'projected', 'partial contest projects');
select is((select parent_contest_id from contests where id='b0000000-0000-4000-8000-000000000011'), 'b0000000-0000-4000-8000-000000000012'::uuid, 'partial contest preserves parent');
select is((select scheduled_at from contests where id='b0000000-0000-4000-8000-000000000011'), '2026-11-11T10:00:00Z'::timestamptz, 'partial contest preserves schedule');
insert into slice_2b_r2_observations
select 'bracket-partial', observation_id from record_provider_observation('b0000000-0000-4000-8000-000000000025','b0000000-0000-4000-8000-000000000024','bracket','r2-bracket','bracket-1','2026-11-01T13:08:00Z','2026-11-01T13:09:00Z',1,'{"fixture":"bracket"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','partial','normalizedEntity',jsonb_build_object('stageExternalId','child-stage','bracketKey','r2-bracket','name','Patched Bracket','bracketKind','knockout','edges',jsonb_build_array(),'metadata',jsonb_build_object('new',true)),'semanticHash',repeat('d',64)));
select is((select outcome from project_structural_observation((select observation_id from slice_2b_r2_observations where name='bracket-partial'))), 'projected', 'partial bracket projects');
select is((select count(*) from bracket_edges where bracket_id='b0000000-0000-4000-8000-000000000013'), 1::bigint, 'partial bracket preserves child edges');
select is((select metadata from brackets where id='b0000000-0000-4000-8000-000000000013'), '{"new":true,"oldBracket":true}'::jsonb, 'partial bracket merges metadata');

-- Same-timestamp changed partial input is quarantined before a canonical or provenance write.
insert into slice_2b_r2_observations
select 'stage-partial-conflict', observation_id from record_provider_observation('b0000000-0000-4000-8000-000000000025','b0000000-0000-4000-8000-000000000024','stage','child-stage','stage-2','2026-11-01T13:02:00Z','2026-11-01T13:10:00Z',1,'{"fixture":"stage-conflict"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','partial','normalizedEntity',jsonb_build_object('eventEditionExternalId','root-edition','stageKey','child','name','Should Not Apply','stageKind','knockout','ordinal',2,'metadata',jsonb_build_object('bad',true)),'semanticHash',repeat('e',64)));
select is((select outcome from project_structural_observation((select observation_id from slice_2b_r2_observations where name='stage-partial-conflict'))), 'quarantined', 'equal-timestamp partial conflict quarantines');
select is((select name from stages where id='b0000000-0000-4000-8000-000000000009'), 'Patched Child Stage', 'quarantined partial update preserves canonical row');
select is((select last_observation_id from canonical_structural_projection_state where entity_kind='stage' and canonical_id='b0000000-0000-4000-8000-000000000009'), (select observation_id from slice_2b_r2_observations where name='stage-partial'), 'quarantined partial update preserves provenance');

-- Root provenance is edition-scoped and shared competitors can be projected in both editions.
insert into slice_2b_r2_observations
select 'shared-team-second-edition', observation_id from record_provider_observation('b0000000-0000-4000-8000-000000000027','b0000000-0000-4000-8000-000000000026','competitor','shared-team','shared-1','2026-11-01T14:00:00Z','2026-11-01T14:01:00Z',1,'{"fixture":"second-edition"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','partial','normalizedEntity',jsonb_build_object('competitorKind','team','canonicalName','Second Edition Name','metadata',jsonb_build_object('second',true)),'semanticHash',repeat('f',64)));
select is((select outcome from project_structural_observation((select observation_id from slice_2b_r2_observations where name='shared-team-second-edition'))), 'projected', 'shared competitor projects in a second edition');
select is((select count(*) from canonical_structural_projection_scope where entity_kind='competitor' and canonical_id='b0000000-0000-4000-8000-000000000006'), 2::bigint, 'competitor provenance is independently scoped by edition');

-- SQL lifecycle ordering enforces the same monotonic policy as TypeScript.
insert into slice_2b_r2_observations
select 'lifecycle-scheduled', observation_id from record_provider_observation('b0000000-0000-4000-8000-000000000025','b0000000-0000-4000-8000-000000000024','contest','lifecycle-contest','life-1','2026-11-01T15:00:00Z','2026-11-01T15:01:00Z',1,'{"fixture":"lifecycle"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','root-edition','stageExternalId','child-stage','roundExternalId','child-round','contestKey','lifecycle','name','Lifecycle Contest','contestKind','match','status','scheduled','requiredForCompletion',true,'entries',jsonb_build_array(),'metadata',jsonb_build_object()),'semanticHash',repeat('1',64)));
insert into slice_2b_r2_observations
select 'lifecycle-live', observation_id from record_provider_observation('b0000000-0000-4000-8000-000000000025','b0000000-0000-4000-8000-000000000024','contest','lifecycle-contest','life-2','2026-11-01T15:02:00Z','2026-11-01T15:03:00Z',1,'{"fixture":"lifecycle"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','root-edition','stageExternalId','child-stage','roundExternalId','child-round','contestKey','lifecycle','name','Lifecycle Contest','contestKind','match','status','live','requiredForCompletion',true,'entries',jsonb_build_array(),'metadata',jsonb_build_object()),'semanticHash',repeat('2',64)));
insert into slice_2b_r2_observations
select 'lifecycle-final', observation_id from record_provider_observation('b0000000-0000-4000-8000-000000000025','b0000000-0000-4000-8000-000000000024','contest','lifecycle-contest','life-3','2026-11-01T15:04:00Z','2026-11-01T15:05:00Z',1,'{"fixture":"lifecycle"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','root-edition','stageExternalId','child-stage','roundExternalId','child-round','contestKey','lifecycle','name','Lifecycle Contest','contestKind','match','status','final','requiredForCompletion',true,'entries',jsonb_build_array(),'metadata',jsonb_build_object()),'semanticHash',repeat('3',64)));
select is((select outcome from project_structural_observation((select observation_id from slice_2b_r2_observations where name='lifecycle-scheduled'))), 'projected', 'scheduled lifecycle projects');
select is((select outcome from project_structural_observation((select observation_id from slice_2b_r2_observations where name='lifecycle-live'))), 'projected', 'live lifecycle advances');
select is((select outcome from project_structural_observation((select observation_id from slice_2b_r2_observations where name='lifecycle-final'))), 'projected', 'final lifecycle advances');
select is((select status from contests where id='b0000000-0000-4000-8000-000000000012'), 'final', 'lifecycle terminal state is stored');

insert into slice_2b_r2_observations
select 'shadow-result', observation_id from record_provider_observation('b0000000-0000-4000-8000-000000000021','b0000000-0000-4000-8000-000000000020','result','shadow-result','shadow-result-1','2026-11-01T15:10:00Z','2026-11-01T15:11:00Z',1,'{"fixture":"shadow-result"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','root-edition','contestExternalId','child-contest','resultStatus','final','outcomeType','draw','resultData',jsonb_build_object()),'semanticHash',repeat('4',64)));
insert into slice_2b_r2_observations
select 'disabled-result', observation_id from record_provider_observation('b0000000-0000-4000-8000-000000000023','b0000000-0000-4000-8000-000000000022','result','disabled-result','disabled-result-1','2026-11-01T15:10:00Z','2026-11-01T15:11:00Z',1,'{"fixture":"disabled-result"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','root-edition','contestExternalId','child-contest','resultStatus','final','outcomeType','draw','resultData',jsonb_build_object()),'semanticHash',repeat('5',64)));
select is((select outcome from project_provider_result((select observation_id from slice_2b_r2_observations where name='shadow-result'))), 'skipped_non_write', 'shadow result projection is explicitly skipped');
select is((select outcome from project_provider_result((select observation_id from slice_2b_r2_observations where name='disabled-result'))), 'skipped_non_write', 'disabled result projection is explicitly skipped');

insert into slice_2b_r2_observations
select 'lifecycle-regress-live', observation_id from record_provider_observation('b0000000-0000-4000-8000-000000000025','b0000000-0000-4000-8000-000000000024','contest','lifecycle-contest','life-4','2026-11-01T15:06:00Z','2026-11-01T15:07:00Z',1,'{"fixture":"lifecycle"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','root-edition','stageExternalId','child-stage','roundExternalId','child-round','contestKey','lifecycle','name','Lifecycle Contest','contestKind','match','status','live','requiredForCompletion',true,'entries',jsonb_build_array(),'metadata',jsonb_build_object()),'semanticHash',repeat('6',64)));
insert into slice_2b_r2_observations
select 'lifecycle-regress-scheduled', observation_id from record_provider_observation('b0000000-0000-4000-8000-000000000025','b0000000-0000-4000-8000-000000000024','contest','lifecycle-contest','life-5','2026-11-01T15:08:00Z','2026-11-01T15:09:00Z',1,'{"fixture":"lifecycle"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','root-edition','stageExternalId','child-stage','roundExternalId','child-round','contestKey','lifecycle','name','Lifecycle Contest','contestKind','match','status','scheduled','requiredForCompletion',true,'entries',jsonb_build_array(),'metadata',jsonb_build_object()),'semanticHash',repeat('7',64)));
insert into slice_2b_r2_observations
select 'lifecycle-equal-change', observation_id from record_provider_observation('b0000000-0000-4000-8000-000000000025','b0000000-0000-4000-8000-000000000024','contest','lifecycle-contest','life-6','2026-11-01T15:04:00Z','2026-11-01T15:10:00Z',1,'{"fixture":"lifecycle"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','root-edition','stageExternalId','child-stage','roundExternalId','child-round','contestKey','lifecycle','name','Lifecycle Contest','contestKind','match','status','canceled','requiredForCompletion',true,'entries',jsonb_build_array(),'metadata',jsonb_build_object()),'semanticHash',repeat('8',64)));
select is((select outcome from project_structural_observation((select observation_id from slice_2b_r2_observations where name='lifecycle-regress-live'))), 'quarantined', 'final to live lifecycle regression quarantines');
select is((select outcome from project_structural_observation((select observation_id from slice_2b_r2_observations where name='lifecycle-regress-scheduled'))), 'quarantined', 'final to scheduled lifecycle regression quarantines');
select is((select outcome from project_structural_observation((select observation_id from slice_2b_r2_observations where name='lifecycle-equal-change'))), 'quarantined', 'equal timestamp lifecycle change quarantines');

insert into slice_2b_r2_observations
select 'result-final', observation_id from record_provider_observation('b0000000-0000-4000-8000-000000000025','b0000000-0000-4000-8000-000000000024','result','child-contest','result-1','2026-11-01T16:00:00Z','2026-11-01T16:01:00Z',1,'{"fixture":"result"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','root-edition','contestExternalId','child-contest','resultStatus','final','outcomeType','draw','resultData',jsonb_build_object('source','r2'),'providerEffectiveAt','2026-11-01T16:00:00Z'),'semanticHash',repeat('9',64)));
select is((select outcome from project_provider_result((select observation_id from slice_2b_r2_observations where name='result-final'))), 'projected', 'initial terminal result projects');
insert into slice_2b_r2_observations
select 'result-provisional-older', observation_id from record_provider_observation('b0000000-0000-4000-8000-000000000025','b0000000-0000-4000-8000-000000000024','result','child-contest','result-2','2026-11-01T16:02:00Z','2026-11-01T16:03:00Z',1,'{"fixture":"result","case":"older"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','root-edition','contestExternalId','child-contest','resultStatus','provisional','outcomeType','pending','resultData',jsonb_build_object(),'providerEffectiveAt','2026-11-01T15:00:00Z'),'semanticHash',repeat('a',64)));
insert into slice_2b_r2_observations
select 'result-provisional-equal', observation_id from record_provider_observation('b0000000-0000-4000-8000-000000000025','b0000000-0000-4000-8000-000000000024','result','child-contest','result-3','2026-11-01T16:04:00Z','2026-11-01T16:05:00Z',1,'{"fixture":"result","case":"equal"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','root-edition','contestExternalId','child-contest','resultStatus','provisional','outcomeType','pending','resultData',jsonb_build_object(),'providerEffectiveAt','2026-11-01T16:00:00Z'),'semanticHash',repeat('b',64)));
insert into slice_2b_r2_observations
select 'result-provisional-newer', observation_id from record_provider_observation('b0000000-0000-4000-8000-000000000025','b0000000-0000-4000-8000-000000000024','result','child-contest','result-4','2026-11-01T16:06:00Z','2026-11-01T16:07:00Z',1,'{"fixture":"result","case":"newer"}'::jsonb,jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','r2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','root-edition','contestExternalId','child-contest','resultStatus','provisional','outcomeType','pending','resultData',jsonb_build_object(),'providerEffectiveAt','2026-11-01T17:00:00Z'),'semanticHash',repeat('c',64)));
select is((select outcome from project_provider_result((select observation_id from slice_2b_r2_observations where name='result-provisional-older'))), 'quarantined', 'older terminal to provisional update quarantines');
select is((select outcome from project_provider_result((select observation_id from slice_2b_r2_observations where name='result-provisional-equal'))), 'quarantined', 'equal terminal to provisional update quarantines');
select is((select outcome from project_provider_result((select observation_id from slice_2b_r2_observations where name='result-provisional-newer'))), 'quarantined', 'newer terminal to provisional update quarantines');

-- This test file reserves the last assertions for the result policy boundary.
-- The TypeScript matrix covers all four terminal statuses; SQL proves the same
-- terminal-to-provisional regression remains illegal at old/equal/new times.
select is(slice_2b_canonical_json('{"ordinary":42,"tiny":1e-7,"threshold":0.000001,"negativeZero":-0}'::jsonb), '{"negativeZero":0,"ordinary":42,"threshold":0.000001,"tiny":1e-7}', 'ordinary SQL canonical numbers remain stable');

select * from finish();
rollback;
