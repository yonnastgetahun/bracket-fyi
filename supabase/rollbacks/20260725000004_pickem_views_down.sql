-- ============================================================
-- Bracket.fyi — Migration 004 DOWN: restore original v_pick_results
-- ============================================================
create or replace view v_pick_results as
select
  p.id               as pick_id,
  p.league_id,
  p.participant_id,
  p.slot_id,
  p.team_id          as picked_team_id,
  p.locked,
  tm.round,
  tm.template_id,
  tm.scheduled_at,
  -- Point value for this round from scoring_config
  coalesce(
    (l.scoring_config -> 'round_points' ->> tm.round::text)::int,
    0
  )                  as points_value,
  -- Effective winner: league override wins over template result
  wr.winner_team_id,
  -- Correct/incorrect/pending
  case
    when wr.winner_team_id is null then null
    else wr.winner_team_id = p.team_id
  end                as is_correct,
  -- Points earned this pick
  case
    when wr.winner_team_id = p.team_id
    then coalesce(
      (l.scoring_config -> 'round_points' ->> tm.round::text)::int,
      0
    )
    else 0
  end                as points_earned,
  -- Still possible: match not yet decided
  wr.winner_team_id is null as still_possible
from picks p
join leagues l  on l.id = p.league_id
join template_matches tm on tm.id::text = p.slot_id
left join lateral (
  select coalesce(
    ( select lro.winner_team_id
      from   league_result_overrides lro
      where  lro.league_id         = p.league_id
        and  lro.template_match_id = tm.id
      limit  1 ),
    ( select tr.winner_team_id
      from   template_results tr
      where  tr.template_match_id = tm.id
      limit  1 )
  ) as winner_team_id
) wr on true
where p.slot_id <> 'champion';
