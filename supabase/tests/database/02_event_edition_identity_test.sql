begin;

select plan(4);

select lives_ok(
  $$
    insert into organizations (id, organization_key, name, kind)
    values (
      '10000000-0000-4000-8000-000000000001',
      'uefa',
      'Union of European Football Associations',
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
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'uefa-champions-league',
      'UEFA Champions League',
      'sport',
      'soccer'
    );

    insert into event_editions (
      id,
      competition_id,
      edition_key,
      name,
      season_label,
      timezone,
      starts_at,
      ends_at
    ) values (
      '30000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '2026-27',
      'UEFA Champions League 2026/27',
      '2026/27',
      'Europe/Zurich',
      '2026-07-01 00:00:00+00',
      '2027-06-30 23:59:59+00'
    );
  $$,
  'a canonical competition and its first edition can be registered'
);

select lives_ok(
  $$
    insert into event_editions (
      competition_id,
      edition_key,
      name,
      season_label,
      timezone
    ) values (
      '20000000-0000-4000-8000-000000000001',
      '2027-28',
      'UEFA Champions League 2027/28',
      '2027/28',
      'Europe/Zurich'
    )
  $$,
  'one competition can have multiple editions'
);

select throws_ok(
  $$
    insert into event_editions (
      competition_id,
      edition_key,
      name,
      season_label,
      timezone
    ) values (
      '20000000-0000-4000-8000-000000000001',
      '2026-27',
      'Duplicate edition',
      'duplicate',
      'UTC'
    )
  $$,
  '23505',
  null,
  'an edition key is unique within its competition'
);

select throws_ok(
  $$
    insert into event_editions (
      competition_id,
      edition_key,
      name,
      season_label,
      timezone,
      starts_at,
      ends_at
    ) values (
      '20000000-0000-4000-8000-000000000001',
      'invalid-dates',
      'Invalid edition dates',
      'invalid',
      'UTC',
      '2027-06-30 00:00:00+00',
      '2026-07-01 00:00:00+00'
    )
  $$,
  '23514',
  null,
  'an edition cannot end before it starts'
);

select * from finish();

rollback;
