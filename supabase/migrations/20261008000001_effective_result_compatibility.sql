-- Bracket.fyi result compatibility contracts — Slice 1C
-- Additive metadata and read contracts only; no provider is enabled.

alter table league_result_overrides
  add column status text not null default 'active',
  add column reason text not null default 'organizer result entry',
  add column created_by_fingerprint text,
  add column result_payload jsonb not null default '{}'::jsonb,
  add column replaced_contest_result_id uuid
    references contest_results(id) on delete restrict,
  add column created_audit_event_id uuid
    references result_audit_events(id) on delete restrict,
  add column expires_at timestamptz,
  add column released_at timestamptz,
  add column released_by_fingerprint text,
  add column release_reason text,
  add column release_audit_event_id uuid
    references result_audit_events(id) on delete restrict,
  add column updated_at timestamptz not null default now();

update league_result_overrides lro
set
  created_by_fingerprint = encode(
    extensions.digest(l.organizer_token::text, 'sha256'),
    'hex'
  ),
  result_payload = jsonb_build_object(
    'winner_team_id',
    lro.winner_team_id
  )
from leagues l
where l.id = lro.league_id;

alter table league_result_overrides
  alter column created_by_fingerprint set not null,
  add constraint league_result_overrides_status_valid
    check (status in ('active', 'released', 'expired')),
  add constraint league_result_overrides_reason_not_blank
    check (btrim(reason) <> ''),
  add constraint league_result_overrides_creator_fingerprint_format
    check (created_by_fingerprint ~ '^[a-f0-9]{64}$'),
  add constraint league_result_overrides_payload_object
    check (jsonb_typeof(result_payload) = 'object'),
  add constraint league_result_overrides_expiry_order
    check (expires_at is null or expires_at > overridden_at),
  add constraint league_result_overrides_release_fingerprint_format
    check (
      released_by_fingerprint is null
      or released_by_fingerprint ~ '^[a-f0-9]{64}$'
    ),
  add constraint league_result_overrides_lifecycle_valid
    check (
      (
        status = 'active'
        and released_at is null
        and released_by_fingerprint is null
        and release_reason is null
        and release_audit_event_id is null
      )
      or
      (
        status = 'released'
        and released_at is not null
        and released_by_fingerprint is not null
        and release_reason is not null
        and btrim(release_reason) <> ''
      )
      or
      (
        status = 'expired'
        and expires_at is not null
        and released_at is null
        and released_by_fingerprint is null
        and release_reason is null
        and release_audit_event_id is null
      )
    ),
  add constraint league_result_overrides_release_order
    check (released_at is null or released_at >= overridden_at);

create index league_result_overrides_effective_idx
  on league_result_overrides (league_id, template_match_id, expires_at)
  where status = 'active';

create or replace function maintain_league_result_override_metadata()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  organizer_secret uuid;
begin
  if new.created_by_fingerprint is null then
    select organizer_token
    into organizer_secret
    from leagues
    where id = new.league_id;

    if organizer_secret is not null then
      new.created_by_fingerprint := encode(
        digest(organizer_secret::text, 'sha256'),
        'hex'
      );
    end if;
  end if;

  if tg_op = 'INSERT'
     or new.winner_team_id is distinct from old.winner_team_id then
    new.result_payload := jsonb_set(
      coalesce(new.result_payload, '{}'::jsonb),
      '{winner_team_id}',
      to_jsonb(new.winner_team_id),
      true
    );
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger league_result_override_metadata_trigger
  before insert or update
  on league_result_overrides
  for each row
  execute function maintain_league_result_override_metadata();

create or replace function backfill_legacy_template_results(p_template_id uuid)
returns table (
  scanned_results bigint,
  eligible_results bigint,
  inserted_results bigint,
  already_backfilled_results bigint,
  skipped_unlinked_results bigint,
  skipped_unmapped_results bigint,
  skipped_conflicting_results bigint,
  skipped_duplicate_results bigint,
  skipped_existing_results bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  legacy_result record;
  mapped_entry_ids uuid[];
  inserted_result_id uuid;
begin
  if p_template_id is null then
    raise exception 'a template id is required for bounded backfill'
      using errcode = '22023';
  end if;

  -- Serialize replays for one template so two operator sessions cannot race
  -- between the existing-result check and the append-only insert.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'bracket-fyi:legacy-result-backfill:' || p_template_id::text,
      0
    )
  );

  scanned_results := 0;
  eligible_results := 0;
  inserted_results := 0;
  already_backfilled_results := 0;
  skipped_unlinked_results := 0;
  skipped_unmapped_results := 0;
  skipped_conflicting_results := 0;
  skipped_duplicate_results := 0;
  skipped_existing_results := 0;

  for legacy_result in
    select
      tr.id,
      tr.template_id,
      tr.template_match_id,
      tr.winner_team_id,
      tr.score,
      tr.entered_at,
      tm.contest_id,
      c.event_edition_id
    from template_results tr
    join template_matches tm on tm.id = tr.template_match_id
    left join contests c on c.id = tm.contest_id
    where tr.template_id = p_template_id
    order by tr.id::text
  loop
    scanned_results := scanned_results + 1;

    if legacy_result.contest_id is null
       or legacy_result.event_edition_id is null then
      skipped_unlinked_results := skipped_unlinked_results + 1;
      continue;
    end if;

    select array_agg(ce.event_entry_id order by ce.event_entry_id::text)
    into mapped_entry_ids
    from contest_entries ce
    where ce.contest_id = legacy_result.contest_id
      and ce.metadata ->> 'legacy_team_id' = legacy_result.winner_team_id;

    if coalesce(cardinality(mapped_entry_ids), 0) <> 1 then
      skipped_unmapped_results := skipped_unmapped_results + 1;
      continue;
    end if;

    if exists (
      select 1
      from (
        select
          other_tr.id,
          count(other_ce.event_entry_id) as mapping_count,
          (array_agg(
            other_ce.event_entry_id
            order by other_ce.event_entry_id::text
          ))[1] as mapped_entry_id
        from template_results other_tr
        join template_matches other_tm
          on other_tm.id = other_tr.template_match_id
        join contest_entries other_ce
          on other_ce.contest_id = other_tm.contest_id
         and other_ce.metadata ->> 'legacy_team_id' = other_tr.winner_team_id
        where other_tm.contest_id = legacy_result.contest_id
          and other_tr.id <> legacy_result.id
        group by other_tr.id
      ) other_mapping
      where other_mapping.mapping_count = 1
        and other_mapping.mapped_entry_id <> mapped_entry_ids[1]
    ) then
      skipped_conflicting_results := skipped_conflicting_results + 1;
      continue;
    end if;

    if exists (
      select 1
      from template_results other_tr
      join template_matches other_tm
        on other_tm.id = other_tr.template_match_id
      join contest_entries other_ce
        on other_ce.contest_id = other_tm.contest_id
       and other_ce.metadata ->> 'legacy_team_id' = other_tr.winner_team_id
      where other_tm.contest_id = legacy_result.contest_id
        and other_tr.id::text < legacy_result.id::text
        and other_ce.event_entry_id = mapped_entry_ids[1]
    ) then
      skipped_duplicate_results := skipped_duplicate_results + 1;
      continue;
    end if;

    eligible_results := eligible_results + 1;

    if exists (
      select 1
      from contest_results cr
      where cr.idempotency_key = 'legacy-template-result:' || legacy_result.id::text
    ) then
      already_backfilled_results := already_backfilled_results + 1;
      continue;
    end if;

    if exists (
      select 1
      from contest_results cr
      where cr.contest_id = legacy_result.contest_id
    ) then
      skipped_existing_results := skipped_existing_results + 1;
      continue;
    end if;

    insert into contest_results (
      contest_id,
      event_edition_id,
      version,
      result_status,
      outcome_type,
      winner_event_entry_id,
      score,
      result_data,
      source_type,
      accepted_at,
      idempotency_key
    ) values (
      legacy_result.contest_id,
      legacy_result.event_edition_id,
      1,
      'final',
      'winner',
      mapped_entry_ids[1],
      legacy_result.score,
      jsonb_build_object(
        'backfill_contract_version', 1,
        'legacy_template_id', legacy_result.template_id,
        'legacy_template_match_id', legacy_result.template_match_id,
        'legacy_template_result_id', legacy_result.id
      ),
      'backfill',
      legacy_result.entered_at,
      'legacy-template-result:' || legacy_result.id::text
    )
    returning id into inserted_result_id;

    insert into result_audit_events (
      event_edition_id,
      contest_id,
      contest_result_id,
      event_type,
      actor_type,
      actor_reference,
      idempotency_key,
      new_state,
      details,
      occurred_at
    ) values (
      legacy_result.event_edition_id,
      legacy_result.contest_id,
      inserted_result_id,
      'result.backfilled',
      'system',
      'slice-1c-legacy-result-backfill',
      'legacy-template-result-audit:' || legacy_result.id::text,
      jsonb_build_object(
        'result_status', 'final',
        'outcome_type', 'winner',
        'winner_event_entry_id', mapped_entry_ids[1],
        'version', 1
      ),
      jsonb_build_object(
        'legacy_template_id', legacy_result.template_id,
        'legacy_template_match_id', legacy_result.template_match_id,
        'legacy_template_result_id', legacy_result.id
      ),
      legacy_result.entered_at
    );

    inserted_results := inserted_results + 1;
  end loop;

  return next;
end;
$$;

revoke all on function backfill_legacy_template_results(uuid)
from public, anon, authenticated;

grant execute on function backfill_legacy_template_results(uuid)
to service_role;

create or replace function resolve_effective_results(p_league_id uuid)
returns table (
  template_match_id uuid,
  template_id uuid,
  round integer,
  match_number integer,
  home_slot text,
  away_slot text,
  scheduled_at timestamptz,
  league_id uuid,
  winner_team_id text,
  score jsonb,
  result_source text,
  result_entered_at timestamptz
)
language sql
stable
set search_path = public
as $$
  select
    tm.id,
    tm.template_id,
    tm.round,
    tm.match_number,
    tm.home_slot,
    tm.away_slot,
    tm.scheduled_at,
    l.id,
    coalesce(lro.winner_team_id, tr.winner_team_id),
    coalesce(lro.result_payload -> 'score', tr.score),
    case
      when lro.id is not null then 'override'
      when tr.id is not null then tr.entered_by::text
      else null
    end,
    coalesce(lro.overridden_at, tr.entered_at)
  from leagues l
  join template_matches tm
    on tm.template_id = l.template_id
  left join template_results tr
    on tr.template_match_id = tm.id
  left join league_result_overrides lro
    on lro.league_id = l.id
   and lro.template_match_id = tm.id
   and lro.status = 'active'
   and (lro.expires_at is null or lro.expires_at > statement_timestamp())
  where l.id = p_league_id;
$$;

revoke all on function resolve_effective_results(uuid)
from public, anon, authenticated;

grant execute on function resolve_effective_results(uuid)
to service_role;

-- Keep the existing browser/server read surface while fixing its ambiguous
-- left-join behavior: callers filtering by league now receive one row per
-- match even when that league has no override.
create or replace view effective_results as
select
  tm.id as template_match_id,
  tm.template_id,
  tm.round,
  tm.match_number,
  tm.home_slot,
  tm.away_slot,
  tm.scheduled_at,
  l.id as league_id,
  coalesce(lro.winner_team_id, tr.winner_team_id) as winner_team_id,
  coalesce(lro.result_payload -> 'score', tr.score) as score,
  case
    when lro.id is not null then 'override'
    when tr.id is not null then tr.entered_by::text
    else null
  end as result_source,
  coalesce(lro.overridden_at, tr.entered_at) as result_entered_at
from leagues l
join template_matches tm on tm.template_id = l.template_id
left join template_results tr on tr.template_match_id = tm.id
left join league_result_overrides lro
  on lro.league_id = l.id
 and lro.template_match_id = tm.id
 and lro.status = 'active'
 and (lro.expires_at is null or lro.expires_at > statement_timestamp());

-- Keep scoring on the same league-parameterized precedence contract used by
-- result screens. Pick'em weighting remains unchanged from migration 004.
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
  select resolved.winner_team_id
  from resolve_effective_results(p.league_id) resolved
  where resolved.template_match_id = tm.id
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
  select resolved.winner_team_id
  from template_matches final_match
  join lateral resolve_effective_results(p.league_id) resolved
    on resolved.template_match_id = final_match.id
  where final_match.template_id = l.template_id
  order by final_match.round desc, final_match.match_number
  limit 1
) final_winner on true
where p.slot_id = 'champion';
