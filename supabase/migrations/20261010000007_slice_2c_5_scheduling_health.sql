-- Slice 2C.5C: NULL is an explicit unscheduled state. Ordinary claims require
-- a non-NULL due time; retries remain independently claimable by next_retry_at.

create or replace function public.slice_2c_claim_due_impl(
  p_claim_request_key text,
  p_now timestamptz,
  p_worker_id text,
  p_lease_seconds integer
)
returns table (
  run_id uuid, binding_id uuid, claim_key text, claim_request_key text,
  claim_generation bigint, retry_index integer, checkpoint_generation bigint,
  lease_token text, lease_acquired boolean, provider_id uuid, event_edition_id uuid,
  adapter_key text, binding_key text, mode text, credential_ref text,
  adapter_config_version integer, adapter_config jsonb, poll_policy jsonb,
  provider_cursor jsonb, provider_etag text, lease_expires_at timestamptz
)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_request_key text := public.slice_2c_normalize_automated_claim_key(p_claim_request_key);
  v_existing public.ingestion_runs%rowtype;
  v_binding public.provider_bindings%rowtype;
  v_parent public.ingestion_runs%rowtype;
  v_new public.ingestion_runs%rowtype;
  v_generation bigint;
  v_lease_seconds integer := public.slice_2c_lease_seconds(p_lease_seconds);
  v_has_due_retry boolean;
  v_replay_now timestamptz;
  v_claim_now timestamptz;
begin
  if p_now is null or btrim(coalesce(p_worker_id, '')) = '' then
    raise exception 'claim requires now and nonblank worker_id' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_request_key, 0));
  select ir.* into v_existing
  from public.ingestion_runs ir
  where ir.claim_request_key = v_request_key
  for update;
  if found then
    v_replay_now := clock_timestamp();
    return query select * from public.slice_2c_run_row(
      v_existing.id,
      v_existing.status in ('claimed', 'running')
        and v_existing.claimed_by = p_worker_id
        and v_existing.lease_expires_at > v_replay_now
    );
    return;
  end if;

  select pb.* into v_binding
  from public.provider_bindings pb
  where pb.mode <> 'disabled'
    and not exists (
      select 1 from public.ingestion_runs active_run
      where active_run.binding_id = pb.id
        and active_run.status in ('claimed', 'running')
    )
    and (
      exists (
        select 1 from public.ingestion_runs due_parent
        where due_parent.binding_id = pb.id
          and due_parent.status in ('failed', 'rate_limited')
          and due_parent.retry_index < 3
          and due_parent.next_retry_at <= p_now
          and not exists (
            select 1 from public.ingestion_runs child
            where child.retry_of_run_id = due_parent.id
          )
      )
      or (
        (pb.next_poll_at is not null and pb.next_poll_at <= p_now)
        and not exists (
          select 1 from public.ingestion_runs unresolved_retry
          where unresolved_retry.binding_id = pb.id
            and unresolved_retry.status in ('failed', 'rate_limited')
            and unresolved_retry.retry_index < 3
            and unresolved_retry.next_retry_at is not null
            and not exists (
              select 1 from public.ingestion_runs child
              where child.retry_of_run_id = unresolved_retry.id
            )
        )
      )
    )
  order by case when exists (
    select 1 from public.ingestion_runs due_parent
    where due_parent.binding_id = pb.id
      and due_parent.status in ('failed', 'rate_limited')
      and due_parent.retry_index < 3
      and due_parent.next_retry_at <= p_now
      and not exists (
        select 1 from public.ingestion_runs child
        where child.retry_of_run_id = due_parent.id
      )
  ) then 0 else 1 end,
  coalesce((select min(due_parent.next_retry_at)
    from public.ingestion_runs due_parent
    where due_parent.binding_id = pb.id
      and due_parent.status in ('failed', 'rate_limited')
      and due_parent.retry_index < 3
      and due_parent.next_retry_at is not null
      and not exists (
        select 1 from public.ingestion_runs child
        where child.retry_of_run_id = due_parent.id
      )), pb.next_poll_at),
  pb.id
  for update of pb skip locked
  limit 1;

  if not found then
    return;
  end if;

  select exists (
    select 1 from public.ingestion_runs retry_parent
    where retry_parent.binding_id = v_binding.id
      and retry_parent.status in ('failed', 'rate_limited')
      and retry_parent.retry_index < 3
      and retry_parent.next_retry_at <= p_now
      and not exists (
        select 1 from public.ingestion_runs child
        where child.retry_of_run_id = retry_parent.id
      )
  ) into v_has_due_retry;

  if v_has_due_retry then
    select retry_parent.* into v_parent
    from public.ingestion_runs retry_parent
    where retry_parent.binding_id = v_binding.id
      and retry_parent.status in ('failed', 'rate_limited')
      and retry_parent.retry_index < 3
      and retry_parent.next_retry_at <= p_now
      and not exists (
        select 1 from public.ingestion_runs child
        where child.retry_of_run_id = retry_parent.id
      )
    order by retry_parent.next_retry_at, retry_parent.id
    for update skip locked
    limit 1;
    if not found then
      return;
    end if;
  end if;

  v_claim_now := clock_timestamp();
  begin
    update public.provider_bindings pb
    set claim_generation = pb.claim_generation + 1,
        next_poll_at = null,
        updated_at = v_claim_now
    where pb.id = v_binding.id
    returning pb.claim_generation into v_generation;

    if v_has_due_retry then
      insert into public.ingestion_runs (
        binding_id, provider_id, event_edition_id, claim_key, claim_request_key,
        claim_generation, trigger_kind, status, claimed_by, lease_token,
        lease_expires_at, cursor_before, retry_index, retry_of_run_id
      ) values (
        v_binding.id, v_binding.provider_id, v_binding.event_edition_id,
        'v1:retry:' || v_binding.id::text || ':g' || v_generation::text,
        v_request_key, v_generation, 'retry', 'claimed', p_worker_id,
        pg_catalog.gen_random_uuid()::text, v_claim_now + make_interval(secs => v_lease_seconds),
        v_binding.provider_cursor, v_parent.retry_index + 1, v_parent.id
      ) returning * into v_new;
    else
      insert into public.ingestion_runs (
        binding_id, provider_id, event_edition_id, claim_key, claim_request_key,
        claim_generation, trigger_kind, status, claimed_by, lease_token,
        lease_expires_at, cursor_before, retry_index
      ) values (
        v_binding.id, v_binding.provider_id, v_binding.event_edition_id,
        'v1:schedule:' || v_binding.id::text || ':g' || v_generation::text,
        v_request_key, v_generation, 'schedule', 'claimed', p_worker_id,
        pg_catalog.gen_random_uuid()::text, v_claim_now + make_interval(secs => v_lease_seconds),
        v_binding.provider_cursor, 0
      ) returning * into v_new;
    end if;
  exception when unique_violation then
    select ir.* into v_existing
    from public.ingestion_runs ir
    where ir.claim_request_key = v_request_key
    for update;
    if found then
      v_replay_now := clock_timestamp();
      return query select * from public.slice_2c_run_row(
        v_existing.id,
        v_existing.status in ('claimed', 'running')
          and v_existing.claimed_by = p_worker_id
          and v_existing.lease_expires_at > v_replay_now
      );
    end if;
    return;
  end;

  return query select * from public.slice_2c_run_row(v_new.id, true);
end;
$$;

revoke all on function public.slice_2c_claim_due_impl(text, timestamptz, text, integer) from public, anon, authenticated, service_role;

-- Keep finish_ingestion_run as the sole state transition boundary while making
-- health and scheduling authoritative at the same locked binding/run boundary.
create or replace function public.finish_ingestion_run(
  p_run_id uuid, p_lease_token text, p_outcome text, p_finished_at timestamptz,
  p_next_poll_at timestamptz, p_next_retry_at timestamptz, p_data_changed boolean,
  p_failure_code text, p_error_message text, p_metadata jsonb
)
returns table (
  run_id uuid, status text, health_status text, next_poll_at timestamptz, next_retry_at timestamptz
)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_binding_id uuid;
  v_binding public.provider_bindings%rowtype;
  v_status text;
  v_retry_index integer;
  v_retry_at timestamptz := p_next_retry_at;
  v_next_poll_at timestamptz;
  v_health text;
  v_finished_at timestamptz;
  v_effective_data_at timestamptz;
  v_is_stale boolean;
  v_is_auth_failure boolean := p_failure_code in ('provider:authentication', 'provider:authorization');
begin
  if p_outcome not in ('succeeded', 'partial', 'failed', 'rate_limited', 'canceled') then
    raise exception 'invalid_run_outcome' using errcode = '22023';
  end if;
  if p_finished_at is null then
    raise exception 'finish requires finished_at' using errcode = '22023';
  end if;
  if p_metadata is not null and jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'metadata must be an object' using errcode = '22023';
  end if;

  select ir.binding_id into v_binding_id
  from public.ingestion_runs ir where ir.id = p_run_id;
  if v_binding_id is null then
    raise exception 'run_not_found' using errcode = '23503';
  end if;
  select pb.* into v_binding
  from public.provider_bindings pb where pb.id = v_binding_id for update;
  select ir.status, ir.retry_index into v_status, v_retry_index
  from public.ingestion_runs ir where ir.id = p_run_id for update;
  if v_status is null then
    raise exception 'run_not_found' using errcode = '23503';
  end if;
  if v_status <> 'running' then
    raise exception 'run_not_running' using errcode = 'P0004';
  end if;
  perform public.slice_2c_assert_lease(p_run_id, p_lease_token, p_finished_at);
  v_finished_at := clock_timestamp();

  if v_retry_at is not null and (p_outcome not in ('failed', 'rate_limited') or v_retry_index >= 3) then
    raise exception 'invalid_retry_schedule' using errcode = '22023';
  end if;
  if p_outcome not in ('failed', 'rate_limited') then
    v_retry_at := null;
  end if;

  v_next_poll_at := case
    when v_is_auth_failure then null
    when v_retry_at is not null then v_retry_at
    else p_next_poll_at
  end;
  v_effective_data_at := case when coalesce(p_data_changed, false) then v_finished_at else v_binding.last_data_at end;
  v_is_stale := v_effective_data_at is null
    or v_finished_at - v_effective_data_at > make_interval(secs => v_binding.stale_after_seconds);
  v_health := case
    when v_is_auth_failure then 'disabled'
    when p_outcome in ('succeeded', 'partial') and coalesce(p_data_changed, false) then 'healthy'
    when p_outcome in ('succeeded', 'partial') and v_is_stale then 'stale'
    when p_outcome in ('succeeded', 'partial') then 'healthy'
    when p_outcome in ('failed', 'rate_limited') and p_failure_code in (
      'provider:not_found', 'provider:unsupported', 'provider:invalid_response', 'provider:permanent'
    ) then 'degraded'
    when p_outcome in ('failed', 'rate_limited') and v_is_stale then 'stale'
    when p_outcome in ('failed', 'rate_limited') then 'degraded'
    else v_binding.health_status
  end;

  update public.ingestion_runs ir
  set status = p_outcome,
      finished_at = v_finished_at,
      lease_expires_at = null,
      lease_token = null,
      next_retry_at = v_retry_at,
      error_class = nullif(btrim(p_failure_code), ''),
      error_message = nullif(btrim(p_error_message), ''),
      metadata = coalesce(p_metadata, '{}'::jsonb)
  where ir.id = p_run_id;

  update public.provider_bindings pb
  set mode = case when v_is_auth_failure then 'disabled' else pb.mode end,
      next_poll_at = v_next_poll_at,
      health_status = v_health,
      consecutive_failures = case
        when p_outcome in ('succeeded', 'partial') then 0
        when p_outcome = 'canceled' then pb.consecutive_failures
        else pb.consecutive_failures + 1
      end,
      last_attempt_at = v_finished_at,
      last_success_at = case when p_outcome in ('succeeded', 'partial') then v_finished_at else pb.last_success_at end,
      last_data_at = case when coalesce(p_data_changed, false) then v_finished_at else pb.last_data_at end,
      updated_at = v_finished_at
  where pb.id = v_binding.id;

  return query select p_run_id, p_outcome, v_health, v_next_poll_at, v_retry_at;
end;
$$;

revoke all on function public.finish_ingestion_run(uuid, text, text, timestamptz, timestamptz, timestamptz, boolean, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.finish_ingestion_run(uuid, text, text, timestamptz, timestamptz, timestamptz, boolean, text, text, jsonb) to service_role;
