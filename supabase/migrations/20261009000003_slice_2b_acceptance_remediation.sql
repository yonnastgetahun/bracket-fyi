-- Bracket.fyi Slice 2B-R — acceptance remediation.
-- Forward-only: preserves immutable evidence and adds authoritative safety gates.

create or replace function slice_2b_canonical_number(p_value jsonb)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_text text := lower(p_value::text);
  v_sign text := '';
  v_mantissa text;
  v_exponent integer := 0;
  v_dot integer;
  v_before integer;
  v_digits text;
  v_decimal_position integer;
  v_expanded text;
  v_integer text;
  v_fraction text;
  v_leading_fraction integer;
  v_scientific_exponent integer;
  v_significand text;
begin
  if left(v_text, 1) = '-' then
    v_sign := '-';
    v_text := substring(v_text from 2);
  end if;
  if position('e' in v_text) > 0 then
    v_mantissa := split_part(v_text, 'e', 1);
    v_exponent := split_part(v_text, 'e', 2)::integer;
  else
    v_mantissa := v_text;
  end if;
  v_dot := position('.' in v_mantissa);
  v_before := case when v_dot = 0 then length(v_mantissa) else v_dot - 1 end;
  v_digits := replace(v_mantissa, '.', '');
  v_decimal_position := v_before + v_exponent;
  if v_decimal_position <= 0 then
    v_expanded := '0.' || repeat('0', -v_decimal_position) || v_digits;
  elsif v_decimal_position >= length(v_digits) then
    v_expanded := v_digits || repeat('0', v_decimal_position - length(v_digits));
  else
    v_expanded := left(v_digits, v_decimal_position) || '.' || substring(v_digits from v_decimal_position + 1);
  end if;
  v_integer := split_part(v_expanded, '.', 1);
  v_fraction := case when position('.' in v_expanded) = 0 then '' else split_part(v_expanded, '.', 2) end;
  v_integer := ltrim(v_integer, '0');
  if v_integer = '' then v_integer := '0'; end if;
  v_fraction := rtrim(v_fraction, '0');
  if v_integer = '0' and v_fraction = '' then return '0'; end if;

  if v_integer <> '0' then
    if length(v_integer) < 22 then
      return v_sign || v_integer || case when v_fraction = '' then '' else '.' || v_fraction end;
    end if;
    v_scientific_exponent := length(v_integer) - 1;
    v_significand := left(v_integer, 1) || substring(v_integer from 2) || v_fraction;
  else
    v_leading_fraction := length(v_fraction) - length(ltrim(v_fraction, '0'));
    if v_leading_fraction < 6 then
      return v_sign || '0.' || repeat('0', v_leading_fraction) || ltrim(v_fraction, '0');
    end if;
    v_scientific_exponent := -(v_leading_fraction + 1);
    v_significand := substring(ltrim(v_fraction, '0') from 1);
  end if;
  v_significand := rtrim(v_significand, '0');
  return v_sign || left(v_significand, 1)
    || case when length(v_significand) > 1 then '.' || substring(v_significand from 2) else '' end
    || 'e' || case when v_scientific_exponent >= 0 then '+' else '' end || v_scientific_exponent::text;
end;
$$;

create or replace function slice_2b_canonical_json(p_value jsonb)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case jsonb_typeof(p_value)
    when 'object' then
      '{' || coalesce((
        select string_agg(to_json(entry.key)::text || ':' || slice_2b_canonical_json(entry.value), ',' order by entry.key)
        from jsonb_each(p_value) as entry(key, value)
      ), '') || '}'
    when 'array' then
      '[' || coalesce((
        select string_agg(slice_2b_canonical_json(entry.value), ',' order by entry.ordinality)
        from jsonb_array_elements(p_value) with ordinality as entry(value, ordinality)
      ), '') || ']'
    when 'number' then slice_2b_canonical_number(p_value)
    else p_value::text
  end
$$;

alter table provider_observation_conflicts
  drop constraint if exists provider_observation_conflicts_original_observation_id_payload_hash_key;

alter table provider_observation_conflicts
  drop constraint if exists provider_observation_conflict_original_observation_id_paylo_key;

alter table provider_observation_conflicts
  drop constraint if exists provider_observation_conflicts_snapshot_hash_valid,
  drop constraint if exists provider_observation_conflicts_identity_unique,
  drop column if exists normalized_snapshot_hash;

alter table provider_observation_conflicts
  add column normalized_snapshot_hash text generated always as (
    encode(extensions.digest(slice_2b_canonical_json(normalized_snapshot), 'sha256'), 'hex')
  ) stored;

alter table provider_observation_conflicts
  add constraint provider_observation_conflicts_snapshot_hash_valid
    check (normalized_snapshot_hash ~ '^[a-f0-9]{64}$'),
  add constraint provider_observation_conflicts_identity_unique
    unique (original_observation_id, payload_hash, normalized_snapshot_hash);

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
returns table (outcome text, observation_id uuid, conflict_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_provider_id uuid;
  v_event_edition_id uuid;
  v_existing provider_observations%rowtype;
  v_conflict_id uuid;
  v_payload_hash text := encode(extensions.digest(p_sanitized_payload::text, 'sha256'), 'hex');
  v_snapshot_hash text := encode(extensions.digest(slice_2b_canonical_json(p_normalized_snapshot), 'sha256'), 'hex');
begin
  perform validate_slice_2b_normalized_snapshot(p_normalized_snapshot);
  select provider_id, event_edition_id into v_provider_id, v_event_edition_id
  from ingestion_runs where id = p_ingestion_run_id and binding_id = p_binding_id for update;
  if v_provider_id is null or v_event_edition_id is null then
    raise exception 'observation evidence requires an existing ingestion run for the binding' using errcode = '23503';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'bracket-fyi:observation:' || p_binding_id::text || ':' || p_external_object_kind || ':' || p_external_object_id, 0
  ));

  if p_provider_revision is not null then
    select * into v_existing from provider_observations
    where binding_id = p_binding_id and external_object_kind = p_external_object_kind
      and external_object_id = p_external_object_id and provider_revision = p_provider_revision
    for update;
  else
    select * into v_existing from provider_observations
    where binding_id = p_binding_id and external_object_kind = p_external_object_kind
      and external_object_id = p_external_object_id and payload_hash = v_payload_hash
    for update;
  end if;

  if v_existing.id is not null then
    if v_existing.sanitized_payload = p_sanitized_payload and v_existing.metadata = p_normalized_snapshot then
      return query select 'exact_replay'::text, v_existing.id, null::uuid;
      return;
    end if;

    insert into provider_observation_conflicts (
      original_observation_id, ingestion_run_id, binding_id, provider_id, event_edition_id,
      external_object_kind, external_object_id, provider_revision, provider_updated_at, received_at,
      sanitization_version, sanitized_payload, normalized_snapshot, conflict_reason
    ) values (
      v_existing.id, p_ingestion_run_id, p_binding_id, v_provider_id, v_event_edition_id,
      p_external_object_kind, p_external_object_id, p_provider_revision, p_provider_updated_at, p_received_at,
      p_sanitization_version, p_sanitized_payload, p_normalized_snapshot,
      case when p_provider_revision is null
        then 'revisionless replay changed normalized evidence'
        else 'same provider revision received with different evidence or normalized snapshot' end
    ) on conflict (original_observation_id, payload_hash, normalized_snapshot_hash) do nothing;

    select id into v_conflict_id from provider_observation_conflicts
    where original_observation_id = v_existing.id
      and payload_hash = v_payload_hash
      and normalized_snapshot_hash = v_snapshot_hash;
    return query select 'revision_conflict'::text, v_existing.id, v_conflict_id;
    return;
  end if;

  insert into provider_observations (
    ingestion_run_id, binding_id, provider_id, event_edition_id, external_object_kind, external_object_id,
    provider_revision, provider_updated_at, received_at, sanitization_version, sanitized_payload, metadata
  ) values (
    p_ingestion_run_id, p_binding_id, v_provider_id, v_event_edition_id, p_external_object_kind, p_external_object_id,
    p_provider_revision, p_provider_updated_at, p_received_at, p_sanitization_version, p_sanitized_payload, p_normalized_snapshot
  ) returning id into observation_id;
  return query select 'inserted'::text, observation_id, null::uuid;
end;
$$;

create or replace function validate_provider_entity_ref()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_exists boolean := false;
begin
  if new.canonical_id is null then return new; end if;
  case new.entity_kind
    when 'organization' then select exists (select 1 from organizations where id = new.canonical_id) into target_exists;
    when 'competition' then select exists (select 1 from event_editions where id = new.event_edition_id and competition_id = new.canonical_id) into target_exists;
    when 'event_edition' then target_exists := new.canonical_id = new.event_edition_id;
    when 'competitor' then select exists (select 1 from competitors where id = new.canonical_id) into target_exists;
    when 'event_entry' then select exists (select 1 from event_entries where id = new.canonical_id and event_edition_id = new.event_edition_id) into target_exists;
    when 'stage' then select exists (select 1 from stages where id = new.canonical_id and event_edition_id = new.event_edition_id) into target_exists;
    when 'round' then select exists (select 1 from rounds where id = new.canonical_id and event_edition_id = new.event_edition_id) into target_exists;
    when 'contest' then select exists (select 1 from contests where id = new.canonical_id and event_edition_id = new.event_edition_id) into target_exists;
    when 'bracket' then select exists (select 1 from brackets where id = new.canonical_id and event_edition_id = new.event_edition_id) into target_exists;
    else target_exists := false;
  end case;
  if not target_exists then
    raise exception 'canonical % target does not belong to the provider binding event edition', new.entity_kind using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function slice_2b_candidate_belongs_to_edition(
  p_entity_kind text, p_candidate_id uuid, p_event_edition_id uuid
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare v_exists boolean := false;
begin
  case p_entity_kind
    when 'organization' then select exists (select 1 from organizations where id = p_candidate_id) into v_exists;
    when 'competition' then select exists (select 1 from event_editions where id = p_event_edition_id and competition_id = p_candidate_id) into v_exists;
    when 'event_edition' then v_exists := p_candidate_id = p_event_edition_id;
    when 'competitor' then select exists (select 1 from competitors where id = p_candidate_id) into v_exists;
    when 'event_entry' then select exists (select 1 from event_entries where id = p_candidate_id and event_edition_id = p_event_edition_id) into v_exists;
    when 'stage' then select exists (select 1 from stages where id = p_candidate_id and event_edition_id = p_event_edition_id) into v_exists;
    when 'round' then select exists (select 1 from rounds where id = p_candidate_id and event_edition_id = p_event_edition_id) into v_exists;
    when 'contest' then select exists (select 1 from contests where id = p_candidate_id and event_edition_id = p_event_edition_id) into v_exists;
    when 'bracket' then select exists (select 1 from brackets where id = p_candidate_id and event_edition_id = p_event_edition_id) into v_exists;
  end case;
  return v_exists;
end;
$$;

create table if not exists canonical_structural_projection_scope (
  event_edition_id uuid not null references event_editions(id) on delete restrict,
  entity_kind text not null,
  canonical_id uuid not null,
  last_observation_id uuid not null,
  last_provider_updated_at timestamptz,
  last_received_at timestamptz not null,
  semantic_hash text not null,
  completeness text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_edition_id, entity_kind, canonical_id),
  foreign key (last_observation_id, event_edition_id)
    references provider_observations(id, event_edition_id) on delete restrict,
  constraint canonical_structural_projection_scope_kind_valid check (entity_kind in (
    'organization', 'competition', 'event_edition', 'competitor', 'event_entry', 'stage', 'round', 'contest', 'bracket'
  )),
  constraint canonical_structural_projection_scope_hash_valid check (semantic_hash ~ '^[a-f0-9]{64}$'),
  constraint canonical_structural_projection_scope_completeness_valid check (completeness in ('full', 'partial'))
);

create index if not exists canonical_structural_projection_scope_observation_idx
  on canonical_structural_projection_scope (last_observation_id);
alter table canonical_structural_projection_scope enable row level security;
revoke all on table canonical_structural_projection_scope from public, anon, authenticated;
grant all on table canonical_structural_projection_scope to service_role;

create or replace function slice_2b_resolve_quarantine(p_observation_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update ingestion_quarantine
  set status = 'resolved', resolved_at = now(), resolved_by = 'system:slice-2b',
      resolution_action = 'dependency_replayed', resolution_note = 'Projection succeeded after the blocking dependency became available', updated_at = now()
  where observation_id = p_observation_id and status = 'open' and severity = 'blocking';
$$;

alter function project_structural_observation(uuid) rename to project_structural_observation_unchecked;

create or replace function project_structural_observation(p_observation_id uuid)
returns table (outcome text, canonical_id uuid, quarantine_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mode text;
  v_result record;
begin
  select pb.mode into v_mode
  from provider_observations po join provider_bindings pb on pb.id = po.binding_id
  where po.id = p_observation_id for update;
  if v_mode is null then
    raise exception 'structural projection requires an existing provider observation' using errcode = '23503';
  end if;
  if v_mode <> 'write' then
    return query select 'skipped_shadow'::text, null::uuid, null::uuid;
    return;
  end if;
  select * into v_result from project_structural_observation_unchecked(p_observation_id);
  if v_result.outcome in ('projected', 'unchanged') then perform slice_2b_resolve_quarantine(p_observation_id); end if;
  return query select v_result.outcome::text, v_result.canonical_id::uuid, v_result.quarantine_id::uuid;
end;
$$;

revoke all on function project_structural_observation(uuid) from public, anon, authenticated;
revoke all on function project_structural_observation_unchecked(uuid) from public, anon, authenticated;
grant execute on function project_structural_observation(uuid) to service_role;

create or replace function slice_2b_project_root_observation(p_observation_id uuid)
returns table (outcome text, canonical_id uuid, quarantine_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_observation provider_observations%rowtype;
  v_data jsonb;
  v_kind text;
  v_canonical_id uuid;
  v_status text;
  v_state canonical_structural_projection_scope%rowtype;
  v_quarantine_id uuid;
  v_parent_id uuid;
  v_incoming_time timestamptz;
  v_current_time timestamptz;
begin
  select * into v_observation from provider_observations where id = p_observation_id for update;
  v_kind := v_observation.external_object_kind;
  v_data := v_observation.metadata->'normalizedEntity';
  select per.canonical_id, per.resolution_status into v_canonical_id, v_status
  from provider_entity_refs per
  where per.binding_id = v_observation.binding_id and per.entity_kind = v_kind
    and per.external_id = v_observation.external_object_id
  for update;
  if v_status not in ('automatic', 'reviewed') or v_canonical_id is null then
    select oq.id into v_quarantine_id from open_ingestion_quarantine(
      v_observation.id, v_observation.ingestion_run_id, v_observation.binding_id,
      'mapping_missing', 'blocking', v_kind, v_observation.external_object_id, '{}'::uuid[],
      jsonb_build_object('reason', 'root projection requires a resolved reviewed or automatic mapping')
    ) oq;
    return query select 'quarantined'::text, null::uuid, v_quarantine_id;
    return;
  end if;

  select css.* into v_state from canonical_structural_projection_scope css
  where css.event_edition_id = v_observation.event_edition_id and css.entity_kind = v_kind and css.canonical_id = v_canonical_id
  for update;
  v_incoming_time := coalesce(v_observation.provider_updated_at, v_observation.received_at);
  v_current_time := coalesce(v_state.last_provider_updated_at, v_state.last_received_at);
  if v_state.last_provider_updated_at is not null and v_observation.provider_updated_at is null then
    select oq.id into v_quarantine_id from open_ingestion_quarantine(
      v_observation.id, v_observation.ingestion_run_id, v_observation.binding_id,
      'stale_update', 'warning', v_kind, v_observation.external_object_id, '{}'::uuid[],
      jsonb_build_object('reason', 'missing root provider timestamp cannot replace newer state')
    ) oq;
    return query select 'quarantined'::text, v_canonical_id, v_quarantine_id;
    return;
  end if;
  if v_state.last_observation_id is not null and v_incoming_time < v_current_time then
    select oq.id into v_quarantine_id from open_ingestion_quarantine(
      v_observation.id, v_observation.ingestion_run_id, v_observation.binding_id,
      'stale_update', 'warning', v_kind, v_observation.external_object_id, '{}'::uuid[],
      jsonb_build_object('reason', 'older root observation')
    ) oq;
    return query select 'quarantined'::text, v_canonical_id, v_quarantine_id;
    return;
  end if;
  if v_state.last_observation_id is not null and v_incoming_time = v_current_time then
    if v_state.semantic_hash = v_observation.metadata->>'semanticHash' then
      return query select 'unchanged'::text, v_canonical_id, null::uuid;
    else
      select oq.id into v_quarantine_id from open_ingestion_quarantine(
        v_observation.id, v_observation.ingestion_run_id, v_observation.binding_id,
        'stale_update', 'warning', v_kind, v_observation.external_object_id, '{}'::uuid[],
        jsonb_build_object('reason', 'equal root timestamp changed semantics')
      ) oq;
      return query select 'quarantined'::text, v_canonical_id, v_quarantine_id;
    end if;
    return;
  end if;

  if v_kind = 'organization' then
    perform 1 from organizations where id = v_canonical_id for update;
    if not found then
      select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'mapping_missing','blocking',v_kind,v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','mapped organization does not exist')) oq;
      return query select 'quarantined'::text, null::uuid, v_quarantine_id; return;
    end if;
    update organizations set name=v_data->>'name', kind=v_data->>'organizationKind', official_url=v_data->>'officialUrl', metadata=v_data->'metadata', updated_at=now() where id=v_canonical_id;
  elsif v_kind = 'competition' then
    perform 1 from competitions where id = v_canonical_id for update;
    if not found then
      select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'mapping_missing','blocking',v_kind,v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','mapped competition does not exist')) oq;
      return query select 'quarantined'::text, null::uuid, v_quarantine_id; return;
    end if;
    if v_data->>'organizationExternalId' is not null then
      select per.canonical_id into v_parent_id from provider_entity_refs per where per.binding_id=v_observation.binding_id and per.entity_kind='organization' and per.external_id=v_data->>'organizationExternalId' and per.resolution_status in ('automatic','reviewed') for update;
      if v_parent_id is null or not exists (select 1 from organizations where id=v_parent_id) then
        select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'mapping_missing','blocking',v_kind,v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','competition organization mapping is missing')) oq;
        return query select 'quarantined'::text, v_canonical_id, v_quarantine_id; return;
      end if;
      if exists (select 1 from competitions where id=v_canonical_id and organization_id is not null and organization_id<>v_parent_id) then
        select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'unsupported_shape','blocking',v_kind,v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','competition immutable organization identity conflicts')) oq;
        return query select 'quarantined'::text, v_canonical_id, v_quarantine_id; return;
      end if;
    end if;
    update competitions set organization_id=coalesce(v_parent_id,organization_id), name=v_data->>'name', domain=v_data->>'domain', sport_code=v_data->>'sportCode', official_url=v_data->>'officialUrl', rules_metadata=v_data->'rulesMetadata', updated_at=now() where id=v_canonical_id;
  elsif v_kind = 'event_edition' then
    perform 1 from event_editions where id = v_canonical_id for update;
    if not found or v_canonical_id <> v_observation.event_edition_id then
      select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'unsupported_shape','blocking',v_kind,v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','mapped event edition does not match the binding edition')) oq;
      return query select 'quarantined'::text, v_canonical_id, v_quarantine_id; return;
    end if;
    if v_data->>'editionKey' <> (select edition_key from event_editions where id=v_canonical_id) then
      select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'unsupported_shape','blocking',v_kind,v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','approved event edition key cannot be changed by provider data')) oq;
      return query select 'quarantined'::text, v_canonical_id, v_quarantine_id; return;
    end if;
    select per.canonical_id into v_parent_id from provider_entity_refs per where per.binding_id=v_observation.binding_id and per.entity_kind='competition' and per.external_id=v_data->>'competitionExternalId' and per.resolution_status in ('automatic','reviewed') for update;
    if v_parent_id is null or not exists (select 1 from event_editions where id=v_canonical_id and competition_id=v_parent_id) then
      select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'unsupported_shape','blocking',v_kind,v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','event edition competition parent conflicts')) oq;
      return query select 'quarantined'::text, v_canonical_id, v_quarantine_id; return;
    end if;
    update event_editions set name=v_data->>'name', season_label=v_data->>'seasonLabel', timezone=v_data->>'timezone', status=v_data->>'status', starts_at=(v_data->>'startsAt')::timestamptz, ends_at=(v_data->>'endsAt')::timestamptz, official_url=v_data->>'officialUrl', metadata=v_data->'metadata', updated_at=now() where id=v_canonical_id;
  elsif v_kind = 'competitor' then
    perform 1 from competitors where id = v_canonical_id for update;
    if not found then
      select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'mapping_missing','blocking',v_kind,v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','mapped competitor does not exist')) oq;
      return query select 'quarantined'::text, null::uuid, v_quarantine_id; return;
    end if;
    if v_data->>'organizationExternalId' is not null then
      select per.canonical_id into v_parent_id from provider_entity_refs per where per.binding_id=v_observation.binding_id and per.entity_kind='organization' and per.external_id=v_data->>'organizationExternalId' and per.resolution_status in ('automatic','reviewed') for update;
      if v_parent_id is null or not exists (select 1 from organizations where id=v_parent_id) then
        select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'mapping_missing','blocking',v_kind,v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','competitor organization mapping is missing')) oq;
        return query select 'quarantined'::text, v_canonical_id, v_quarantine_id; return;
      end if;
      if exists (select 1 from competitors where id=v_canonical_id and organization_id is not null and organization_id<>v_parent_id) then
        select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'unsupported_shape','blocking',v_kind,v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','competitor immutable organization identity conflicts')) oq;
        return query select 'quarantined'::text, v_canonical_id, v_quarantine_id; return;
      end if;
    end if;
    update competitors set organization_id=coalesce(v_parent_id,organization_id), kind=v_data->>'competitorKind', canonical_name=v_data->>'canonicalName', short_name=v_data->>'shortName', country_code=v_data->>'countryCode', metadata=v_data->'metadata', updated_at=now() where id=v_canonical_id;
  end if;

  insert into canonical_structural_projection_scope (event_edition_id,entity_kind,canonical_id,last_observation_id,last_provider_updated_at,last_received_at,semantic_hash,completeness,updated_at)
  values (v_observation.event_edition_id,v_kind,v_canonical_id,v_observation.id,v_observation.provider_updated_at,v_observation.received_at,v_observation.metadata->>'semanticHash',v_observation.metadata->>'completeness',now())
  on conflict on constraint canonical_structural_projection_scope_pkey do update set last_observation_id=excluded.last_observation_id,last_provider_updated_at=excluded.last_provider_updated_at,last_received_at=excluded.last_received_at,semantic_hash=excluded.semantic_hash,completeness=excluded.completeness,updated_at=now();
  perform slice_2b_resolve_quarantine(v_observation.id);
  return query select 'projected'::text, v_canonical_id, null::uuid;
end;
$$;

create or replace function project_structural_observation(p_observation_id uuid)
returns table (outcome text, canonical_id uuid, quarantine_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mode text;
  v_kind text;
  v_result record;
begin
  select pb.mode, po.external_object_kind into v_mode, v_kind
  from provider_observations po join provider_bindings pb on pb.id=po.binding_id
  where po.id=p_observation_id for update;
  if v_mode is null then raise exception 'structural projection requires an existing provider observation' using errcode='23503'; end if;
  if v_mode <> 'write' then return query select 'skipped_shadow'::text,null::uuid,null::uuid; return; end if;
  if v_kind in ('organization','competition','event_edition','competitor') then
    return query select * from slice_2b_project_root_observation(p_observation_id);
    return;
  end if;
  if v_kind = 'contest' then
    declare
      v_observation provider_observations%rowtype;
      v_data jsonb;
      v_contest_id uuid;
      v_current_status text;
      v_state canonical_structural_projection_state%rowtype;
      v_incoming_time timestamptz;
      v_current_time timestamptz;
      v_incoming_rank integer;
      v_current_rank integer;
      v_q uuid;
    begin
      select * into v_observation from provider_observations where id=p_observation_id for update;
      v_data := v_observation.metadata->'normalizedEntity';
      select per.canonical_id into v_contest_id from provider_entity_refs per
      where per.binding_id=v_observation.binding_id and per.entity_kind='contest'
        and per.external_id=v_observation.external_object_id and per.resolution_status in ('automatic','reviewed') for update;
      if v_contest_id is not null then
        select c.status into v_current_status from contests c where c.id=v_contest_id and c.event_edition_id=v_observation.event_edition_id for update;
        select csps.* into v_state from canonical_structural_projection_state csps where csps.entity_kind='contest' and csps.canonical_id=v_contest_id for update;
        v_incoming_time := coalesce(v_observation.provider_updated_at,v_observation.received_at);
        v_current_time := coalesce(v_state.last_provider_updated_at,v_state.last_received_at);
        v_incoming_rank := case v_data->>'status' when 'scheduled' then 0 when 'pregame' then 1 when 'postponed' then 1 when 'live' then 2 when 'suspended' then 2 when 'final' then 3 when 'canceled' then 3 when 'void' then 3 else -1 end;
        v_current_rank := case v_current_status when 'scheduled' then 0 when 'pregame' then 1 when 'postponed' then 1 when 'live' then 2 when 'suspended' then 2 when 'final' then 3 when 'canceled' then 3 when 'void' then 3 else -1 end;
        if (v_state.last_provider_updated_at is not null and v_observation.provider_updated_at is null) or v_incoming_time < v_current_time then
          select oq.id into v_q from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'stale_update','warning','contest',v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','older contest lifecycle observation')) oq;
          return query select 'quarantined'::text,v_contest_id,v_q; return;
        end if;
        if v_incoming_time = v_current_time and ((v_data->>'status') <> v_current_status or v_state.semantic_hash <> v_observation.metadata->>'semanticHash') then
          select oq.id into v_q from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'stale_update','warning','contest',v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','equal lifecycle timestamp changed semantics')) oq;
          return query select 'quarantined'::text,v_contest_id,v_q; return;
        end if;
        if v_incoming_rank < v_current_rank or (v_current_rank = 3 and v_incoming_rank = 3 and v_data->>'status' <> v_current_status) then
          select oq.id into v_q from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'illegal_regression','error','contest',v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','contest lifecycle status regressed')) oq;
          return query select 'quarantined'::text,v_contest_id,v_q; return;
        end if;
      end if;
    end;
  end if;
  select * into v_result from project_structural_observation_unchecked(p_observation_id);
  if v_result.outcome in ('projected','unchanged') then perform slice_2b_resolve_quarantine(p_observation_id); end if;
  return query select v_result.outcome::text,v_result.canonical_id::uuid,v_result.quarantine_id::uuid;
end;
$$;

revoke all on function project_structural_observation(uuid) from public, anon, authenticated;
grant execute on function project_structural_observation(uuid) to service_role;

alter function project_provider_result(uuid, text) rename to project_provider_result_unchecked;

create or replace function project_provider_result(
  p_observation_id uuid,
  p_result_idempotency_key text default null
)
returns table (
  outcome text,
  contest_result_id uuid,
  result_version integer,
  audit_event_id uuid,
  outbox_id uuid,
  quarantine_id uuid,
  prior_outcome text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mode text;
  v_result record;
begin
  select pb.mode into v_mode
  from provider_observations po join provider_bindings pb on pb.id = po.binding_id
  where po.id = p_observation_id for update;
  if v_mode is null then
    raise exception 'result projection requires an existing provider observation' using errcode = '23503';
  end if;
  if v_mode <> 'write' then
    return query select 'skipped_shadow'::text, null::uuid, null::integer, null::uuid, null::uuid, null::uuid, null::text;
    return;
  end if;
  select * into v_result from project_provider_result_unchecked(p_observation_id, p_result_idempotency_key);
  if v_result.outcome in ('projected', 'duplicate') then perform slice_2b_resolve_quarantine(p_observation_id); end if;
  return query select v_result.outcome::text, v_result.contest_result_id::uuid, v_result.result_version::integer,
    v_result.audit_event_id::uuid, v_result.outbox_id::uuid, v_result.quarantine_id::uuid, v_result.prior_outcome::text;
end;
$$;

revoke all on function project_provider_result(uuid, text) from public, anon, authenticated;
revoke all on function project_provider_result_unchecked(uuid, text) from public, anon, authenticated;
grant execute on function project_provider_result(uuid, text) to service_role;

revoke all on function slice_2b_canonical_number(jsonb) from public, anon, authenticated;
grant execute on function slice_2b_canonical_number(jsonb) to service_role;
revoke all on function slice_2b_resolve_quarantine(uuid) from public, anon, authenticated;
grant execute on function slice_2b_resolve_quarantine(uuid) to service_role;
revoke all on function slice_2b_project_root_observation(uuid) from public, anon, authenticated;
grant execute on function slice_2b_project_root_observation(uuid) to service_role;
