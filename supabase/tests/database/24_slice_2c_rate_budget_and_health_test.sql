begin;

select plan(95);

select has_table('public', 'provider_rate_budgets', 'provider-wide budget table exists');
select has_table('public', 'provider_rate_budget_reservations', 'immutable reservation table exists');
select has_column('public', 'provider_rate_budgets', 'provider_id', 'budget provider_id exists');
select has_column('public', 'provider_rate_budgets', 'scope_key', 'budget scope exists');
select has_column('public', 'provider_rate_budgets', 'configured_limit_count', 'budget ceiling exists');
select has_column('public', 'provider_rate_budgets', 'configured_window_seconds', 'budget window exists');
select has_column('public', 'provider_rate_budgets', 'available_count', 'budget availability exists');
select has_column('public', 'provider_rate_budgets', 'trusted_reset_at', 'trusted reset exists');
select has_column('public', 'provider_rate_budgets', 'observed_limit_count', 'observed limit exists');
select has_column('public', 'provider_rate_budgets', 'observed_remaining_count', 'observed remaining exists');
select has_column('public', 'provider_rate_budgets', 'observed_reset_at', 'observed reset exists');
select has_column('public', 'provider_rate_budgets', 'observed_at', 'observed effective time exists');
select has_column('public', 'provider_rate_budgets', 'observed_accepted_at', 'observed acceptance time exists');
select has_column('public', 'provider_rate_budgets', 'updated_at', 'budget updated_at exists');
select has_column('public', 'provider_rate_budget_reservations', 'id', 'reservation id exists');
select has_column('public', 'provider_rate_budget_reservations', 'provider_id', 'reservation provider exists');
select has_column('public', 'provider_rate_budget_reservations', 'scope_key', 'reservation scope exists');
select has_column('public', 'provider_rate_budget_reservations', 'attempt_key', 'reservation attempt key exists');
select has_column('public', 'provider_rate_budget_reservations', 'cost', 'reservation cost exists');
select has_column('public', 'provider_rate_budget_reservations', 'reserved_at', 'reservation time exists');
select has_column('public', 'provider_rate_budget_reservations', 'remaining_after', 'reservation remaining exists');
select has_index('public', 'provider_rate_budgets', 'provider_rate_budgets_pkey', 'budget primary key exists');
select has_index('public', 'provider_rate_budget_reservations', 'provider_rate_budget_reservations_provider_id_scope_key_attempt_key_key', 'reservation idempotency key exists');
select ok((select count(*) >= 8 from pg_constraint where conrelid = 'public.provider_rate_budgets'::regclass), 'budget constraints cover scope, ceiling, availability, and observations');
select ok((select count(*) >= 4 from pg_constraint where conrelid = 'public.provider_rate_budget_reservations'::regclass), 'reservation constraints cover identity and nonnegative values');
select ok((select relrowsecurity from pg_class where oid = 'public.provider_rate_budgets'::regclass), 'budget RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.provider_rate_budget_reservations'::regclass), 'reservation RLS is enabled');
select ok(has_table_privilege('service_role', 'public.provider_rate_budgets', 'select'), 'service_role can select budgets');
select ok(has_table_privilege('service_role', 'public.provider_rate_budget_reservations', 'select'), 'service_role can select reservations');
select ok(not has_table_privilege('service_role', 'public.provider_rate_budgets', 'insert'), 'service_role cannot insert budgets directly');
select ok(not has_table_privilege('service_role', 'public.provider_rate_budgets', 'update'), 'service_role cannot update budgets directly');
select ok(not has_table_privilege('service_role', 'public.provider_rate_budgets', 'delete'), 'service_role cannot delete budgets directly');
select ok(not has_table_privilege('service_role', 'public.provider_rate_budgets', 'truncate'), 'service_role cannot truncate budgets directly');
select ok(not has_table_privilege('service_role', 'public.provider_rate_budget_reservations', 'insert'), 'service_role cannot insert reservations directly');
select ok(not has_table_privilege('service_role', 'public.provider_rate_budget_reservations', 'update'), 'service_role cannot update reservations directly');
select ok(not has_table_privilege('service_role', 'public.provider_rate_budget_reservations', 'delete'), 'service_role cannot delete reservations directly');
select ok(not has_table_privilege('service_role', 'public.provider_rate_budget_reservations', 'truncate'), 'service_role cannot truncate reservations directly');
select ok(has_function_privilege('service_role', 'public.reserve_provider_budget(uuid,text,text,integer)', 'execute'), 'service_role can reserve through the public wrapper');
select ok(has_function_privilege('service_role', 'public.record_ingestion_response(uuid,text,integer,integer,integer,timestamptz,timestamptz,timestamptz)', 'execute'), 'service_role can record responses through the public wrapper');
select ok(not has_function_privilege('service_role', 'public.record_provider_rate_headers_for_run(uuid,text,integer,integer,timestamptz,timestamptz)', 'execute'), 'service_role cannot execute the private header helper');

insert into data_providers (id, adapter_key, display_name)
values ('c5000000-0000-4000-8000-000000000001', 'slice-2c-budget', 'Slice 2C Budget Provider');
insert into data_providers (id, adapter_key, display_name)
values ('c5000000-0000-4000-8000-000000000007', 'slice-2c-no-budget', 'Slice 2C No Budget Provider');
insert into organizations (id, organization_key, name, kind)
values ('c5000000-0000-4000-8000-000000000002', 'slice-2c-budget-org', 'Slice 2C Budget Org', 'league');
insert into competitions (id, organization_id, competition_key, name, domain)
values ('c5000000-0000-4000-8000-000000000003', 'c5000000-0000-4000-8000-000000000002', 'slice-2c-budget-cup', 'Slice 2C Budget Cup', 'sport');
insert into event_editions (id, competition_id, edition_key, name, season_label)
values ('c5000000-0000-4000-8000-000000000004', 'c5000000-0000-4000-8000-000000000003', '2026', 'Slice 2C Budget Edition', '2026');
insert into provider_bindings (id, provider_id, event_edition_id, binding_key, mode, health_status, next_poll_at, provider_cursor)
values ('c5000000-0000-4000-8000-000000000005', 'c5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000004', 'budget-primary', 'write', 'healthy', now(), '{}'::jsonb);
insert into provider_bindings (id, provider_id, event_edition_id, binding_key, mode, health_status, next_poll_at, provider_cursor)
values ('c5000000-0000-4000-8000-000000000006', 'c5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000004', 'budget-secondary', 'write', 'healthy', now(), '{}'::jsonb);
insert into provider_bindings (id, provider_id, event_edition_id, binding_key, mode, health_status, next_poll_at, provider_cursor)
values ('c5000000-0000-4000-8000-000000000008', 'c5000000-0000-4000-8000-000000000007', 'c5000000-0000-4000-8000-000000000004', 'budget-missing', 'write', 'healthy', now(), '{}'::jsonb);
insert into provider_rate_budgets (provider_id, scope_key, configured_limit_count, configured_window_seconds, available_count, trusted_reset_at)
values ('c5000000-0000-4000-8000-000000000001', 'provider', 3, 60, 3, clock_timestamp() + interval '60 seconds');

create temporary table budget_claim as
select * from claim_manual_ingestion_run('c5000000-0000-4000-8000-000000000005', 'budget-run', 'budget-worker', now(), 900);
select lives_ok($$select * from start_ingestion_run((select run_id from budget_claim), (select lease_token from budget_claim), now())$$, 'budget run starts through the existing lifecycle wrapper');
create temporary table budget_attempt as
select
  'v1:request:' || (select run_id::text from budget_claim) || ':0:' ||
  public.slice_2c_page_key('c5000000-0000-4000-8000-000000000005', 0, '{}'::jsonb, null) as attempt_key;

create temporary table first_reservation as
select * from reserve_provider_budget((select run_id from budget_claim), (select lease_token from budget_claim), (select attempt_key from budget_attempt), 1);
select is((select outcome from first_reservation), 'reserved', 'available budget creates one reservation');
select is((select remaining_count from first_reservation), 2, 'reservation decrements exactly once');
select is((select count(*) from provider_rate_budget_reservations), 1::bigint, 'one immutable reservation row exists');
select is((select available_count from provider_rate_budgets), 2, 'provider-wide budget availability is decremented');

create temporary table replay_reservation as
select * from reserve_provider_budget((select run_id from budget_claim), (select lease_token from budget_claim), (select attempt_key from budget_attempt), 1);
select is((select outcome from replay_reservation), 'replayed', 'exact reservation replay is idempotent');
select is((select reservation_id from replay_reservation), (select reservation_id from first_reservation), 'replay returns the original reservation');
select is((select count(*) from provider_rate_budget_reservations), 1::bigint, 'replay does not add a reservation');
select is((select available_count from provider_rate_budgets), 2, 'replay does not decrement or replenish');
select throws_ok($$select * from reserve_provider_budget((select run_id from budget_claim), (select lease_token from budget_claim), (select attempt_key from budget_attempt), 2)$$, 'P0005', null, 'same attempt key with changed cost is a conflict');

create temporary table second_claim as
select * from claim_manual_ingestion_run('c5000000-0000-4000-8000-000000000006', 'budget-run-2', 'budget-worker-2', now(), 900);
select lives_ok($$select * from start_ingestion_run((select run_id from second_claim), (select lease_token from second_claim), now())$$, 'second binding can use the provider-wide budget');
create temporary table second_attempt as
select 'v1:request:' || (select run_id::text from second_claim) || ':0:' || public.slice_2c_page_key('c5000000-0000-4000-8000-000000000006', 0, '{}'::jsonb, null) as attempt_key;
create temporary table second_reservation as
select * from reserve_provider_budget((select run_id from second_claim), (select lease_token from second_claim), (select attempt_key from second_attempt), 1);
select is((select outcome from second_reservation), 'reserved', 'a second binding shares the provider budget');
select is((select remaining_count from second_reservation), 1, 'shared provider budget has one unit remaining');
select is((select count(*) from provider_rate_budget_reservations), 2::bigint, 'shared budget records both binding attempts');

create temporary table missing_claim as
select * from claim_manual_ingestion_run('c5000000-0000-4000-8000-000000000008', 'budget-missing-run', 'budget-worker-missing', now(), 900);
select lives_ok($$select * from start_ingestion_run((select run_id from missing_claim), (select lease_token from missing_claim), now())$$, 'missing-budget run starts through the existing lifecycle wrapper');
create temporary table missing_attempt as
select 'v1:request:' || (select run_id::text from missing_claim) || ':0:' || public.slice_2c_page_key('c5000000-0000-4000-8000-000000000008', 0, '{}'::jsonb, null) as attempt_key;
create temporary table missing_reservation as
select * from reserve_provider_budget((select run_id from missing_claim), (select lease_token from missing_claim), (select attempt_key from missing_attempt), 1);
select is((select outcome from missing_reservation), 'configuration_missing', 'missing provider budget fails closed');
select is((select reservation_id from missing_reservation), null::uuid, 'missing configuration has no reservation');
select is((select remaining_count from missing_reservation), null::integer, 'missing configuration has no remaining count');
select is((select retry_at from missing_reservation), null::timestamptz, 'missing configuration has no retry time');

update provider_rate_budgets set available_count = 0 where provider_id = 'c5000000-0000-4000-8000-000000000001';
create temporary table exhausted_reservation as
select * from reserve_provider_budget((select run_id from second_claim), (select lease_token from second_claim), (select attempt_key from second_attempt) || '-new', 1);
select is((select outcome from exhausted_reservation), 'exhausted', 'insufficient availability is exhausted');
select is((select retry_at from exhausted_reservation), (select trusted_reset_at from provider_rate_budgets), 'exhaustion returns authoritative trusted reset');
select is((select count(*) from provider_rate_budget_reservations), 2::bigint, 'exhaustion does not create a reservation');

update provider_rate_budgets set available_count = 0, trusted_reset_at = clock_timestamp() where provider_id = 'c5000000-0000-4000-8000-000000000001';
create temporary table boundary_reservation as
select * from reserve_provider_budget((select run_id from second_claim), (select lease_token from second_claim), (select attempt_key from second_attempt) || '-boundary', 1);
select is((select outcome from boundary_reservation), 'reserved', 'exact reset boundary replenishes before reservation');
select is((select remaining_count from boundary_reservation), 2, 'boundary reset restores the configured ceiling once');

update ingestion_runs set retry_index = 1 where id = (select run_id from second_claim);
update provider_rate_budgets set available_count = 0, trusted_reset_at = clock_timestamp() - interval '181 seconds' where provider_id = 'c5000000-0000-4000-8000-000000000001';
create temporary table multi_window_reservation as
select * from reserve_provider_budget(
  (select run_id from second_claim), (select lease_token from second_claim),
  'v1:request:' || (select run_id::text from second_claim) || ':1:' || public.slice_2c_page_key('c5000000-0000-4000-8000-000000000006', 0, '{}'::jsonb, null), 1
);
select is((select outcome from multi_window_reservation), 'reserved', 'multiple elapsed windows replenish safely');
select is((select remaining_count from multi_window_reservation), 2, 'multi-window reset never over-credits');
select ok((select trusted_reset_at > clock_timestamp() from provider_rate_budgets), 'multi-window reset advances strictly beyond database time');

select lives_ok($$select * from record_ingestion_response((select run_id from budget_claim), (select lease_token from budget_claim), 429, 100, 1, clock_timestamp() + interval '1 hour', clock_timestamp(), now())$$, 'response wrapper records metadata and headers atomically');
select is((select http_status from ingestion_runs where id = (select run_id from budget_claim)), 429, 'HTTP status is persisted');
select is((select observed_limit_count from provider_rate_budgets), 100, 'observed limit is retained without changing configured ceiling');
select is((select available_count from provider_rate_budgets), 1, 'headers can reduce but not raise availability');
select is((select trusted_reset_at from provider_rate_budgets), (select trusted_reset_at from provider_rate_budgets), 'trusted reset remains database-authoritative');
select lives_ok($$select * from record_ingestion_response((select run_id from budget_claim), (select lease_token from budget_claim), 200, 100, 0, clock_timestamp() + interval '2 hours', null, clock_timestamp() + interval '1 day')$$, 'future provider observation is accepted with server-time clamping');
select is((select available_count from provider_rate_budgets), 0, 'future headers cannot increase availability');
select lives_ok($$select * from record_ingestion_response((select run_id from budget_claim), (select lease_token from budget_claim), 200, 100, 3, clock_timestamp() - interval '1 hour', null, clock_timestamp() - interval '1 day')$$, 'older header is safely ignored');
select is((select observed_remaining_count from provider_rate_budgets), 0, 'older header cannot overwrite newer observation');
select throws_ok($$select * from record_ingestion_response((select run_id from budget_claim), (select lease_token from budget_claim), 200, 1, 2, null, null, now())$$, '22023', null, 'invalid header bounds fail atomically');
select is((select http_status from ingestion_runs where id = (select run_id from budget_claim)), 200, 'failed header update leaves prior response metadata unchanged');

set role service_role;
select is(current_user, 'service_role', 'privilege probe runs as service_role');
select throws_ok($sql$insert into provider_rate_budgets (provider_id, scope_key, configured_limit_count, configured_window_seconds, available_count, trusted_reset_at) values ('c5000000-0000-4000-8000-000000000001', 'provider', 1, 60, 1, now())$sql$, '42501', null, 'service_role cannot insert budgets directly');
select throws_ok($sql$update provider_rate_budgets set available_count = 0 where false$sql$, '42501', null, 'service_role cannot update budgets directly');
select throws_ok($sql$delete from provider_rate_budgets where false$sql$, '42501', null, 'service_role cannot delete budgets directly');
select throws_ok($sql$truncate table provider_rate_budgets$sql$, '42501', null, 'service_role cannot truncate budgets');
select throws_ok($sql$insert into provider_rate_budget_reservations (provider_id, scope_key, attempt_key, cost, reserved_at, remaining_after) values ('c5000000-0000-4000-8000-000000000001', 'provider', 'direct', 1, now(), 0)$sql$, '42501', null, 'service_role cannot insert reservations directly');
select throws_ok($sql$update provider_rate_budget_reservations set cost = 2 where false$sql$, '42501', null, 'service_role cannot update reservations directly');
select throws_ok($sql$delete from provider_rate_budget_reservations where false$sql$, '42501', null, 'service_role cannot delete reservations directly');
select throws_ok($sql$truncate table provider_rate_budget_reservations$sql$, '42501', null, 'service_role cannot truncate reservations');
select ok(
  not has_table_privilege('anon', 'public.provider_rate_budgets', 'insert')
  and not has_table_privilege('anon', 'public.provider_rate_budgets', 'update')
  and not has_table_privilege('anon', 'public.provider_rate_budgets', 'delete')
  and not has_table_privilege('anon', 'public.provider_rate_budgets', 'truncate')
  and not has_table_privilege('authenticated', 'public.provider_rate_budgets', 'insert')
  and not has_table_privilege('authenticated', 'public.provider_rate_budgets', 'update')
  and not has_table_privilege('authenticated', 'public.provider_rate_budgets', 'delete')
  and not has_table_privilege('authenticated', 'public.provider_rate_budgets', 'truncate'),
  'browser roles cannot mutate provider budgets directly'
);
select ok(
  not has_table_privilege('anon', 'public.provider_rate_budget_reservations', 'insert')
  and not has_table_privilege('anon', 'public.provider_rate_budget_reservations', 'update')
  and not has_table_privilege('anon', 'public.provider_rate_budget_reservations', 'delete')
  and not has_table_privilege('anon', 'public.provider_rate_budget_reservations', 'truncate')
  and not has_table_privilege('authenticated', 'public.provider_rate_budget_reservations', 'insert')
  and not has_table_privilege('authenticated', 'public.provider_rate_budget_reservations', 'update')
  and not has_table_privilege('authenticated', 'public.provider_rate_budget_reservations', 'delete')
  and not has_table_privilege('authenticated', 'public.provider_rate_budget_reservations', 'truncate'),
  'browser roles cannot mutate reservations directly'
);
select ok(not has_function_privilege('anon', 'public.reserve_provider_budget(uuid,text,text,integer)', 'execute'), 'anon cannot execute the reservation wrapper');
select ok(not has_function_privilege('authenticated', 'public.reserve_provider_budget(uuid,text,text,integer)', 'execute'), 'authenticated cannot execute the reservation wrapper');
select ok(not has_function_privilege('anon', 'public.record_ingestion_response(uuid,text,integer,integer,integer,timestamptz,timestamptz,timestamptz)', 'execute'), 'anon cannot execute the response wrapper');
select ok(not has_function_privilege('authenticated', 'public.record_ingestion_response(uuid,text,integer,integer,integer,timestamptz,timestamptz,timestamptz)', 'execute'), 'authenticated cannot execute the response wrapper');
select lives_ok($$select * from reserve_provider_budget((select run_id from second_claim), (select lease_token from second_claim), (select attempt_key from second_attempt), 1)$$, 'service_role can execute reservation wrapper');
select throws_ok($$select * from record_provider_rate_headers_for_run((select run_id from second_claim), (select lease_token from second_claim), 10, 1, now(), now())$$, '42501', null, 'service_role cannot execute private header helper');
reset role;

select * from finish();
rollback;
