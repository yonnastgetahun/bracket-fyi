begin;

select plan(21);

select is(
  (select count(*) from information_schema.role_routine_grants
   where specific_schema = 'public'
     and routine_name in ('project_structural_observation', 'project_provider_result')
     and grantee in ('anon', 'authenticated')),
  0::bigint,
  'replay projection boundaries remain unavailable to browser roles'
);

create temporary table slice_2b_legacy_counts as
select
  (select count(*) from template_results) as template_results_count,
  (select count(*) from template_matches where contest_id is not null) as linked_template_matches_count;

insert into data_providers (id, adapter_key, display_name)
values ('99000000-0000-4000-8000-000000000001', 'replay-fixture', 'Synthetic Replay Fixture');
insert into organizations (id, organization_key, name, kind)
values ('99000000-0000-4000-8000-000000000002', 'replay-org', 'Synthetic Replay Organization', 'studio');
insert into competitions (id, organization_id, competition_key, name, domain)
values ('99000000-0000-4000-8000-000000000003', '99000000-0000-4000-8000-000000000002', 'replay-program', 'Synthetic Replay Program', 'other');
insert into event_editions (id, competition_id, edition_key, name, season_label)
values
  ('99000000-0000-4000-8000-000000000004', '99000000-0000-4000-8000-000000000003', 'sports', 'Synthetic Sports Replay', 'synthetic-sports'),
  ('99000000-0000-4000-8000-000000000005', '99000000-0000-4000-8000-000000000003', 'ceremony', 'Synthetic Ceremony Replay', 'synthetic-ceremony');
insert into stages (id, event_edition_id, stage_key, name, kind, ordinal)
values
  ('99000000-0000-4000-8000-000000000006', '99000000-0000-4000-8000-000000000004', 'finals', 'Synthetic Finals', 'knockout', 1),
  ('99000000-0000-4000-8000-000000000007', '99000000-0000-4000-8000-000000000005', 'categories', 'Synthetic Categories', 'ceremony', 1);
insert into contests (id, event_edition_id, stage_id, contest_key, name, kind)
values
  ('99000000-0000-4000-8000-000000000008', '99000000-0000-4000-8000-000000000004', '99000000-0000-4000-8000-000000000006', 'sports-final', 'Synthetic Sports Final', 'match'),
  ('99000000-0000-4000-8000-000000000009', '99000000-0000-4000-8000-000000000005', '99000000-0000-4000-8000-000000000007', 'ceremony-category', 'Synthetic Ceremony Category', 'award');
insert into competitors (id, competitor_key, kind, canonical_name)
values
  ('99000000-0000-4000-8000-000000000010', 'sports-team-a', 'team', 'Synthetic Sports Team A'),
  ('99000000-0000-4000-8000-000000000011', 'ceremony-work', 'other_work', 'Synthetic Ceremony Work');
insert into event_entries (id, event_edition_id, competitor_id, role)
values
  ('99000000-0000-4000-8000-000000000012', '99000000-0000-4000-8000-000000000004', '99000000-0000-4000-8000-000000000010', 'team'),
  ('99000000-0000-4000-8000-000000000013', '99000000-0000-4000-8000-000000000005', '99000000-0000-4000-8000-000000000011', 'work');
insert into contest_entries (contest_id, event_edition_id, event_entry_id, role, ordinal)
values
  ('99000000-0000-4000-8000-000000000008', '99000000-0000-4000-8000-000000000004', '99000000-0000-4000-8000-000000000012', 'winner', 1),
  ('99000000-0000-4000-8000-000000000009', '99000000-0000-4000-8000-000000000005', '99000000-0000-4000-8000-000000000013', 'nominee', 1);
insert into provider_bindings (id, provider_id, event_edition_id, binding_key, mode, health_status)
values
  ('99000000-0000-4000-8000-000000000014', '99000000-0000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000004', 'replay-sports', 'write', 'healthy'),
  ('99000000-0000-4000-8000-000000000015', '99000000-0000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000005', 'replay-ceremony', 'write', 'healthy');
insert into ingestion_runs (id, binding_id, provider_id, event_edition_id, claim_key, trigger_kind, claimed_by, lease_expires_at)
values
  ('99000000-0000-4000-8000-000000000016', '99000000-0000-4000-8000-000000000014', '99000000-0000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000004', 'replay-sports-run', 'replay', 'replay-test', now() + interval '10 minutes'),
  ('99000000-0000-4000-8000-000000000017', '99000000-0000-4000-8000-000000000015', '99000000-0000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000005', 'replay-ceremony-run', 'replay', 'replay-test', now() + interval '10 minutes');
insert into provider_entity_refs (binding_id, provider_id, event_edition_id, entity_kind, external_id, canonical_id, resolution_status, reviewed_by, reviewed_at)
values
  ('99000000-0000-4000-8000-000000000014', '99000000-0000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000004', 'contest', 'sports-final', '99000000-0000-4000-8000-000000000008', 'reviewed', 'replay-operator', now()),
  ('99000000-0000-4000-8000-000000000014', '99000000-0000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000004', 'event_entry', 'sports-entry-a', '99000000-0000-4000-8000-000000000012', 'reviewed', 'replay-operator', now()),
  ('99000000-0000-4000-8000-000000000015', '99000000-0000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000005', 'contest', 'ceremony-category', '99000000-0000-4000-8000-000000000009', 'reviewed', 'replay-operator', now()),
  ('99000000-0000-4000-8000-000000000015', '99000000-0000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000005', 'event_entry', 'ceremony-entry', '99000000-0000-4000-8000-000000000013', 'reviewed', 'replay-operator', now());

create temporary table slice_2b_replay_observations (name text primary key, observation_id uuid);
insert into slice_2b_replay_observations
select 'sports', observation_id from record_provider_observation(
  '99000000-0000-4000-8000-000000000016', '99000000-0000-4000-8000-000000000014', 'result', 'sports-final', 'sports-final-1', '2026-10-08T18:00:00Z', '2026-10-08T18:01:00Z', 1, '{"fixture":"synthetic-sports"}'::jsonb,
  jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','replay-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','sports-edition','contestExternalId','sports-final','resultStatus','final','outcomeType','winner','winnerEventEntryExternalId','sports-entry-a','resultData',jsonb_build_object('fixture','synthetic-sports'),'score',jsonb_build_object('home',2,'away',1),'providerEffectiveAt','2026-10-08T18:00:00Z'),'semanticHash',repeat('a',64))
);
insert into slice_2b_replay_observations
select 'ceremony', observation_id from record_provider_observation(
  '99000000-0000-4000-8000-000000000017', '99000000-0000-4000-8000-000000000015', 'result', 'ceremony-category', 'ceremony-category-1', '2026-10-08T21:00:00Z', '2026-10-08T21:01:00Z', 1, '{"fixture":"synthetic-ceremony"}'::jsonb,
  jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','replay-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','ceremony-edition','contestExternalId','ceremony-category','resultStatus','awarded','outcomeType','winner','winnerEventEntryExternalId','ceremony-entry','resultData',jsonb_build_object('fixture','synthetic-ceremony'),'providerEffectiveAt','2026-10-08T21:00:00Z'),'semanticHash',repeat('b',64))
);
insert into slice_2b_replay_observations
select 'sports-semantic-replay', observation_id from record_provider_observation(
  '99000000-0000-4000-8000-000000000016', '99000000-0000-4000-8000-000000000014', 'result', 'sports-final-replay', 'sports-final-2', '2026-10-08T18:01:00Z', '2026-10-08T18:02:00Z', 1, '{"fixture":"synthetic-sports","delivery":2}'::jsonb,
  jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','replay-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('eventEditionExternalId','sports-edition','contestExternalId','sports-final','resultStatus','final','outcomeType','winner','winnerEventEntryExternalId','sports-entry-a','resultData',jsonb_build_object('fixture','synthetic-sports'),'score',jsonb_build_object('away',1,'home',2),'providerEffectiveAt','2026-10-08T18:00:00Z'),'semanticHash',repeat('a',64))
);

select is((select outcome from project_provider_result((select observation_id from slice_2b_replay_observations where name = 'sports'))), 'projected', 'synthetic sports final projects');
select is((select outcome from project_provider_result((select observation_id from slice_2b_replay_observations where name = 'ceremony'))), 'projected', 'synthetic ceremony award projects');
select is((select result_status from contest_results where contest_id = '99000000-0000-4000-8000-000000000008'), 'final', 'sports replay preserves final status');
select is((select result_status from contest_results where contest_id = '99000000-0000-4000-8000-000000000009'), 'awarded', 'ceremony replay preserves awarded status');
select is((select count(*) from result_audit_events), 2::bigint, 'sports and ceremony replay create one audit each');
select is((select count(*) from notification_outbox where audience_kind = 'operator'), 2::bigint, 'sports and ceremony replay create operator intents only');
select is((select outcome from project_provider_result((select observation_id from slice_2b_replay_observations where name = 'sports'), 'v1:result:5be279699f32423f9de6e5164d8db47fc77a733a53d0159cf45f616fb21f19d0')), 'duplicate', 'sports exact replay verifies the TypeScript/SQL semantic key');
select is((select outcome from project_provider_result((select observation_id from slice_2b_replay_observations where name = 'sports-semantic-replay'))), 'duplicate', 'sports semantic replay is idempotent');
select is((select count(*) from contest_results where contest_id = '99000000-0000-4000-8000-000000000008'), 1::bigint, 'sports replay creates no duplicate version');
select is((select count(*) from result_audit_events), 2::bigint, 'replay creates no duplicate audit event');
select is((select count(*) from notification_outbox), 2::bigint, 'replay creates no duplicate notification intent');
select is((select count(*) from provider_observations), 3::bigint, 'immutable replay evidence retains each delivery observation');
select is((select count(*) from contest_results where source_observation_id is null), 0::bigint, 'canonical results retain source observation provenance');
select is((select count(*) from contest_results where event_edition_id not in ('99000000-0000-4000-8000-000000000004','99000000-0000-4000-8000-000000000005')), 0::bigint, 'replay results remain in their binding editions');
select is((select count(*) from template_results), (select template_results_count from slice_2b_legacy_counts), 'replay does not write legacy template results');
select is((select count(*) from template_matches where contest_id is not null), (select linked_template_matches_count from slice_2b_legacy_counts), 'replay does not link legacy template matches');
select is((select count(*) from notification_outbox where intent_type not in ('result_final','result_correction')), 0::bigint, 'replay emits no lifecycle or delivery intent');
select is((select count(*) from result_audit_events where actor_type <> 'provider'), 0::bigint, 'replay actor provenance is provider-derived');
select is((select count(*) from provider_entity_refs where resolution_status <> 'reviewed'), 0::bigint, 'replay uses reviewed synthetic mappings without guessing');
select is((select count(*) from contest_results where version <> 1), 0::bigint, 'independent sports and ceremony contests each start at version one');

select * from finish();
rollback;
