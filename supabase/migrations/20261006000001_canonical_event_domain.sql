-- Bracket.fyi canonical event domain — Slice 1A
-- Additive only: existing template, league, pick, and scoring reads remain intact.

create table data_providers (
  id               uuid primary key default gen_random_uuid(),
  adapter_key      text not null unique,
  display_name     text not null,
  terms_url        text,
  attribution_text text,
  enabled          boolean not null default false,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint data_providers_adapter_key_format
    check (adapter_key ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  constraint data_providers_display_name_not_blank
    check (btrim(display_name) <> ''),
  constraint data_providers_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

alter table data_providers enable row level security;

create table organizations (
  id               uuid primary key default gen_random_uuid(),
  organization_key text not null unique,
  name             text not null,
  kind             text not null default 'other',
  official_url     text,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint organizations_key_format
    check (organization_key ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  constraint organizations_name_not_blank
    check (btrim(name) <> ''),
  constraint organizations_kind_valid
    check (kind in ('governing_body', 'league', 'conference', 'studio', 'academy', 'owner', 'other')),
  constraint organizations_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create table competitions (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid references organizations(id) on delete set null,
  competition_key    text not null unique,
  name               text not null,
  domain             text not null,
  sport_code         text,
  official_url       text,
  rules_metadata     jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint competitions_key_format
    check (competition_key ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  constraint competitions_name_not_blank
    check (btrim(name) <> ''),
  constraint competitions_domain_valid
    check (domain in ('sport', 'awards', 'other')),
  constraint competitions_sport_code_not_blank
    check (sport_code is null or btrim(sport_code) <> ''),
  constraint competitions_rules_metadata_object
    check (jsonb_typeof(rules_metadata) = 'object')
);

create index competitions_organization_id_idx
  on competitions (organization_id);

create table event_editions (
  id               uuid primary key default gen_random_uuid(),
  competition_id   uuid not null references competitions(id) on delete restrict,
  edition_key      text not null,
  name             text not null,
  season_label     text not null,
  timezone         text not null default 'UTC',
  status           text not null default 'planned',
  starts_at        timestamptz,
  ends_at          timestamptz,
  official_url     text,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (competition_id, edition_key),
  unique (id, competition_id),
  constraint event_editions_key_format
    check (edition_key ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  constraint event_editions_name_not_blank
    check (btrim(name) <> ''),
  constraint event_editions_season_label_not_blank
    check (btrim(season_label) <> ''),
  constraint event_editions_timezone_not_blank
    check (btrim(timezone) <> ''),
  constraint event_editions_status_valid
    check (status in ('planned', 'scheduled', 'active', 'complete', 'canceled')),
  constraint event_editions_date_order
    check (ends_at is null or starts_at is null or ends_at >= starts_at),
  constraint event_editions_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index event_editions_competition_id_idx
  on event_editions (competition_id);

alter table organizations enable row level security;
alter table competitions enable row level security;
alter table event_editions enable row level security;

create table competitors (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references organizations(id) on delete set null,
  competitor_key   text not null unique,
  kind             text not null,
  canonical_name   text not null,
  short_name       text,
  country_code     text,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint competitors_key_format
    check (competitor_key ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  constraint competitors_kind_valid
    check (kind in (
      'team',
      'national_side',
      'school',
      'person',
      'film',
      'song',
      'album',
      'other_work',
      'other'
    )),
  constraint competitors_canonical_name_not_blank
    check (btrim(canonical_name) <> ''),
  constraint competitors_short_name_not_blank
    check (short_name is null or btrim(short_name) <> ''),
  constraint competitors_country_code_format
    check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  constraint competitors_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index competitors_organization_id_idx
  on competitors (organization_id);

create table competitor_aliases (
  id               uuid primary key default gen_random_uuid(),
  competitor_id    uuid not null references competitors(id) on delete cascade,
  organization_id  uuid references organizations(id) on delete set null,
  domain           text not null default 'global',
  alias            text not null,
  normalized_alias text not null,
  locale           text not null default 'und',
  source           text not null default 'manual',
  reviewed         boolean not null default false,
  valid_from       date,
  valid_to         date,
  created_at       timestamptz not null default now(),
  constraint competitor_aliases_domain_not_blank
    check (btrim(domain) <> ''),
  constraint competitor_aliases_alias_not_blank
    check (btrim(alias) <> ''),
  constraint competitor_aliases_normalized_not_blank
    check (btrim(normalized_alias) <> ''),
  constraint competitor_aliases_normalized_canonical
    check (normalized_alias = lower(btrim(normalized_alias))),
  constraint competitor_aliases_locale_not_blank
    check (btrim(locale) <> ''),
  constraint competitor_aliases_source_valid
    check (source in ('official', 'provider', 'manual', 'historical')),
  constraint competitor_aliases_date_order
    check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create unique index competitor_aliases_context_unique_idx
  on competitor_aliases (domain, organization_id, normalized_alias, locale)
  nulls not distinct;

create index competitor_aliases_competitor_id_idx
  on competitor_aliases (competitor_id);

create table event_entries (
  id               uuid primary key default gen_random_uuid(),
  event_edition_id uuid not null references event_editions(id) on delete cascade,
  competitor_id    uuid not null references competitors(id) on delete restrict,
  seed             integer,
  region           text,
  conference       text,
  role             text not null default 'competitor',
  status           text not null default 'confirmed',
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (event_edition_id, competitor_id),
  unique (id, event_edition_id),
  constraint event_entries_seed_positive
    check (seed is null or seed >= 1),
  constraint event_entries_region_not_blank
    check (region is null or btrim(region) <> ''),
  constraint event_entries_conference_not_blank
    check (conference is null or btrim(conference) <> ''),
  constraint event_entries_role_not_blank
    check (btrim(role) <> ''),
  constraint event_entries_status_valid
    check (status in ('invited', 'confirmed', 'withdrawn', 'disqualified')),
  constraint event_entries_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index event_entries_event_edition_id_idx
  on event_entries (event_edition_id);

create index event_entries_competitor_id_idx
  on event_entries (competitor_id);

alter table competitors enable row level security;
alter table competitor_aliases enable row level security;
alter table event_entries enable row level security;

create table stages (
  id               uuid primary key default gen_random_uuid(),
  event_edition_id uuid not null references event_editions(id) on delete cascade,
  parent_stage_id  uuid,
  stage_key        text not null,
  name             text not null,
  kind             text not null default 'other',
  ordinal          integer not null,
  starts_at        timestamptz,
  ends_at          timestamptz,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (event_edition_id, stage_key),
  unique (id, event_edition_id),
  foreign key (parent_stage_id, event_edition_id)
    references stages(id, event_edition_id) on delete restrict,
  constraint stages_key_format
    check (stage_key ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  constraint stages_name_not_blank
    check (btrim(name) <> ''),
  constraint stages_kind_valid
    check (kind in ('league', 'group', 'knockout', 'playoffs', 'nominations', 'ceremony', 'other')),
  constraint stages_ordinal_positive
    check (ordinal >= 1),
  constraint stages_date_order
    check (ends_at is null or starts_at is null or ends_at >= starts_at),
  constraint stages_not_self_parent
    check (parent_stage_id is null or parent_stage_id <> id),
  constraint stages_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index stages_event_edition_id_idx
  on stages (event_edition_id);

create index stages_parent_stage_id_idx
  on stages (parent_stage_id);

create table rounds (
  id               uuid primary key default gen_random_uuid(),
  event_edition_id uuid not null references event_editions(id) on delete cascade,
  stage_id         uuid not null,
  round_key        text not null,
  name             text not null,
  ordinal          integer not null,
  provider_label   text,
  starts_at        timestamptz,
  ends_at          timestamptz,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (stage_id, round_key),
  unique (stage_id, ordinal),
  unique (id, stage_id, event_edition_id),
  foreign key (stage_id, event_edition_id)
    references stages(id, event_edition_id) on delete cascade,
  constraint rounds_key_format
    check (round_key ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  constraint rounds_name_not_blank
    check (btrim(name) <> ''),
  constraint rounds_ordinal_positive
    check (ordinal >= 1),
  constraint rounds_provider_label_not_blank
    check (provider_label is null or btrim(provider_label) <> ''),
  constraint rounds_date_order
    check (ends_at is null or starts_at is null or ends_at >= starts_at),
  constraint rounds_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index rounds_event_edition_id_idx
  on rounds (event_edition_id);

create index rounds_stage_id_idx
  on rounds (stage_id);

create table contests (
  id                      uuid primary key default gen_random_uuid(),
  event_edition_id        uuid not null references event_editions(id) on delete cascade,
  stage_id                uuid not null,
  round_id                uuid,
  parent_contest_id       uuid,
  contest_key             text not null,
  name                    text not null,
  kind                    text not null,
  status                  text not null default 'scheduled',
  scheduled_at            timestamptz,
  starts_at               timestamptz,
  ends_at                 timestamptz,
  best_of                 integer,
  required_for_completion boolean not null default true,
  metadata                jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (event_edition_id, contest_key),
  unique (id, event_edition_id),
  unique (id, stage_id, event_edition_id),
  foreign key (stage_id, event_edition_id)
    references stages(id, event_edition_id) on delete cascade,
  foreign key (round_id, stage_id, event_edition_id)
    references rounds(id, stage_id, event_edition_id) on delete restrict,
  foreign key (parent_contest_id, stage_id, event_edition_id)
    references contests(id, stage_id, event_edition_id) on delete restrict,
  constraint contests_key_format
    check (contest_key ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  constraint contests_name_not_blank
    check (btrim(name) <> ''),
  constraint contests_kind_valid
    check (kind in ('game', 'match', 'series', 'tie', 'award', 'category')),
  constraint contests_status_valid
    check (status in (
      'scheduled',
      'pregame',
      'live',
      'suspended',
      'postponed',
      'final',
      'canceled',
      'void'
    )),
  constraint contests_time_order
    check (ends_at is null or starts_at is null or ends_at >= starts_at),
  constraint contests_best_of_positive
    check (best_of is null or best_of >= 1),
  constraint contests_not_self_parent
    check (parent_contest_id is null or parent_contest_id <> id),
  constraint contests_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index contests_event_edition_id_idx
  on contests (event_edition_id);

create index contests_stage_id_idx
  on contests (stage_id);

create index contests_round_id_idx
  on contests (round_id);

create index contests_parent_contest_id_idx
  on contests (parent_contest_id);

alter table stages enable row level security;
alter table rounds enable row level security;
alter table contests enable row level security;

create table contest_entries (
  id               uuid primary key default gen_random_uuid(),
  event_edition_id uuid not null references event_editions(id) on delete cascade,
  contest_id       uuid not null,
  event_entry_id   uuid not null,
  role             text not null,
  side             text,
  ordinal          integer not null,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  unique (contest_id, event_entry_id),
  unique (contest_id, ordinal),
  foreign key (contest_id, event_edition_id)
    references contests(id, event_edition_id) on delete cascade,
  foreign key (event_entry_id, event_edition_id)
    references event_entries(id, event_edition_id) on delete restrict,
  constraint contest_entries_role_not_blank
    check (btrim(role) <> ''),
  constraint contest_entries_side_not_blank
    check (side is null or btrim(side) <> ''),
  constraint contest_entries_ordinal_positive
    check (ordinal >= 1),
  constraint contest_entries_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index contest_entries_event_edition_id_idx
  on contest_entries (event_edition_id);

create index contest_entries_event_entry_id_idx
  on contest_entries (event_entry_id);

create table brackets (
  id               uuid primary key default gen_random_uuid(),
  event_edition_id uuid not null references event_editions(id) on delete cascade,
  stage_id         uuid,
  bracket_key      text not null,
  name             text not null,
  kind             text not null,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (event_edition_id, bracket_key),
  unique (id, event_edition_id),
  foreign key (stage_id, event_edition_id)
    references stages(id, event_edition_id) on delete restrict,
  constraint brackets_key_format
    check (bracket_key ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  constraint brackets_name_not_blank
    check (btrim(name) <> ''),
  constraint brackets_kind_valid
    check (kind in (
      'single_elimination',
      'double_elimination',
      'reseeded',
      'knockout',
      'custom'
    )),
  constraint brackets_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index brackets_event_edition_id_idx
  on brackets (event_edition_id);

create index brackets_stage_id_idx
  on brackets (stage_id);

create table bracket_edges (
  id               uuid primary key default gen_random_uuid(),
  bracket_id       uuid not null,
  event_edition_id uuid not null references event_editions(id) on delete cascade,
  from_contest_id  uuid not null,
  to_contest_id    uuid not null,
  outcome          text not null,
  target_role      text not null,
  priority         integer not null default 1,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  unique (bracket_id, from_contest_id, to_contest_id, outcome, target_role),
  foreign key (bracket_id, event_edition_id)
    references brackets(id, event_edition_id) on delete cascade,
  foreign key (from_contest_id, event_edition_id)
    references contests(id, event_edition_id) on delete cascade,
  foreign key (to_contest_id, event_edition_id)
    references contests(id, event_edition_id) on delete cascade,
  constraint bracket_edges_outcome_valid
    check (outcome in ('winner', 'loser', 'qualifier', 'seed', 'placement')),
  constraint bracket_edges_target_role_not_blank
    check (btrim(target_role) <> ''),
  constraint bracket_edges_priority_positive
    check (priority >= 1),
  constraint bracket_edges_not_self_referential
    check (from_contest_id <> to_contest_id),
  constraint bracket_edges_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index bracket_edges_event_edition_id_idx
  on bracket_edges (event_edition_id);

create index bracket_edges_from_contest_id_idx
  on bracket_edges (from_contest_id);

create index bracket_edges_to_contest_id_idx
  on bracket_edges (to_contest_id);

alter table contest_entries enable row level security;
alter table brackets enable row level security;
alter table bracket_edges enable row level security;

alter table templates
  add column event_edition_id uuid
    references event_editions(id) on delete restrict;

create index templates_event_edition_id_idx
  on templates (event_edition_id);

alter table template_matches
  add column contest_id uuid
    references contests(id) on delete set null,
  add column counts_toward_completion boolean not null default true;

create unique index template_matches_template_contest_unique_idx
  on template_matches (template_id, contest_id)
  where contest_id is not null;

create index template_matches_contest_id_idx
  on template_matches (contest_id);

create or replace function enforce_template_match_contest_edition()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  template_edition_id uuid;
  contest_edition_id uuid;
begin
  if new.contest_id is null then
    return new;
  end if;

  select t.event_edition_id, c.event_edition_id
  into template_edition_id, contest_edition_id
  from templates t
  cross join contests c
  where t.id = new.template_id
    and c.id = new.contest_id;

  -- Missing referenced rows are handled by their foreign keys.
  if not found then
    return new;
  end if;

  if template_edition_id is null then
    raise exception 'template must have an event edition before linking a contest'
      using errcode = '23514';
  end if;

  if template_edition_id is distinct from contest_edition_id then
    raise exception 'template and contest must belong to the same event edition'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger template_match_contest_edition_trigger
  before insert or update of template_id, contest_id
  on template_matches
  for each row
  execute function enforce_template_match_contest_edition();

create or replace function enforce_template_edition_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.event_edition_id is not distinct from old.event_edition_id then
    return new;
  end if;

  if exists (
    select 1
    from template_matches tm
    join contests c on c.id = tm.contest_id
    where tm.template_id = new.id
      and c.event_edition_id is distinct from new.event_edition_id
  ) then
    raise exception 'template edition conflicts with an existing contest link'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger template_edition_change_trigger
  before update of event_edition_id
  on templates
  for each row
  execute function enforce_template_edition_change();
