begin;

select plan(5);

select throws_ok(
  $$ select * from backfill_legacy_template_results(null::uuid) $$,
  '22023',
  'a template id is required for bounded backfill',
  'the backfill contract refuses an unbounded run'
);

insert into organizations (id, organization_key, name, kind)
values (
  'b1000000-0000-4000-8000-000000000001',
  'backfill-org',
  'Backfill Organization',
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
  'b1000000-0000-4000-8000-000000000002',
  'b1000000-0000-4000-8000-000000000001',
  'backfill-cup',
  'Backfill Cup',
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
  'b1000000-0000-4000-8000-000000000003',
  'b1000000-0000-4000-8000-000000000002',
  '2026',
  'Backfill Cup 2026',
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
  'b1000000-0000-4000-8000-000000000004',
  'b1000000-0000-4000-8000-000000000003',
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
  'b1000000-0000-4000-8000-000000000005',
  'b1000000-0000-4000-8000-000000000003',
  'b1000000-0000-4000-8000-000000000004',
  'final',
  'Final',
  'match'
);

insert into competitors (id, competitor_key, kind, canonical_name)
values
  (
    'b1000000-0000-4000-8000-000000000006',
    'backfill-team-a',
    'team',
    'Backfill Team A'
  ),
  (
    'b1000000-0000-4000-8000-000000000007',
    'backfill-team-b',
    'team',
    'Backfill Team B'
  );

insert into event_entries (
  id,
  event_edition_id,
  competitor_id,
  role
) values
  (
    'b1000000-0000-4000-8000-000000000008',
    'b1000000-0000-4000-8000-000000000003',
    'b1000000-0000-4000-8000-000000000006',
    'team'
  ),
  (
    'b1000000-0000-4000-8000-000000000009',
    'b1000000-0000-4000-8000-000000000003',
    'b1000000-0000-4000-8000-000000000007',
    'team'
  );

insert into contest_entries (
  event_edition_id,
  contest_id,
  event_entry_id,
  role,
  side,
  ordinal,
  metadata
) values
  (
    'b1000000-0000-4000-8000-000000000003',
    'b1000000-0000-4000-8000-000000000005',
    'b1000000-0000-4000-8000-000000000008',
    'competitor',
    'home',
    1,
    '{"legacy_team_id":"team-a"}'::jsonb
  ),
  (
    'b1000000-0000-4000-8000-000000000003',
    'b1000000-0000-4000-8000-000000000005',
    'b1000000-0000-4000-8000-000000000009',
    'competitor',
    'away',
    2,
    '{"legacy_team_id":"team-b"}'::jsonb
  );

insert into templates (
  id,
  name,
  type,
  event_edition_id,
  team_registry
) values (
  'b1000000-0000-4000-8000-000000000010',
  'Backfill template',
  'bracket',
  'b1000000-0000-4000-8000-000000000003',
  '[{"id":"team-a","name":"Team A"},{"id":"team-b","name":"Team B"}]'::jsonb
);

insert into template_matches (
  id,
  template_id,
  round,
  match_number,
  home_slot,
  away_slot,
  contest_id
) values (
  'b1000000-0000-4000-8000-000000000011',
  'b1000000-0000-4000-8000-000000000010',
  1,
  1,
  'team-a',
  'team-b',
  'b1000000-0000-4000-8000-000000000005'
);

insert into leagues (
  id,
  name,
  template_id,
  scoring_config
) values (
  'b1000000-0000-4000-8000-000000000012',
  'Backfill league',
  'b1000000-0000-4000-8000-000000000010',
  '{"round_points":{"1":1}}'::jsonb
);

insert into participants (id, league_id, display_name)
values (
  'b1000000-0000-4000-8000-000000000013',
  'b1000000-0000-4000-8000-000000000012',
  'Backfill Tester'
);

insert into picks (
  id,
  league_id,
  participant_id,
  slot_id,
  team_id
) values (
  'b1000000-0000-4000-8000-000000000014',
  'b1000000-0000-4000-8000-000000000012',
  'b1000000-0000-4000-8000-000000000013',
  'b1000000-0000-4000-8000-000000000011',
  'team-a'
);

insert into template_results (
  id,
  template_id,
  template_match_id,
  winner_team_id,
  score,
  entered_by
) values (
  'b1000000-0000-4000-8000-000000000015',
  'b1000000-0000-4000-8000-000000000010',
  'b1000000-0000-4000-8000-000000000011',
  'team-a',
  '{"away":1,"home":2}'::jsonb,
  'organizer'
);

insert into template_matches (
  id,
  template_id,
  round,
  match_number,
  home_slot,
  away_slot
) values (
  'b1000000-0000-4000-8000-000000000017',
  'b1000000-0000-4000-8000-000000000010',
  1,
  2,
  'team-a',
  'team-b'
);

insert into template_results (
  id,
  template_id,
  template_match_id,
  winner_team_id,
  entered_by
) values (
  'b1000000-0000-4000-8000-000000000018',
  'b1000000-0000-4000-8000-000000000010',
  'b1000000-0000-4000-8000-000000000017',
  'team-a',
  'organizer'
);

insert into league_result_overrides (
  id,
  league_id,
  template_match_id,
  winner_team_id
) values (
  'b1000000-0000-4000-8000-000000000016',
  'b1000000-0000-4000-8000-000000000012',
  'b1000000-0000-4000-8000-000000000011',
  'team-b'
);

create temporary table first_backfill_run on commit drop as
select *
from backfill_legacy_template_results(
  'b1000000-0000-4000-8000-000000000010'
);

select results_eq(
  $$
    select
      scanned_results,
      eligible_results,
      inserted_results,
      already_backfilled_results,
      skipped_unlinked_results
    from first_backfill_run
  $$,
  $$ values (2::bigint, 1::bigint, 1::bigint, 0::bigint, 1::bigint) $$,
  'the first bounded backfill run reports and inserts one eligible result'
);

select diag(
  'first backfill run: ' || row_to_json(first_backfill_run)::text
)
from first_backfill_run;

create temporary table second_backfill_run on commit drop as
select *
from backfill_legacy_template_results(
  'b1000000-0000-4000-8000-000000000010'
);

select results_eq(
  $$
    select
      scanned_results,
      eligible_results,
      inserted_results,
      already_backfilled_results,
      skipped_unlinked_results
    from second_backfill_run
  $$,
  $$ values (2::bigint, 1::bigint, 0::bigint, 1::bigint, 1::bigint) $$,
  'replaying the bounded backfill is an idempotent no-op'
);

select diag(
  'second backfill run: ' || row_to_json(second_backfill_run)::text
)
from second_backfill_run;

select results_eq(
  $$
    select
      cr.version,
      cr.result_status,
      cr.winner_event_entry_id,
      cr.source_type,
      count(rae.id)::bigint as audit_events
    from contest_results cr
    left join result_audit_events rae on rae.contest_result_id = cr.id
    where cr.contest_id = 'b1000000-0000-4000-8000-000000000005'
    group by cr.id
  $$,
  $$
    values (
      1,
      'final',
      'b1000000-0000-4000-8000-000000000008'::uuid,
      'backfill',
      1::bigint
    )
  $$,
  'backfilled canonical history uses the explicit winner mapping and has audit evidence'
);

select results_eq(
  $$
    select
      t.id,
      tm.id,
      p.id,
      tr.id,
      lro.id,
      pr.winner_team_id,
      pr.points_earned
    from templates t
    join template_matches tm on tm.template_id = t.id
    join leagues l on l.template_id = t.id
    join participants pa on pa.league_id = l.id
    join picks p on p.participant_id = pa.id and p.slot_id = tm.id::text
    join template_results tr on tr.template_match_id = tm.id
    join league_result_overrides lro
      on lro.league_id = l.id
     and lro.template_match_id = tm.id
    join v_pick_results pr on pr.pick_id = p.id
    where t.id = 'b1000000-0000-4000-8000-000000000010'
  $$,
  $$
    values (
      'b1000000-0000-4000-8000-000000000010'::uuid,
      'b1000000-0000-4000-8000-000000000011'::uuid,
      'b1000000-0000-4000-8000-000000000014'::uuid,
      'b1000000-0000-4000-8000-000000000015'::uuid,
      'b1000000-0000-4000-8000-000000000016'::uuid,
      'team-b',
      0
    )
  $$,
  'legacy IDs, picks, shared results, overrides, and scoring remain unchanged'
);

select * from finish();

rollback;
