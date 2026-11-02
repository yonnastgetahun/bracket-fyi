begin;
-- Explicit synthetic fixture activation; production remains stopped by default.
update event_runtime_control set global_stopped=false;

select plan(27);

select ok(has_table_privilege('service_role', 'public.canonical_structural_projection_state', 'select'), 'service_role can read structural projection state');
select ok(not has_table_privilege('service_role', 'public.canonical_structural_projection_state', 'insert'), 'service_role cannot directly insert structural projection state');
select ok(not has_table_privilege('service_role', 'public.canonical_structural_projection_state', 'update'), 'service_role cannot directly update structural projection state');
select ok(not has_table_privilege('service_role', 'public.canonical_structural_projection_state', 'delete'), 'service_role cannot directly delete structural projection state');
select ok(not has_table_privilege('service_role', 'public.canonical_structural_projection_state', 'truncate'), 'service_role cannot truncate structural projection state');
select ok(has_table_privilege('service_role', 'public.canonical_structural_projection_scope', 'select'), 'service_role can read structural projection scope');
select ok(not has_table_privilege('service_role', 'public.canonical_structural_projection_scope', 'insert'), 'service_role cannot directly insert structural projection scope');
select ok(not has_table_privilege('service_role', 'public.canonical_structural_projection_scope', 'update'), 'service_role cannot directly update structural projection scope');
select ok(not has_table_privilege('service_role', 'public.canonical_structural_projection_scope', 'delete'), 'service_role cannot directly delete structural projection scope');
select ok(not has_table_privilege('service_role', 'public.canonical_structural_projection_scope', 'truncate'), 'service_role cannot truncate structural projection scope');

select ok(not has_function_privilege('service_role', 'public.project_structural_observation_unchecked(uuid)', 'execute'), 'service_role cannot execute the unchecked structural helper');
select ok(not has_function_privilege('service_role', 'public.project_provider_result_unchecked(uuid,text)', 'execute'), 'service_role cannot execute the unchecked result helper');
select ok(not has_function_privilege('service_role', 'public.slice_2b_project_root_observation(uuid)', 'execute'), 'service_role cannot execute the root helper');
select ok(not has_function_privilege('service_role', 'public.slice_2b_resolve_quarantine(uuid)', 'execute'), 'service_role cannot execute the quarantine helper');
select ok(has_function_privilege('service_role', 'public.project_structural_observation(uuid)', 'execute'), 'service_role can execute the structural wrapper');

insert into data_providers (id, adapter_key, display_name)
values ('c3000000-0000-4000-8000-000000000001', 'r3-fixture', 'R3 Fixture');
insert into organizations (id, organization_key, name, kind)
values ('c3000000-0000-4000-8000-000000000002', 'r3-org', 'R3 Organization', 'league');
insert into competitions (id, organization_id, competition_key, name, domain)
values ('c3000000-0000-4000-8000-000000000003', 'c3000000-0000-4000-8000-000000000002', 'r3-cup', 'R3 Cup', 'sport');
insert into event_editions (id, competition_id, edition_key, name, season_label)
values ('c3000000-0000-4000-8000-000000000004', 'c3000000-0000-4000-8000-000000000003', '2026', 'R3 Edition', '2026');
insert into provider_bindings (id, provider_id, event_edition_id, binding_key, role, mode, health_status)
values ('c3000000-0000-4000-8000-000000000005', 'c3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000004', 'r3-write', 'primary', 'write', 'healthy');
insert into ingestion_runs (id, binding_id, provider_id, event_edition_id, claim_key, trigger_kind, claimed_by, lease_expires_at)
values ('c3000000-0000-4000-8000-000000000006', 'c3000000-0000-4000-8000-000000000005', 'c3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000004', 'r3-run', 'replay', 'r3-test', now() + interval '10 minutes');
insert into provider_entity_refs (binding_id, provider_id, event_edition_id, entity_kind, external_id, canonical_id, resolution_status, reviewed_by, reviewed_at)
values ('c3000000-0000-4000-8000-000000000005', 'c3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000004', 'organization', 'r3-org', 'c3000000-0000-4000-8000-000000000002', 'reviewed', 'r3-test', now());

create temporary table r3_observation as
select * from record_provider_observation(
  'c3000000-0000-4000-8000-000000000006',
  'c3000000-0000-4000-8000-000000000005',
  'organization',
  'r3-org',
  'r3-revision-1',
  '2026-10-08T10:00:00Z',
  '2026-10-08T10:01:00Z',
  1,
  '{"fixture":"r3"}'::jsonb,
  jsonb_build_object(
    'contractVersion', 'slice-2a-v1',
    'adapterKey', 'r3',
    'adapterConfigVersion', 1,
    'normalizationPolicyVersion', 'identity-normalization-v1',
    'completeness', 'full',
    'normalizedEntity', jsonb_build_object('organizationKind', 'league', 'name', 'R3 Projected Organization', 'metadata', jsonb_build_object()),
    'semanticHash', repeat('a', 64)
  )
);

select is((select outcome from project_structural_observation((select observation_id from r3_observation))), 'projected', 'SECURITY DEFINER structural wrapper still projects');
select is((select count(*) from canonical_structural_projection_state where entity_kind = 'organization' and canonical_id = 'c3000000-0000-4000-8000-000000000002'), 0::bigint, 'wrapper leaves the legacy structural state table untouched');
select is((select last_observation_id from canonical_structural_projection_scope where entity_kind = 'organization' and canonical_id = 'c3000000-0000-4000-8000-000000000002'), (select observation_id from r3_observation), 'wrapper updates scoped provenance');

set role service_role;
select is(current_user, 'service_role', 'privilege probe runs as service_role');
select throws_ok($sql$insert into canonical_structural_projection_state (event_edition_id, entity_kind, canonical_id, last_observation_id, last_received_at, semantic_hash, completeness) values ('c3000000-0000-4000-8000-000000000004', 'organization', 'c3000000-0000-4000-8000-000000000002', (select observation_id from r3_observation), now(), repeat('b', 64), 'full')$sql$, '42501', null, 'SET ROLE service_role cannot insert structural state');
select throws_ok($sql$update canonical_structural_projection_state set updated_at = now() where false$sql$, '42501', null, 'SET ROLE service_role cannot update structural state');
select throws_ok($sql$delete from canonical_structural_projection_state where false$sql$, '42501', null, 'SET ROLE service_role cannot delete structural state');
select throws_ok($sql$truncate table canonical_structural_projection_state$sql$, '42501', null, 'SET ROLE service_role cannot truncate structural state');
select throws_ok($sql$insert into canonical_structural_projection_scope (event_edition_id, entity_kind, canonical_id, last_observation_id, last_received_at, semantic_hash, completeness) values ('c3000000-0000-4000-8000-000000000004', 'organization', 'c3000000-0000-4000-8000-000000000002', (select observation_id from r3_observation), now(), repeat('b', 64), 'full')$sql$, '42501', null, 'SET ROLE service_role cannot insert structural scope');
select throws_ok($sql$update canonical_structural_projection_scope set updated_at = now() where false$sql$, '42501', null, 'SET ROLE service_role cannot update structural scope');
select throws_ok($sql$delete from canonical_structural_projection_scope where false$sql$, '42501', null, 'SET ROLE service_role cannot delete structural scope');
select throws_ok($sql$truncate table canonical_structural_projection_scope$sql$, '42501', null, 'SET ROLE service_role cannot truncate structural scope');
reset role;

select * from finish();
rollback;
