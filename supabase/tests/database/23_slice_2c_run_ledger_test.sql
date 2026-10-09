begin;

select plan(63);

select has_table('public', 'ingestion_page_ledger', 'immutable page ledger exists');
select ok(has_table_privilege('service_role', 'public.provider_bindings', 'select'), 'service_role can read bindings');
select ok(has_table_privilege('service_role', 'public.ingestion_runs', 'select'), 'service_role can read runs');
select ok(has_table_privilege('service_role', 'public.ingestion_page_ledger', 'select'), 'service_role can read page ledger');
select ok(not has_table_privilege('service_role', 'public.provider_bindings', 'insert'), 'service_role cannot insert bindings directly');
select ok(not has_table_privilege('service_role', 'public.provider_bindings', 'update'), 'service_role cannot update bindings directly');
select ok(not has_table_privilege('service_role', 'public.provider_bindings', 'delete'), 'service_role cannot delete bindings directly');
select ok(not has_table_privilege('service_role', 'public.provider_bindings', 'truncate'), 'service_role cannot truncate bindings');
select ok(not has_table_privilege('service_role', 'public.ingestion_runs', 'insert'), 'service_role cannot insert runs directly');
select ok(not has_table_privilege('service_role', 'public.ingestion_runs', 'update'), 'service_role cannot update runs directly');
select ok(not has_table_privilege('service_role', 'public.ingestion_runs', 'delete'), 'service_role cannot delete runs directly');
select ok(not has_table_privilege('service_role', 'public.ingestion_runs', 'truncate'), 'service_role cannot truncate runs');
select ok(not has_table_privilege('service_role', 'public.ingestion_page_ledger', 'insert'), 'service_role cannot insert pages directly');
select ok(not has_table_privilege('service_role', 'public.ingestion_page_ledger', 'update'), 'service_role cannot update pages directly');
select ok(not has_table_privilege('service_role', 'public.ingestion_page_ledger', 'delete'), 'service_role cannot delete pages directly');
select ok(not has_table_privilege('service_role', 'public.ingestion_page_ledger', 'truncate'), 'service_role cannot truncate pages');
select ok(has_function_privilege('service_role', 'public.claim_due_ingestion_run(text,timestamptz,text,integer)', 'execute'), 'service_role can claim due runs');
select ok(has_function_privilege('service_role', 'public.commit_ingestion_page(uuid,text,text,bigint,jsonb,text,jsonb,text,integer,integer,integer,integer,integer,integer,integer)', 'execute'), 'service_role can commit pages');
select ok(not has_function_privilege('service_role', 'public.slice_2c_run_row(uuid,boolean)', 'execute'), 'service_role cannot execute the run helper');
select ok(not has_function_privilege('service_role', 'public.slice_2c_page_key(uuid,bigint,jsonb,text)', 'execute'), 'service_role cannot execute the page-key helper');

insert into data_providers (id, adapter_key, display_name)
values ('c2000000-0000-4000-8000-000000000001', 'slice-2c-fixture', 'Slice 2C Fixture');
insert into organizations (id, organization_key, name, kind)
values ('c2000000-0000-4000-8000-000000000002', 'slice-2c-org', 'Slice 2C Organization', 'league');
insert into competitions (id, organization_id, competition_key, name, domain)
values ('c2000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-000000000002', 'slice-2c-cup', 'Slice 2C Cup', 'sport');
insert into event_editions (id, competition_id, edition_key, name, season_label)
values ('c2000000-0000-4000-8000-000000000004', 'c2000000-0000-4000-8000-000000000003', '2026', 'Slice 2C 2026', '2026');
insert into provider_bindings (
  id, provider_id, event_edition_id, binding_key, mode, health_status,
  next_poll_at, provider_cursor
) values (
  'c2000000-0000-4000-8000-000000000005', 'c2000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000004', 'slice-2c-write', 'write', 'healthy',
  '2026-10-08T18:00:00Z', '{}'::jsonb
);

create temporary table first_claim as
select * from claim_due_ingestion_run('scheduler-operation-1', now(), 'worker-a', 900);
select is((select count(*) from first_claim), 1::bigint, 'due claim creates one run');
select is((select claim_generation from first_claim), 1::bigint, 'first claim has monotonic generation one');
select is((select retry_index from first_claim), 0, 'ordinary claim starts retry index zero');
select is((select mode from first_claim), 'write', 'claim returns binding mode');
select ok((select lease_token is not null from first_claim), 'owner receives a lease token');
select is((select claim_request_key from first_claim), 'automated:v1:scheduler-operation-1', 'automated keys use the disjoint namespace');
select is((select claim_key from first_claim), 'v1:schedule:c2000000-0000-4000-8000-000000000005:g1', 'claim key includes binding and generation');

create temporary table competing_claim as
select * from claim_due_ingestion_run('scheduler-operation-1', now(), 'worker-b', 900);
select is((select count(*) from competing_claim), 1::bigint, 'exact request replay returns the prior run');
select is((select run_id from competing_claim), (select run_id from first_claim), 'exact replay returns the same run');
select ok((select lease_token is null from competing_claim), 'competing worker receives no lease token');
select ok((select not lease_acquired from competing_claim), 'competing worker is not lease owner');

select lives_ok(
  $$ select * from start_ingestion_run((select run_id from first_claim), (select lease_token from first_claim), now()) $$,
  'claimed run transitions to running through its lease boundary'
);

create temporary table first_page as
select * from commit_ingestion_page(
  (select run_id from first_claim),
  (select lease_token from first_claim),
  slice_2c_page_key('c2000000-0000-4000-8000-000000000005', 0, '{}'::jsonb, null),
  0, '{}'::jsonb, null, '{"page":1}'::jsonb, 'etag-1', 2, 2, 1, 1, 0, 0, 0
);
select is((select outcome from first_page), 'committed', 'first page commits');
select is((select checkpoint_generation from first_page), 1::bigint, 'page commit advances checkpoint once');
select is((select count(*) from ingestion_page_ledger), 1::bigint, 'page ledger has one immutable row');
select is((select normalized_count from ingestion_runs where id = (select run_id from first_claim)), 2, 'page commit increments normalized count');
select is((select provider_cursor from provider_bindings where id = 'c2000000-0000-4000-8000-000000000005'), '{"page": 1}'::jsonb, 'page commit advances cursor');

create temporary table replay_page as
select * from commit_ingestion_page(
  (select run_id from first_claim),
  (select lease_token from first_claim),
  slice_2c_page_key('c2000000-0000-4000-8000-000000000005', 0, '{}'::jsonb, null),
  0, '{}'::jsonb, null, '{"page":1}'::jsonb, 'etag-1', 2, 2, 1, 1, 0, 0, 0
);
select is((select outcome from replay_page), 'replayed', 'response-loss replay is checked before checkpoint CAS');
select is((select page_ledger_id from replay_page), (select page_ledger_id from first_page), 'replay returns original immutable page ID');
select is((select count(*) from ingestion_page_ledger), 1::bigint, 'exact replay does not add a ledger row');
select is((select normalized_count from ingestion_runs where id = (select run_id from first_claim)), 2, 'exact replay does not increment counters');
select throws_ok(
  $$ select * from commit_ingestion_page(
    (select run_id from first_claim), (select lease_token from first_claim),
    slice_2c_page_key('c2000000-0000-4000-8000-000000000005', 0, '{}'::jsonb, null),
    0, '{}'::jsonb, null, '{"page":2}'::jsonb, 'etag-2', 2, 2, 2, 0, 0, 0, 0
  ) $$,
  'P0003', null, 'same page key with changed effect is a page conflict'
);
select throws_ok(
  $$ select * from commit_ingestion_page(
    (select run_id from first_claim), (select lease_token from first_claim),
    slice_2c_page_key('c2000000-0000-4000-8000-000000000005', 0, '{"stale":true}'::jsonb, null),
    0, '{"stale":true}'::jsonb, null, '{"page":2}'::jsonb, 'etag-2', 1, 1, 1, 0, 0, 0, 0
  ) $$,
  'P0002', null, 'stale checkpoint CAS is rejected'
);

select lives_ok(
  $$ select * from finish_ingestion_run((select run_id from first_claim), (select lease_token from first_claim), 'succeeded', now(), now() + interval '1 hour', null, true, null, null, '{"fixture":"sports"}'::jsonb) $$,
  'running run finishes atomically'
);
select is((select status from ingestion_runs where id = (select run_id from first_claim)), 'succeeded', 'finished run is terminal');
select ok((select lease_token is null from ingestion_runs where id = (select run_id from first_claim)), 'terminal run no longer exposes a lease token');

update provider_bindings
set next_poll_at = now()
where id = 'c2000000-0000-4000-8000-000000000005';
create temporary table manual_claim as
select * from claim_manual_ingestion_run('c2000000-0000-4000-8000-000000000005', 'operator-replay', 'operator-a', now(), 900);
select is((select claim_request_key from manual_claim), 'manual:v1:c2000000-0000-4000-8000-000000000005:operator-replay', 'manual keys include binding namespace');
select is((select trigger_kind from ingestion_runs where id = (select run_id from manual_claim)), 'manual', 'manual claim records manual trigger');
select lives_ok(
  $$ select * from finish_ingestion_run((select run_id from manual_claim), (select lease_token from manual_claim), 'canceled', now(), now() + interval '1 hour', null, false, null, null, '{}'::jsonb) $$,
  'manual claim can finish without provider data'
);

insert into ingestion_runs (
  id, binding_id, provider_id, event_edition_id, claim_key, trigger_kind, status,
  claimed_by, lease_expires_at, started_at, finished_at, retry_index, next_retry_at,
  claim_generation, error_class, error_message
) values (
  'c2000000-0000-4000-8000-000000000010', 'c2000000-0000-4000-8000-000000000005',
  'c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000004',
  'v1:failed:g2', 'schedule', 'failed', 'worker-a', null,
  now() - interval '2 hours', now() - interval '119 minutes', 0, now() + interval '10 minutes', 2,
  'timeout', 'synthetic timeout'
);
update provider_bindings
set next_poll_at = now()
where id = 'c2000000-0000-4000-8000-000000000005';
select is((select count(*) from claim_due_ingestion_run('future-retry-poll', now() + interval '5 minutes', 'worker-c', 900)), 0::bigint, 'future unresolved retry suppresses ordinary polling');
create temporary table retry_claim as
select * from claim_due_ingestion_run('retry-operation-1', now() + interval '10 minutes', 'worker-c', 900);
select is((select count(*) from retry_claim), 1::bigint, 'retry claims at the exact retry boundary');
select is((select retry_index from retry_claim), 1, 'retry child increments retry index');
select is((select retry_of_run_id from ingestion_runs where id = (select run_id from retry_claim)), 'c2000000-0000-4000-8000-000000000010'::uuid, 'retry child records its parent');
select is((select trigger_kind from ingestion_runs where id = (select run_id from retry_claim)), 'retry', 'retry child records retry trigger');
select is((select count(*) from claim_due_ingestion_run('retry-operation-2', '2026-10-08T18:10:01Z', 'worker-d', 60)), 0::bigint, 'one retry parent cannot create a second child');

insert into ingestion_runs (
  id, binding_id, provider_id, event_edition_id, claim_key, trigger_kind, status,
  claimed_by, lease_expires_at, started_at, finished_at, retry_index, next_retry_at,
  claim_generation, error_class, error_message
) values (
  'c2000000-0000-4000-8000-000000000011', 'c2000000-0000-4000-8000-000000000005',
  'c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000004',
  'v1:failed:g3', 'retry', 'failed', 'worker-a', null,
  now() - interval '110 minutes', now() - interval '109 minutes', 3, now() + interval '11 minutes', 3,
  'timeout', 'synthetic timeout'
);
select lives_ok(
  $$ select * from finish_ingestion_run((select run_id from retry_claim), (select lease_token from retry_claim), 'failed', now() + interval '11 minutes', null, null, false, 'timeout', 'retry terminal', '{}'::jsonb) $$,
  'retry child can finish before its next lineage decision'
);
update provider_bindings set next_poll_at = now() + interval '12 minutes' where id = 'c2000000-0000-4000-8000-000000000005';
select is((select count(*) from claim_due_ingestion_run('retry-cap-poll', now() + interval '12 minutes', 'worker-e', 900)), 1::bigint, 'retry index three does not create a fifth retry and can return to ordinary polling');

select lives_ok(
  $$ select * from reclaim_expired_ingestion_runs(now() + interval '40 minutes', 'worker crash', now() + interval '45 minutes') $$,
  'expired lease is reclaimed through the database boundary'
);

set role service_role;
select throws_ok($sql$insert into provider_bindings (provider_id, event_edition_id, binding_key) values ('c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000004', 'denied')$sql$, '42501', null, 'SET ROLE service_role cannot insert a binding');
select throws_ok($sql$update ingestion_runs set metadata = '{}'::jsonb where false$sql$, '42501', null, 'SET ROLE service_role cannot update runs');
select throws_ok($sql$insert into ingestion_page_ledger default values$sql$, '42501', null, 'SET ROLE service_role cannot insert page ledger rows');
select throws_ok($sql$select * from slice_2c_run_row('c2000000-0000-4000-8000-000000000010', false)$sql$, '42501', null, 'SET ROLE service_role cannot execute private run helper');
select is((select count(*) from claim_manual_ingestion_run('c2000000-0000-4000-8000-000000000005', 'service-role-call', 'service-worker', now() + interval '50 minutes', 900)), 1::bigint, 'service_role wrapper remains callable');
reset role;

select * from finish();
rollback;
