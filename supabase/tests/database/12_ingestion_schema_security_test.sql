begin;

select plan(35);

select is(
  (
    select count(*)
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relname in (
        'provider_bindings',
        'provider_entity_refs',
        'ingestion_runs',
        'provider_observations',
        'ingestion_quarantine',
        'contest_results',
        'result_audit_events',
        'notification_outbox',
        'notification_attempts',
        'league_completion_holds'
      )
      and relrowsecurity
  ),
  10::bigint,
  'all Slice 1B tables have row level security enabled'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'provider_bindings',
        'provider_entity_refs',
        'ingestion_runs',
        'provider_observations',
        'ingestion_quarantine',
        'contest_results',
        'result_audit_events',
        'notification_outbox',
        'notification_attempts',
        'league_completion_holds'
      )
  ),
  0::bigint,
  'Slice 1B tables expose no anonymous policy by default'
);

select is(
  (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'provider_bindings',
        'provider_entity_refs',
        'ingestion_runs',
        'provider_observations',
        'ingestion_quarantine',
        'contest_results',
        'result_audit_events',
        'notification_outbox',
        'notification_attempts',
        'league_completion_holds'
      )
      and grantee in ('anon', 'authenticated')
  ),
  0::bigint,
  'public client roles receive no direct grants on Slice 1B operator tables'
);

select ok(has_table_privilege('service_role', 'public.provider_bindings', 'select'), 'service_role can read provider bindings');
select ok(not has_table_privilege('service_role', 'public.provider_bindings', 'insert'), 'RPC-only boundary denies direct provider-binding inserts');
select ok(not has_table_privilege('service_role', 'public.provider_bindings', 'update'), 'RPC-only boundary denies direct provider-binding updates');
select ok(has_table_privilege('service_role', 'public.ingestion_runs', 'select'), 'service_role can read ingestion runs');
select ok(not has_table_privilege('service_role', 'public.ingestion_runs', 'insert'), 'RPC-only boundary denies direct ingestion-run inserts');
select ok(not has_table_privilege('service_role', 'public.ingestion_runs', 'update'), 'RPC-only boundary denies direct ingestion-run updates');

select ok(has_table_privilege('service_role', 'public.provider_entity_refs', 'select'), 'service_role can read provider entity references');
select ok(not has_table_privilege('service_role', 'public.provider_entity_refs', 'insert'), 'scoped operator boundary denies direct provider entity reference inserts');
select ok(not has_table_privilege('service_role', 'public.provider_entity_refs', 'update'), 'scoped operator boundary denies direct provider entity reference updates');
select ok(has_table_privilege('service_role', 'public.provider_observations', 'select'), 'service_role can read provider observations');
select ok(has_table_privilege('service_role', 'public.provider_observations', 'insert'), 'provider observation inserts retain the Slice 1B grant');
select ok(not has_table_privilege('service_role', 'public.provider_observations', 'update'), 'provider observations remain immutable');
select ok(has_table_privilege('service_role', 'public.ingestion_quarantine', 'select'), 'service_role can read ingestion quarantine');
select ok(has_table_privilege('service_role', 'public.ingestion_quarantine', 'insert'), 'ingestion quarantine inserts retain the Slice 1B grant');
select ok(has_table_privilege('service_role', 'public.ingestion_quarantine', 'update'), 'ingestion quarantine updates retain the Slice 1B grant');
select ok(has_table_privilege('service_role', 'public.contest_results', 'select'), 'service_role can read contest results');
select ok(not has_table_privilege('service_role', 'public.contest_results', 'insert'), 'scoped operator boundary denies direct contest result inserts');
select ok(not has_table_privilege('service_role', 'public.contest_results', 'update'), 'contest results remain immutable');
select ok(has_table_privilege('service_role', 'public.result_audit_events', 'select'), 'service_role can read result audit events');
select ok(has_table_privilege('service_role', 'public.result_audit_events', 'insert'), 'result audit inserts retain the Slice 1B grant');
select ok(not has_table_privilege('service_role', 'public.result_audit_events', 'update'), 'result audit events remain immutable');
select ok(has_table_privilege('service_role', 'public.notification_outbox', 'select'), 'service_role can read notification outbox');
select ok(has_table_privilege('service_role', 'public.notification_outbox', 'insert'), 'notification outbox inserts retain the Slice 1B grant');
select ok(has_table_privilege('service_role', 'public.notification_outbox', 'update'), 'notification outbox updates retain the Slice 1B grant');
select ok(has_table_privilege('service_role', 'public.notification_attempts', 'select'), 'service_role can read notification attempts');
select ok(has_table_privilege('service_role', 'public.notification_attempts', 'insert'), 'notification attempt inserts retain the Slice 1B grant');
select ok(has_table_privilege('service_role', 'public.notification_attempts', 'update'), 'notification attempt updates retain the Slice 1B grant');
select ok(has_table_privilege('service_role', 'public.league_completion_holds', 'select'), 'service_role can read completion holds');
select ok(has_table_privilege('service_role', 'public.league_completion_holds', 'insert'), 'completion hold inserts retain the Slice 1B grant');
select ok(has_table_privilege('service_role', 'public.league_completion_holds', 'update'), 'completion hold updates retain the Slice 1B grant');

select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'provider_bindings',
        'provider_entity_refs',
        'ingestion_runs',
        'provider_observations',
        'ingestion_quarantine',
        'contest_results',
        'result_audit_events',
        'notification_outbox',
        'notification_attempts',
        'league_completion_holds'
      )
      and column_name ~ '(^|_)(api_key|secret|password|access_token|refresh_token|private_key)($|_)'
  ),
  0::bigint,
  'Slice 1B stores credential references and endpoint fingerprints rather than secret material'
);

select throws_ok(
  $$
    set local role anon;
    insert into ingestion_runs (
      binding_id,
      provider_id,
      event_edition_id,
      claim_key,
      trigger_kind,
      claimed_by,
      lease_expires_at
    ) values (
      gen_random_uuid(),
      gen_random_uuid(),
      gen_random_uuid(),
      'unauthorized-run',
      'manual',
      'anonymous',
      now() + interval '1 minute'
    )
  $$,
  '42501',
  null,
  'anonymous callers cannot write ingestion operator state'
);

select * from finish();

rollback;
