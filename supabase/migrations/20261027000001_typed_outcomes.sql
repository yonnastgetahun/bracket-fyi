-- P2 bounded typed outcomes packet. Does not activate legacy readers/scorers.
-- Nomination identity is independent of credits: one person/work may occur in
-- multiple nominations in the same category. Eligibility is an immutable fact.
begin;

create table public.award_nominations (
  id uuid primary key default gen_random_uuid(),
  event_edition_id uuid not null,
  contest_id uuid not null,
  nomination_key text not null check (nomination_key ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  name text not null check (btrim(name) <> ''),
  eligible boolean not null default true,
  created_at timestamptz not null default now(),
  unique (contest_id, nomination_key),
  unique (id, contest_id, event_edition_id),
  foreign key (contest_id, event_edition_id)
    references public.contests(id, event_edition_id) on delete restrict
);

create table public.award_nomination_credits (
  nomination_id uuid not null,
  contest_id uuid not null,
  event_edition_id uuid not null,
  event_entry_id uuid not null,
  credit_role text not null check (btrim(credit_role) <> ''),
  primary key (nomination_id, event_entry_id, credit_role),
  foreign key (nomination_id, contest_id, event_edition_id)
    references public.award_nominations(id, contest_id, event_edition_id) on delete restrict,
  foreign key (event_entry_id, event_edition_id)
    references public.event_entries(id, event_edition_id) on delete restrict
);

create function public.validate_award_nomination_category()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.contests
  where id = new.contest_id and event_edition_id = new.event_edition_id
    and kind in ('award', 'category') for share;
  if not found then
    raise exception 'nomination requires an award/category in its edition' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger award_nomination_category
before insert on public.award_nominations
for each row execute function public.validate_award_nomination_category();

create function public.protect_award_category_kind()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.kind not in ('award', 'category') and exists (
    select 1 from public.award_nominations where contest_id = old.id
  ) then
    raise exception 'a nominated category cannot become a non-awards contest' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger protect_award_category_kind
before update of kind on public.contests
for each row execute function public.protect_award_category_kind();

create trigger award_nominations_immutable
before update or delete on public.award_nominations
for each row execute function public.reject_immutable_evidence_change();
create trigger award_nomination_credits_immutable
before update or delete on public.award_nomination_credits
for each row execute function public.reject_immutable_evidence_change();

alter table public.contest_results add column winner_nomination_ids uuid[];
alter table public.contest_results drop constraint contest_results_outcome_valid;
alter table public.contest_results add constraint contest_results_outcome_valid
  check (outcome_type in ('pending', 'winner', 'draw', 'no_contest', 'winner_set'));
alter table public.contest_results drop constraint contest_results_status_outcome_valid;
alter table public.contest_results add constraint contest_results_status_outcome_valid check (
  (result_status in ('provisional', 'unresolved') and outcome_type = 'pending')
  or (result_status = 'final' and outcome_type in ('winner', 'draw', 'winner_set'))
  or (result_status = 'awarded' and outcome_type in ('winner', 'winner_set'))
  or (result_status in ('canceled', 'void') and outcome_type = 'no_contest')
);
-- NULL remains the representation for non-set outcomes. Old winner constraint
-- already forbids a scalar winner for a winner_set.
alter table public.contest_results add constraint contest_results_nomination_set_shape check (
  (outcome_type <> 'winner_set' and winner_nomination_ids is null)
  or (outcome_type = 'winner_set' and winner_nomination_ids is not null
      and cardinality(winner_nomination_ids) > 0
      and array_ndims(winner_nomination_ids) = 1
      and array_lower(winner_nomination_ids, 1) = 1)
);

create function public.validate_contest_result_nomination_set()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare member_count integer;
begin
  if new.outcome_type <> 'winner_set' then return new; end if;
  if new.winner_nomination_ids is null
     or cardinality(new.winner_nomination_ids) = 0
     or array_ndims(new.winner_nomination_ids) <> 1
     or array_lower(new.winner_nomination_ids, 1) <> 1
     or exists (select 1 from unnest(new.winner_nomination_ids) n where n is null)
     or cardinality(new.winner_nomination_ids) <> (
       select count(distinct n) from unnest(new.winner_nomination_ids) n
     ) then
    raise exception 'winner_set requires a nonempty distinct nomination ID set' using errcode = '23514';
  end if;
  -- Immutable nominations and revoked truncate/update/delete grants retain
  -- membership for all historical results. Row locks also serialize with DDL/
  -- owner deletes; no unchecked JSON membership or arbitrary scalar fallback.
  perform 1 from public.award_nominations n
    where n.id = any(new.winner_nomination_ids)
      and n.contest_id = new.contest_id
      and n.event_edition_id = new.event_edition_id and n.eligible
    for key share;
  get diagnostics member_count = row_count;
  if member_count <> cardinality(new.winner_nomination_ids) then
    raise exception 'winner_set members must be eligible nominations in this edition/category'
      using errcode = '23514';
  end if;
  -- A set has a deterministic storage order independent of provider order.
  select array_agg(n order by n) into new.winner_nomination_ids
    from unnest(new.winner_nomination_ids) n;
  return new;
end;
$$;
create trigger contest_result_nomination_set
before insert on public.contest_results
for each row execute function public.validate_contest_result_nomination_set();

-- Opt-in compatibility envelope, service-only. Existing application readers
-- MUST adopt this capability gate before activating winner_set categories.
-- This is a canonical-result projection, NOT a league effective-result resolver.
create function public.read_contest_result_typed(p_result_id uuid, p_supports_winner_set boolean default false)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select case
    when r.outcome_type = 'winner_set' and not coalesce(p_supports_winner_set, false)
      then jsonb_build_object('status', 'unsupported_format', 'requiredCapability', 'winner_set', 'resultId', r.id)
    else jsonb_build_object('status', 'ok', 'resultId', r.id, 'version', r.version,
      'resultStatus', r.result_status, 'outcomeType', r.outcome_type,
      'winnerEventEntryId', r.winner_event_entry_id, 'winnerNominationIds', r.winner_nomination_ids)
    end
  from public.contest_results r where r.id = p_result_id;
$$;

alter table public.award_nominations enable row level security;
alter table public.award_nomination_credits enable row level security;
revoke all on public.award_nominations, public.award_nomination_credits from public, anon, authenticated, service_role;
grant select, insert on public.award_nominations, public.award_nomination_credits to service_role;
revoke all on function public.validate_award_nomination_category(),
  public.protect_award_category_kind(), public.validate_contest_result_nomination_set(),
  public.read_contest_result_typed(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.read_contest_result_typed(uuid, boolean) to service_role;

comment on column public.contest_results.winner_nomination_ids is
  'Authoritative immutable typed set of eligible canonical nomination UUIDs; trigger-enforced edition/category membership. Never derive a scalar winner.';
commit;
