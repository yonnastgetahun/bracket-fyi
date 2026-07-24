-- ============================================================
-- Bracket.fyi — Migration 001: Initial multi-tenant schema
-- ============================================================

-- Enums
create type template_type as enum ('bracket', 'pickem');
create type result_source as enum ('organizer', 'api');
create type league_status as enum ('active', 'locked', 'complete');

-- ============================================================
-- Templates: one per competition type, shared across leagues
-- ============================================================
create table templates (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  type              template_type not null,
  topology          jsonb,
  team_registry     jsonb not null default '[]',
  schedule          jsonb,
  scoring_defaults  jsonb not null default '{}',
  results_provider  text,
  created_at        timestamptz not null default now()
);

-- ============================================================
-- Leagues: one per friend group / competition run
-- ============================================================
create table leagues (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  template_id        uuid references templates(id) on delete set null,
  organizer_token    uuid not null default gen_random_uuid(),
  join_token         uuid not null default gen_random_uuid(),
  scoring_config     jsonb not null default '{}',
  announcement_text  text,
  locked_at          timestamptz,
  status             league_status not null default 'active',
  created_at         timestamptz not null default now()
);

-- Unique constraint: tokens must be globally unique
create unique index leagues_organizer_token_idx on leagues (organizer_token);
create unique index leagues_join_token_idx on leagues (join_token);

-- ============================================================
-- Participants: one per person per league
-- ============================================================
create table participants (
  id                uuid primary key default gen_random_uuid(),
  league_id         uuid not null references leagues(id) on delete cascade,
  display_name      text not null,
  emoji             text,
  magic_token       uuid not null default gen_random_uuid(),
  push_subscription jsonb,
  created_at        timestamptz not null default now()
);

create unique index participants_magic_token_idx on participants (magic_token);
create index participants_league_id_idx on participants (league_id);

-- ============================================================
-- Picks: one row per bracket slot or pickem category per participant
-- ============================================================
create table picks (
  id             uuid primary key default gen_random_uuid(),
  league_id      uuid not null references leagues(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  slot_id        text not null,
  team_id        text not null,
  submitted_at   timestamptz not null default now(),
  locked         boolean not null default false,
  -- enforce one pick per slot per participant
  unique (participant_id, slot_id)
);

create index picks_league_id_idx on picks (league_id);
create index picks_participant_id_idx on picks (participant_id);

-- ============================================================
-- Template matches: shared schedule across all leagues on a template
-- ============================================================
create table template_matches (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references templates(id) on delete cascade,
  round         int not null check (round >= 1),
  match_number  int not null check (match_number >= 1),
  home_slot     text not null,
  away_slot     text not null,
  scheduled_at  timestamptz,
  unique (template_id, round, match_number)
);

create index template_matches_template_id_idx on template_matches (template_id);

-- ============================================================
-- Template results: shared results per template (one ingestion serves all leagues)
-- ============================================================
create table template_results (
  id                uuid primary key default gen_random_uuid(),
  template_id       uuid not null references templates(id) on delete cascade,
  template_match_id uuid not null references template_matches(id) on delete cascade,
  winner_team_id    text not null,
  score             jsonb,
  entered_by        result_source not null,
  entered_at        timestamptz not null default now(),
  unique (template_match_id)
);

create index template_results_template_id_idx on template_results (template_id);

-- ============================================================
-- League result overrides: per-league organizer overrides (always wins)
-- ============================================================
create table league_result_overrides (
  id                uuid primary key default gen_random_uuid(),
  league_id         uuid not null references leagues(id) on delete cascade,
  template_match_id uuid not null references template_matches(id) on delete cascade,
  winner_team_id    text not null,
  overridden_at     timestamptz not null default now(),
  unique (league_id, template_match_id)
);

create index league_result_overrides_league_id_idx on league_result_overrides (league_id);

-- ============================================================
-- Lock trigger: set picks.locked = true when leagues.locked_at is set
-- ============================================================
create or replace function lock_picks_on_league_lock()
returns trigger
language plpgsql
security definer
as $$
begin
  -- only fire when locked_at transitions from null to a timestamp
  if new.locked_at is not null and old.locked_at is null then
    update picks
    set locked = true
    where league_id = new.id;

    -- also update league status to locked
    new.status := 'locked';
  end if;
  return new;
end;
$$;

create trigger league_lock_trigger
  before update of locked_at on leagues
  for each row
  execute function lock_picks_on_league_lock();

-- ============================================================
-- Effective results view: override wins over template result
-- ============================================================
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
    when tr.id is not null  then tr.entered_by::text
    else null
  end as result_source,
  coalesce(lro.overridden_at, tr.entered_at) as result_entered_at
from template_matches tm
left join template_results tr
  on tr.template_match_id = tm.id
left join league_result_overrides lro
  on lro.template_match_id = tm.id;
