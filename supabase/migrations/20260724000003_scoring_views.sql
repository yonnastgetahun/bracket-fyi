-- ============================================================
-- Bracket.fyi — Migration 003: Derived scoring views
-- ============================================================
-- Scoring is NEVER stored — always derived from picks + results.
-- All views are league_id-scoped. scoring_config is the single
-- source of truth for point values; no hardcoded stage weights.
--
-- scoring_config JSON shape (stored on leagues row):
--   {
--     "round_points": {"1": 1, "2": 1, "3": 2, "4": 2},
--     "champion_bonus": 2,
--     "has_third_place": true,
--     "tiebreakers": ["champion_correct", "fewest_wrong"]
--   }
--
-- picks.slot_id is either:
--   - A template_match.id (UUID string) for bracket picks
--   - The literal string 'champion' for the champion pick
-- ============================================================

-- ============================================================
-- v_pick_results
-- One row per non-champion pick per participant, with scoring.
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
-- Lateral: compute effective winner once, reuse three times above
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

-- ============================================================
-- v_champion_status
-- Champion pick + bonus per participant per league.
-- ============================================================
create or replace view v_champion_status as
select
  p.participant_id,
  p.league_id,
  p.team_id                                               as champion_team_id,
  coalesce(
    (l.scoring_config ->>'champion_bonus')::int,
    0
  )                                                       as champion_bonus,
  -- Champion is correct when they won the final (highest round match)
  case
    when final_winner.winner_team_id is null then null
    else final_winner.winner_team_id = p.team_id
  end                                                     as champion_correct,
  -- Points earned from champion pick
  case
    when final_winner.winner_team_id = p.team_id
    then coalesce((l.scoring_config ->>'champion_bonus')::int, 0)
    else 0
  end                                                     as champion_points
from picks p
join leagues l on l.id = p.league_id
-- Find the final match (highest round in the template)
left join lateral (
  select coalesce(
    ( select lro.winner_team_id
      from   league_result_overrides lro
      join   template_matches tf
               on  tf.id = lro.template_match_id
              and  tf.template_id = l.template_id
              and  tf.round = (
                select max(round) from template_matches
                where template_id = l.template_id
                  and round != (
                    -- exclude third-place match if has_third_place
                    select case
                      when (l.scoring_config->>'has_third_place')::bool
                      then (select round from template_matches
                            where template_id = l.template_id
                            order by round desc limit 1 offset 1)
                      else -1 end
                  )
              )
      where  lro.league_id = p.league_id
      limit  1 ),
    ( select tr.winner_team_id
      from   template_results tr
      join   template_matches tf
               on  tf.id = tr.template_match_id
              and  tf.template_id = l.template_id
              and  tf.round = (
                select max(round) from template_matches
                where template_id = l.template_id
              )
      limit  1 )
  ) as winner_team_id
) final_winner on true
where p.slot_id = 'champion';

-- ============================================================
-- v_leaderboard
-- Aggregated scores per participant per league.
-- Tiebreakers: 1) champion correct, 2) fewest wrong picks.
-- ============================================================
create or replace view v_leaderboard as
select
  pa.id              as participant_id,
  pa.league_id,
  pa.display_name,
  pa.emoji,
  pa.created_at      as joined_at,
  -- Points from bracket picks
  coalesce(sum(pr.points_earned), 0)                                          as points,
  -- Champion bonus (separate row in picks)
  coalesce(cs.champion_points, 0)                                             as champion_points,
  -- Total points including champion bonus
  coalesce(sum(pr.points_earned), 0) + coalesce(cs.champion_points, 0)       as total_points,
  -- Max possible: current points + remaining achievable points
  coalesce(sum(pr.points_earned), 0)
    + coalesce(sum(pr.points_value) filter (where pr.still_possible), 0)
    + coalesce(cs.champion_bonus, 0)                                          as max_possible,
  -- Pick stats
  count(*) filter (where pr.is_correct = true)                                as correct_picks,
  count(*) filter (where pr.is_correct = false)                               as wrong_picks,
  count(*) filter (where pr.is_correct is null)                               as pending_picks,
  -- Champion info
  cs.champion_team_id,
  cs.champion_correct,
  -- Rank: total desc, champion correct desc, fewest wrong asc
  rank() over (
    partition by pa.league_id
    order by
      coalesce(sum(pr.points_earned), 0) + coalesce(cs.champion_points, 0) desc,
      coalesce(cs.champion_correct, false)                                    desc,
      count(*) filter (where pr.is_correct = false)                           asc
  )                                                                           as rank
from participants pa
left join v_pick_results   pr on pr.participant_id = pa.id
                              and pr.league_id     = pa.league_id
left join v_champion_status cs on cs.participant_id = pa.id
                               and cs.league_id     = pa.league_id
group by
  pa.id, pa.league_id, pa.display_name, pa.emoji, pa.created_at,
  cs.champion_team_id, cs.champion_correct, cs.champion_points, cs.champion_bonus;

-- ============================================================
-- v_contention
-- Is each participant mathematically eliminated?
-- ============================================================
create or replace view v_contention as
select
  l.*,
  l.max_possible < (
    select max(total_points)
    from   v_leaderboard leader
    where  leader.league_id = l.league_id
  ) as eliminated_from_contention
from v_leaderboard l;
