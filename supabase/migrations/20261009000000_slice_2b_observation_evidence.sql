-- Bracket.fyi Slice 2B.3 — immutable evidence conflicts and atomic identity boundaries.
-- Forward-only. Existing Slice 1B tables remain unchanged.

create table provider_observation_conflicts (
  id                    uuid primary key default gen_random_uuid(),
  original_observation_id uuid not null,
  ingestion_run_id      uuid not null,
  binding_id            uuid not null,
  provider_id           uuid not null,
  event_edition_id      uuid not null,
  external_object_kind  text not null,
  external_object_id    text not null,
  provider_revision     text,
  provider_updated_at   timestamptz,
  received_at           timestamptz not null,
  sanitization_version  integer not null,
  sanitized_payload     jsonb not null,
  payload_hash          text generated always as (
    encode(extensions.digest(sanitized_payload::text, 'sha256'), 'hex')
  ) stored,
  normalized_snapshot   jsonb not null,
  conflict_reason       text not null,
  created_at            timestamptz not null default now(),
  unique (original_observation_id, payload_hash),
  foreign key (original_observation_id, event_edition_id)
    references provider_observations(id, event_edition_id) on delete restrict,
  foreign key (ingestion_run_id, binding_id, provider_id, event_edition_id)
    references ingestion_runs(id, binding_id, provider_id, event_edition_id) on delete restrict,
  constraint provider_observation_conflicts_kind_format
    check (external_object_kind ~ '^[a-z][a-z0-9._-]*$'),
  constraint provider_observation_conflicts_external_id_not_blank
    check (btrim(external_object_id) <> ''),
  constraint provider_observation_conflicts_revision_not_blank
    check (provider_revision is null or btrim(provider_revision) <> ''),
  constraint provider_observation_conflicts_sanitization_positive
    check (sanitization_version >= 1),
  constraint provider_observation_conflicts_payload_shape
    check (jsonb_typeof(sanitized_payload) in ('object', 'array')),
  constraint provider_observation_conflicts_snapshot_object
    check (jsonb_typeof(normalized_snapshot) = 'object'),
  constraint provider_observation_conflicts_reason_not_blank
    check (btrim(conflict_reason) <> '')
);

create index provider_observation_conflicts_original_idx
  on provider_observation_conflicts (original_observation_id, created_at);

alter table provider_observation_conflicts enable row level security;

create trigger provider_observation_conflicts_immutable_trigger
  before update or delete
  on provider_observation_conflicts
  for each row
  execute function reject_immutable_evidence_change();

create or replace function validate_slice_2b_normalized_snapshot(p_snapshot jsonb)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if jsonb_typeof(p_snapshot) <> 'object'
    or not (p_snapshot ?& array[
      'contractVersion',
      'adapterKey',
      'adapterConfigVersion',
      'normalizationPolicyVersion',
      'completeness',
      'normalizedEntity',
      'semanticHash'
    ])
    or jsonb_typeof(p_snapshot->'normalizedEntity') <> 'object'
    or p_snapshot->>'contractVersion' is null
    or btrim(p_snapshot->>'contractVersion') = ''
    or p_snapshot->>'adapterKey' is null
    or btrim(p_snapshot->>'adapterKey') = ''
    or jsonb_typeof(p_snapshot->'adapterConfigVersion') <> 'number'
    or p_snapshot->>'normalizationPolicyVersion' <> 'identity-normalization-v1'
    or p_snapshot->>'completeness' not in ('full', 'partial')
    or p_snapshot->>'semanticHash' !~ '^[a-f0-9]{64}$'
    or exists (
      select 1
      from jsonb_object_keys(p_snapshot) as keys(key)
      where keys.key not in (
        'contractVersion',
        'adapterKey',
        'adapterConfigVersion',
        'normalizationPolicyVersion',
        'completeness',
        'normalizedEntity',
        'semanticHash',
        'correctionProvenance'
      )
    )
  then
    raise exception 'normalized snapshot envelope is invalid'
      using errcode = '22023';
  end if;

  if p_snapshot ? 'correctionProvenance'
    and (jsonb_typeof(p_snapshot->'correctionProvenance') <> 'string'
      or btrim(p_snapshot->>'correctionProvenance') = '') then
    raise exception 'correction provenance must be a nonblank string'
      using errcode = '22023';
  end if;
end;
$$;

create or replace function record_provider_observation(
  p_ingestion_run_id uuid,
  p_binding_id uuid,
  p_external_object_kind text,
  p_external_object_id text,
  p_provider_revision text,
  p_provider_updated_at timestamptz,
  p_received_at timestamptz,
  p_sanitization_version integer,
  p_sanitized_payload jsonb,
  p_normalized_snapshot jsonb
)
returns table (
  outcome text,
  observation_id uuid,
  conflict_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_provider_id uuid;
  v_event_edition_id uuid;
  v_existing provider_observations%rowtype;
  v_conflict_id uuid;
begin
  perform validate_slice_2b_normalized_snapshot(p_normalized_snapshot);

  select provider_id, event_edition_id
  into v_provider_id, v_event_edition_id
  from ingestion_runs
  where id = p_ingestion_run_id
    and binding_id = p_binding_id
  for update;

  if v_provider_id is null or v_event_edition_id is null then
    raise exception 'observation evidence requires an existing ingestion run for the binding'
      using errcode = '23503';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'bracket-fyi:observation:' || p_binding_id::text || ':' || p_external_object_kind || ':' || p_external_object_id,
    0
  ));

  if p_provider_revision is not null then
    select *
    into v_existing
    from provider_observations
    where binding_id = p_binding_id
      and external_object_kind = p_external_object_kind
      and external_object_id = p_external_object_id
      and provider_revision = p_provider_revision
    for update;

    if v_existing.id is not null then
      if v_existing.sanitized_payload = p_sanitized_payload
        and v_existing.metadata = p_normalized_snapshot then
        return query select 'exact_replay'::text, v_existing.id, null::uuid;
        return;
      end if;

      insert into provider_observation_conflicts (
        original_observation_id,
        ingestion_run_id,
        binding_id,
        provider_id,
        event_edition_id,
        external_object_kind,
        external_object_id,
        provider_revision,
        provider_updated_at,
        received_at,
        sanitization_version,
        sanitized_payload,
        normalized_snapshot,
        conflict_reason
      ) values (
        v_existing.id,
        p_ingestion_run_id,
        p_binding_id,
        v_provider_id,
        v_event_edition_id,
        p_external_object_kind,
        p_external_object_id,
        p_provider_revision,
        p_provider_updated_at,
        p_received_at,
        p_sanitization_version,
        p_sanitized_payload,
        p_normalized_snapshot,
        'same provider revision received with different evidence or normalized snapshot'
      )
      on conflict (original_observation_id, payload_hash)
      do update set conflict_reason = provider_observation_conflicts.conflict_reason
      returning id into v_conflict_id;

      if v_conflict_id is null then
        select id into v_conflict_id
        from provider_observation_conflicts
        where original_observation_id = v_existing.id
          and payload_hash = encode(extensions.digest(p_sanitized_payload::text, 'sha256'), 'hex');
      end if;

      return query select 'revision_conflict'::text, v_existing.id, v_conflict_id;
      return;
    end if;
  else
    select *
    into v_existing
    from provider_observations
    where binding_id = p_binding_id
      and external_object_kind = p_external_object_kind
      and external_object_id = p_external_object_id
      and payload_hash = encode(extensions.digest(p_sanitized_payload::text, 'sha256'), 'hex')
    for update;

    if v_existing.id is not null then
      return query select 'exact_replay'::text, v_existing.id, null::uuid;
      return;
    end if;
  end if;

  insert into provider_observations (
    ingestion_run_id,
    binding_id,
    provider_id,
    event_edition_id,
    external_object_kind,
    external_object_id,
    provider_revision,
    provider_updated_at,
    received_at,
    sanitization_version,
    sanitized_payload,
    metadata
  ) values (
    p_ingestion_run_id,
    p_binding_id,
    v_provider_id,
    v_event_edition_id,
    p_external_object_kind,
    p_external_object_id,
    p_provider_revision,
    p_provider_updated_at,
    p_received_at,
    p_sanitization_version,
    p_sanitized_payload,
    p_normalized_snapshot
  )
  returning id into observation_id;

  return query select 'inserted'::text, observation_id, null::uuid;
end;
$$;

create or replace function get_provider_entity_ref(
  p_binding_id uuid,
  p_entity_kind text,
  p_external_id text
)
returns table (
  ref_id uuid,
  binding_id uuid,
  provider_id uuid,
  event_edition_id uuid,
  entity_kind text,
  external_id text,
  canonical_id uuid,
  resolution_status text,
  confidence numeric,
  reviewed_by text,
  reviewed_at timestamptz,
  metadata jsonb
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select id, binding_id, provider_id, event_edition_id, entity_kind, external_id, canonical_id,
    resolution_status, confidence, reviewed_by, reviewed_at, metadata
  from provider_entity_refs
  where binding_id = p_binding_id
    and entity_kind = p_entity_kind
    and external_id = p_external_id
$$;

create or replace function slice_2b_candidate_belongs_to_edition(
  p_entity_kind text,
  p_candidate_id uuid,
  p_event_edition_id uuid
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_exists boolean := false;
begin
  case p_entity_kind
    when 'organization' then
      select exists (select 1 from organizations where id = p_candidate_id) into v_exists;
    when 'competition' then
      select exists (
        select 1 from event_editions
        where id = p_event_edition_id and competition_id = p_candidate_id
      ) into v_exists;
    when 'event_edition' then
      v_exists := p_candidate_id = p_event_edition_id;
    when 'competitor' then
      select exists (
        select 1 from event_entries
        where event_edition_id = p_event_edition_id and competitor_id = p_candidate_id
      ) into v_exists;
    when 'event_entry' then
      select exists (
        select 1 from event_entries
        where id = p_candidate_id and event_edition_id = p_event_edition_id
      ) into v_exists;
    when 'stage' then
      select exists (
        select 1 from stages
        where id = p_candidate_id and event_edition_id = p_event_edition_id
      ) into v_exists;
    when 'round' then
      select exists (
        select 1 from rounds
        where id = p_candidate_id and event_edition_id = p_event_edition_id
      ) into v_exists;
    when 'contest' then
      select exists (
        select 1 from contests
        where id = p_candidate_id and event_edition_id = p_event_edition_id
      ) into v_exists;
    when 'bracket' then
      select exists (
        select 1 from brackets
        where id = p_candidate_id and event_edition_id = p_event_edition_id
      ) into v_exists;
    else
      v_exists := false;
  end case;
  return v_exists;
end;
$$;

create or replace function upsert_provider_entity_mapping(
  p_binding_id uuid,
  p_entity_kind text,
  p_external_id text,
  p_canonical_id uuid,
  p_resolution_status text,
  p_confidence numeric,
  p_reviewed_by text,
  p_reviewed_at timestamptz,
  p_metadata jsonb
)
returns table (
  outcome text,
  ref_id uuid,
  binding_id uuid,
  provider_id uuid,
  event_edition_id uuid,
  entity_kind text,
  external_id text,
  canonical_id uuid,
  resolution_status text,
  confidence numeric,
  reviewed_by text,
  reviewed_at timestamptz,
  metadata jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_provider_id uuid;
  v_event_edition_id uuid;
  v_existing provider_entity_refs%rowtype;
  v_outcome text;
begin
  if p_entity_kind = 'result' then
    raise exception 'result identities cannot be provider mappings' using errcode = '22023';
  end if;
  if p_resolution_status not in ('unresolved', 'automatic', 'reviewed', 'rejected') then
    raise exception 'invalid provider mapping status' using errcode = '22023';
  end if;
  if jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'provider mapping metadata must be an object' using errcode = '22023';
  end if;
  if p_resolution_status in ('automatic', 'reviewed') and p_canonical_id is null then
    raise exception 'resolved provider mapping requires a canonical ID' using errcode = '23514';
  end if;
  if p_resolution_status in ('unresolved', 'rejected') and p_canonical_id is not null then
    raise exception 'unresolved or rejected provider mapping cannot have a canonical ID' using errcode = '23514';
  end if;
  if p_resolution_status in ('reviewed', 'rejected')
    and (p_reviewed_by is null or btrim(p_reviewed_by) = '' or p_reviewed_at is null) then
    raise exception 'reviewed or rejected mapping requires reviewer provenance' using errcode = '23514';
  end if;
  if p_resolution_status in ('unresolved', 'automatic')
    and (p_reviewed_by is not null or p_reviewed_at is not null) then
    raise exception 'unresolved or automatic mapping cannot carry reviewer provenance' using errcode = '23514';
  end if;

  select pb.provider_id, pb.event_edition_id
  into v_provider_id, v_event_edition_id
  from provider_bindings pb
  where pb.id = p_binding_id
  for update;
  if v_provider_id is null or v_event_edition_id is null then
    raise exception 'provider mapping requires an existing binding' using errcode = '23503';
  end if;

  select * into v_existing
  from provider_entity_refs per
  where per.binding_id = p_binding_id
    and per.entity_kind = p_entity_kind
    and per.external_id = p_external_id
  for update;

  if v_existing.id is not null then
    if v_existing.resolution_status = 'reviewed' then
      v_outcome := case when p_resolution_status = 'reviewed'
        and v_existing.canonical_id is not distinct from p_canonical_id then 'unchanged'
        else 'conflict' end;
    elsif v_existing.resolution_status = 'rejected' then
      v_outcome := case when p_resolution_status = 'rejected' then 'unchanged'
        when p_resolution_status = 'reviewed' then 'created'
        else 'conflict' end;
    elsif v_existing.resolution_status = 'automatic' then
      v_outcome := case
        when p_resolution_status = 'automatic' and v_existing.canonical_id is not distinct from p_canonical_id then 'unchanged'
        when p_resolution_status in ('reviewed', 'rejected') then 'created'
        else 'conflict'
      end;
    else
      v_outcome := 'created';
    end if;

    if v_outcome = 'created' then
      update provider_entity_refs
      set canonical_id = p_canonical_id,
          resolution_status = p_resolution_status,
          confidence = p_confidence,
          reviewed_by = p_reviewed_by,
          reviewed_at = p_reviewed_at,
          metadata = p_metadata,
          updated_at = now()
      where id = v_existing.id;
    end if;
  else
    insert into provider_entity_refs (
      binding_id, provider_id, event_edition_id, entity_kind, external_id,
      canonical_id, resolution_status, confidence, reviewed_by, reviewed_at, metadata
    ) values (
      p_binding_id, v_provider_id, v_event_edition_id, p_entity_kind, p_external_id,
      p_canonical_id, p_resolution_status, p_confidence, p_reviewed_by, p_reviewed_at, p_metadata
    ) returning id into v_existing.id;
    v_outcome := 'created';
  end if;

  return query
  select v_outcome, r.id, r.binding_id, r.provider_id, r.event_edition_id, r.entity_kind,
    r.external_id, r.canonical_id, r.resolution_status, r.confidence, r.reviewed_by,
    r.reviewed_at, r.metadata
  from provider_entity_refs r
  where r.id = v_existing.id;
end;
$$;

create or replace function open_ingestion_quarantine(
  p_observation_id uuid,
  p_ingestion_run_id uuid,
  p_binding_id uuid,
  p_issue_code text,
  p_severity text,
  p_external_entity_kind text,
  p_external_entity_id text,
  p_candidate_ids uuid[],
  p_details jsonb
)
returns table (
  outcome text,
  id uuid,
  observation_id uuid,
  ingestion_run_id uuid,
  binding_id uuid,
  issue_code text,
  severity text,
  status text,
  external_entity_kind text,
  external_entity_id text,
  candidate_ids uuid[],
  details jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing ingestion_quarantine%rowtype;
  v_event_edition_id uuid;
  v_candidate_id uuid;
  v_candidate_ids uuid[] := coalesce(
    array(select distinct candidate_id from unnest(coalesce(p_candidate_ids, '{}'::uuid[])) candidate_id order by candidate_id),
    '{}'::uuid[]
  );
  v_outcome text;
begin
  if jsonb_typeof(p_details) <> 'object' then
    raise exception 'quarantine details must be an object' using errcode = '22023';
  end if;
  if not exists (
    select 1 from provider_observations po
    where po.id = p_observation_id
      and po.binding_id = p_binding_id
      and po.ingestion_run_id = p_ingestion_run_id
  ) then
    raise exception 'quarantine requires an existing observation/run/binding relationship'
      using errcode = '23503';
  end if;

  select po.event_edition_id into v_event_edition_id
  from provider_observations po
  where po.id = p_observation_id;

  if coalesce(array_length(v_candidate_ids, 1), 0) > 0
    and (p_external_entity_kind is null or p_external_entity_kind = 'result') then
    raise exception 'quarantine candidates require a mappable entity kind'
      using errcode = '23514';
  end if;
  foreach v_candidate_id in array v_candidate_ids loop
    if not slice_2b_candidate_belongs_to_edition(p_external_entity_kind, v_candidate_id, v_event_edition_id) then
      raise exception 'quarantine candidate does not belong to the observation event edition'
        using errcode = '23514';
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended(
    'bracket-fyi:quarantine:' || p_observation_id::text || ':' || p_issue_code,
    0
  ));

  select * into v_existing
  from ingestion_quarantine iq
  where iq.observation_id = p_observation_id
    and iq.issue_code = p_issue_code
  for update;

  if v_existing.id is null then
    insert into ingestion_quarantine (
      observation_id, ingestion_run_id, binding_id, issue_code, severity, external_entity_kind,
      external_entity_id, candidate_ids, details
    ) values (
      p_observation_id, p_ingestion_run_id, p_binding_id, p_issue_code, p_severity,
      p_external_entity_kind, p_external_entity_id, v_candidate_ids, p_details
    ) returning * into v_existing;
    v_outcome := 'created';
  else
    v_outcome := case when v_existing.status = 'open' then 'unchanged' else 'already_resolved' end;
  end if;

  return query select v_outcome, v_existing.id, v_existing.observation_id, v_existing.ingestion_run_id,
    v_existing.binding_id, v_existing.issue_code, v_existing.severity, v_existing.status,
    v_existing.external_entity_kind, v_existing.external_entity_id, v_existing.candidate_ids,
    v_existing.details;
end;
$$;

create or replace function get_ingestion_quarantine(
  p_observation_id uuid,
  p_issue_code text
)
returns table (
  id uuid,
  observation_id uuid,
  ingestion_run_id uuid,
  binding_id uuid,
  issue_code text,
  severity text,
  status text,
  external_entity_kind text,
  external_entity_id text,
  candidate_ids uuid[],
  details jsonb
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select id, observation_id, ingestion_run_id, binding_id, issue_code, severity, status,
    external_entity_kind, external_entity_id, candidate_ids, details
  from ingestion_quarantine
  where observation_id = p_observation_id
    and issue_code = p_issue_code
$$;

revoke all on table provider_observation_conflicts from public, anon, authenticated;
grant select, insert on table provider_observation_conflicts to service_role;

revoke all on function validate_slice_2b_normalized_snapshot(jsonb) from public, anon, authenticated;
revoke all on function record_provider_observation(uuid, uuid, text, text, text, timestamptz, timestamptz, integer, jsonb, jsonb) from public, anon, authenticated;
revoke all on function get_provider_entity_ref(uuid, text, text) from public, anon, authenticated;
revoke all on function slice_2b_candidate_belongs_to_edition(text, uuid, uuid) from public, anon, authenticated;
revoke all on function upsert_provider_entity_mapping(uuid, text, text, uuid, text, numeric, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function open_ingestion_quarantine(uuid, uuid, uuid, text, text, text, text, uuid[], jsonb) from public, anon, authenticated;
revoke all on function get_ingestion_quarantine(uuid, text) from public, anon, authenticated;

grant execute on function validate_slice_2b_normalized_snapshot(jsonb) to service_role;
grant execute on function record_provider_observation(uuid, uuid, text, text, text, timestamptz, timestamptz, integer, jsonb, jsonb) to service_role;
grant execute on function get_provider_entity_ref(uuid, text, text) to service_role;
grant execute on function slice_2b_candidate_belongs_to_edition(text, uuid, uuid) to service_role;
grant execute on function upsert_provider_entity_mapping(uuid, text, text, uuid, text, numeric, text, timestamptz, jsonb) to service_role;
grant execute on function open_ingestion_quarantine(uuid, uuid, uuid, text, text, text, text, uuid[], jsonb) to service_role;
grant execute on function get_ingestion_quarantine(uuid, text) to service_role;
