begin;

select plan(24);

insert into data_providers (id, adapter_key, display_name)
values ('c5000000-0000-4000-8000-000000000001', 'slice-2c-5c-fixture', 'Slice 2C.5C Fixture');
insert into organizations (id, organization_key, name, kind)
values ('c5000000-0000-4000-8000-000000000002', 'slice-2c-5c-org', 'Slice 2C.5C Organization', 'league');
insert into competitions (id, organization_id, competition_key, name, domain)
values ('c5000000-0000-4000-8000-000000000003', 'c5000000-0000-4000-8000-000000000002', 'slice-2c-5c-cup', 'Slice 2C.5C Cup', 'sport');
insert into event_editions (id, competition_id, edition_key, name, season_label)
values ('c5000000-0000-4000-8000-000000000004', 'c5000000-0000-4000-8000-000000000003', '2026', 'Slice 2C.5C 2026', '2026');

insert into provider_bindings (
  id, provider_id, event_edition_id, binding_key, role, mode, health_status,
  next_poll_at, provider_cursor
) values
  ('c5000000-0000-4000-8000-000000000010', 'c5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000004', 'null-schedule', 'primary', 'write', 'healthy', null, '{}'::jsonb),
  ('c5000000-0000-4000-8000-000000000011', 'c5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000004', 'future-schedule', 'fallback', 'write', 'healthy', now() + interval '1 day', '{}'::jsonb),
  ('c5000000-0000-4000-8000-000000000012', 'c5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000004', 'due-schedule', 'shadow', 'write', 'healthy', now() - interval '1 minute', '{}'::jsonb);

create temporary table due_claim as
select * from claim_due_ingestion_run('slice-2c-5c-due', now(), 'worker-5c', 900);
select is((select binding_id from due_claim), 'c5000000-0000-4000-8000-000000000012'::uuid, 'ordinary claims select an explicitly due schedule');

create temporary table no_unscheduled_claim as
select * from claim_due_ingestion_run('slice-2c-5c-none', now(), 'worker-5c', 900);
select is((select count(*) from no_unscheduled_claim), 0::bigint, 'NULL and future ordinary schedules are not due');

update provider_bindings
set next_poll_at = now()
where id = 'c5000000-0000-4000-8000-000000000010';
create temporary table explicit_reenable_claim as
select * from claim_due_ingestion_run('slice-2c-5c-reenabled', now(), 'worker-5c', 900);
select is((select binding_id from explicit_reenable_claim), 'c5000000-0000-4000-8000-000000000010'::uuid, 'an explicit initial schedule makes a re-enabled binding claimable');

insert into provider_bindings (
  id, provider_id, event_edition_id, binding_key, role, mode, health_status,
  next_poll_at, provider_cursor
) values (
  'c5000000-0000-4000-8000-000000000020', 'c5000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000004', 'authentication-failure', 'fallback', 'write', 'healthy',
  now() + interval '1 day', '{}'::jsonb
);
create temporary table auth_claim as
select * from claim_manual_ingestion_run('c5000000-0000-4000-8000-000000000020', 'auth-failure', 'worker-5c', now(), 900);
select lives_ok(
  $$ select * from start_ingestion_run((select run_id from auth_claim), (select lease_token from auth_claim), now()) $$,
  'authentication fixture run starts'
);
select lives_ok(
  $$ select * from finish_ingestion_run(
    (select run_id from auth_claim), (select lease_token from auth_claim), 'failed', now(),
    now() + interval '5 minutes', null, false, 'provider:authentication',
    'Provider execution failed: authentication', '{}'::jsonb
  ) $$,
  'authentication failure finishes through the single run boundary'
);
select is(
  (select row(mode, health_status, next_poll_at) from provider_bindings where id = 'c5000000-0000-4000-8000-000000000020'),
  row('disabled'::text, 'disabled'::text, null::timestamptz),
  'authentication failure disables the binding and clears automatic scheduling'
);

insert into provider_bindings (
  id, provider_id, event_edition_id, binding_key, role, mode, health_status,
  next_poll_at, provider_cursor, stale_after_seconds, consecutive_failures, last_data_at
) values
  ('c5000000-0000-4000-8000-000000000021', 'c5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000004', 'empty-stale-success', 'fallback', 'write', 'degraded', now() + interval '1 day', '{}'::jsonb, 60, 2, now() - interval '1 hour'),
  ('c5000000-0000-4000-8000-000000000022', 'c5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000004', 'changed-success', 'fallback', 'write', 'stale', now() + interval '1 day', '{}'::jsonb, 60, 2, null),
  ('c5000000-0000-4000-8000-000000000023', 'c5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000004', 'fresh-timeout', 'fallback', 'write', 'healthy', now() + interval '1 day', '{}'::jsonb, 3600, 0, now()),
  ('c5000000-0000-4000-8000-000000000024', 'c5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000004', 'terminal-invalid', 'fallback', 'write', 'healthy', now() + interval '1 day', '{}'::jsonb, 60, 0, null),
  ('c5000000-0000-4000-8000-000000000025', 'c5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000004', 'fresh-rate-limit', 'fallback', 'write', 'healthy', now() + interval '1 day', '{}'::jsonb, 3600, 0, now()),
  ('c5000000-0000-4000-8000-000000000026', 'c5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000004', 'operator-cancel', 'fallback', 'write', 'degraded', now() + interval '1 day', '{}'::jsonb, 3600, 3, now());

create temporary table empty_stale_claim as
select * from claim_manual_ingestion_run('c5000000-0000-4000-8000-000000000021', 'empty-stale', 'worker-5c', now(), 900);
select lives_ok($$ select * from start_ingestion_run((select run_id from empty_stale_claim), (select lease_token from empty_stale_claim), now()) $$, 'empty-success fixture starts');
select lives_ok($$ select * from finish_ingestion_run((select run_id from empty_stale_claim), (select lease_token from empty_stale_claim), 'succeeded', now(), now() + interval '5 minutes', null, false, null, null, '{}'::jsonb) $$, 'empty stale success finishes');
select is(
  (select row(health_status, consecutive_failures, last_success_at is not null, last_data_at < now() - interval '30 minutes') from provider_bindings where id = 'c5000000-0000-4000-8000-000000000021'),
  row('stale'::text, 0, true, true),
  'empty success resets failures but remains stale without fresh accepted data'
);

create temporary table changed_success_claim as
select * from claim_manual_ingestion_run('c5000000-0000-4000-8000-000000000022', 'changed-success', 'worker-5c', now(), 900);
select lives_ok($$ select * from start_ingestion_run((select run_id from changed_success_claim), (select lease_token from changed_success_claim), now()) $$, 'changed-success fixture starts');
select lives_ok($$ select * from finish_ingestion_run((select run_id from changed_success_claim), (select lease_token from changed_success_claim), 'succeeded', now(), now() + interval '5 minutes', null, true, null, null, '{}'::jsonb) $$, 'changed-data success finishes');
select is(
  (select row(health_status, consecutive_failures, last_success_at is not null, last_data_at is not null) from provider_bindings where id = 'c5000000-0000-4000-8000-000000000022'),
  row('healthy'::text, 0, true, true),
  'changed-data success restores healthy state and freshness'
);

create temporary table timeout_claim as
select * from claim_manual_ingestion_run('c5000000-0000-4000-8000-000000000023', 'fresh-timeout', 'worker-5c', now(), 900);
select lives_ok($$ select * from start_ingestion_run((select run_id from timeout_claim), (select lease_token from timeout_claim), now()) $$, 'timeout fixture starts');
select lives_ok($$ select * from finish_ingestion_run((select run_id from timeout_claim), (select lease_token from timeout_claim), 'failed', now(), now() + interval '5 minutes', now() + interval '5 minutes', false, 'provider:timeout', 'Provider execution failed: timeout', '{}'::jsonb) $$, 'retryable timeout finishes');
select is(
  (select row(health_status, consecutive_failures, next_poll_at = (select next_retry_at from ingestion_runs where id = (select run_id from timeout_claim))) from provider_bindings where id = 'c5000000-0000-4000-8000-000000000023'),
  row('degraded'::text, 1, true),
  'fresh retryable failure degrades health and schedules the authorized retry'
);

create temporary table invalid_claim as
select * from claim_manual_ingestion_run('c5000000-0000-4000-8000-000000000024', 'terminal-invalid', 'worker-5c', now(), 900);
select lives_ok($$ select * from start_ingestion_run((select run_id from invalid_claim), (select lease_token from invalid_claim), now()) $$, 'invalid-response fixture starts');
select lives_ok($$ select * from finish_ingestion_run((select run_id from invalid_claim), (select lease_token from invalid_claim), 'failed', now(), null, null, false, 'provider:invalid_response', 'Provider execution failed: invalid_response', '{}'::jsonb) $$, 'terminal invalid response finishes');
select is(
  (select row(health_status, consecutive_failures, next_poll_at) from provider_bindings where id = 'c5000000-0000-4000-8000-000000000024'),
  row('degraded'::text, 1, null::timestamptz),
  'terminal invalid response degrades and unschedules pending operator disposition'
);

create temporary table rate_limit_claim as
select * from claim_manual_ingestion_run('c5000000-0000-4000-8000-000000000025', 'fresh-rate-limit', 'worker-5c', now(), 900);
select lives_ok($$ select * from start_ingestion_run((select run_id from rate_limit_claim), (select lease_token from rate_limit_claim), now()) $$, 'rate-limit fixture starts');
select lives_ok($$ select * from finish_ingestion_run((select run_id from rate_limit_claim), (select lease_token from rate_limit_claim), 'rate_limited', now(), now() + interval '10 minutes', now() + interval '10 minutes', false, 'provider:rate_limited', 'Provider execution failed: rate_limited', '{}'::jsonb) $$, 'rate-limited run finishes');
select is(
  (select row(pb.health_status, pb.consecutive_failures, ir.failed_count, pb.next_poll_at = ir.next_retry_at) from provider_bindings pb join ingestion_runs ir on ir.binding_id = pb.id where ir.id = (select run_id from rate_limit_claim)),
  row('degraded'::text, 1, 0, true),
  'rate limiting degrades health and schedules retry without inventing an item failure'
);

create temporary table canceled_claim as
select * from claim_manual_ingestion_run('c5000000-0000-4000-8000-000000000026', 'operator-cancel', 'worker-5c', now(), 900);
select lives_ok($$ select * from start_ingestion_run((select run_id from canceled_claim), (select lease_token from canceled_claim), now()) $$, 'cancellation fixture starts');
select lives_ok($$ select * from finish_ingestion_run((select run_id from canceled_claim), (select lease_token from canceled_claim), 'canceled', now(), null, null, false, null, null, '{}'::jsonb) $$, 'operator cancellation finishes');
select is(
  (select row(health_status, consecutive_failures, next_poll_at) from provider_bindings where id = 'c5000000-0000-4000-8000-000000000026'),
  row('degraded'::text, 3, null::timestamptz),
  'operator cancellation preserves health history and clears automatic scheduling'
);

select * from finish();
rollback;
