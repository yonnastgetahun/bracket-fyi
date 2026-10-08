begin;

select plan(11);

select has_table(
  'public',
  'contest_results',
  'canonical contest outcomes have an append-only version ledger'
);

select lives_ok(
  $$
    insert into data_providers (id, adapter_key, display_name)
    values (
      '93000000-0000-4000-8000-000000000001',
      'result-fixture',
      'Result Fixture'
    );

    insert into organizations (id, organization_key, name, kind)
    values (
      '93000000-0000-4000-8000-000000000002',
      'result-org',
      'Result Organization',
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
      '93000000-0000-4000-8000-000000000003',
      '93000000-0000-4000-8000-000000000002',
      'result-cup',
      'Result Cup',
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
      '93000000-0000-4000-8000-000000000004',
      '93000000-0000-4000-8000-000000000003',
      '2026',
      'Result Cup 2026',
      '2026'
    );

    insert into stages (
      id,
      event_edition_id,
      stage_key,
      name,
      kind,
      ordinal
    ) values (
      '93000000-0000-4000-8000-000000000005',
      '93000000-0000-4000-8000-000000000004',
      'finals',
      'Finals',
      'knockout',
      1
    );

    insert into contests (
      id,
      event_edition_id,
      stage_id,
      contest_key,
      name,
      kind
    ) values (
      '93000000-0000-4000-8000-000000000006',
      '93000000-0000-4000-8000-000000000004',
      '93000000-0000-4000-8000-000000000005',
      'final',
      'Final',
      'match'
    );

    insert into competitors (id, competitor_key, kind, canonical_name)
    values
      (
        '93000000-0000-4000-8000-000000000007',
        'result-team-a',
        'team',
        'Result Team A'
      ),
      (
        '93000000-0000-4000-8000-000000000008',
        'result-team-b',
        'team',
        'Result Team B'
      ),
      (
        '93000000-0000-4000-8000-000000000009',
        'result-team-c',
        'team',
        'Result Team C'
      );

    insert into event_entries (
      id,
      event_edition_id,
      competitor_id,
      role
    ) values
      (
        '93000000-0000-4000-8000-000000000010',
        '93000000-0000-4000-8000-000000000004',
        '93000000-0000-4000-8000-000000000007',
        'team'
      ),
      (
        '93000000-0000-4000-8000-000000000011',
        '93000000-0000-4000-8000-000000000004',
        '93000000-0000-4000-8000-000000000008',
        'team'
      ),
      (
        '93000000-0000-4000-8000-000000000012',
        '93000000-0000-4000-8000-000000000004',
        '93000000-0000-4000-8000-000000000009',
        'team'
      );

    insert into contest_entries (
      event_edition_id,
      contest_id,
      event_entry_id,
      role,
      side,
      ordinal
    ) values
      (
        '93000000-0000-4000-8000-000000000004',
        '93000000-0000-4000-8000-000000000006',
        '93000000-0000-4000-8000-000000000010',
        'competitor',
        'home',
        1
      ),
      (
        '93000000-0000-4000-8000-000000000004',
        '93000000-0000-4000-8000-000000000006',
        '93000000-0000-4000-8000-000000000011',
        'competitor',
        'away',
        2
      );

    insert into provider_bindings (
      id,
      provider_id,
      event_edition_id,
      binding_key,
      mode,
      health_status
    ) values (
      '93000000-0000-4000-8000-000000000013',
      '93000000-0000-4000-8000-000000000001',
      '93000000-0000-4000-8000-000000000004',
      'result-primary',
      'shadow',
      'healthy'
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
      '93000000-0000-4000-8000-000000000014',
      '93000000-0000-4000-8000-000000000013',
      '93000000-0000-4000-8000-000000000001',
      '93000000-0000-4000-8000-000000000004',
      'result-run-1',
      'schedule',
      'result-test-worker',
      now() + interval '5 minutes'
    );

    insert into provider_observations (
      id,
      ingestion_run_id,
      binding_id,
      provider_id,
      event_edition_id,
      external_object_kind,
      external_object_id,
      provider_revision,
      sanitized_payload
    ) values (
      '93000000-0000-4000-8000-000000000015',
      '93000000-0000-4000-8000-000000000014',
      '93000000-0000-4000-8000-000000000013',
      '93000000-0000-4000-8000-000000000001',
      '93000000-0000-4000-8000-000000000004',
      'contest',
      'provider-final-1',
      'revision-1',
      '{"away":1,"home":2,"status":"FINISHED","winner":"HOME"}'::jsonb
    );
  $$,
  'a canonical contest, participants, and source observation can be prepared'
);

select lives_ok(
  $$
    insert into contest_results (
      id,
      contest_id,
      event_edition_id,
      version,
      result_status,
      outcome_type,
      winner_event_entry_id,
      score,
      source_type,
      source_observation_id,
      idempotency_key
    ) values (
      '93000000-0000-4000-8000-000000000020',
      '93000000-0000-4000-8000-000000000006',
      '93000000-0000-4000-8000-000000000004',
      1,
      'final',
      'winner',
      '93000000-0000-4000-8000-000000000010',
      '{"away":1,"home":2}'::jsonb,
      'provider',
      '93000000-0000-4000-8000-000000000015',
      'result-final-v1'
    );
  $$,
  'a provider observation can produce the first canonical result version'
);

select throws_ok(
  $$
    insert into contest_results (
      contest_id,
      event_edition_id,
      version,
      result_status,
      outcome_type,
      winner_event_entry_id,
      source_type,
      source_observation_id,
      supersedes_result_id,
      idempotency_key
    ) values (
      '93000000-0000-4000-8000-000000000006',
      '93000000-0000-4000-8000-000000000004',
      2,
      'final',
      'winner',
      '93000000-0000-4000-8000-000000000010',
      'provider',
      '93000000-0000-4000-8000-000000000015',
      '93000000-0000-4000-8000-000000000020',
      'result-final-v1'
    )
  $$,
  '23505',
  null,
  'a result idempotency key cannot create a second version'
);

select throws_ok(
  $$
    insert into contest_results (
      contest_id,
      event_edition_id,
      version,
      result_status,
      outcome_type,
      winner_event_entry_id,
      source_type,
      source_observation_id,
      supersedes_result_id,
      idempotency_key
    ) values (
      '93000000-0000-4000-8000-000000000006',
      '93000000-0000-4000-8000-000000000004',
      2,
      'final',
      'winner',
      '93000000-0000-4000-8000-000000000012',
      'provider',
      '93000000-0000-4000-8000-000000000015',
      '93000000-0000-4000-8000-000000000020',
      'result-invalid-winner'
    )
  $$,
  '23503',
  null,
  'a winner must be an entry in the target contest'
);

select throws_ok(
  $$
    insert into contest_results (
      contest_id,
      event_edition_id,
      version,
      result_status,
      outcome_type,
      source_type,
      idempotency_key
    ) values (
      '93000000-0000-4000-8000-000000000006',
      '93000000-0000-4000-8000-000000000004',
      2,
      'unresolved',
      'pending',
      'operator',
      'result-missing-supersedes'
    )
  $$,
  '23514',
  null,
  'a correction must identify the immediately prior result version'
);

select throws_ok(
  $$
    insert into contest_results (
      contest_id,
      event_edition_id,
      version,
      result_status,
      outcome_type,
      source_type,
      supersedes_result_id,
      idempotency_key
    ) values (
      '93000000-0000-4000-8000-000000000006',
      '93000000-0000-4000-8000-000000000004',
      3,
      'unresolved',
      'pending',
      'operator',
      '93000000-0000-4000-8000-000000000020',
      'result-skipped-version'
    )
  $$,
  '23514',
  null,
  'a contest result version cannot skip a number'
);

select lives_ok(
  $$
    insert into contest_results (
      id,
      contest_id,
      event_edition_id,
      version,
      result_status,
      outcome_type,
      source_type,
      source_observation_id,
      supersedes_result_id,
      correction_reason,
      idempotency_key
    ) values (
      '93000000-0000-4000-8000-000000000021',
      '93000000-0000-4000-8000-000000000006',
      '93000000-0000-4000-8000-000000000004',
      2,
      'unresolved',
      'pending',
      'operator',
      '93000000-0000-4000-8000-000000000015',
      '93000000-0000-4000-8000-000000000020',
      'Provider correction requires review',
      'result-correction-v2'
    );
  $$,
  'a correction creates a new version and can reopen a previously final outcome'
);

select throws_ok(
  $$
    update contest_results
    set result_status = 'final'
    where id = '93000000-0000-4000-8000-000000000021'
  $$,
  '55000',
  null,
  'canonical result history cannot be edited'
);

select throws_ok(
  $$
    delete from contest_results
    where id = '93000000-0000-4000-8000-000000000020'
  $$,
  '55000',
  null,
  'canonical result history cannot be erased'
);

select is(
  (
    select count(*)
    from contest_results
    where contest_id = '93000000-0000-4000-8000-000000000006'
  ),
  2::bigint,
  'both the original result and its correction remain available'
);

select * from finish();

rollback;
