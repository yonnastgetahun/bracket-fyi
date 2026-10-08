begin;

select plan(8);

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

select is(
  (
    select count(*)
    from (
      values
        ('provider_bindings'),
        ('provider_entity_refs'),
        ('ingestion_runs'),
        ('provider_observations'),
        ('ingestion_quarantine'),
        ('contest_results'),
        ('result_audit_events'),
        ('notification_outbox'),
        ('notification_attempts'),
        ('league_completion_holds')
    ) as target(table_name)
    where has_table_privilege(
      'service_role',
      format('public.%I', table_name),
      'select'
    )
      and has_table_privilege(
        'service_role',
        format('public.%I', table_name),
        'insert'
      )
  ),
  10::bigint,
  'the server-side service role can read and insert every Slice 1B record type'
);

select is(
  (
    select count(*)
    from (
      values
        ('provider_bindings'),
        ('provider_entity_refs'),
        ('ingestion_runs'),
        ('ingestion_quarantine'),
        ('notification_outbox'),
        ('notification_attempts'),
        ('league_completion_holds')
    ) as target(table_name)
    where has_table_privilege(
      'service_role',
      format('public.%I', table_name),
      'update'
    )
  ),
  7::bigint,
  'the service role can update only mutable operational tables'
);

select is(
  (
    select count(*)
    from (
      values
        ('provider_observations'),
        ('contest_results'),
        ('result_audit_events')
    ) as target(table_name)
    where has_table_privilege(
      'service_role',
      format('public.%I', table_name),
      'update'
    )
  ),
  0::bigint,
  'the service role has no update grant on immutable evidence ledgers'
);

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
