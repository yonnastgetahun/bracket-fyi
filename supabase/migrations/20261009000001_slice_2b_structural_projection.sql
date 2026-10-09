-- Bracket.fyi Slice 2B.4 — canonical structural projection and provenance.
-- Forward-only. Structural projection excludes results, legacy scoring, and lifecycle writes.

create table canonical_structural_projection_state (
  id                         uuid primary key default gen_random_uuid(),
  event_edition_id           uuid not null references event_editions(id) on delete restrict,
  entity_kind                text not null,
  canonical_id               uuid not null,
  last_observation_id        uuid not null,
  last_provider_updated_at   timestamptz,
  last_received_at           timestamptz not null,
  semantic_hash               text not null,
  completeness                text not null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint canonical_structural_projection_state_kind_id_unique unique (entity_kind, canonical_id),
  foreign key (last_observation_id, event_edition_id)
    references provider_observations(id, event_edition_id) on delete restrict,
  constraint canonical_structural_projection_kind_valid
    check (entity_kind in (
      'organization', 'competition', 'event_edition', 'competitor', 'event_entry',
      'stage', 'round', 'contest', 'bracket'
    )),
  constraint canonical_structural_projection_hash_valid
    check (semantic_hash ~ '^[a-f0-9]{64}$'),
  constraint canonical_structural_projection_completeness_valid
    check (completeness in ('full', 'partial'))
);

create index canonical_structural_projection_edition_idx
  on canonical_structural_projection_state (event_edition_id, entity_kind);

alter table canonical_structural_projection_state enable row level security;

create or replace function project_structural_observation(p_observation_id uuid)
returns table (
  outcome text,
  canonical_id uuid,
  quarantine_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_observation provider_observations%rowtype;
  v_data jsonb;
  v_kind text;
  v_semantic_hash text;
  v_canonical_id uuid;
  v_existing_status text;
  v_state canonical_structural_projection_state%rowtype;
  v_quarantine_id uuid;
  v_parent_id uuid;
  v_stage_id uuid;
  v_round_id uuid;
  v_event_edition_id uuid;
  v_map_outcome text;
  v_cycle boolean;
begin
  select * into v_observation
  from provider_observations po
  where po.id = p_observation_id
  for update;

  if v_observation.id is null then
    raise exception 'structural projection requires an existing observation' using errcode = '23503';
  end if;

  v_event_edition_id := v_observation.event_edition_id;
  v_kind := v_observation.external_object_kind;
  v_data := v_observation.metadata->'normalizedEntity';
  v_semantic_hash := v_observation.metadata->>'semanticHash';

  if v_data is null or jsonb_typeof(v_data) <> 'object'
    or v_semantic_hash is null then
    select oq.id into v_quarantine_id from open_ingestion_quarantine(
      v_observation.id, v_observation.ingestion_run_id, v_observation.binding_id,
      'unsupported_shape', 'blocking', v_kind, v_observation.external_object_id, '{}'::uuid[],
      jsonb_build_object('reason', 'validated normalized snapshot is missing or entity kind mismatches')
    ) oq;
    return query select 'quarantined'::text, null::uuid, v_quarantine_id;
    return;
  end if;

  if v_kind = 'result' then
    select oq.id into v_quarantine_id from open_ingestion_quarantine(
      v_observation.id, v_observation.ingestion_run_id, v_observation.binding_id,
      'unsupported_shape', 'blocking', v_kind, v_observation.external_object_id, '{}'::uuid[],
      jsonb_build_object('reason', 'result observations use the atomic result projection boundary')
    ) oq;
    return query select 'quarantined'::text, null::uuid, v_quarantine_id;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'bracket-fyi:structural:' || v_observation.binding_id::text || ':' || v_kind || ':' || v_observation.external_object_id,
    0
  ));

  select per.canonical_id, per.resolution_status
  into v_canonical_id, v_existing_status
  from provider_entity_refs per
  where per.binding_id = v_observation.binding_id
    and per.entity_kind = v_kind
    and per.external_id = v_observation.external_object_id
  for update;

  if v_existing_status is not null and v_existing_status in ('unresolved', 'rejected') then
    v_canonical_id := null;
  end if;

  if v_kind in ('organization', 'competition', 'event_edition', 'competitor')
    and v_canonical_id is null then
    select oq.id into v_quarantine_id from open_ingestion_quarantine(
      v_observation.id, v_observation.ingestion_run_id, v_observation.binding_id,
      'mapping_missing', 'blocking', v_kind, v_observation.external_object_id, '{}'::uuid[],
      jsonb_build_object('reason', 'D1 root entity requires a pre-provisioned or reviewed mapping')
    ) oq;
    return query select 'quarantined'::text, null::uuid, v_quarantine_id;
    return;
  end if;

  if v_canonical_id is not null then
    select * into v_state
    from canonical_structural_projection_state csps
    where csps.entity_kind = v_kind
      and csps.canonical_id = v_canonical_id
    for update;

    if v_state.id is not null then
      if v_observation.provider_updated_at is null and v_state.last_provider_updated_at is not null then
        select oq.id into v_quarantine_id from open_ingestion_quarantine(
          v_observation.id, v_observation.ingestion_run_id, v_observation.binding_id,
          'stale_update', 'warning', v_kind, v_observation.external_object_id, '{}'::uuid[],
          jsonb_build_object('reason', 'missing structural provider timestamp cannot replace newer state')
        ) oq;
        return query select 'quarantined'::text, v_canonical_id, v_quarantine_id;
        return;
      end if;
      if v_observation.provider_updated_at is not null
        and v_state.last_provider_updated_at is not null
        and v_observation.provider_updated_at < v_state.last_provider_updated_at then
        select oq.id into v_quarantine_id from open_ingestion_quarantine(
          v_observation.id, v_observation.ingestion_run_id, v_observation.binding_id,
          'stale_update', 'warning', v_kind, v_observation.external_object_id, '{}'::uuid[],
          jsonb_build_object('reason', 'older structural provider timestamp')
        ) oq;
        return query select 'quarantined'::text, v_canonical_id, v_quarantine_id;
        return;
      end if;
      if v_observation.provider_updated_at is not distinct from v_state.last_provider_updated_at
        and v_semantic_hash = v_state.semantic_hash then
        return query select 'unchanged'::text, v_canonical_id, null::uuid;
        return;
      end if;
      if v_observation.provider_updated_at is not distinct from v_state.last_provider_updated_at then
        select oq.id into v_quarantine_id from open_ingestion_quarantine(
          v_observation.id, v_observation.ingestion_run_id, v_observation.binding_id,
          'stale_update', 'warning', v_kind, v_observation.external_object_id, '{}'::uuid[],
          jsonb_build_object('reason', 'equal structural timestamp changed semantics')
        ) oq;
        return query select 'quarantined'::text, v_canonical_id, v_quarantine_id;
        return;
      end if;
    end if;
  end if;

  if v_kind = 'event_entry' then
    select per.canonical_id into v_stage_id from provider_entity_refs per
    where per.binding_id = v_observation.binding_id and per.entity_kind = 'event_edition'
      and per.external_id = v_data->>'eventEditionExternalId'
      and per.resolution_status in ('automatic', 'reviewed');
    select per.canonical_id into v_round_id from provider_entity_refs per
    where per.binding_id = v_observation.binding_id and per.entity_kind = 'competitor'
      and per.external_id = v_data->>'competitorExternalId'
      and per.resolution_status in ('automatic', 'reviewed');
    if v_stage_id is null or v_round_id is null then
      select oq.id into v_quarantine_id from open_ingestion_quarantine(
        v_observation.id, v_observation.ingestion_run_id, v_observation.binding_id,
        'mapping_missing', 'blocking', v_kind, v_observation.external_object_id, '{}'::uuid[],
        jsonb_build_object('reason', 'event entry requires edition and competitor mappings')
      ) oq;
      return query select 'quarantined'::text, null::uuid, v_quarantine_id;
      return;
    end if;
    insert into event_entries (event_edition_id, competitor_id, seed, region, conference, role, status, metadata)
    values (v_event_edition_id, v_round_id, nullif(v_data->>'seed','')::integer, v_data->>'region', v_data->>'conference', v_data->>'role', v_data->>'status', v_data->'metadata')
    on conflict (event_edition_id, competitor_id) do update set
      seed = excluded.seed, region = excluded.region, conference = excluded.conference,
      role = excluded.role, status = excluded.status, metadata = excluded.metadata, updated_at = now()
    returning id into v_canonical_id;
  elsif v_kind = 'stage' then
    select per.canonical_id into v_stage_id from provider_entity_refs per
    where per.binding_id = v_observation.binding_id and per.entity_kind = 'event_edition'
      and per.external_id = v_data->>'eventEditionExternalId' and per.resolution_status in ('automatic','reviewed');
    if v_stage_id is null then
      select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'mapping_missing','blocking',v_kind,v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','stage requires event edition mapping')) oq;
      return query select 'quarantined'::text,null::uuid,v_quarantine_id; return;
    end if;
    if v_data->>'parentStageExternalId' is not null then
      select per.canonical_id into v_parent_id from provider_entity_refs per where per.binding_id=v_observation.binding_id and per.entity_kind='stage' and per.external_id=v_data->>'parentStageExternalId' and per.resolution_status in ('automatic','reviewed');
      if v_parent_id is null then
        select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'mapping_missing','blocking',v_kind,v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','stage parent mapping is missing')) oq;
        return query select 'quarantined'::text,null::uuid,v_quarantine_id; return;
      end if;
    end if;
    insert into stages (event_edition_id,parent_stage_id,stage_key,name,kind,ordinal,starts_at,ends_at,metadata)
    values (v_stage_id,v_parent_id,v_data->>'stageKey',v_data->>'name',v_data->>'stageKind',(v_data->>'ordinal')::integer,(v_data->>'startsAt')::timestamptz,(v_data->>'endsAt')::timestamptz,v_data->'metadata')
    on conflict (event_edition_id, stage_key) do update set parent_stage_id=excluded.parent_stage_id,name=excluded.name,kind=excluded.kind,ordinal=excluded.ordinal,starts_at=excluded.starts_at,ends_at=excluded.ends_at,metadata=excluded.metadata,updated_at=now()
    returning id into v_canonical_id;
  elsif v_kind = 'round' then
    select per.canonical_id into v_stage_id from provider_entity_refs per where per.binding_id=v_observation.binding_id and per.entity_kind='stage' and per.external_id=v_data->>'stageExternalId' and per.resolution_status in ('automatic','reviewed');
    if v_stage_id is null then
      select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'mapping_missing','blocking',v_kind,v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','round requires stage mapping')) oq;
      return query select 'quarantined'::text,null::uuid,v_quarantine_id; return;
    end if;
    insert into rounds (event_edition_id,stage_id,round_key,name,ordinal,provider_label,starts_at,ends_at,metadata)
    values (v_event_edition_id,v_stage_id,v_data->>'roundKey',v_data->>'name',(v_data->>'ordinal')::integer,v_data->>'providerLabel',(v_data->>'startsAt')::timestamptz,(v_data->>'endsAt')::timestamptz,v_data->'metadata')
    on conflict (stage_id, round_key) do update set name=excluded.name,ordinal=excluded.ordinal,provider_label=excluded.provider_label,starts_at=excluded.starts_at,ends_at=excluded.ends_at,metadata=excluded.metadata,updated_at=now()
    returning id into v_canonical_id;
  elsif v_kind = 'contest' then
    select per.canonical_id into v_stage_id from provider_entity_refs per where per.binding_id=v_observation.binding_id and per.entity_kind='stage' and per.external_id=v_data->>'stageExternalId' and per.resolution_status in ('automatic','reviewed');
    if v_stage_id is null then
      select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'mapping_missing','blocking',v_kind,v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','contest requires stage mapping')) oq;
      return query select 'quarantined'::text,null::uuid,v_quarantine_id; return;
    end if;
    if v_data->>'roundExternalId' is not null then
      select per.canonical_id into v_round_id from provider_entity_refs per where per.binding_id=v_observation.binding_id and per.entity_kind='round' and per.external_id=v_data->>'roundExternalId' and per.resolution_status in ('automatic','reviewed');
      if v_round_id is null then
        select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'mapping_missing','blocking',v_kind,v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','contest round mapping is missing')) oq;
        return query select 'quarantined'::text,null::uuid,v_quarantine_id; return;
      end if;
    end if;
    if v_data->>'parentContestExternalId' is not null then
      select per.canonical_id into v_parent_id from provider_entity_refs per where per.binding_id=v_observation.binding_id and per.entity_kind='contest' and per.external_id=v_data->>'parentContestExternalId' and per.resolution_status in ('automatic','reviewed');
      if v_parent_id is null then
        select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'mapping_missing','blocking',v_kind,v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','contest parent mapping is missing')) oq;
        return query select 'quarantined'::text,null::uuid,v_quarantine_id; return;
      end if;
    end if;
    if exists (
      select 1
      from jsonb_array_elements(v_data->'entries') as entry(value)
      where not exists (
        select 1 from provider_entity_refs per
        where per.binding_id = v_observation.binding_id
          and per.entity_kind = 'event_entry'
          and per.external_id = entry.value->>'eventEntryExternalId'
          and per.resolution_status in ('automatic','reviewed')
      )
    ) then
      select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'mapping_missing','blocking',v_kind,v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','contest entry mapping is missing')) oq;
      return query select 'quarantined'::text,null::uuid,v_quarantine_id; return;
    end if;
    if exists (select 1 from jsonb_array_elements(v_data->'entries') as entry(value) group by entry.value->>'eventEntryExternalId' having count(*) > 1)
      or exists (select 1 from jsonb_array_elements(v_data->'entries') as entry(value) group by (entry.value->>'ordinal')::integer having count(*) > 1) then
      select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'unsupported_shape','blocking',v_kind,v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','contest entries repeat an external identity or ordinal')) oq;
      return query select 'quarantined'::text,null::uuid,v_quarantine_id; return;
    end if;
    insert into contests (event_edition_id,stage_id,round_id,parent_contest_id,contest_key,name,kind,status,scheduled_at,starts_at,ends_at,best_of,required_for_completion,metadata)
    values (v_event_edition_id,v_stage_id,v_round_id,v_parent_id,v_data->>'contestKey',v_data->>'name',v_data->>'contestKind',v_data->>'status',(v_data->>'scheduledAt')::timestamptz,(v_data->>'startsAt')::timestamptz,(v_data->>'endsAt')::timestamptz,(v_data->>'bestOf')::integer,(v_data->>'requiredForCompletion')::boolean,v_data->'metadata')
    on conflict (event_edition_id,contest_key) do update set stage_id=excluded.stage_id,round_id=excluded.round_id,parent_contest_id=excluded.parent_contest_id,name=excluded.name,kind=excluded.kind,status=excluded.status,scheduled_at=excluded.scheduled_at,starts_at=excluded.starts_at,ends_at=excluded.ends_at,best_of=excluded.best_of,required_for_completion=excluded.required_for_completion,metadata=excluded.metadata,updated_at=now()
    returning id into v_canonical_id;
    if exists (
      select 1
      from contest_entries ce
      join jsonb_array_elements(v_data->'entries') as entry(value) on ce.ordinal = (entry.value->>'ordinal')::integer
      join provider_entity_refs per on per.binding_id=v_observation.binding_id and per.entity_kind='event_entry' and per.external_id=entry.value->>'eventEntryExternalId' and per.resolution_status in ('automatic','reviewed')
      where ce.contest_id=v_canonical_id and ce.event_entry_id<>per.canonical_id
    ) then
      select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'unsupported_shape','blocking',v_kind,v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','contest ordinal already belongs to another entry')) oq;
      return query select 'quarantined'::text,null::uuid,v_quarantine_id; return;
    end if;
    insert into contest_entries (event_edition_id,contest_id,event_entry_id,role,side,ordinal,metadata)
    select v_event_edition_id,v_canonical_id,per.canonical_id,entry.value->>'role',entry.value->>'side',(entry.value->>'ordinal')::integer,entry.value->'metadata'
    from jsonb_array_elements(v_data->'entries') as entry(value)
    join provider_entity_refs per on per.binding_id=v_observation.binding_id and per.entity_kind='event_entry' and per.external_id=entry.value->>'eventEntryExternalId' and per.resolution_status in ('automatic','reviewed')
    on conflict (contest_id,event_entry_id) do update set role=excluded.role,side=excluded.side,ordinal=excluded.ordinal,metadata=excluded.metadata;
  elsif v_kind = 'bracket' then
    if v_data->>'stageExternalId' is not null then
      select per.canonical_id into v_stage_id from provider_entity_refs per where per.binding_id=v_observation.binding_id and per.entity_kind='stage' and per.external_id=v_data->>'stageExternalId' and per.resolution_status in ('automatic','reviewed');
      if v_stage_id is null then
        select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'mapping_missing','blocking',v_kind,v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','bracket stage mapping is missing')) oq;
        return query select 'quarantined'::text,null::uuid,v_quarantine_id; return;
      end if;
    end if;
    if exists (
      select 1
      from jsonb_array_elements(v_data->'edges') as edge(value)
      left join provider_entity_refs from_ref on from_ref.binding_id=v_observation.binding_id and from_ref.entity_kind='contest' and from_ref.external_id=edge.value->>'fromContestExternalId' and from_ref.resolution_status in ('automatic','reviewed')
      left join provider_entity_refs to_ref on to_ref.binding_id=v_observation.binding_id and to_ref.entity_kind='contest' and to_ref.external_id=edge.value->>'toContestExternalId' and to_ref.resolution_status in ('automatic','reviewed')
      where from_ref.canonical_id is null or to_ref.canonical_id is null or from_ref.canonical_id=to_ref.canonical_id
    ) then
      select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'unsupported_shape','blocking',v_kind,v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','bracket edge dependency missing or self-referential')) oq;
      return query select 'quarantined'::text,null::uuid,v_quarantine_id; return;
    end if;
    with recursive proposed(from_contest_id,to_contest_id) as (
      select from_ref.canonical_id,to_ref.canonical_id
      from jsonb_array_elements(v_data->'edges') as edge(value)
      join provider_entity_refs from_ref on from_ref.binding_id=v_observation.binding_id and from_ref.entity_kind='contest' and from_ref.external_id=edge.value->>'fromContestExternalId' and from_ref.resolution_status in ('automatic','reviewed')
      join provider_entity_refs to_ref on to_ref.binding_id=v_observation.binding_id and to_ref.entity_kind='contest' and to_ref.external_id=edge.value->>'toContestExternalId' and to_ref.resolution_status in ('automatic','reviewed')
    ), all_edges(from_contest_id,to_contest_id) as (
      select be.from_contest_id,be.to_contest_id from bracket_edges be where v_canonical_id is not null and be.bracket_id=v_canonical_id
      union
      select from_contest_id,to_contest_id from proposed
    ), reach(from_contest_id,to_contest_id) as (
      select from_contest_id,to_contest_id from all_edges
      union
      select r.from_contest_id,e.to_contest_id from reach r join all_edges e on e.from_contest_id=r.to_contest_id
    ) select exists(select 1 from reach where from_contest_id=to_contest_id) into v_cycle;
    if v_cycle then
      select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'unsupported_shape','blocking',v_kind,v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','bracket graph cycle')) oq;
      return query select 'quarantined'::text,null::uuid,v_quarantine_id; return;
    end if;
    insert into brackets (event_edition_id,stage_id,bracket_key,name,kind,metadata)
    values (v_event_edition_id,v_stage_id,v_data->>'bracketKey',v_data->>'name',v_data->>'bracketKind',v_data->'metadata')
    on conflict (event_edition_id,bracket_key) do update set stage_id=excluded.stage_id,name=excluded.name,kind=excluded.kind,metadata=excluded.metadata
    returning id into v_canonical_id;
    insert into bracket_edges (bracket_id,event_edition_id,from_contest_id,to_contest_id,outcome,target_role,priority,metadata)
    select v_canonical_id,v_event_edition_id,from_ref.canonical_id,to_ref.canonical_id,edge.value->>'outcome',edge.value->>'targetRole',(edge.value->>'priority')::integer,edge.value->'metadata'
    from jsonb_array_elements(v_data->'edges') as edge(value)
    join provider_entity_refs from_ref on from_ref.binding_id=v_observation.binding_id and from_ref.entity_kind='contest' and from_ref.external_id=edge.value->>'fromContestExternalId' and from_ref.resolution_status in ('automatic','reviewed')
    join provider_entity_refs to_ref on to_ref.binding_id=v_observation.binding_id and to_ref.entity_kind='contest' and to_ref.external_id=edge.value->>'toContestExternalId' and to_ref.resolution_status in ('automatic','reviewed')
    on conflict do nothing;
  end if;

  if v_canonical_id is null then
    v_canonical_id := (select per.canonical_id from provider_entity_refs per where per.binding_id=v_observation.binding_id and per.entity_kind=v_kind and per.external_id=v_observation.external_object_id and per.resolution_status in ('automatic','reviewed'));
  end if;

  if v_canonical_id is null then
    select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'mapping_missing','blocking',v_kind,v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','structural projection did not resolve a canonical identity')) oq;
    return query select 'quarantined'::text,null::uuid,v_quarantine_id; return;
  end if;

  if not exists (select 1 from provider_entity_refs per where per.binding_id=v_observation.binding_id and per.entity_kind=v_kind and per.external_id=v_observation.external_object_id) then
    select m.outcome, m.canonical_id into v_map_outcome, v_canonical_id
    from upsert_provider_entity_mapping(v_observation.binding_id,v_kind,v_observation.external_object_id,v_canonical_id,'automatic',1,null,null,jsonb_build_object('normalizationPolicyVersion','identity-normalization-v1','projectionObservationId',v_observation.id::text)) m;
    if v_map_outcome = 'conflict' then
      select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'mapping_ambiguous','blocking',v_kind,v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','structural mapping transition conflicted')) oq;
      return query select 'quarantined'::text,v_canonical_id,v_quarantine_id; return;
    end if;
  end if;

  insert into canonical_structural_projection_state (event_edition_id,entity_kind,canonical_id,last_observation_id,last_provider_updated_at,last_received_at,semantic_hash,completeness)
  values (v_event_edition_id,v_kind,v_canonical_id,v_observation.id,v_observation.provider_updated_at,v_observation.received_at,v_semantic_hash,v_observation.metadata->>'completeness')
  on conflict on constraint canonical_structural_projection_state_kind_id_unique do update set last_observation_id=excluded.last_observation_id,last_provider_updated_at=excluded.last_provider_updated_at,last_received_at=excluded.last_received_at,semantic_hash=excluded.semantic_hash,completeness=excluded.completeness,updated_at=now();

  return query select 'projected'::text,v_canonical_id,null::uuid;
end;
$$;

revoke all on table canonical_structural_projection_state from public, anon, authenticated;
grant select, insert, update on table canonical_structural_projection_state to service_role;
revoke all on function project_structural_observation(uuid) from public, anon, authenticated;
grant execute on function project_structural_observation(uuid) to service_role;
