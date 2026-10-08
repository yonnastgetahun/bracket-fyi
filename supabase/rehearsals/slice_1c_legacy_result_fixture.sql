-- Disposable-local-only fixture for the Slice 1C backfill rehearsal.
-- Reset the local database before and after use. Never run against a hosted
-- project: these fixed IDs and synthetic records are test evidence only.

begin;

insert into organizations (id, organization_key, name, kind)
values (
  'c1000000-0000-4000-8000-000000000001',
  'slice-1c-rehearsal-org',
  'Slice 1C Rehearsal Organization',
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
  'c1000000-0000-4000-8000-000000000002',
  'c1000000-0000-4000-8000-000000000001',
  'slice-1c-rehearsal-cup',
  'Slice 1C Rehearsal Cup',
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
  'c1000000-0000-4000-8000-000000000003',
  'c1000000-0000-4000-8000-000000000002',
  '2026',
  'Slice 1C Rehearsal Cup 2026',
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
  'c1000000-0000-4000-8000-000000000004',
  'c1000000-0000-4000-8000-000000000003',
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
  'c1000000-0000-4000-8000-000000000005',
  'c1000000-0000-4000-8000-000000000003',
  'c1000000-0000-4000-8000-000000000004',
  'final',
  'Final',
  'match'
);

insert into competitors (id, competitor_key, kind, canonical_name)
values (
  'c1000000-0000-4000-8000-000000000006',
  'slice-1c-rehearsal-team',
  'team',
  'Slice 1C Rehearsal Team'
);

insert into event_entries (
  id,
  event_edition_id,
  competitor_id,
  role
) values (
  'c1000000-0000-4000-8000-000000000007',
  'c1000000-0000-4000-8000-000000000003',
  'c1000000-0000-4000-8000-000000000006',
  'team'
);

insert into contest_entries (
  event_edition_id,
  contest_id,
  event_entry_id,
  role,
  ordinal,
  metadata
) values (
  'c1000000-0000-4000-8000-000000000003',
  'c1000000-0000-4000-8000-000000000005',
  'c1000000-0000-4000-8000-000000000007',
  'competitor',
  1,
  '{"legacy_team_id":"team-a"}'::jsonb
);

insert into templates (
  id,
  name,
  type,
  event_edition_id,
  team_registry
) values (
  'c1000000-0000-4000-8000-000000000008',
  'Slice 1C Rehearsal Template',
  'bracket',
  'c1000000-0000-4000-8000-000000000003',
  '[{"id":"team-a","name":"Team A"}]'::jsonb
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
  'c1000000-0000-4000-8000-000000000009',
  'c1000000-0000-4000-8000-000000000008',
  1,
  1,
  'team-a',
  'pending-opponent',
  'c1000000-0000-4000-8000-000000000005'
);

insert into template_results (
  id,
  template_id,
  template_match_id,
  winner_team_id,
  score,
  entered_by
) values (
  'c1000000-0000-4000-8000-000000000010',
  'c1000000-0000-4000-8000-000000000008',
  'c1000000-0000-4000-8000-000000000009',
  'team-a',
  '{"away":1,"home":2}'::jsonb,
  'organizer'
);

commit;
