-- Bracket.fyi ingestion evidence and delivery domain — Slice 1B
-- Additive only: no provider is enabled and no existing result read path changes.

create table provider_bindings (
  id                   uuid primary key default gen_random_uuid(),
  provider_id          uuid not null references data_providers(id) on delete restrict,
  event_edition_id     uuid not null references event_editions(id) on delete restrict,
  binding_key          text not null,
  role                 text not null default 'primary',
  mode                 text not null default 'disabled',
  health_status        text not null default 'disabled',
  credential_ref       text,
  adapter_config       jsonb not null default '{}'::jsonb,
  poll_policy          jsonb not null default '{}'::jsonb,
  provider_cursor      jsonb not null default '{}'::jsonb,
  stale_after_seconds  integer not null default 900,
  next_poll_at         timestamptz,
  last_attempt_at      timestamptz,
  last_success_at      timestamptz,
  last_data_at         timestamptz,
  consecutive_failures integer not null default 0,
  config_version       integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (provider_id, event_edition_id, binding_key),
  unique (id, provider_id, event_edition_id),
  constraint provider_bindings_key_format
    check (binding_key ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  constraint provider_bindings_role_valid
    check (role in ('primary', 'fallback', 'shadow')),
  constraint provider_bindings_mode_valid
    check (mode in ('disabled', 'shadow', 'write')),
  constraint provider_bindings_health_valid
    check (health_status in ('disabled', 'healthy', 'degraded', 'stale')),
  constraint provider_bindings_credential_ref_not_blank
    check (credential_ref is null or btrim(credential_ref) <> ''),
  constraint provider_bindings_adapter_config_object
    check (jsonb_typeof(adapter_config) = 'object'),
  constraint provider_bindings_poll_policy_object
    check (jsonb_typeof(poll_policy) = 'object'),
  constraint provider_bindings_cursor_object
    check (jsonb_typeof(provider_cursor) = 'object'),
  constraint provider_bindings_stale_after_positive
    check (stale_after_seconds >= 60),
  constraint provider_bindings_failure_count_nonnegative
    check (consecutive_failures >= 0),
  constraint provider_bindings_config_version_positive
    check (config_version >= 1),
  constraint provider_bindings_time_order
    check (
      last_success_at is null
      or last_attempt_at is null
      or last_success_at <= last_attempt_at
    )
);

create unique index provider_bindings_primary_per_edition_idx
  on provider_bindings (event_edition_id)
  where role = 'primary';

create index provider_bindings_due_idx
  on provider_bindings (mode, next_poll_at)
  where mode <> 'disabled';

create index provider_bindings_provider_id_idx
  on provider_bindings (provider_id);

alter table provider_bindings enable row level security;

create table ingestion_runs (
  id                    uuid primary key default gen_random_uuid(),
  binding_id            uuid not null,
  provider_id           uuid not null,
  event_edition_id      uuid not null,
  claim_key             text not null unique,
  trigger_kind          text not null,
  status                text not null default 'claimed',
  claimed_by            text not null,
  lease_expires_at      timestamptz,
  started_at            timestamptz not null default now(),
  finished_at           timestamptz,
  cursor_before         jsonb,
  cursor_after          jsonb,
  fetched_count         integer not null default 0,
  normalized_count      integer not null default 0,
  unchanged_count       integer not null default 0,
  projected_count       integer not null default 0,
  quarantined_count     integer not null default 0,
  failed_count          integer not null default 0,
  http_status           integer,
  rate_limit_limit      integer,
  rate_limit_remaining  integer,
  rate_limit_reset_at   timestamptz,
  retry_after_at        timestamptz,
  error_class           text,
  error_message         text,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  unique (id, binding_id, provider_id, event_edition_id),
  foreign key (binding_id, provider_id, event_edition_id)
    references provider_bindings(id, provider_id, event_edition_id) on delete restrict,
  constraint ingestion_runs_claim_key_not_blank
    check (btrim(claim_key) <> ''),
  constraint ingestion_runs_trigger_kind_valid
    check (trigger_kind in ('schedule', 'manual', 'retry', 'replay')),
  constraint ingestion_runs_status_valid
    check (status in (
      'claimed',
      'running',
      'succeeded',
      'partial',
      'failed',
      'rate_limited',
      'canceled'
    )),
  constraint ingestion_runs_claimed_by_not_blank
    check (btrim(claimed_by) <> ''),
  constraint ingestion_runs_lifecycle_valid
    check (
      (
        status in ('claimed', 'running')
        and lease_expires_at is not null
        and finished_at is null
      )
      or
      (
        status in ('succeeded', 'partial', 'failed', 'rate_limited', 'canceled')
        and finished_at is not null
      )
    ),
  constraint ingestion_runs_time_order
    check (finished_at is null or finished_at >= started_at),
  constraint ingestion_runs_cursor_before_object
    check (cursor_before is null or jsonb_typeof(cursor_before) = 'object'),
  constraint ingestion_runs_cursor_after_object
    check (cursor_after is null or jsonb_typeof(cursor_after) = 'object'),
  constraint ingestion_runs_counts_nonnegative
    check (
      fetched_count >= 0
      and normalized_count >= 0
      and unchanged_count >= 0
      and projected_count >= 0
      and quarantined_count >= 0
      and failed_count >= 0
    ),
  constraint ingestion_runs_http_status_valid
    check (http_status is null or http_status between 100 and 599),
  constraint ingestion_runs_rate_limit_nonnegative
    check (
      (rate_limit_limit is null or rate_limit_limit >= 0)
      and (rate_limit_remaining is null or rate_limit_remaining >= 0)
      and (
        rate_limit_limit is null
        or rate_limit_remaining is null
        or rate_limit_remaining <= rate_limit_limit
      )
    ),
  constraint ingestion_runs_error_class_not_blank
    check (error_class is null or btrim(error_class) <> ''),
  constraint ingestion_runs_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create unique index ingestion_runs_one_active_per_binding_idx
  on ingestion_runs (binding_id)
  where status in ('claimed', 'running');

create index ingestion_runs_binding_started_idx
  on ingestion_runs (binding_id, started_at desc);

create index ingestion_runs_status_started_idx
  on ingestion_runs (status, started_at desc);

alter table ingestion_runs enable row level security;

create table provider_entity_refs (
  id                 uuid primary key default gen_random_uuid(),
  binding_id         uuid not null,
  provider_id        uuid not null,
  event_edition_id   uuid not null,
  entity_kind        text not null,
  external_id        text not null,
  canonical_id       uuid,
  resolution_status  text not null default 'unresolved',
  confidence         numeric(5, 4),
  reviewed_by        text,
  reviewed_at        timestamptz,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (binding_id, entity_kind, external_id),
  foreign key (binding_id, provider_id, event_edition_id)
    references provider_bindings(id, provider_id, event_edition_id) on delete restrict,
  constraint provider_entity_refs_kind_valid
    check (entity_kind in (
      'organization',
      'competition',
      'event_edition',
      'competitor',
      'event_entry',
      'stage',
      'round',
      'contest',
      'bracket'
    )),
  constraint provider_entity_refs_external_id_not_blank
    check (btrim(external_id) <> ''),
  constraint provider_entity_refs_status_valid
    check (resolution_status in ('unresolved', 'automatic', 'reviewed', 'rejected')),
  constraint provider_entity_refs_resolution_valid
    check (
      (
        resolution_status in ('automatic', 'reviewed')
        and canonical_id is not null
      )
      or
      (
        resolution_status in ('unresolved', 'rejected')
        and canonical_id is null
      )
    ),
  constraint provider_entity_refs_review_valid
    check (
      (
        resolution_status in ('reviewed', 'rejected')
        and reviewed_by is not null
        and btrim(reviewed_by) <> ''
        and reviewed_at is not null
      )
      or
      (
        resolution_status in ('unresolved', 'automatic')
        and reviewed_by is null
        and reviewed_at is null
      )
    ),
  constraint provider_entity_refs_confidence_valid
    check (confidence is null or confidence between 0 and 1),
  constraint provider_entity_refs_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index provider_entity_refs_canonical_idx
  on provider_entity_refs (entity_kind, canonical_id)
  where canonical_id is not null;

create index provider_entity_refs_unresolved_idx
  on provider_entity_refs (binding_id, entity_kind, created_at)
  where resolution_status = 'unresolved';

create or replace function validate_provider_entity_ref()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_exists boolean := false;
begin
  if new.canonical_id is null then
    return new;
  end if;

  case new.entity_kind
    when 'organization' then
      select exists (
        select 1 from organizations where id = new.canonical_id
      ) into target_exists;
    when 'competition' then
      select exists (
        select 1
        from event_editions
        where id = new.event_edition_id
          and competition_id = new.canonical_id
      ) into target_exists;
    when 'event_edition' then
      target_exists := new.canonical_id = new.event_edition_id;
    when 'competitor' then
      select exists (
        select 1
        from event_entries
        where event_edition_id = new.event_edition_id
          and competitor_id = new.canonical_id
      ) into target_exists;
    when 'event_entry' then
      select exists (
        select 1
        from event_entries
        where id = new.canonical_id
          and event_edition_id = new.event_edition_id
      ) into target_exists;
    when 'stage' then
      select exists (
        select 1
        from stages
        where id = new.canonical_id
          and event_edition_id = new.event_edition_id
      ) into target_exists;
    when 'round' then
      select exists (
        select 1
        from rounds
        where id = new.canonical_id
          and event_edition_id = new.event_edition_id
      ) into target_exists;
    when 'contest' then
      select exists (
        select 1
        from contests
        where id = new.canonical_id
          and event_edition_id = new.event_edition_id
      ) into target_exists;
    when 'bracket' then
      select exists (
        select 1
        from brackets
        where id = new.canonical_id
          and event_edition_id = new.event_edition_id
      ) into target_exists;
    else
      target_exists := false;
  end case;

  if not target_exists then
    raise exception 'canonical % target does not belong to the provider binding event edition',
      new.entity_kind
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger provider_entity_ref_target_trigger
  before insert or update of entity_kind, canonical_id, event_edition_id
  on provider_entity_refs
  for each row
  execute function validate_provider_entity_ref();

alter table provider_entity_refs enable row level security;

create table provider_observations (
  id                    uuid primary key default gen_random_uuid(),
  ingestion_run_id      uuid not null,
  binding_id            uuid not null,
  provider_id           uuid not null,
  event_edition_id      uuid not null,
  external_object_kind  text not null,
  external_object_id    text not null,
  provider_revision     text,
  provider_updated_at   timestamptz,
  received_at           timestamptz not null default now(),
  sanitization_version  integer not null default 1,
  sanitized_payload     jsonb not null,
  payload_hash          text generated always as (
    encode(digest(sanitized_payload::text, 'sha256'), 'hex')
  ) stored,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  unique (id, event_edition_id),
  unique (id, binding_id, ingestion_run_id),
  foreign key (ingestion_run_id, binding_id, provider_id, event_edition_id)
    references ingestion_runs(id, binding_id, provider_id, event_edition_id) on delete restrict,
  constraint provider_observations_object_kind_format
    check (external_object_kind ~ '^[a-z][a-z0-9._-]*$'),
  constraint provider_observations_external_id_not_blank
    check (btrim(external_object_id) <> ''),
  constraint provider_observations_revision_not_blank
    check (provider_revision is null or btrim(provider_revision) <> ''),
  constraint provider_observations_sanitization_version_positive
    check (sanitization_version >= 1),
  constraint provider_observations_payload_shape
    check (jsonb_typeof(sanitized_payload) in ('object', 'array')),
  constraint provider_observations_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create unique index provider_observations_revision_identity_idx
  on provider_observations (
    binding_id,
    external_object_kind,
    external_object_id,
    provider_revision
  )
  where provider_revision is not null;

create unique index provider_observations_hash_identity_idx
  on provider_observations (
    binding_id,
    external_object_kind,
    external_object_id,
    payload_hash
  )
  where provider_revision is null;

create index provider_observations_run_idx
  on provider_observations (ingestion_run_id, received_at);

create index provider_observations_external_idx
  on provider_observations (
    binding_id,
    external_object_kind,
    external_object_id,
    provider_updated_at desc
  );

create or replace function reject_immutable_evidence_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '% is append-only', tg_table_name
    using errcode = '55000';
end;
$$;

create trigger provider_observations_immutable_trigger
  before update or delete
  on provider_observations
  for each row
  execute function reject_immutable_evidence_change();

alter table provider_observations enable row level security;

create table ingestion_quarantine (
  id                    uuid primary key default gen_random_uuid(),
  observation_id        uuid not null,
  ingestion_run_id      uuid not null,
  binding_id            uuid not null,
  issue_code            text not null,
  severity              text not null default 'error',
  status                text not null default 'open',
  external_entity_kind  text,
  external_entity_id    text,
  candidate_ids         uuid[] not null default '{}'::uuid[],
  details               jsonb not null default '{}'::jsonb,
  opened_at             timestamptz not null default now(),
  resolved_at           timestamptz,
  resolved_by           text,
  resolution_action     text,
  resolution_note       text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (observation_id, issue_code),
  foreign key (observation_id, binding_id, ingestion_run_id)
    references provider_observations(id, binding_id, ingestion_run_id) on delete restrict,
  constraint ingestion_quarantine_issue_code_valid
    check (issue_code in (
      'mapping_missing',
      'mapping_ambiguous',
      'schema_invalid',
      'partial_payload',
      'illegal_regression',
      'conflicting_terminal_result',
      'stale_update',
      'provider_error',
      'unsupported_shape',
      'other'
    )),
  constraint ingestion_quarantine_severity_valid
    check (severity in ('info', 'warning', 'error', 'blocking')),
  constraint ingestion_quarantine_status_valid
    check (status in ('open', 'resolved', 'ignored')),
  constraint ingestion_quarantine_external_identity_paired
    check (
      (external_entity_kind is null and external_entity_id is null)
      or
      (
        external_entity_kind is not null
        and btrim(external_entity_kind) <> ''
        and external_entity_id is not null
        and btrim(external_entity_id) <> ''
      )
    ),
  constraint ingestion_quarantine_details_object
    check (jsonb_typeof(details) = 'object'),
  constraint ingestion_quarantine_resolution_valid
    check (
      (
        status = 'open'
        and resolved_at is null
        and resolved_by is null
        and resolution_action is null
      )
      or
      (
        status in ('resolved', 'ignored')
        and resolved_at is not null
        and resolved_by is not null
        and btrim(resolved_by) <> ''
        and resolution_action is not null
        and btrim(resolution_action) <> ''
      )
    ),
  constraint ingestion_quarantine_time_order
    check (resolved_at is null or resolved_at >= opened_at)
);

create index ingestion_quarantine_open_idx
  on ingestion_quarantine (binding_id, severity, opened_at)
  where status = 'open';

create index ingestion_quarantine_run_idx
  on ingestion_quarantine (ingestion_run_id, opened_at);

alter table ingestion_quarantine enable row level security;

create table contest_results (
  id                     uuid primary key default gen_random_uuid(),
  contest_id             uuid not null,
  event_edition_id       uuid not null,
  version                integer not null,
  result_status          text not null,
  outcome_type           text not null,
  winner_event_entry_id  uuid,
  score                  jsonb,
  result_data            jsonb not null default '{}'::jsonb,
  source_type            text not null,
  source_observation_id  uuid,
  provider_effective_at  timestamptz,
  accepted_at            timestamptz not null default now(),
  supersedes_result_id   uuid,
  correction_reason      text,
  idempotency_key        text not null unique,
  created_at             timestamptz not null default now(),
  unique (contest_id, version),
  unique (id, contest_id, event_edition_id),
  foreign key (contest_id, event_edition_id)
    references contests(id, event_edition_id) on delete restrict,
  foreign key (contest_id, winner_event_entry_id)
    references contest_entries(contest_id, event_entry_id) on delete restrict,
  foreign key (source_observation_id, event_edition_id)
    references provider_observations(id, event_edition_id) on delete restrict,
  foreign key (supersedes_result_id, contest_id, event_edition_id)
    references contest_results(id, contest_id, event_edition_id) on delete restrict,
  constraint contest_results_version_positive
    check (version >= 1),
  constraint contest_results_status_valid
    check (result_status in (
      'provisional',
      'final',
      'awarded',
      'canceled',
      'void',
      'unresolved'
    )),
  constraint contest_results_outcome_valid
    check (outcome_type in ('pending', 'winner', 'draw', 'no_contest')),
  constraint contest_results_winner_valid
    check (
      (outcome_type = 'winner' and winner_event_entry_id is not null)
      or
      (outcome_type <> 'winner' and winner_event_entry_id is null)
    ),
  constraint contest_results_status_outcome_valid
    check (
      (result_status = 'provisional' and outcome_type = 'pending')
      or (result_status = 'unresolved' and outcome_type = 'pending')
      or (result_status = 'final' and outcome_type in ('winner', 'draw'))
      or (result_status = 'awarded' and outcome_type = 'winner')
      or (result_status in ('canceled', 'void') and outcome_type = 'no_contest')
    ),
  constraint contest_results_score_object
    check (score is null or jsonb_typeof(score) = 'object'),
  constraint contest_results_data_object
    check (jsonb_typeof(result_data) = 'object'),
  constraint contest_results_source_type_valid
    check (source_type in ('provider', 'operator', 'system', 'backfill')),
  constraint contest_results_provider_source_valid
    check (source_type <> 'provider' or source_observation_id is not null),
  constraint contest_results_correction_reason_not_blank
    check (correction_reason is null or btrim(correction_reason) <> ''),
  constraint contest_results_idempotency_key_not_blank
    check (btrim(idempotency_key) <> '')
);

create index contest_results_contest_version_idx
  on contest_results (contest_id, version desc);

create index contest_results_observation_idx
  on contest_results (source_observation_id)
  where source_observation_id is not null;

create or replace function validate_contest_result_version()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  prior_version integer;
  latest_version integer;
begin
  select max(version)
  into latest_version
  from contest_results
  where contest_id = new.contest_id;

  latest_version := coalesce(latest_version, 0);

  if new.version <> latest_version + 1 then
    raise exception 'contest result version must be the next contiguous version'
      using errcode = '23514';
  end if;

  if new.version = 1 then
    if new.supersedes_result_id is not null then
      raise exception 'the first contest result version cannot supersede another result'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.supersedes_result_id is null then
    raise exception 'a later contest result version must identify the result it supersedes'
      using errcode = '23514';
  end if;

  select version
  into prior_version
  from contest_results
  where id = new.supersedes_result_id
    and contest_id = new.contest_id
    and event_edition_id = new.event_edition_id;

  if prior_version is distinct from new.version - 1 then
    raise exception 'a contest result must supersede the immediately prior version'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger contest_result_version_trigger
  before insert
  on contest_results
  for each row
  execute function validate_contest_result_version();

create trigger contest_results_immutable_trigger
  before update or delete
  on contest_results
  for each row
  execute function reject_immutable_evidence_change();

alter table contest_results enable row level security;

create table result_audit_events (
  id                      uuid primary key default gen_random_uuid(),
  event_edition_id        uuid not null references event_editions(id) on delete restrict,
  contest_id              uuid,
  league_id               uuid references leagues(id) on delete restrict,
  contest_result_id       uuid,
  provider_observation_id uuid,
  event_type              text not null,
  actor_type              text not null,
  provider_id             uuid references data_providers(id) on delete restrict,
  actor_reference         text,
  organizer_fingerprint   text,
  idempotency_key         text not null unique,
  previous_state          jsonb,
  new_state               jsonb,
  details                 jsonb not null default '{}'::jsonb,
  occurred_at             timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  unique (id, event_edition_id),
  foreign key (contest_id, event_edition_id)
    references contests(id, event_edition_id) on delete restrict,
  foreign key (contest_result_id, contest_id, event_edition_id)
    references contest_results(id, contest_id, event_edition_id) on delete restrict,
  foreign key (provider_observation_id, event_edition_id)
    references provider_observations(id, event_edition_id) on delete restrict,
  constraint result_audit_events_event_type_format
    check (event_type ~ '^[a-z][a-z0-9._-]*$'),
  constraint result_audit_events_actor_type_valid
    check (actor_type in ('provider', 'organizer', 'operator', 'system')),
  constraint result_audit_events_actor_reference_not_blank
    check (actor_reference is null or btrim(actor_reference) <> ''),
  constraint result_audit_events_organizer_fingerprint_format
    check (
      organizer_fingerprint is null
      or organizer_fingerprint ~ '^[a-f0-9]{64}$'
    ),
  constraint result_audit_events_actor_valid
    check (
      (
        actor_type = 'provider'
        and provider_id is not null
        and organizer_fingerprint is null
      )
      or
      (
        actor_type = 'organizer'
        and provider_id is null
        and league_id is not null
        and organizer_fingerprint is not null
      )
      or
      (
        actor_type in ('operator', 'system')
        and provider_id is null
        and organizer_fingerprint is null
        and actor_reference is not null
      )
    ),
  constraint result_audit_events_idempotency_key_not_blank
    check (btrim(idempotency_key) <> ''),
  constraint result_audit_events_previous_state_object
    check (previous_state is null or jsonb_typeof(previous_state) = 'object'),
  constraint result_audit_events_new_state_object
    check (new_state is null or jsonb_typeof(new_state) = 'object'),
  constraint result_audit_events_details_object
    check (jsonb_typeof(details) = 'object')
);

create index result_audit_events_contest_idx
  on result_audit_events (contest_id, occurred_at desc)
  where contest_id is not null;

create index result_audit_events_league_idx
  on result_audit_events (league_id, occurred_at desc)
  where league_id is not null;

create index result_audit_events_observation_idx
  on result_audit_events (provider_observation_id)
  where provider_observation_id is not null;

create trigger result_audit_events_immutable_trigger
  before update or delete
  on result_audit_events
  for each row
  execute function reject_immutable_evidence_change();

alter table result_audit_events enable row level security;

create table league_completion_holds (
  id                     uuid primary key default gen_random_uuid(),
  league_id              uuid not null references leagues(id) on delete restrict,
  event_edition_id       uuid not null references event_editions(id) on delete restrict,
  hold_key               text not null,
  status                 text not null default 'active',
  reason                 text not null,
  created_by_fingerprint text not null,
  idempotency_key        text not null unique,
  expires_at             timestamptz,
  ended_at               timestamptz,
  ended_by_actor_type    text,
  ended_by_fingerprint   text,
  end_reason             text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint league_completion_holds_key_format
    check (hold_key ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  constraint league_completion_holds_status_valid
    check (status in ('active', 'released', 'expired')),
  constraint league_completion_holds_reason_not_blank
    check (btrim(reason) <> ''),
  constraint league_completion_holds_creator_fingerprint_format
    check (created_by_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint league_completion_holds_idempotency_key_not_blank
    check (btrim(idempotency_key) <> ''),
  constraint league_completion_holds_expiry_order
    check (expires_at is null or expires_at > created_at),
  constraint league_completion_holds_end_valid
    check (
      (
        status = 'active'
        and ended_at is null
        and ended_by_actor_type is null
        and ended_by_fingerprint is null
        and end_reason is null
      )
      or
      (
        status = 'released'
        and ended_at is not null
        and ended_by_actor_type = 'organizer'
        and ended_by_fingerprint ~ '^[a-f0-9]{64}$'
        and end_reason is not null
        and btrim(end_reason) <> ''
      )
      or
      (
        status = 'expired'
        and ended_at is not null
        and ended_by_actor_type = 'system'
        and ended_by_fingerprint is null
        and end_reason is not null
        and btrim(end_reason) <> ''
      )
    ),
  constraint league_completion_holds_end_order
    check (ended_at is null or ended_at >= created_at)
);

create unique index league_completion_holds_active_key_idx
  on league_completion_holds (league_id, hold_key)
  where status = 'active';

create index league_completion_holds_active_league_idx
  on league_completion_holds (league_id, created_at)
  where status = 'active';

create or replace function validate_completion_hold_edition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from leagues l
    join templates t on t.id = l.template_id
    where l.id = new.league_id
      and t.event_edition_id = new.event_edition_id
  ) then
    raise exception 'completion hold edition must match the league template edition'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger league_completion_hold_edition_trigger
  before insert or update of league_id, event_edition_id
  on league_completion_holds
  for each row
  execute function validate_completion_hold_edition();

alter table league_completion_holds enable row level security;

create table notification_outbox (
  id                    uuid primary key default gen_random_uuid(),
  event_edition_id      uuid not null references event_editions(id) on delete restrict,
  league_id             uuid references leagues(id) on delete restrict,
  participant_id        uuid references participants(id) on delete restrict,
  contest_id            uuid,
  contest_result_id     uuid,
  audit_event_id        uuid not null,
  intent_type           text not null,
  audience_kind         text not null,
  payload               jsonb not null,
  destination_path      text,
  idempotency_key       text not null unique,
  status                text not null default 'pending',
  available_at          timestamptz not null default now(),
  expires_at            timestamptz,
  claimed_at            timestamptz,
  claimed_by            text,
  processed_at          timestamptz,
  attempt_count         integer not null default 0,
  last_error_class      text,
  last_error_message    text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  foreign key (contest_id, event_edition_id)
    references contests(id, event_edition_id) on delete restrict,
  foreign key (contest_result_id, contest_id, event_edition_id)
    references contest_results(id, contest_id, event_edition_id) on delete restrict,
  foreign key (audit_event_id, event_edition_id)
    references result_audit_events(id, event_edition_id) on delete restrict,
  constraint notification_outbox_intent_type_valid
    check (intent_type in (
      'result_final',
      'result_correction',
      'league_complete',
      'league_reopened',
      'provider_stale',
      'provider_recovered',
      'broadcast'
    )),
  constraint notification_outbox_audience_kind_valid
    check (audience_kind in ('league', 'participant', 'operator')),
  constraint notification_outbox_audience_valid
    check (
      (audience_kind = 'league' and league_id is not null and participant_id is null)
      or
      (audience_kind = 'participant' and league_id is not null and participant_id is not null)
      or
      (audience_kind = 'operator' and league_id is null and participant_id is null)
    ),
  constraint notification_outbox_payload_object
    check (jsonb_typeof(payload) = 'object'),
  constraint notification_outbox_destination_relative
    check (
      destination_path is null
      or destination_path ~ '^/[^[:space:]]*$'
    ),
  constraint notification_outbox_idempotency_key_not_blank
    check (btrim(idempotency_key) <> ''),
  constraint notification_outbox_status_valid
    check (status in (
      'pending',
      'processing',
      'sent',
      'partially_sent',
      'failed',
      'canceled'
    )),
  constraint notification_outbox_expiry_order
    check (expires_at is null or expires_at > created_at),
  constraint notification_outbox_processing_state_valid
    check (
      (
        status = 'pending'
        and claimed_at is null
        and claimed_by is null
        and processed_at is null
      )
      or
      (
        status = 'processing'
        and claimed_at is not null
        and claimed_by is not null
        and btrim(claimed_by) <> ''
        and processed_at is null
      )
      or
      (
        status in ('sent', 'partially_sent', 'failed', 'canceled')
        and processed_at is not null
      )
    ),
  constraint notification_outbox_attempt_count_nonnegative
    check (attempt_count >= 0),
  constraint notification_outbox_last_error_class_not_blank
    check (last_error_class is null or btrim(last_error_class) <> '')
);

create index notification_outbox_due_idx
  on notification_outbox (available_at, created_at)
  where status = 'pending';

create index notification_outbox_league_idx
  on notification_outbox (league_id, created_at desc)
  where league_id is not null;

create index notification_outbox_audit_event_idx
  on notification_outbox (audit_event_id);

create or replace function validate_notification_audience()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.league_id is not null and not exists (
    select 1
    from leagues l
    join templates t on t.id = l.template_id
    where l.id = new.league_id
      and t.event_edition_id = new.event_edition_id
  ) then
    raise exception 'notification league must belong to the intent event edition'
      using errcode = '23514';
  end if;

  if new.participant_id is not null and not exists (
    select 1
    from participants
    where id = new.participant_id
      and league_id = new.league_id
  ) then
    raise exception 'notification participant must belong to the target league'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger notification_outbox_audience_trigger
  before insert or update of event_edition_id, league_id, participant_id
  on notification_outbox
  for each row
  execute function validate_notification_audience();

alter table notification_outbox enable row level security;

create table notification_attempts (
  id                      uuid primary key default gen_random_uuid(),
  outbox_id               uuid not null references notification_outbox(id) on delete restrict,
  participant_id          uuid references participants(id) on delete restrict,
  endpoint_fingerprint    text not null,
  attempt_number          integer not null,
  idempotency_key         text not null unique,
  status                  text not null default 'pending',
  http_status             integer,
  push_service_message_id text,
  started_at              timestamptz not null default now(),
  finished_at             timestamptz,
  retry_at                timestamptz,
  error_class             text,
  error_message           text,
  metadata                jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (outbox_id, endpoint_fingerprint, attempt_number),
  constraint notification_attempts_endpoint_fingerprint_format
    check (endpoint_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint notification_attempts_attempt_number_positive
    check (attempt_number >= 1),
  constraint notification_attempts_idempotency_key_not_blank
    check (btrim(idempotency_key) <> ''),
  constraint notification_attempts_status_valid
    check (status in (
      'pending',
      'sent',
      'transient_failure',
      'permanent_failure',
      'pruned',
      'skipped'
    )),
  constraint notification_attempts_http_status_valid
    check (http_status is null or http_status between 100 and 599),
  constraint notification_attempts_message_id_not_blank
    check (
      push_service_message_id is null
      or btrim(push_service_message_id) <> ''
    ),
  constraint notification_attempts_lifecycle_valid
    check (
      (status = 'pending' and finished_at is null)
      or (status <> 'pending' and finished_at is not null)
    ),
  constraint notification_attempts_time_order
    check (finished_at is null or finished_at >= started_at),
  constraint notification_attempts_retry_valid
    check (
      (status = 'transient_failure' and retry_at is not null)
      or (status <> 'transient_failure' and retry_at is null)
    ),
  constraint notification_attempts_error_class_not_blank
    check (error_class is null or btrim(error_class) <> ''),
  constraint notification_attempts_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index notification_attempts_outbox_idx
  on notification_attempts (outbox_id, attempt_number);

create index notification_attempts_retry_idx
  on notification_attempts (retry_at)
  where status = 'transient_failure';

create or replace function validate_notification_attempt_participant()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_league_id uuid;
begin
  if new.participant_id is null then
    return new;
  end if;

  select league_id
  into target_league_id
  from notification_outbox
  where id = new.outbox_id;

  if target_league_id is null or not exists (
    select 1
    from participants
    where id = new.participant_id
      and league_id = target_league_id
  ) then
    raise exception 'notification attempt participant must belong to the outbox league'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger notification_attempt_participant_trigger
  before insert or update of outbox_id, participant_id
  on notification_attempts
  for each row
  execute function validate_notification_attempt_participant();

alter table notification_attempts enable row level security;

revoke all privileges on table
  provider_bindings,
  provider_entity_refs,
  ingestion_runs,
  provider_observations,
  ingestion_quarantine,
  contest_results,
  result_audit_events,
  notification_outbox,
  notification_attempts,
  league_completion_holds
from anon, authenticated;

grant select, insert on table
  provider_bindings,
  provider_entity_refs,
  ingestion_runs,
  provider_observations,
  ingestion_quarantine,
  contest_results,
  result_audit_events,
  notification_outbox,
  notification_attempts,
  league_completion_holds
to service_role;

grant update on table
  provider_bindings,
  provider_entity_refs,
  ingestion_runs,
  ingestion_quarantine,
  notification_outbox,
  notification_attempts,
  league_completion_holds
to service_role;
