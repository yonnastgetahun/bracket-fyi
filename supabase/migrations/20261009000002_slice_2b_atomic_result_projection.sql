-- Bracket.fyi Slice 2B.5 — atomic provider result, audit, and operator outbox projection.
-- Forward-only. The observation must already exist; no legacy or lifecycle writes occur here.

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
    else p_value::text
  end
$$;

create or replace function slice_2b_result_idempotency_key(
  p_contest_id uuid,
  p_result_status text,
  p_outcome_type text,
  p_winner_event_entry_id uuid,
  p_score jsonb,
  p_result_data jsonb,
  p_provider_effective_at timestamptz,
  p_correction_reason text
)
returns text
language sql
set search_path = public, pg_temp
as $$
  select 'v1:result:' || encode(
    extensions.digest(
      slice_2b_canonical_json(jsonb_build_object(
        'contestId', p_contest_id::text,
        'resultStatus', p_result_status,
        'outcomeType', p_outcome_type,
        'winnerEventEntryId', p_winner_event_entry_id::text,
        'score', p_score,
        'resultData', p_result_data,
        'providerEffectiveAt', case when p_provider_effective_at is null then null else to_char(p_provider_effective_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
        'correctionReason', p_correction_reason,
        'orderingPolicyVersion', 'result-ordering-v1'
      )),
      'sha256'
    ),
    'hex'
  )
$$;

create or replace function slice_2b_audit_idempotency_key(p_result_key text, p_event_type text)
returns text
language sql
set search_path = public, pg_temp
as $$
  select 'v1:audit:' || encode(extensions.digest(slice_2b_canonical_json(jsonb_build_object('resultKey', p_result_key, 'eventType', p_event_type)), 'sha256'), 'hex')
$$;

create or replace function slice_2b_outbox_idempotency_key(p_result_key text, p_intent_type text)
returns text
language sql
set search_path = public, pg_temp
as $$
  select 'v1:outbox:' || encode(extensions.digest(slice_2b_canonical_json(jsonb_build_object('resultKey', p_result_key, 'intentType', p_intent_type, 'audience', 'operator')), 'sha256'), 'hex')
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
  v_observation provider_observations%rowtype;
  v_binding provider_bindings%rowtype;
  v_previous contest_results%rowtype;
  v_duplicate contest_results%rowtype;
  v_data jsonb;
  v_snapshot jsonb;
  v_contest_id uuid;
  v_winner_id uuid;
  v_result_status text;
  v_outcome_type text;
  v_score jsonb;
  v_result_data jsonb;
  v_provider_effective_at timestamptz;
  v_incoming_trusted_at timestamptz;
  v_previous_trusted_at timestamptz;
  v_previous_observed_at timestamptz;
  v_correction_reason text;
  v_correction_provenance text;
  v_result_key text;
  v_event_type text;
  v_intent_type text;
  v_audit_key text;
  v_outbox_key text;
  v_quarantine_id uuid;
  v_result_id uuid;
  v_audit_id uuid;
  v_outbox_id uuid;
  v_is_correction boolean := false;
  v_correction_allowed boolean := false;
  v_ref record;
begin
  select * into v_observation
  from provider_observations po
  where po.id = p_observation_id
  for update;

  if v_observation.id is null then
    raise exception 'result projection requires an existing provider observation' using errcode = '23503';
  end if;

  if v_observation.external_object_kind <> 'result' then
    raise exception 'result projection accepts only result observations' using errcode = '22023';
  end if;

  select * into v_binding
  from provider_bindings pb
  where pb.id = v_observation.binding_id
  for update;

  v_snapshot := v_observation.metadata;
  v_data := v_snapshot->'normalizedEntity';
  if v_data is null or jsonb_typeof(v_data) <> 'object' then
    select oq.id into v_quarantine_id from open_ingestion_quarantine(
      v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,
      'unsupported_shape','blocking','result',v_observation.external_object_id,'{}'::uuid[],
      jsonb_build_object('reason','validated normalized result snapshot is missing')
    ) oq;
    return query select 'quarantined'::text,null::uuid,null::integer,null::uuid,null::uuid,v_quarantine_id,null::text;
    return;
  end if;

  v_result_status := v_data->>'resultStatus';
  v_outcome_type := v_data->>'outcomeType';
  v_result_data := v_data->'resultData';
  v_score := v_data->'score';
  v_provider_effective_at := nullif(v_data->>'providerEffectiveAt','')::timestamptz;
  v_correction_reason := nullif(btrim(v_data->>'correctionReason'),'');
  v_correction_provenance := nullif(btrim(v_snapshot->>'correctionProvenance'),'');

  if v_result_status not in ('provisional','unresolved','final','awarded','canceled','void')
    or v_outcome_type not in ('pending','winner','draw','no_contest')
    or jsonb_typeof(v_result_data) <> 'object'
    or (v_score is not null and jsonb_typeof(v_score) <> 'object')
    or (v_outcome_type = 'winner' and nullif(v_data->>'winnerEventEntryExternalId','') is null)
    or (v_outcome_type <> 'winner' and nullif(v_data->>'winnerEventEntryExternalId','') is not null)
    or not (
      (v_result_status in ('provisional','unresolved') and v_outcome_type = 'pending')
      or (v_result_status = 'final' and v_outcome_type in ('winner','draw'))
      or (v_result_status = 'awarded' and v_outcome_type = 'winner')
      or (v_result_status in ('canceled','void') and v_outcome_type = 'no_contest')
    ) then
    select oq.id into v_quarantine_id from open_ingestion_quarantine(
      v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,
      'schema_invalid','blocking','result',v_observation.external_object_id,'{}'::uuid[],
      jsonb_build_object('reason','normalized result state is invalid')
    ) oq;
    return query select 'quarantined'::text,null::uuid,null::integer,null::uuid,null::uuid,v_quarantine_id,null::text;
    return;
  end if;

  for v_ref in
    select per.entity_kind, per.external_id, per.canonical_id
    from provider_entity_refs per
    where per.binding_id = v_observation.binding_id
      and (
        (per.entity_kind = 'contest' and per.external_id = v_data->>'contestExternalId')
        or (per.entity_kind = 'event_entry' and per.external_id = v_data->>'winnerEventEntryExternalId')
      )
      and per.resolution_status in ('automatic','reviewed')
    order by per.entity_kind, per.external_id
    for update
  loop
    if v_ref.entity_kind = 'contest' then v_contest_id := v_ref.canonical_id; end if;
    if v_ref.entity_kind = 'event_entry' then v_winner_id := v_ref.canonical_id; end if;
  end loop;

  if v_contest_id is null then
    select oq.id into v_quarantine_id from open_ingestion_quarantine(
      v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,
      'mapping_missing','blocking','contest',v_data->>'contestExternalId','{}'::uuid[],
      jsonb_build_object('reason','result contest identity is unresolved')
    ) oq;
    return query select 'quarantined'::text,null::uuid,null::integer,null::uuid,null::uuid,v_quarantine_id,null::text;
    return;
  end if;
  if v_outcome_type = 'winner' and v_winner_id is null then
    select oq.id into v_quarantine_id from open_ingestion_quarantine(
      v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,
      'mapping_missing','blocking','event_entry',v_data->>'winnerEventEntryExternalId','{}'::uuid[],
      jsonb_build_object('reason','result winner-entry identity is unresolved')
    ) oq;
    return query select 'quarantined'::text,null::uuid,null::integer,null::uuid,null::uuid,v_quarantine_id,null::text;
    return;
  end if;

  if not exists (select 1 from contests c where c.id=v_contest_id and c.event_edition_id=v_observation.event_edition_id) then
    raise exception 'result contest mapping does not belong to the observation edition' using errcode = '23514';
  end if;
  if v_winner_id is not null and not exists (
    select 1 from contest_entries ce where ce.contest_id=v_contest_id and ce.event_entry_id=v_winner_id
  ) then
    raise exception 'result winner entry is not a member of the mapped contest' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('bracket-fyi:contest-result:' || v_contest_id::text, 0));

  v_result_key := slice_2b_result_idempotency_key(v_contest_id,v_result_status,v_outcome_type,v_winner_id,v_score,v_result_data,v_provider_effective_at,v_correction_reason);
  if p_result_idempotency_key is not null and p_result_idempotency_key <> v_result_key then
    raise exception 'caller result idempotency key does not match the verified semantic result'
      using errcode = '22023';
  end if;

  select * into v_duplicate from contest_results cr where cr.idempotency_key=v_result_key;
  if v_duplicate.id is not null then
    select ra.id into v_audit_id from result_audit_events ra where ra.contest_result_id=v_duplicate.id order by ra.occurred_at,ra.created_at limit 1;
    select no.id into v_outbox_id from notification_outbox no where no.contest_result_id=v_duplicate.id order by no.created_at limit 1;
    return query select 'duplicate'::text,v_duplicate.id,v_duplicate.version,v_audit_id,v_outbox_id,null::uuid,'projected'::text;
    return;
  end if;

  select * into v_previous
  from contest_results cr
  where cr.contest_id=v_contest_id
  order by cr.version desc
  limit 1
  for update;

  if v_previous.id is not null then
    select po.provider_updated_at,po.received_at into v_previous_trusted_at,v_previous_observed_at
    from provider_observations po where po.id=v_previous.source_observation_id;
    v_previous_trusted_at := coalesce(v_previous.provider_effective_at,v_previous_trusted_at);
    v_incoming_trusted_at := coalesce(v_provider_effective_at,v_observation.provider_updated_at);

    if v_previous.result_status='unresolved' and v_result_status='provisional' then
      select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'illegal_regression','error','result',v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','unresolved result cannot regress to provisional')) oq;
      return query select 'quarantined'::text,v_previous.id,v_previous.version,null::uuid,null::uuid,v_quarantine_id,'quarantined'::text; return;
    end if;

    if v_previous.result_status in ('final','awarded','canceled','void') then
      if v_result_status in ('provisional','final') and v_result_status='provisional' then
        select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'illegal_regression','error','result',v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','terminal result cannot regress to provisional')) oq;
        return query select 'quarantined'::text,v_previous.id,v_previous.version,null::uuid,null::uuid,v_quarantine_id,'quarantined'::text; return;
      end if;
      if v_incoming_trusted_at is null or v_previous_trusted_at is null then
        select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'conflicting_terminal_result','blocking','result',v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','changed terminal result lacks comparable trusted provenance')) oq;
        return query select 'quarantined'::text,v_previous.id,v_previous.version,null::uuid,null::uuid,v_quarantine_id,'quarantined'::text; return;
      end if;
      if v_incoming_trusted_at < v_previous_trusted_at then
        select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'stale_update','warning','result',v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','older result timestamp')) oq;
        return query select 'ignored_stale'::text,v_previous.id,v_previous.version,null::uuid,null::uuid,v_quarantine_id,'ignored_stale'::text; return;
      end if;
      if v_incoming_trusted_at = v_previous_trusted_at then
        select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'conflicting_terminal_result','blocking','result',v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','equal result timestamps changed terminal semantics')) oq;
        return query select 'quarantined'::text,v_previous.id,v_previous.version,null::uuid,null::uuid,v_quarantine_id,'quarantined'::text; return;
      end if;
      v_correction_allowed := v_correction_reason is not null
        and v_correction_provenance is not null
        and v_binding.adapter_config->>'allowTrustedCorrections' = 'true';
      if not v_correction_allowed then
        select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'conflicting_terminal_result','blocking','result',v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','terminal correction lacks approved reason, provenance, or binding policy')) oq;
        return query select 'quarantined'::text,v_previous.id,v_previous.version,null::uuid,null::uuid,v_quarantine_id,'quarantined'::text; return;
      end if;
      v_is_correction := true;
    else
      if v_result_status in ('final','awarded','canceled','void') then
        null;
      elsif v_previous.result_status='unresolved' and v_result_status='provisional' then
        select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'illegal_regression','error','result',v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','result state regressed')) oq;
        return query select 'quarantined'::text,v_previous.id,v_previous.version,null::uuid,null::uuid,v_quarantine_id,'quarantined'::text; return;
      end if;
      if v_previous_trusted_at is not null and v_incoming_trusted_at is null and v_observation.received_at <= v_previous_observed_at then
        select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'stale_update','warning','result',v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','missing trusted timestamp is not newer')) oq;
        return query select 'ignored_stale'::text,v_previous.id,v_previous.version,null::uuid,null::uuid,v_quarantine_id,'ignored_stale'::text; return;
      end if;
      if v_previous_trusted_at is not null and v_incoming_trusted_at is not null and v_incoming_trusted_at <= v_previous_trusted_at then
        select oq.id into v_quarantine_id from open_ingestion_quarantine(v_observation.id,v_observation.ingestion_run_id,v_observation.binding_id,'stale_update','warning','result',v_observation.external_object_id,'{}'::uuid[],jsonb_build_object('reason','older or equal result timestamp')) oq;
        return query select 'ignored_stale'::text,v_previous.id,v_previous.version,null::uuid,null::uuid,v_quarantine_id,'ignored_stale'::text; return;
      end if;
    end if;
  end if;

  v_event_type := case when v_is_correction then 'result.corrected' else 'result.projected' end;
  v_intent_type := case
    when v_is_correction then 'result_correction'
    when v_result_status in ('final','awarded') then 'result_final'
    else null
  end;
  v_audit_key := slice_2b_audit_idempotency_key(v_result_key,v_event_type);
  if v_intent_type is not null then v_outbox_key := slice_2b_outbox_idempotency_key(v_result_key,v_intent_type); end if;

  insert into contest_results (
    contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,score,result_data,source_type,source_observation_id,provider_effective_at,supersedes_result_id,correction_reason,idempotency_key
  ) values (
    v_contest_id,v_observation.event_edition_id,coalesce(v_previous.version,0)+1,v_result_status,v_outcome_type,v_winner_id,v_score,v_result_data,'provider',v_observation.id,v_provider_effective_at,v_previous.id,v_correction_reason,v_result_key
  ) returning id,version into v_result_id,result_version;

  insert into result_audit_events (
    event_edition_id,contest_id,contest_result_id,provider_observation_id,event_type,actor_type,provider_id,idempotency_key,previous_state,new_state,details
  ) values (
    v_observation.event_edition_id,v_contest_id,v_result_id,v_observation.id,v_event_type,'provider',v_observation.provider_id,v_audit_key,
    case when v_previous.id is null then null else jsonb_build_object('resultStatus',v_previous.result_status,'outcomeType',v_previous.outcome_type,'version',v_previous.version) end,
    jsonb_build_object('resultStatus',v_result_status,'outcomeType',v_outcome_type,'version',result_version,'correction',v_is_correction),
    jsonb_build_object('source','slice-2b','correctionProvenance',v_correction_provenance)
  ) returning id into v_audit_id;

  if v_intent_type is not null then
    insert into notification_outbox (
      event_edition_id,contest_id,contest_result_id,audit_event_id,intent_type,audience_kind,payload,idempotency_key
    ) values (
      v_observation.event_edition_id,v_contest_id,v_result_id,v_audit_id,v_intent_type,'operator',
      jsonb_build_object('contestResultId',v_result_id,'resultVersion',result_version,'eventType',v_intent_type),v_outbox_key
    ) returning id into v_outbox_id;
  end if;

  return query select 'projected'::text,v_result_id,result_version,v_audit_id,v_outbox_id,null::uuid,null::text;
end;
$$;

revoke all on function slice_2b_result_idempotency_key(uuid,text,text,uuid,jsonb,jsonb,timestamptz,text) from public, anon, authenticated;
revoke all on function slice_2b_audit_idempotency_key(text,text) from public, anon, authenticated;
revoke all on function slice_2b_outbox_idempotency_key(text,text) from public, anon, authenticated;
revoke all on function slice_2b_canonical_json(jsonb) from public, anon, authenticated;
revoke all on function project_provider_result(uuid,text) from public, anon, authenticated;
grant execute on function slice_2b_canonical_json(jsonb) to service_role;
grant execute on function project_provider_result(uuid,text) to service_role;
