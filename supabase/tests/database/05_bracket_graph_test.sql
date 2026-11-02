begin;

select plan(5);

select lives_ok(
  $$
    insert into organizations (id, organization_key, name, kind)
    values (
      '13000000-0000-4000-8000-000000000001',
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
      '23000000-0000-4000-8000-000000000001',
      '13000000-0000-4000-8000-000000000001',
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
    ) values
      (
        '33000000-0000-4000-8000-000000000001',
        '23000000-0000-4000-8000-000000000001',
        '2026-27',
        'UEFA Champions League 2026/27',
        '2026/27',
        'Europe/Zurich'
      ),
      (
        '33000000-0000-4000-8000-000000000002',
        '23000000-0000-4000-8000-000000000001',
        '2027-28',
        'UEFA Champions League 2027/28',
        '2027/28',
        'Europe/Zurich'
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
        '53000000-0000-4000-8000-000000000001',
        '33000000-0000-4000-8000-000000000001',
        'knockout',
        'Knockout stage',
        'knockout',
        1
      ),
      (
        '53000000-0000-4000-8000-000000000002',
        '33000000-0000-4000-8000-000000000002',
        'knockout',
        'Knockout stage',
        'knockout',
        1
      );

    insert into rounds (
      id,
      event_edition_id,
      stage_id,
      round_key,
      name,
      ordinal
    ) values
      (
        '63000000-0000-4000-8000-000000000001',
        '33000000-0000-4000-8000-000000000001',
        '53000000-0000-4000-8000-000000000001',
        'semifinal',
        'Semifinal',
        1
      ),
      (
        '63000000-0000-4000-8000-000000000002',
        '33000000-0000-4000-8000-000000000002',
        '53000000-0000-4000-8000-000000000002',
        'semifinal',
        'Semifinal',
        1
      );

    insert into competitors (id, competitor_key, kind, canonical_name)
    values
      (
        '43000000-0000-4000-8000-000000000001',
        'real-madrid',
        'team',
        'Real Madrid CF'
      ),
      (
        '43000000-0000-4000-8000-000000000002',
        'arsenal',
        'team',
        'Arsenal FC'
      );

    insert into event_entries (id, event_edition_id, competitor_id, role)
    values
      (
        '44000000-0000-4000-8000-000000000001',
        '33000000-0000-4000-8000-000000000001',
        '43000000-0000-4000-8000-000000000001',
        'team'
      ),
      (
        '44000000-0000-4000-8000-000000000002',
        '33000000-0000-4000-8000-000000000002',
        '43000000-0000-4000-8000-000000000002',
        'team'
      );

    insert into contests (
      id,
      event_edition_id,
      stage_id,
      round_id,
      contest_key,
      name,
      kind
    ) values
      (
        '73000000-0000-4000-8000-000000000001',
        '33000000-0000-4000-8000-000000000001',
        '53000000-0000-4000-8000-000000000001',
        '63000000-0000-4000-8000-000000000001',
        'semifinal-1',
        'Semifinal 1',
        'tie'
      ),
      (
        '73000000-0000-4000-8000-000000000002',
        '33000000-0000-4000-8000-000000000001',
        '53000000-0000-4000-8000-000000000001',
        '63000000-0000-4000-8000-000000000001',
        'final',
        'Final',
        'match'
      ),
      (
        '73000000-0000-4000-8000-000000000003',
        '33000000-0000-4000-8000-000000000002',
        '53000000-0000-4000-8000-000000000002',
        '63000000-0000-4000-8000-000000000002',
        'semifinal-1',
        'Semifinal 1',
        'tie'
      );

    insert into contest_entries (
      event_edition_id,
      contest_id,
      event_entry_id,
      role,
      ordinal
    ) values (
      '33000000-0000-4000-8000-000000000001',
      '73000000-0000-4000-8000-000000000001',
      '44000000-0000-4000-8000-000000000001',
      'home',
      1
    );
  $$,
  'a contest can reference an entry from the same edition'
);

select throws_ok(
  $$
    insert into contest_entries (
      event_edition_id,
      contest_id,
      event_entry_id,
      role,
      ordinal
    ) values (
      '33000000-0000-4000-8000-000000000001',
      '73000000-0000-4000-8000-000000000001',
      '44000000-0000-4000-8000-000000000002',
      'away',
      2
    )
  $$,
  '23503',
  null,
  'a contest cannot reference an entry from another edition'
);

select lives_ok(
  $$
    insert into brackets (
      id,
      event_edition_id,
      stage_id,
      bracket_key,
      name,
      kind
    ) values (
      '83000000-0000-4000-8000-000000000001',
      '33000000-0000-4000-8000-000000000001',
      '53000000-0000-4000-8000-000000000001',
      'champions-path',
      'Champions path',
      'knockout'
    );

    insert into bracket_edges (
      bracket_id,
      event_edition_id,
      from_contest_id,
      to_contest_id,
      outcome,
      target_role
    ) values (
      '83000000-0000-4000-8000-000000000001',
      '33000000-0000-4000-8000-000000000001',
      '73000000-0000-4000-8000-000000000001',
      '73000000-0000-4000-8000-000000000002',
      'winner',
      'finalist'
    );
  $$,
  'a bracket can advance an outcome between contests in one edition'
);

select throws_ok(
  $$
    insert into bracket_edges (
      bracket_id,
      event_edition_id,
      from_contest_id,
      to_contest_id,
      outcome,
      target_role
    ) values (
      '83000000-0000-4000-8000-000000000001',
      '33000000-0000-4000-8000-000000000001',
      '73000000-0000-4000-8000-000000000003',
      '73000000-0000-4000-8000-000000000002',
      'winner',
      'finalist'
    )
  $$,
  '23503',
  null,
  'a bracket edge cannot cross event editions'
);

select throws_ok(
  $$
    insert into bracket_edges (
      bracket_id,
      event_edition_id,
      from_contest_id,
      to_contest_id,
      outcome,
      target_role
    ) values (
      '83000000-0000-4000-8000-000000000001',
      '33000000-0000-4000-8000-000000000001',
      '73000000-0000-4000-8000-000000000001',
      '73000000-0000-4000-8000-000000000001',
      'winner',
      'self'
    )
  $$,
  '23514',
  null,
  'a bracket edge cannot point a contest to itself'
);

select * from finish();

rollback;
