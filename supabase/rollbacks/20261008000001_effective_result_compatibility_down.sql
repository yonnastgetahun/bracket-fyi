-- Operator-reviewed rollback for Slice 1C.
-- This restores the pre-Slice 1C read behavior and removes additive override
-- metadata. It intentionally retains any canonical result/audit rows created
-- by a separately approved backfill run; use forward repair for those ledgers.

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
  end                as points_value,
  wr.winner_team_id,
  case
    when wr.winner_team_id is null then null
    else wr.winner_team_id = p.team_id
  end                as is_correct,
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
  wr.winner_team_id is null as still_possible
from picks p
join leagues l on l.id = p.league_id
join template_matches tm on tm.id::text = p.slot_id
left join lateral (
  select coalesce(
    (
      select lro.winner_team_id
      from league_result_overrides lro
      where lro.league_id = p.league_id
        and lro.template_match_id = tm.id
      limit 1
    ),
    (
      select tr.winner_team_id
      from template_results tr
      where tr.template_match_id = tm.id
      limit 1
    )
  ) as winner_team_id
) wr on true
where p.slot_id <> 'champion';

create or replace view v_champion_status as
select
  p.participant_id,
  p.league_id,
  p.team_id                                               as champion_team_id,
  coalesce(
    (l.scoring_config ->>'champion_bonus')::int,
    0
  )                                                       as champion_bonus,
  case
    when final_winner.winner_team_id is null then null
    else final_winner.winner_team_id = p.team_id
  end                                                     as champion_correct,
  case
    when final_winner.winner_team_id = p.team_id
    then coalesce((l.scoring_config ->>'champion_bonus')::int, 0)
    else 0
  end                                                     as champion_points
from picks p
join leagues l on l.id = p.league_id
left join lateral (
  select coalesce(
    (
      select lro.winner_team_id
      from league_result_overrides lro
      join template_matches tf
        on tf.id = lro.template_match_id
       and tf.template_id = l.template_id
       and tf.round = (
         select max(round)
         from template_matches
         where template_id = l.template_id
           and round != (
             select case
               when (l.scoring_config->>'has_third_place')::bool
               then (
                 select round
                 from template_matches
                 where template_id = l.template_id
                 order by round desc
                 limit 1 offset 1
               )
               else -1
             end
           )
       )
      where lro.league_id = p.league_id
      limit 1
    ),
    (
      select tr.winner_team_id
      from template_results tr
      join template_matches tf
        on tf.id = tr.template_match_id
       and tf.template_id = l.template_id
       and tf.round = (
         select max(round)
         from template_matches
         where template_id = l.template_id
       )
      limit 1
    )
  ) as winner_team_id
) final_winner on true
where p.slot_id = 'champion';

create or replace view effective_results as
select
  tm.id               as template_match_id,
  tm.template_id,
  tm.round,
  tm.match_number,
  tm.home_slot,
  tm.away_slot,
  tm.scheduled_at,
  lro.league_id,
  coalesce(lro.winner_team_id, tr.winner_team_id) as winner_team_id,
  tr.score,
  case
    when lro.id is not null then 'override'
    when tr.id is not null then tr.entered_by::text
    else null
  end as result_source,
  coalesce(lro.overridden_at, tr.entered_at) as result_entered_at
from template_matches tm
left join template_results tr
  on tr.template_match_id = tm.id
left join league_result_overrides lro
  on lro.template_match_id = tm.id;

drop function if exists resolve_effective_results(uuid);
drop function if exists backfill_legacy_template_results(uuid);

drop trigger if exists league_result_override_metadata_trigger
  on league_result_overrides;
drop function if exists maintain_league_result_override_metadata();

drop index if exists league_result_overrides_effective_idx;

alter table league_result_overrides
  drop column if exists updated_at,
  drop column if exists release_audit_event_id,
  drop column if exists release_reason,
  drop column if exists released_by_fingerprint,
  drop column if exists released_at,
  drop column if exists expires_at,
  drop column if exists created_audit_event_id,
  drop column if exists replaced_contest_result_id,
  drop column if exists result_payload,
  drop column if exists created_by_fingerprint,
  drop column if exists reason,
  drop column if exists status;
