begin;

select plan(4);

select lives_ok(
  $$
    insert into organizations (id, organization_key, name, kind)
    values (
      '12000000-0000-4000-8000-000000000001',
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
      '22000000-0000-4000-8000-000000000001',
      '12000000-0000-4000-8000-000000000001',
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
        '32000000-0000-4000-8000-000000000001',
        '22000000-0000-4000-8000-000000000001',
        '2026-27',
        'UEFA Champions League 2026/27',
        '2026/27',
        'Europe/Zurich'
      ),
      (
        '32000000-0000-4000-8000-000000000002',
        '22000000-0000-4000-8000-000000000001',
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
        '52000000-0000-4000-8000-000000000001',
        '32000000-0000-4000-8000-000000000001',
        'knockout',
        'Knockout stage',
        'knockout',
        1
      ),
      (
        '52000000-0000-4000-8000-000000000002',
        '32000000-0000-4000-8000-000000000002',
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
    ) values (
      '62000000-0000-4000-8000-000000000001',
      '32000000-0000-4000-8000-000000000001',
      '52000000-0000-4000-8000-000000000001',
      'round-of-16',
      'Round of 16',
      1
    );

    insert into contests (
      id,
      event_edition_id,
      stage_id,
      round_id,
      contest_key,
      name,
      kind
    ) values (
      '72000000-0000-4000-8000-000000000001',
      '32000000-0000-4000-8000-000000000001',
      '52000000-0000-4000-8000-000000000001',
      '62000000-0000-4000-8000-000000000001',
      'r16-tie-1',
      'Round of 16 tie 1',
      'tie'
    );

    insert into contests (
      event_edition_id,
      stage_id,
      round_id,
      parent_contest_id,
      contest_key,
      name,
      kind
    ) values (
      '32000000-0000-4000-8000-000000000001',
      '52000000-0000-4000-8000-000000000001',
      '62000000-0000-4000-8000-000000000001',
      '72000000-0000-4000-8000-000000000001',
      'r16-tie-1-leg-1',
      'Round of 16 tie 1, leg 1',
      'match'
    );
  $$,
  'a tie can contain child matches in the same edition, stage, and round'
);

select throws_ok(
  $$
    insert into rounds (
      event_edition_id,
      stage_id,
      round_key,
      name,
      ordinal
    ) values (
      '32000000-0000-4000-8000-000000000001',
      '52000000-0000-4000-8000-000000000002',
      'wrong-edition',
      'Wrong edition',
      2
    )
  $$,
  '23503',
  null,
  'a round cannot reference a stage from another edition'
);

select throws_ok(
  $$
    insert into contests (
      event_edition_id,
      stage_id,
      contest_key,
      name,
      kind
    ) values (
      '32000000-0000-4000-8000-000000000001',
      '52000000-0000-4000-8000-000000000002',
      'wrong-stage',
      'Wrong stage',
      'match'
    )
  $$,
  '23503',
  null,
  'a contest cannot reference a stage from another edition'
);

select throws_ok(
  $$
    insert into contests (
      id,
      event_edition_id,
      stage_id,
      contest_key,
      name,
      kind
    ) values (
      '72000000-0000-4000-8000-000000000002',
      '32000000-0000-4000-8000-000000000002',
      '52000000-0000-4000-8000-000000000002',
      'other-edition-parent',
      'Other edition parent',
      'tie'
    );

    insert into contests (
      event_edition_id,
      stage_id,
      parent_contest_id,
      contest_key,
      name,
      kind
    ) values (
      '32000000-0000-4000-8000-000000000001',
      '52000000-0000-4000-8000-000000000001',
      '72000000-0000-4000-8000-000000000002',
      'wrong-parent',
      'Wrong parent',
      'match'
    )
  $$,
  '23503',
  null,
  'a child contest cannot reference a parent from another edition'
);

select * from finish();

rollback;
