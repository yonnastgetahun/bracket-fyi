begin;

select plan(4);

select lives_ok(
  $$
    insert into organizations (id, organization_key, name, kind)
    values (
      '11000000-0000-4000-8000-000000000001',
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
      '21000000-0000-4000-8000-000000000001',
      '11000000-0000-4000-8000-000000000001',
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
      timezone
    ) values (
      '31000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      '2026-27',
      'UEFA Champions League 2026/27',
      '2026/27',
      'Europe/Zurich'
    );

    insert into competitors (
      id,
      organization_id,
      competitor_key,
      kind,
      canonical_name
    ) values
      (
        '41000000-0000-4000-8000-000000000001',
        null,
        'real-madrid',
        'team',
        'Real Madrid CF'
      ),
      (
        '41000000-0000-4000-8000-000000000002',
        null,
        'real-sociedad',
        'team',
        'Real Sociedad'
      );

    insert into event_entries (
      event_edition_id,
      competitor_id,
      seed,
      region,
      role
    ) values (
      '31000000-0000-4000-8000-000000000001',
      '41000000-0000-4000-8000-000000000001',
      1,
      'league-phase',
      'team'
    );
  $$,
  'canonical competitors can enter an event edition'
);

select throws_ok(
  $$
    insert into event_entries (event_edition_id, competitor_id, role)
    values (
      '31000000-0000-4000-8000-000000000001',
      '41000000-0000-4000-8000-000000000001',
      'team'
    )
  $$,
  '23505',
  null,
  'a competitor can enter an edition only once'
);

select lives_ok(
  $$
    insert into competitor_aliases (
      competitor_id,
      organization_id,
      domain,
      alias,
      normalized_alias,
      locale,
      source,
      reviewed
    ) values (
      '41000000-0000-4000-8000-000000000001',
      '11000000-0000-4000-8000-000000000001',
      'soccer',
      'Real Madrid',
      'real madrid',
      'en',
      'manual',
      true
    )
  $$,
  'a reviewed alias can map to a canonical competitor'
);

select throws_ok(
  $$
    insert into competitor_aliases (
      competitor_id,
      organization_id,
      domain,
      alias,
      normalized_alias,
      locale,
      source
    ) values (
      '41000000-0000-4000-8000-000000000002',
      '11000000-0000-4000-8000-000000000001',
      'soccer',
      'Real Madrid',
      'real madrid',
      'en',
      'provider'
    )
  $$,
  '23505',
  null,
  'one normalized alias cannot map to two competitors in the same context'
);

select * from finish();

rollback;
