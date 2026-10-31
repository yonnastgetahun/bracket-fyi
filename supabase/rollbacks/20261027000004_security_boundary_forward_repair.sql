-- Forward-only repair: reassert the closed browser/identity boundary.
-- Does not restore insecure grants, erase evidence, or auto-review legacy mappings.
-- Replay after schema restoration; provision/review mappings before resuming ingestion.
begin;
-- SEC-03 / GAP-01: browser access goes through authorized, allowlisted server DTOs.
-- Row policies cannot protect bearer columns; owner-rights views are not auth APIs.
revoke all privileges on table public.leagues, public.participants, public.picks,
  public.effective_results, public.v_pick_results, public.v_champion_status, public.v_leaderboard
  from public, anon, authenticated;

-- Remove any independent column grants too (table REVOKE does not remove them).
do $$
declare target record;
begin
  for target in
    select c.relname, a.attname from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    where n.nspname='public' and c.relname in
      ('leagues','participants','picks','effective_results','v_pick_results','v_champion_status','v_leaderboard')
  loop
    execute format('revoke all privileges (%I) on table public.%I from public, anon, authenticated',
      target.attname,target.relname);
  end loop;
end;
$$;

-- SEC-01/02: automatic rows are proposals. No trusted bootstrap verifier exists.
-- Gate the public RPCs, not just the standalone TypeScript identity resolver.
create or replace function security_reviewed_observation_identity(p_observation_id uuid)
returns uuid
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  observation provider_observations%rowtype;
  mapping provider_entity_refs%rowtype;
  required record;
  data jsonb;
  quarantine uuid;
begin
  select * into observation from provider_observations where id=p_observation_id for update;
  if observation.id is null then
    raise exception 'identity admission requires an existing observation' using errcode='23503';
  end if;
  data := observation.metadata->'normalizedEntity';
  if jsonb_typeof(data) is distinct from 'object' then
    select q.id into quarantine from open_ingestion_quarantine(
      observation.id,observation.ingestion_run_id,observation.binding_id,
      'unsupported_shape','blocking',observation.external_object_kind,observation.external_object_id,
      '{}'::uuid[],jsonb_build_object('reason','normalized identity envelope is missing')) q;
    return quarantine;
  end if;

  -- Enumerate only identity fields consumed by current projectors, never metadata.
  -- Structural creation also requires a provisioned reviewed subject association.
  -- Results have no result mapping: contest + optional winner are their identities.
  for required in
    with objects(value) as (
      select data
      union all select value from jsonb_array_elements(
        case when jsonb_typeof(data->'entries')='array' then data->'entries' else '[]'::jsonb end)
        where observation.external_object_kind <> 'result'
      union all select value from jsonb_array_elements(
        case when jsonb_typeof(data->'edges')='array' then data->'edges' else '[]'::jsonb end)
        where observation.external_object_kind <> 'result'
    ), fields(field,kind) as (values
      ('organizationExternalId','organization'),('competitionExternalId','competition'),
      ('eventEditionExternalId','event_edition'),('competitorExternalId','competitor'),
      ('stageExternalId','stage'),('parentStageExternalId','stage'),('roundExternalId','round'),
      ('contestExternalId','contest'),('parentContestExternalId','contest'),
      ('fromContestExternalId','contest'),('toContestExternalId','contest'),
      ('eventEntryExternalId','event_entry'),('winnerEventEntryExternalId','event_entry')
    ), required_refs(kind,external_id) as (
      select observation.external_object_kind,observation.external_object_id
        where observation.external_object_kind <> 'result'
      union all
      select fields.kind,objects.value->>fields.field from objects cross join fields
      where objects.value->>fields.field is not null
        and (observation.external_object_kind <> 'result'
          or fields.field in ('contestExternalId','winnerEventEntryExternalId'))
    )
    select distinct kind,external_id from required_refs order by kind,external_id
  loop
    select * into mapping from provider_entity_refs
      where binding_id=observation.binding_id and entity_kind=required.kind and external_id=required.external_id
      for update;
    if mapping.id is null or mapping.resolution_status <> 'reviewed'
      or mapping.canonical_id is null or nullif(btrim(mapping.reviewed_by),'') is null
      or mapping.reviewed_at is null
      or mapping.provider_id <> observation.provider_id
      or mapping.event_edition_id <> observation.event_edition_id
      or not slice_2b_candidate_belongs_to_edition(required.kind,mapping.canonical_id,observation.event_edition_id) then
      select q.id into quarantine from open_ingestion_quarantine(
        observation.id,observation.ingestion_run_id,observation.binding_id,
        'mapping_missing','blocking',required.kind,required.external_id,
        '{}'::uuid[],jsonb_build_object('reason','projection requires a scoped reviewed identity; automatic provenance claims are advisory')) q;
      return quarantine;
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function security_reviewed_observation_identity(uuid) from public,anon,authenticated,service_role;

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
  v_identity_quarantine uuid;
begin
  select pb.mode, po.external_object_kind into v_mode, v_kind
  from provider_observations po join provider_bindings pb on pb.id=po.binding_id
  where po.id=p_observation_id for update;
  if v_mode is null then raise exception 'structural projection requires an existing provider observation' using errcode='23503'; end if;
  if v_mode <> 'write' then return query select 'skipped_non_write'::text,null::uuid,null::uuid; return; end if;
  v_identity_quarantine := security_reviewed_observation_identity(p_observation_id);
  if v_identity_quarantine is not null then
    return query select 'quarantined'::text,null::uuid,v_identity_quarantine;
    return;
  end if;
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
  -- Legacy structural upserts use natural keys. A reviewed provider association
  -- must not authorize writing a different canonical object via those keys.
  begin
    select * into v_result from project_structural_observation_unchecked(p_observation_id);
    if v_result.outcome in ('projected','unchanged') and v_result.canonical_id is distinct from (
      select per.canonical_id from provider_observations po
      join provider_entity_refs per on per.binding_id=po.binding_id
        and per.entity_kind=po.external_object_kind and per.external_id=po.external_object_id
      where po.id=p_observation_id
    ) then
      raise exception 'structural projection changed reviewed canonical identity' using errcode='P3001';
    end if;
  exception when sqlstate 'P3001' then
    -- Subtransaction rollback includes canonical writes and provenance updates.
    select q.id into v_identity_quarantine from provider_observations po
      cross join lateral open_ingestion_quarantine(po.id,po.ingestion_run_id,po.binding_id,
        'mapping_ambiguous','blocking',po.external_object_kind,po.external_object_id,
        '{}'::uuid[],jsonb_build_object('reason','structural natural key conflicts with reviewed identity')) q
      where po.id=p_observation_id;
    perform set_config('slice2b.partial_snapshot','false',true);
    return query select 'quarantined'::text,null::uuid,v_identity_quarantine;
    return;
  end;
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
  v_identity_quarantine uuid;
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
  v_identity_quarantine := security_reviewed_observation_identity(p_observation_id);
  if v_identity_quarantine is not null then
    return query select 'quarantined'::text,null::uuid,null::integer,null::uuid,null::uuid,v_identity_quarantine,null::text;
    return;
  end if;
  select * into v_result from project_provider_result_unchecked(p_observation_id, p_result_idempotency_key);
  if v_result.outcome in ('projected', 'duplicate') then perform slice_2b_resolve_quarantine(p_observation_id); end if;
  return query select v_result.outcome::text, v_result.contest_result_id::uuid, v_result.result_version::integer,
    v_result.audit_event_id::uuid, v_result.outbox_id::uuid, v_result.quarantine_id::uuid, v_result.prior_outcome::text;
end;
$$;


-- Preserve wrapper-only service authority; CREATE OR REPLACE retains old ACLs,
-- but explicitly restate the boundary for forward repair.
revoke all on function project_structural_observation(uuid),project_provider_result(uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function project_structural_observation_unchecked(uuid),
  project_provider_result_unchecked(uuid,text),slice_2b_project_root_observation(uuid)
  from public,anon,authenticated,service_role;
grant execute on function project_structural_observation(uuid),project_provider_result(uuid,text) to service_role;

commit;
