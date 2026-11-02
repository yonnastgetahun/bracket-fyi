begin;

select plan(8);

insert into templates (
  id,
  name,
  type,
  team_registry
) values (
  'a1000000-0000-4000-8000-000000000001',
  'Effective result compatibility fixture',
  'bracket',
  '[{"id":"team-a","name":"Team A"},{"id":"team-b","name":"Team B"}]'::jsonb
);

insert into template_matches (
  id,
  template_id,
  round,
  match_number,
  home_slot,
  away_slot
) values (
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000001',
  1,
  1,
  'team-a',
  'team-b'
);

insert into leagues (
  id,
  name,
  template_id,
  scoring_config
) values (
  'a1000000-0000-4000-8000-000000000003',
  'Effective result league',
  'a1000000-0000-4000-8000-000000000001',
  '{"round_points":{"1":1}}'::jsonb
);

insert into template_results (
  template_id,
  template_match_id,
  winner_team_id,
  entered_by
) values (
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'team-a',
  'organizer'
);

select is(
  (
    select winner_team_id
    from resolve_effective_results(
      'a1000000-0000-4000-8000-000000000003'
    )
    where template_match_id = 'a1000000-0000-4000-8000-000000000002'
  ),
  'team-a',
  'the league resolver returns a shared result when no override exists'
);

select is(
  (
    select winner_team_id
    from effective_results
    where league_id = 'a1000000-0000-4000-8000-000000000003'
      and template_match_id = 'a1000000-0000-4000-8000-000000000002'
  ),
  'team-a',
  'the legacy view returns a shared result for a league without an override'
);

insert into league_result_overrides (
  league_id,
  template_match_id,
  winner_team_id
) values (
  'a1000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000002',
  'team-b'
);

select results_eq(
  $$
    select
      status,
      reason,
      created_by_fingerprint ~ '^[a-f0-9]{64}$' as has_safe_actor_fingerprint,
      result_payload ->> 'winner_team_id' as payload_winner
    from league_result_overrides
    where league_id = 'a1000000-0000-4000-8000-000000000003'
      and template_match_id = 'a1000000-0000-4000-8000-000000000002'
  $$,
  $$ values ('active', 'organizer result entry', true, 'team-b') $$,
  'the legacy organizer write shape receives active, attributable override metadata'
);

select is(
  (
    select winner_team_id
    from resolve_effective_results(
      'a1000000-0000-4000-8000-000000000003'
    )
    where template_match_id = 'a1000000-0000-4000-8000-000000000002'
  ),
  'team-b',
  'an active organizer override wins over the shared result'
);

update league_result_overrides
set
  status = 'released',
  released_at = now(),
  released_by_fingerprint = created_by_fingerprint,
  release_reason = 'restore shared result'
where league_id = 'a1000000-0000-4000-8000-000000000003'
  and template_match_id = 'a1000000-0000-4000-8000-000000000002';

select is(
  (
    select winner_team_id
    from resolve_effective_results(
      'a1000000-0000-4000-8000-000000000003'
    )
    where template_match_id = 'a1000000-0000-4000-8000-000000000002'
  ),
  'team-a',
  'a released organizer override reveals the current shared result'
);

insert into participants (
  id,
  league_id,
  display_name
) values (
  'a1000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000003',
  'Compatibility Tester'
);

insert into picks (
  league_id,
  participant_id,
  slot_id,
  team_id
) values (
  'a1000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000002',
  'team-a'
);

select results_eq(
  $$
    select winner_team_id, is_correct, points_earned
    from v_pick_results
    where participant_id = 'a1000000-0000-4000-8000-000000000004'
      and slot_id = 'a1000000-0000-4000-8000-000000000002'
  $$,
  $$ values ('team-a', true, 1) $$,
  'scoring uses the same released-override fallback as the resolver'
);

update league_result_overrides
set
  status = 'active',
  overridden_at = now() - interval '2 seconds',
  expires_at = now() - interval '1 second',
  released_at = null,
  released_by_fingerprint = null,
  release_reason = null
where league_id = 'a1000000-0000-4000-8000-000000000003'
  and template_match_id = 'a1000000-0000-4000-8000-000000000002';

select is(
  (
    select winner_team_id
    from resolve_effective_results(
      'a1000000-0000-4000-8000-000000000003'
    )
    where template_match_id = 'a1000000-0000-4000-8000-000000000002'
  ),
  'team-a',
  'an override past its opt-in expiry reveals the current shared result'
);

insert into picks (
  league_id,
  participant_id,
  slot_id,
  team_id
) values (
  'a1000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000004',
  'champion',
  'team-a'
);

select is(
  (
    select champion_correct
    from v_champion_status
    where participant_id = 'a1000000-0000-4000-8000-000000000004'
      and league_id = 'a1000000-0000-4000-8000-000000000003'
  ),
  true,
  'champion scoring uses the same expired-override fallback as the resolver'
);

select * from finish();

rollback;
