begin;

select plan(22);

select has_table(
  'public',
  'result_audit_events',
  'result and lifecycle decisions have an append-only audit ledger'
);

select has_table(
  'public',
  'league_completion_holds',
  'organizers can explicitly delay automatic league completion'
);

select has_table(
  'public',
  'notification_outbox',
  'notification intent creation is durable and deduplicated'
);

select has_table(
  'public',
  'notification_attempts',
  'each endpoint delivery attempt has a durable outcome record'
);

select lives_ok(
  $$
    insert into organizations (id, organization_key, name, kind)
    values (
      '94000000-0000-4000-8000-000000000001',
      'audit-org',
      'Audit Organization',
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
      '94000000-0000-4000-8000-000000000002',
      '94000000-0000-4000-8000-000000000001',
      'audit-cup',
      'Audit Cup',
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
        '94000000-0000-4000-8000-000000000003',
        '94000000-0000-4000-8000-000000000002',
        '2026',
        'Audit Cup 2026',
        '2026'
      ),
      (
        '94000000-0000-4000-8000-000000000004',
        '94000000-0000-4000-8000-000000000002',
        '2027',
        'Audit Cup 2027',
        '2027'
      );

    insert into stages (
      id,
      event_edition_id,
      stage_key,
      name,
      kind,
      ordinal
    ) values (
      '94000000-0000-4000-8000-000000000005',
      '94000000-0000-4000-8000-000000000003',
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
      '94000000-0000-4000-8000-000000000006',
      '94000000-0000-4000-8000-000000000003',
      '94000000-0000-4000-8000-000000000005',
      'final',
      'Final',
      'match'
    );

    insert into templates (
      id,
      name,
      type,
      event_edition_id
    ) values (
      '94000000-0000-4000-8000-000000000007',
      'Audit Cup Template',
      'bracket',
      '94000000-0000-4000-8000-000000000003'
    );

    insert into leagues (id, name, template_id)
    values
      (
        '94000000-0000-4000-8000-000000000008',
        'Audit League',
        '94000000-0000-4000-8000-000000000007'
      ),
      (
        '94000000-0000-4000-8000-000000000009',
        'Other Audit League',
        '94000000-0000-4000-8000-000000000007'
      );

    insert into participants (id, league_id, display_name)
    values
      (
        '94000000-0000-4000-8000-000000000010',
        '94000000-0000-4000-8000-000000000008',
        'Target Participant'
      ),
      (
        '94000000-0000-4000-8000-000000000011',
        '94000000-0000-4000-8000-000000000009',
        'Other Participant'
      );
  $$,
  'event-linked leagues and participants can be prepared for audit and delivery tests'
);

select lives_ok(
  $$
    insert into result_audit_events (
      id,
      event_edition_id,
      contest_id,
      event_type,
      actor_type,
      actor_reference,
      idempotency_key,
      new_state
    ) values (
      '94000000-0000-4000-8000-000000000020',
      '94000000-0000-4000-8000-000000000003',
      '94000000-0000-4000-8000-000000000006',
      'league.completed',
      'system',
      'lifecycle-reconciler',
      'audit-league-complete',
      '{"status":"complete"}'::jsonb
    );

    insert into result_audit_events (
      id,
      event_edition_id,
      league_id,
      event_type,
      actor_type,
      organizer_fingerprint,
      idempotency_key,
      new_state
    ) values (
      '94000000-0000-4000-8000-000000000021',
      '94000000-0000-4000-8000-000000000003',
      '94000000-0000-4000-8000-000000000008',
      'completion_hold.created',
      'organizer',
      repeat('b', 64),
      'audit-hold-created',
      '{"status":"active"}'::jsonb
    );
  $$,
  'system and fingerprinted organizer actors can create audit events without storing tokens'
);

select throws_ok(
  $$
    insert into result_audit_events (
      event_edition_id,
      event_type,
      actor_type,
      actor_reference,
      idempotency_key
    ) values (
      '94000000-0000-4000-8000-000000000003',
      'league.completed',
      'system',
      'lifecycle-reconciler',
      'audit-league-complete'
    )
  $$,
  '23505',
  null,
  'an audit idempotency key cannot create a duplicate event'
);

select throws_ok(
  $$
    update result_audit_events
    set event_type = 'league.rewritten'
    where id = '94000000-0000-4000-8000-000000000020'
  $$,
  '55000',
  null,
  'audit history cannot be edited'
);

select lives_ok(
  $$
    insert into league_completion_holds (
      id,
      league_id,
      event_edition_id,
      hold_key,
      reason,
      created_by_fingerprint,
      idempotency_key
    ) values (
      '94000000-0000-4000-8000-000000000022',
      '94000000-0000-4000-8000-000000000008',
      '94000000-0000-4000-8000-000000000003',
      'organizer-review',
      'Wait for organizer review',
      repeat('b', 64),
      'hold-organizer-review-v1'
    );
  $$,
  'an organizer can place an active hold on a league in the same event edition'
);

select throws_ok(
  $$
    insert into league_completion_holds (
      league_id,
      event_edition_id,
      hold_key,
      reason,
      created_by_fingerprint,
      idempotency_key
    ) values (
      '94000000-0000-4000-8000-000000000008',
      '94000000-0000-4000-8000-000000000003',
      'organizer-review',
      'Duplicate active hold',
      repeat('b', 64),
      'hold-organizer-review-duplicate'
    )
  $$,
  '23505',
  null,
  'the same hold key cannot be active twice for one league'
);

select lives_ok(
  $$
    update league_completion_holds
    set
      status = 'released',
      ended_at = now(),
      ended_by_actor_type = 'organizer',
      ended_by_fingerprint = repeat('b', 64),
      end_reason = 'Review completed'
    where id = '94000000-0000-4000-8000-000000000022';

    insert into league_completion_holds (
      league_id,
      event_edition_id,
      hold_key,
      reason,
      created_by_fingerprint,
      idempotency_key
    ) values (
      '94000000-0000-4000-8000-000000000008',
      '94000000-0000-4000-8000-000000000003',
      'organizer-review',
      'A later independent review',
      repeat('b', 64),
      'hold-organizer-review-v2'
    );
  $$,
  'releasing a hold preserves it and permits a later independent hold'
);

select throws_ok(
  $$
    insert into league_completion_holds (
      league_id,
      event_edition_id,
      hold_key,
      reason,
      created_by_fingerprint,
      idempotency_key
    ) values (
      '94000000-0000-4000-8000-000000000008',
      '94000000-0000-4000-8000-000000000004',
      'wrong-edition',
      'Invalid edition',
      repeat('b', 64),
      'hold-wrong-edition'
    )
  $$,
  '23514',
  null,
  'a completion hold cannot target an edition different from the league template'
);

select lives_ok(
  $$
    insert into result_audit_events (
      id,
      event_edition_id,
      event_type,
      actor_type,
      actor_reference,
      idempotency_key
    ) values (
      '94000000-0000-4000-8000-000000000023',
      '94000000-0000-4000-8000-000000000004',
      'provider.stale',
      'system',
      'freshness-monitor',
      'audit-other-edition'
    );

    insert into notification_outbox (
      id,
      event_edition_id,
      league_id,
      contest_id,
      audit_event_id,
      intent_type,
      audience_kind,
      payload,
      destination_path,
      idempotency_key,
      expires_at
    ) values (
      '94000000-0000-4000-8000-000000000024',
      '94000000-0000-4000-8000-000000000003',
      '94000000-0000-4000-8000-000000000008',
      '94000000-0000-4000-8000-000000000006',
      '94000000-0000-4000-8000-000000000020',
      'league_complete',
      'league',
      '{"body":"Results are final","title":"League complete"}'::jsonb,
      '/l/public-league-route',
      'notify-league-complete-v1',
      now() + interval '1 day'
    );
  $$,
  'an audited event can create one durable league notification intent'
);

select throws_ok(
  $$
    insert into notification_outbox (
      event_edition_id,
      league_id,
      audit_event_id,
      intent_type,
      audience_kind,
      payload,
      idempotency_key
    ) values (
      '94000000-0000-4000-8000-000000000003',
      '94000000-0000-4000-8000-000000000008',
      '94000000-0000-4000-8000-000000000020',
      'league_complete',
      'league',
      '{"title":"Duplicate"}'::jsonb,
      'notify-league-complete-v1'
    )
  $$,
  '23505',
  null,
  'a notification intent idempotency key cannot enqueue twice'
);

select throws_ok(
  $$
    insert into notification_outbox (
      event_edition_id,
      league_id,
      audit_event_id,
      intent_type,
      audience_kind,
      payload,
      idempotency_key
    ) values (
      '94000000-0000-4000-8000-000000000004',
      '94000000-0000-4000-8000-000000000008',
      '94000000-0000-4000-8000-000000000023',
      'provider_stale',
      'league',
      '{"title":"Wrong edition"}'::jsonb,
      'notify-wrong-edition'
    )
  $$,
  '23514',
  null,
  'an outbox intent cannot cross the target league event edition'
);

select lives_ok(
  $$
    insert into notification_attempts (
      id,
      outbox_id,
      participant_id,
      endpoint_fingerprint,
      attempt_number,
      idempotency_key
    ) values (
      '94000000-0000-4000-8000-000000000025',
      '94000000-0000-4000-8000-000000000024',
      '94000000-0000-4000-8000-000000000010',
      repeat('c', 64),
      1,
      'delivery-complete-target-attempt-1'
    );

    update notification_attempts
    set
      status = 'transient_failure',
      finished_at = now(),
      retry_at = now() + interval '5 minutes',
      http_status = 503,
      error_class = 'push_service_unavailable'
    where id = '94000000-0000-4000-8000-000000000025';

    insert into notification_attempts (
      outbox_id,
      participant_id,
      endpoint_fingerprint,
      attempt_number,
      idempotency_key
    ) values (
      '94000000-0000-4000-8000-000000000024',
      '94000000-0000-4000-8000-000000000010',
      repeat('c', 64),
      2,
      'delivery-complete-target-attempt-2'
    );
  $$,
  'a transient delivery failure remains recorded and can schedule a later attempt'
);

select throws_ok(
  $$
    insert into notification_attempts (
      outbox_id,
      participant_id,
      endpoint_fingerprint,
      attempt_number,
      idempotency_key
    ) values (
      '94000000-0000-4000-8000-000000000024',
      '94000000-0000-4000-8000-000000000010',
      repeat('d', 64),
      3,
      'delivery-complete-target-attempt-2'
    )
  $$,
  '23505',
  null,
  'a delivery attempt idempotency key cannot be replayed'
);

select throws_ok(
  $$
    insert into notification_attempts (
      outbox_id,
      participant_id,
      endpoint_fingerprint,
      attempt_number,
      idempotency_key
    ) values (
      '94000000-0000-4000-8000-000000000024',
      '94000000-0000-4000-8000-000000000011',
      repeat('d', 64),
      1,
      'delivery-wrong-league'
    )
  $$,
  '23514',
  null,
  'an endpoint attempt cannot target a participant from another league'
);

select lives_ok(
  $$
    update notification_attempts
    set
      status = 'sent',
      finished_at = now(),
      http_status = 201,
      push_service_message_id = 'synthetic-message-id'
    where outbox_id = '94000000-0000-4000-8000-000000000024'
      and endpoint_fingerprint = repeat('c', 64)
      and attempt_number = 2;

    update notification_outbox
    set
      status = 'sent',
      processed_at = now(),
      attempt_count = 2
    where id = '94000000-0000-4000-8000-000000000024';
  $$,
  'a successful retry can terminally complete the durable intent'
);

select is(
  (
    select count(*)
    from notification_attempts
    where outbox_id = '94000000-0000-4000-8000-000000000024'
  ),
  2::bigint,
  'both failed and successful endpoint attempts remain visible'
);

select is(
  (
    select count(*)
    from league_completion_holds
    where league_id = '94000000-0000-4000-8000-000000000008'
      and hold_key = 'organizer-review'
  ),
  2::bigint,
  'released and active completion holds both remain auditable'
);

select is(
  (
    select count(*)
    from result_audit_events
    where event_edition_id = '94000000-0000-4000-8000-000000000003'
  ),
  2::bigint,
  'the event audit ledger retains both system and organizer decisions'
);

select * from finish();

rollback;
