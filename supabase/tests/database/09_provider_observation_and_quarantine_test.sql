begin;

select plan(14);

select has_table(
  'public',
  'provider_entity_refs',
  'provider identifiers can be resolved to canonical entities'
);

select has_table(
  'public',
  'provider_observations',
  'sanitized provider payloads have an immutable evidence ledger'
);

select has_table(
  'public',
  'ingestion_quarantine',
  'unresolved or unsafe observations can be quarantined without projection'
);

select lives_ok(
  $$
    insert into data_providers (id, adapter_key, display_name)
    values (
      '92000000-0000-4000-8000-000000000001',
      'observation-fixture',
      'Observation Fixture'
    );

    insert into organizations (id, organization_key, name, kind)
    values (
      '92000000-0000-4000-8000-000000000002',
      'observation-org',
      'Observation Organization',
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
      '92000000-0000-4000-8000-000000000003',
      '92000000-0000-4000-8000-000000000002',
      'observation-cup',
      'Observation Cup',
      'sport',
      'soccer'
    );

    insert into event_editions (
      id,
      competition_id,
      edition_key,
      name,
      season_label
    ) values
      (
        '92000000-0000-4000-8000-000000000004',
        '92000000-0000-4000-8000-000000000003',
        '2026',
        'Observation Cup 2026',
        '2026'
      ),
      (
        '92000000-0000-4000-8000-000000000005',
        '92000000-0000-4000-8000-000000000003',
        '2027',
        'Observation Cup 2027',
        '2027'
      );

    insert into stages (
      id,
      event_edition_id,
      stage_key,
      name,
      kind,
      ordinal
    ) values
      (
        '92000000-0000-4000-8000-000000000008',
        '92000000-0000-4000-8000-000000000004',
        'finals',
        'Finals',
        'knockout',
        1
      ),
      (
        '92000000-0000-4000-8000-000000000009',
        '92000000-0000-4000-8000-000000000005',
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
    ) values
      (
        '92000000-0000-4000-8000-000000000010',
        '92000000-0000-4000-8000-000000000004',
        '92000000-0000-4000-8000-000000000008',
        'final',
        'Final',
        'match'
      ),
      (
        '92000000-0000-4000-8000-000000000011',
        '92000000-0000-4000-8000-000000000005',
        '92000000-0000-4000-8000-000000000009',
        'final',
        'Final',
        'match'
      );

    insert into provider_bindings (
      id,
      provider_id,
      event_edition_id,
      binding_key,
      mode,
      health_status
    ) values (
      '92000000-0000-4000-8000-000000000006',
      '92000000-0000-4000-8000-000000000001',
      '92000000-0000-4000-8000-000000000004',
      'observation-primary',
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
      '92000000-0000-4000-8000-000000000007',
      '92000000-0000-4000-8000-000000000006',
      '92000000-0000-4000-8000-000000000001',
      '92000000-0000-4000-8000-000000000004',
      'observation-run-1',
      'schedule',
      'observation-test-worker',
      now() + interval '5 minutes'
    );

    insert into provider_entity_refs (
      binding_id,
      provider_id,
      event_edition_id,
      entity_kind,
      external_id,
      canonical_id,
      resolution_status,
      reviewed_by,
      reviewed_at
    ) values (
      '92000000-0000-4000-8000-000000000006',
      '92000000-0000-4000-8000-000000000001',
      '92000000-0000-4000-8000-000000000004',
      'contest',
      'ext-match-1',
      '92000000-0000-4000-8000-000000000010',
      'reviewed',
      'local-test-operator',
      now()
    );
  $$,
  'a reviewed provider contest ID can map to a canonical contest in the binding edition'
);

select throws_ok(
  $$
    insert into provider_entity_refs (
      binding_id,
      provider_id,
      event_edition_id,
      entity_kind,
      external_id,
      canonical_id,
      resolution_status
    ) values (
      '92000000-0000-4000-8000-000000000006',
      '92000000-0000-4000-8000-000000000001',
      '92000000-0000-4000-8000-000000000004',
      'contest',
      'wrong-edition-match',
      '92000000-0000-4000-8000-000000000011',
      'automatic'
    )
  $$,
  '23514',
  null,
  'provider mappings cannot point to a contest from another event edition'
);

select lives_ok(
  $$
    insert into provider_observations (
      id,
      ingestion_run_id,
      binding_id,
      provider_id,
      event_edition_id,
      external_object_kind,
      external_object_id,
      provider_updated_at,
      sanitized_payload
    ) values (
      '92000000-0000-4000-8000-000000000020',
      '92000000-0000-4000-8000-000000000007',
      '92000000-0000-4000-8000-000000000006',
      '92000000-0000-4000-8000-000000000001',
      '92000000-0000-4000-8000-000000000004',
      'contest',
      'ext-match-1',
      '2026-10-06T17:00:00Z',
      '{"id":"ext-match-1","status":"FINISHED"}'::jsonb
    );
  $$,
  'a sanitized provider object can be recorded without a provider revision'
);

select is(
  (
    select payload_hash
    from provider_observations
    where id = '92000000-0000-4000-8000-000000000020'
  ),
  encode(
    digest(
      '{"id":"ext-match-1","status":"FINISHED"}'::jsonb::text,
      'sha256'
    ),
    'hex'
  ),
  'the database derives a deterministic SHA-256 hash from sanitized JSONB'
);

select throws_ok(
  $$
    insert into provider_observations (
      ingestion_run_id,
      binding_id,
      provider_id,
      event_edition_id,
      external_object_kind,
      external_object_id,
      sanitized_payload
    ) values (
      '92000000-0000-4000-8000-000000000007',
      '92000000-0000-4000-8000-000000000006',
      '92000000-0000-4000-8000-000000000001',
      '92000000-0000-4000-8000-000000000004',
      'contest',
      'ext-match-1',
      '{"status":"FINISHED","id":"ext-match-1"}'::jsonb
    )
  $$,
  '23505',
  null,
  'the same revisionless semantic payload is deduplicated despite JSON key order'
);

select lives_ok(
  $$
    insert into provider_observations (
      ingestion_run_id,
      binding_id,
      provider_id,
      event_edition_id,
      external_object_kind,
      external_object_id,
      sanitized_payload
    ) values (
      '92000000-0000-4000-8000-000000000007',
      '92000000-0000-4000-8000-000000000006',
      '92000000-0000-4000-8000-000000000001',
      '92000000-0000-4000-8000-000000000004',
      'contest',
      'ext-match-1',
      '{"id":"ext-match-1","status":"IN_PLAY"}'::jsonb
    );
  $$,
  'a changed revisionless payload is retained as new evidence'
);

select lives_ok(
  $$
    insert into provider_observations (
      ingestion_run_id,
      binding_id,
      provider_id,
      event_edition_id,
      external_object_kind,
      external_object_id,
      provider_revision,
      sanitized_payload
    ) values (
      '92000000-0000-4000-8000-000000000007',
      '92000000-0000-4000-8000-000000000006',
      '92000000-0000-4000-8000-000000000001',
      '92000000-0000-4000-8000-000000000004',
      'contest',
      'ext-match-2',
      'revision-7',
      '{"id":"ext-match-2","status":"FINISHED"}'::jsonb
    );
  $$,
  'a provider revision is retained as the preferred observation identity'
);

select throws_ok(
  $$
    insert into provider_observations (
      ingestion_run_id,
      binding_id,
      provider_id,
      event_edition_id,
      external_object_kind,
      external_object_id,
      provider_revision,
      sanitized_payload
    ) values (
      '92000000-0000-4000-8000-000000000007',
      '92000000-0000-4000-8000-000000000006',
      '92000000-0000-4000-8000-000000000001',
      '92000000-0000-4000-8000-000000000004',
      'contest',
      'ext-match-2',
      'revision-7',
      '{"id":"ext-match-2","status":"CHANGED"}'::jsonb
    )
  $$,
  '23505',
  null,
  'a provider revision cannot be reused with a different payload'
);

select throws_ok(
  $$
    update provider_observations
    set sanitized_payload = '{"tampered":true}'::jsonb
    where id = '92000000-0000-4000-8000-000000000020'
  $$,
  '55000',
  null,
  'accepted provider evidence cannot be edited'
);

select lives_ok(
  $$
    insert into ingestion_quarantine (
      observation_id,
      ingestion_run_id,
      binding_id,
      issue_code,
      severity,
      external_entity_kind,
      external_entity_id,
      details
    ) values (
      '92000000-0000-4000-8000-000000000020',
      '92000000-0000-4000-8000-000000000007',
      '92000000-0000-4000-8000-000000000006',
      'mapping_missing',
      'blocking',
      'competitor',
      'unknown-team-42',
      '{"reason":"no exact reviewed mapping"}'::jsonb
    );

    update ingestion_quarantine
    set
      status = 'resolved',
      resolved_at = now(),
      resolved_by = 'local-test-operator',
      resolution_action = 'mapped',
      resolution_note = 'Reviewed synthetic fixture mapping'
    where observation_id = '92000000-0000-4000-8000-000000000020'
      and issue_code = 'mapping_missing';
  $$,
  'a quarantined observation supports an explicit operator disposition'
);

select throws_ok(
  $$
    insert into ingestion_quarantine (
      observation_id,
      ingestion_run_id,
      binding_id,
      issue_code,
      severity
    ) values (
      '92000000-0000-4000-8000-000000000020',
      '92000000-0000-4000-8000-000000000007',
      '92000000-0000-4000-8000-000000000006',
      'mapping_missing',
      'blocking'
    )
  $$,
  '23505',
  null,
  'one observation cannot open the same quarantine issue twice'
);

select * from finish();

rollback;
