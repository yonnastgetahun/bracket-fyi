begin;

select plan(6);

select has_table(
  'public',
  'provider_bindings',
  'event editions can be configured through provider bindings'
);

select has_table(
  'public',
  'ingestion_runs',
  'every scheduler or operator claim can be recorded as an ingestion run'
);

select lives_ok(
  $$
    insert into data_providers (id, adapter_key, display_name)
    values (
      '91000000-0000-4000-8000-000000000001',
      'fixture-provider',
      'Fixture Provider'
    );

    insert into organizations (id, organization_key, name, kind)
    values (
      '91000000-0000-4000-8000-000000000002',
      'fixture-org',
      'Fixture Organization',
      'governing_body'
    );

    insert into competitions (
      id,
      organization_id,
      competition_key,
      name,
      domain,
      sport_code
    ) values (
      '91000000-0000-4000-8000-000000000003',
      '91000000-0000-4000-8000-000000000002',
      'fixture-cup',
      'Fixture Cup',
      'sport',
      'soccer'
    );

    insert into event_editions (
      id,
      competition_id,
      edition_key,
      name,
      season_label
    ) values (
      '91000000-0000-4000-8000-000000000004',
      '91000000-0000-4000-8000-000000000003',
      '2026',
      'Fixture Cup 2026',
      '2026'
    );

    insert into provider_bindings (
      id,
      provider_id,
      event_edition_id,
      binding_key,
      role,
      mode,
      health_status,
      credential_ref,
      poll_policy
    ) values (
      '91000000-0000-4000-8000-000000000005',
      '91000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000004',
      'fixture-cup-primary',
      'primary',
      'shadow',
      'healthy',
      'vault:fixture-provider-readonly',
      '{"idle_seconds":21600,"live_seconds":300}'::jsonb
    );

    insert into ingestion_runs (
      id,
      binding_id,
      provider_id,
      event_edition_id,
      claim_key,
      trigger_kind,
      claimed_by,
      lease_expires_at
    ) values (
      '91000000-0000-4000-8000-000000000006',
      '91000000-0000-4000-8000-000000000005',
      '91000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000004',
      'fixture-cup:2026-10-06T17:00Z',
      'schedule',
      'local-test-worker',
      now() + interval '5 minutes'
    );
  $$,
  'a disabled-by-default binding can be explicitly placed in shadow mode and claimed'
);

select throws_ok(
  $$
    insert into ingestion_runs (
      binding_id,
      provider_id,
      event_edition_id,
      claim_key,
      trigger_kind,
      claimed_by,
      lease_expires_at
    ) values (
      '91000000-0000-4000-8000-000000000005',
      '91000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000004',
      'fixture-cup:2026-10-06T17:00Z',
      'retry',
      'duplicate-worker',
      now() + interval '5 minutes'
    )
  $$,
  '23505',
  null,
  'a run claim idempotency key cannot be replayed as a new run'
);

select throws_ok(
  $$
    insert into ingestion_runs (
      binding_id,
      provider_id,
      event_edition_id,
      claim_key,
      trigger_kind,
      claimed_by,
      lease_expires_at
    ) values (
      '91000000-0000-4000-8000-000000000005',
      '91000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000004',
      'fixture-cup:concurrent-claim',
      'manual',
      'concurrent-worker',
      now() + interval '5 minutes'
    )
  $$,
  '23505',
  null,
  'a binding cannot have two active ingestion runs'
);

select lives_ok(
  $$
    update ingestion_runs
    set
      status = 'succeeded',
      finished_at = now(),
      fetched_count = 4,
      normalized_count = 4,
      projected_count = 1,
      rate_limit_limit = 100,
      rate_limit_remaining = 99,
      rate_limit_reset_at = now() + interval '1 hour'
    where id = '91000000-0000-4000-8000-000000000006';

    insert into ingestion_runs (
      binding_id,
      provider_id,
      event_edition_id,
      claim_key,
      trigger_kind,
      claimed_by,
      lease_expires_at
    ) values (
      '91000000-0000-4000-8000-000000000005',
      '91000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000004',
      'fixture-cup:next-claim',
      'schedule',
      'next-worker',
      now() + interval '5 minutes'
    );
  $$,
  'a terminal run releases the binding for a later claim while preserving rate metadata'
);

select * from finish();

rollback;
