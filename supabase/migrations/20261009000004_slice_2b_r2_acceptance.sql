-- Bracket.fyi Slice 2B-R2 — acceptance-boundary and partial-merge repair.
-- Forward-only. This migration is local/disposable until a separate hosted review approves it.

-- The original structural state constraint was global by canonical ID. Keep the
-- historical table, but scope its ordering state by edition so the legacy
-- projector cannot reject a shared competitor in a second edition.
alter table canonical_structural_projection_state
  drop constraint if exists canonical_structural_projection_state_kind_id_unique;

alter table canonical_structural_projection_state
  add constraint canonical_structural_projection_state_kind_id_unique
  unique (event_edition_id, entity_kind, canonical_id);

-- Preserve ordering provenance that predates the edition-scoped scope table.
insert into canonical_structural_projection_scope (
  event_edition_id,
  entity_kind,
  canonical_id,
  last_observation_id,
  last_provider_updated_at,
  last_received_at,
  semantic_hash,
  completeness,
  created_at,
  updated_at
)
select
  state.event_edition_id,
  state.entity_kind,
  state.canonical_id,
  state.last_observation_id,
  state.last_provider_updated_at,
  state.last_received_at,
  state.semantic_hash,
  state.completeness,
  state.created_at,
  state.updated_at
from canonical_structural_projection_state state
on conflict (event_edition_id, entity_kind, canonical_id) do nothing;

-- A partial provider snapshot is an additive patch. The projector's existing
-- upserts intentionally assign NULL for omitted JSON keys, so this trigger
-- restores the prior row for NULL fields and merges metadata objects. Full
-- snapshots retain the original replacement semantics.
create or replace function slice_2b_preserve_partial_snapshot_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  if coalesce(current_setting('slice2b.partial_snapshot', true), 'false') <> 'true' then
    return new;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);
  if jsonb_typeof(v_old->'metadata') = 'object'
    and jsonb_typeof(v_new->'metadata') = 'object' then
    v_new := v_new || jsonb_build_object('metadata', v_old->'metadata' || v_new->'metadata');
  end if;
  new := jsonb_populate_record(old, jsonb_strip_nulls(v_new));
  if jsonb_typeof(v_old->'metadata') = 'object'
    and jsonb_typeof(v_new->'metadata') = 'object' then
    new.metadata := v_old->'metadata' || v_new->'metadata';
  end if;
  return new;
end;
$$;

-- Contest.required_for_completion is NOT NULL. A partial upsert must first
-- inherit that existing value (and any other omitted optional value) before
-- PostgreSQL checks the insert row's constraints.
create or replace function slice_2b_merge_partial_contest_insert()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_existing contests%rowtype;
  v_incoming_metadata jsonb;
begin
  if coalesce(current_setting('slice2b.partial_snapshot', true), 'false') <> 'true' then
    return new;
  end if;
  select * into v_existing
  from contests
  where event_edition_id = new.event_edition_id and contest_key = new.contest_key
  for update;
  if not found then
    return new;
  end if;
  v_incoming_metadata := new.metadata;
  v_existing := jsonb_populate_record(v_existing, jsonb_strip_nulls(to_jsonb(new)));
  v_existing.metadata := coalesce(v_existing.metadata, '{}'::jsonb) || coalesce(v_incoming_metadata, '{}'::jsonb);
  new := v_existing;
  return new;
end;
$$;

create or replace function slice_2b_merge_partial_metadata()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('slice2b.partial_snapshot', true), 'false') = 'true' then
    new.metadata := coalesce(old.metadata, '{}'::jsonb) || coalesce(new.metadata, '{}'::jsonb);
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_slice_2b_partial_merge on organizations;
create trigger organizations_slice_2b_partial_merge
  before update on organizations
  for each row execute function slice_2b_preserve_partial_snapshot_fields();
drop trigger if exists organizations_slice_2b_partial_metadata on organizations;
create trigger organizations_slice_2b_partial_metadata
  before update on organizations
  for each row execute function slice_2b_merge_partial_metadata();
drop trigger if exists competitions_slice_2b_partial_merge on competitions;
create trigger competitions_slice_2b_partial_merge
  before update on competitions
  for each row execute function slice_2b_preserve_partial_snapshot_fields();
drop trigger if exists competitions_slice_2b_partial_metadata on competitions;
create trigger competitions_slice_2b_partial_metadata
  before update on competitions
  for each row execute function slice_2b_merge_partial_metadata();
drop trigger if exists event_editions_slice_2b_partial_merge on event_editions;
create trigger event_editions_slice_2b_partial_merge
  before update on event_editions
  for each row execute function slice_2b_preserve_partial_snapshot_fields();
drop trigger if exists event_editions_slice_2b_partial_metadata on event_editions;
create trigger event_editions_slice_2b_partial_metadata
  before update on event_editions
  for each row execute function slice_2b_merge_partial_metadata();
drop trigger if exists competitors_slice_2b_partial_merge on competitors;
create trigger competitors_slice_2b_partial_merge
  before update on competitors
  for each row execute function slice_2b_preserve_partial_snapshot_fields();
drop trigger if exists competitors_slice_2b_partial_metadata on competitors;
create trigger competitors_slice_2b_partial_metadata
  before update on competitors
  for each row execute function slice_2b_merge_partial_metadata();
drop trigger if exists event_entries_slice_2b_partial_merge on event_entries;
create trigger event_entries_slice_2b_partial_merge
  before update on event_entries
  for each row execute function slice_2b_preserve_partial_snapshot_fields();
drop trigger if exists event_entries_slice_2b_partial_metadata on event_entries;
create trigger event_entries_slice_2b_partial_metadata
  before update on event_entries
  for each row execute function slice_2b_merge_partial_metadata();
drop trigger if exists stages_slice_2b_partial_merge on stages;
create trigger stages_slice_2b_partial_merge
  before update on stages
  for each row execute function slice_2b_preserve_partial_snapshot_fields();
drop trigger if exists stages_slice_2b_partial_metadata on stages;
create trigger stages_slice_2b_partial_metadata
  before update on stages
  for each row execute function slice_2b_merge_partial_metadata();
drop trigger if exists rounds_slice_2b_partial_merge on rounds;
create trigger rounds_slice_2b_partial_merge
  before update on rounds
  for each row execute function slice_2b_preserve_partial_snapshot_fields();
drop trigger if exists rounds_slice_2b_partial_metadata on rounds;
create trigger rounds_slice_2b_partial_metadata
  before update on rounds
  for each row execute function slice_2b_merge_partial_metadata();
drop trigger if exists contests_slice_2b_partial_merge on contests;
drop trigger if exists contests_slice_2b_partial_insert_merge on contests;
create trigger contests_slice_2b_partial_insert_merge
  before insert on contests
  for each row execute function slice_2b_merge_partial_contest_insert();
create trigger contests_slice_2b_partial_merge
  before update on contests
  for each row execute function slice_2b_preserve_partial_snapshot_fields();
drop trigger if exists contests_slice_2b_partial_metadata on contests;
create trigger contests_slice_2b_partial_metadata
  before update on contests
  for each row execute function slice_2b_merge_partial_metadata();
drop trigger if exists contest_entries_slice_2b_partial_merge on contest_entries;
create trigger contest_entries_slice_2b_partial_merge
  before update on contest_entries
  for each row execute function slice_2b_preserve_partial_snapshot_fields();
drop trigger if exists contest_entries_slice_2b_partial_metadata on contest_entries;
create trigger contest_entries_slice_2b_partial_metadata
  before update on contest_entries
  for each row execute function slice_2b_merge_partial_metadata();
drop trigger if exists brackets_slice_2b_partial_merge on brackets;
create trigger brackets_slice_2b_partial_merge
  before update on brackets
  for each row execute function slice_2b_preserve_partial_snapshot_fields();
drop trigger if exists brackets_slice_2b_partial_metadata on brackets;
create trigger brackets_slice_2b_partial_metadata
  before update on brackets
  for each row execute function slice_2b_merge_partial_metadata();
drop trigger if exists bracket_edges_slice_2b_partial_merge on bracket_edges;
create trigger bracket_edges_slice_2b_partial_merge
  before update on bracket_edges
  for each row execute function slice_2b_preserve_partial_snapshot_fields();
drop trigger if exists bracket_edges_slice_2b_partial_metadata on bracket_edges;
create trigger bracket_edges_slice_2b_partial_metadata
  before update on bracket_edges
  for each row execute function slice_2b_merge_partial_metadata();

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
  v_partial boolean;
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
  v_partial := v_observation.metadata->>'completeness' = 'partial';
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
    update organizations set
      name = case when v_partial then coalesce(v_data->>'name', name) else v_data->>'name' end,
      kind = case when v_partial then coalesce(v_data->>'organizationKind', kind) else v_data->>'organizationKind' end,
      official_url = case when v_partial then coalesce(v_data->>'officialUrl', official_url) else v_data->>'officialUrl' end,
      metadata = case when v_partial then metadata || coalesce(v_data->'metadata','{}'::jsonb) else v_data->'metadata' end,
      updated_at = now()
    where id = v_canonical_id;
  elsif v_kind = 'competition' then
    perform 1 from competitions where id = v_canonical_id for update;
    if not found then
      select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'mapping_missing','blocking',v_kind,v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','mapped competition does not exist')) oq;
      return query select 'quarantined'::text, v_canonical_id, v_quarantine_id; return;
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
    update competitions set
      organization_id = coalesce(v_parent_id, organization_id),
      name = case when v_partial then coalesce(v_data->>'name', name) else v_data->>'name' end,
      domain = case when v_partial then coalesce(v_data->>'domain', domain) else v_data->>'domain' end,
      sport_code = case when v_partial then coalesce(v_data->>'sportCode', sport_code) else v_data->>'sportCode' end,
      official_url = case when v_partial then coalesce(v_data->>'officialUrl', official_url) else v_data->>'officialUrl' end,
      rules_metadata = case when v_partial then rules_metadata || coalesce(v_data->'rulesMetadata','{}'::jsonb) else v_data->'rulesMetadata' end,
      updated_at = now()
    where id = v_canonical_id;
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
    update event_editions set
      name = case when v_partial then coalesce(v_data->>'name', name) else v_data->>'name' end,
      season_label = case when v_partial then coalesce(v_data->>'seasonLabel', season_label) else v_data->>'seasonLabel' end,
      timezone = case when v_partial then coalesce(v_data->>'timezone', timezone) else v_data->>'timezone' end,
      status = case when v_partial then coalesce(v_data->>'status', status) else v_data->>'status' end,
      starts_at = case when v_partial and not (v_data ? 'startsAt') then starts_at else nullif(v_data->>'startsAt','')::timestamptz end,
      ends_at = case when v_partial and not (v_data ? 'endsAt') then ends_at else nullif(v_data->>'endsAt','')::timestamptz end,
      official_url = case when v_partial then coalesce(v_data->>'officialUrl', official_url) else v_data->>'officialUrl' end,
      metadata = case when v_partial then metadata || coalesce(v_data->'metadata','{}'::jsonb) else v_data->'metadata' end,
      updated_at = now()
    where id = v_canonical_id;
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
    update competitors set
      organization_id = coalesce(v_parent_id, organization_id),
      kind = case when v_partial then coalesce(v_data->>'competitorKind', kind) else v_data->>'competitorKind' end,
      canonical_name = case when v_partial then coalesce(v_data->>'canonicalName', canonical_name) else v_data->>'canonicalName' end,
      short_name = case when v_partial then coalesce(v_data->>'shortName', short_name) else v_data->>'shortName' end,
      country_code = case when v_partial then coalesce(v_data->>'countryCode', country_code) else v_data->>'countryCode' end,
      metadata = case when v_partial then metadata || coalesce(v_data->'metadata','{}'::jsonb) else v_data->'metadata' end,
      updated_at = now()
    where id = v_canonical_id;
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
  if v_mode <> 'write' then return query select 'skipped_non_write'::text,null::uuid,null::uuid; return; end if;
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
        select csps.* into v_state from canonical_structural_projection_state csps where csps.entity_kind='contest' and csps.canonical_id=v_contest_id and csps.event_edition_id=v_observation.event_edition_id for update;
        v_incoming_time := coalesce(v_observation.provider_updated_at,v_observation.received_at);
        v_current_time := coalesce(v_state.last_provider_updated_at,v_state.last_received_at);
        v_incoming_rank := case v_data->>'status' when 'scheduled' then 0 when 'pregame' then 1 when 'postponed' then 1 when 'live' then 2 when 'suspended' then 2 when 'final' then 3 when 'canceled' then 3 when 'void' then 3 else -1 end;
        v_current_rank := case v_current_status when 'scheduled' then 0 when 'pregame' then 1 when 'postponed' then 1 when 'live' then 2 when 'suspended' then 2 when 'final' then 3 when 'canceled' then 3 when 'void' then 3 else -1 end;
        if v_incoming_rank < v_current_rank or (v_current_rank = 3 and v_incoming_rank = 3 and v_data->>'status' <> v_current_status) then
          select oq.id into v_q from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'illegal_regression','error','contest',v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','contest lifecycle status regressed')) oq;
          return query select 'quarantined'::text,v_contest_id,v_q; return;
        end if;
        if (v_state.last_provider_updated_at is not null and v_observation.provider_updated_at is null) or v_incoming_time < v_current_time then
          select oq.id into v_q from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'stale_update','warning','contest',v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','older contest lifecycle observation')) oq;
          return query select 'quarantined'::text,v_contest_id,v_q; return;
        end if;
        if v_incoming_time = v_current_time and ((v_data->>'status') <> v_current_status or v_state.semantic_hash <> v_observation.metadata->>'semanticHash') then
          select oq.id into v_q from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'stale_update','warning','contest',v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','equal lifecycle timestamp changed semantics')) oq;
          return query select 'quarantined'::text,v_contest_id,v_q; return;
        end if;
      end if;
    end;
  end if;
  perform set_config('slice2b.partial_snapshot', case when exists (select 1 from provider_observations po where po.id=p_observation_id and po.metadata->>'completeness'='partial') then 'true' else 'false' end, true);
  select * into v_result from project_structural_observation_unchecked(p_observation_id);
  perform set_config('slice2b.partial_snapshot', 'false', true);
  if v_result.outcome in ('projected', 'unchanged') then perform slice_2b_resolve_quarantine(p_observation_id); end if;
  return query select v_result.outcome::text,v_result.canonical_id::uuid,v_result.quarantine_id::uuid;
end;
$$;

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
    return query select 'skipped_non_write'::text, null::uuid, null::integer, null::uuid, null::uuid, null::uuid, null::text;
    return;
  end if;
  select * into v_result from project_provider_result_unchecked(p_observation_id, p_result_idempotency_key);
  if v_result.outcome in ('projected', 'duplicate') then perform slice_2b_resolve_quarantine(p_observation_id); end if;
  return query select v_result.outcome::text, v_result.contest_result_id::uuid, v_result.result_version::integer,
    v_result.audit_event_id::uuid, v_result.outbox_id::uuid, v_result.quarantine_id::uuid, v_result.prior_outcome::text;
end;
$$;

-- The wrappers are the only service-role projection RPC boundaries. Helpers
-- remain callable by their SECURITY DEFINER owners, never by service_role.
revoke all on function project_structural_observation(uuid) from public, anon, authenticated, service_role;
revoke all on function project_structural_observation_unchecked(uuid) from public, anon, authenticated, service_role;
revoke all on function project_provider_result(uuid,text) from public, anon, authenticated, service_role;
revoke all on function project_provider_result_unchecked(uuid,text) from public, anon, authenticated, service_role;
revoke all on function slice_2b_project_root_observation(uuid) from public, anon, authenticated, service_role;
revoke all on function slice_2b_resolve_quarantine(uuid) from public, anon, authenticated, service_role;
revoke all on function slice_2b_canonical_number(jsonb) from public, anon, authenticated, service_role;
grant execute on function project_structural_observation(uuid) to service_role;
grant execute on function project_provider_result(uuid,text) to service_role;

revoke all on table canonical_structural_projection_scope from public, anon, authenticated, service_role;
grant select on table canonical_structural_projection_scope to service_role;

comment on table canonical_structural_projection_scope is
  'Edition-scoped structural ordering provenance. Direct service_role writes are denied; SECURITY DEFINER projection wrappers own writes.';
