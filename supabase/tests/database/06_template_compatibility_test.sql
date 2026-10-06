begin;

select plan(6);

select lives_ok(
  $$
    insert into templates (id, name, type)
    values (
      '90000000-0000-4000-8000-000000000001',
      'Legacy custom bracket',
      'bracket'
    );

    insert into template_matches (
      template_id,
      round,
      match_number,
      home_slot,
      away_slot
    ) values (
      '90000000-0000-4000-8000-000000000001',
      1,
      1,
      'seed-1',
      'seed-2'
    );
  $$,
  'existing templates and matches remain valid without canonical links'
);

select lives_ok(
  $$
    insert into organizations (id, organization_key, name, kind)
    values (
      '14000000-0000-4000-8000-000000000001',
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
      '24000000-0000-4000-8000-000000000001',
      '14000000-0000-4000-8000-000000000001',
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
        '34000000-0000-4000-8000-000000000001',
        '24000000-0000-4000-8000-000000000001',
        '2026-27',
        'UEFA Champions League 2026/27',
        '2026/27',
        'Europe/Zurich'
      ),
      (
        '34000000-0000-4000-8000-000000000002',
        '24000000-0000-4000-8000-000000000001',
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
        '54000000-0000-4000-8000-000000000001',
        '34000000-0000-4000-8000-000000000001',
        'knockout',
        'Knockout stage',
        'knockout',
        1
      ),
      (
        '54000000-0000-4000-8000-000000000002',
        '34000000-0000-4000-8000-000000000002',
        'knockout',
        'Knockout stage',
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
        '74000000-0000-4000-8000-000000000001',
        '34000000-0000-4000-8000-000000000001',
        '54000000-0000-4000-8000-000000000001',
        'final',
        'Final',
        'match'
      ),
      (
        '74000000-0000-4000-8000-000000000002',
        '34000000-0000-4000-8000-000000000002',
        '54000000-0000-4000-8000-000000000002',
        'final',
        'Final',
        'match'
      );

    insert into templates (id, name, type, event_edition_id)
    values (
      '90000000-0000-4000-8000-000000000002',
      'UCL 2026/27',
      'bracket',
      '34000000-0000-4000-8000-000000000001'
    );

    insert into template_matches (
      id,
      template_id,
      round,
      match_number,
      home_slot,
      away_slot,
      contest_id,
      counts_toward_completion
    ) values (
      '91000000-0000-4000-8000-000000000001',
      '90000000-0000-4000-8000-000000000002',
      1,
      1,
      'semifinal-1-winner',
      'semifinal-2-winner',
      '74000000-0000-4000-8000-000000000001',
      false
    );
  $$,
  'a template match can link to a contest in the same edition'
);

select is(
  (
    select counts_toward_completion
    from template_matches
    where id = '91000000-0000-4000-8000-000000000001'
  ),
  false,
  'completion participation is explicit per template match'
);

select throws_ok(
  $$
    insert into templates (id, name, type)
    values (
      '90000000-0000-4000-8000-000000000003',
      'Unbound template',
      'bracket'
    );

    insert into template_matches (
      template_id,
      round,
      match_number,
      home_slot,
      away_slot,
      contest_id
    ) values (
      '90000000-0000-4000-8000-000000000003',
      1,
      1,
      'seed-1',
      'seed-2',
      '74000000-0000-4000-8000-000000000001'
    )
  $$,
  '23514',
  null,
  'a canonical contest cannot be linked to an unbound template'
);

select throws_ok(
  $$
    insert into template_matches (
      template_id,
      round,
      match_number,
      home_slot,
      away_slot,
      contest_id
    ) values (
      '90000000-0000-4000-8000-000000000002',
      1,
      2,
      'other-1',
      'other-2',
      '74000000-0000-4000-8000-000000000002'
    )
  $$,
  '23514',
  null,
  'a template match cannot link to a contest from another edition'
);

select throws_ok(
  $$
    update templates
    set event_edition_id = '34000000-0000-4000-8000-000000000002'
    where id = '90000000-0000-4000-8000-000000000002'
  $$,
  '23514',
  null,
  'a template edition cannot change while linked matches belong elsewhere'
);

select * from finish();

rollback;
