-- ============================================================
-- Bracket.fyi — Migration 004: Pickem-aware scoring views
-- ============================================================
-- Extends v_pick_results to handle pickem scoring config.
-- Pickem leagues store scoring_config as:
--   { "scheme": "pickem_flat" | "pickem_weighted",
--     "major_categories": [...],
--     "major_points": 3,
--     "other_points": 1 }
-- Bracket leagues use the original round_points shape.
-- All other views (v_champion_status, v_leaderboard, v_contention)
-- are unchanged — they derive from v_pick_results and work as-is.
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
  -- Point value: pickem-aware
  case
    when (l.scoring_config->>'scheme') in ('pickem_flat', 'pickem_weighted') then
      case
        when (l.scoring_config->>'scheme') = 'pickem_flat' then
          coalesce((l.scoring_config->>'other_points')::int, 1)
        else -- pickem_weighted
          case
            when (l.scoring_config->'major_categories') @> to_jsonb(substring(tm.home_slot from 10))
            then coalesce((l.scoring_config->>'major_points')::int, 3)
            else coalesce((l.scoring_config->>'other_points')::int, 1)
          end
      end
    else
      -- bracket: round-based points
      coalesce((l.scoring_config->'round_points'->>tm.round::text)::int, 0)
  end                as points_value,
  -- Effective winner: league override wins over template result
  wr.winner_team_id,
  -- Correct/incorrect/pending
  case
    when wr.winner_team_id is null then null
    else wr.winner_team_id = p.team_id
  end                as is_correct,
  -- Points earned this pick (same pickem-aware logic)
  case
    when wr.winner_team_id = p.team_id then
      case
        when (l.scoring_config->>'scheme') in ('pickem_flat', 'pickem_weighted') then
          case
            when (l.scoring_config->>'scheme') = 'pickem_flat' then
              coalesce((l.scoring_config->>'other_points')::int, 1)
            else
              case
                when (l.scoring_config->'major_categories') @> to_jsonb(substring(tm.home_slot from 10))
                then coalesce((l.scoring_config->>'major_points')::int, 3)
                else coalesce((l.scoring_config->>'other_points')::int, 1)
              end
          end
        else
          coalesce((l.scoring_config->'round_points'->>tm.round::text)::int, 0)
      end
    else 0
  end                as points_earned,
  -- Still possible: match not yet decided
  wr.winner_team_id is null as still_possible
from picks p
join leagues l  on l.id = p.league_id
join template_matches tm on tm.id::text = p.slot_id
-- Lateral: compute effective winner once, reuse above
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
