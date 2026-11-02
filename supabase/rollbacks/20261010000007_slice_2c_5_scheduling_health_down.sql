-- Restore Slice 2C.2 scheduling and health behavior.

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.slice_2c_claim_due_impl(text,timestamptz,text,integer)'::regprocedure
  ) into v_definition;
  v_definition := replace(
    v_definition,
    '(pb.next_poll_at is not null and pb.next_poll_at <= p_now)',
    '(pb.next_poll_at is null or pb.next_poll_at <= p_now)'
  );
  execute v_definition;
end;
$$;

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
  v_next_poll_at := case when v_retry_at is not null then v_retry_at else p_next_poll_at end;
  v_health := case
    when p_outcome in ('succeeded', 'partial') then 'healthy'
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
  set next_poll_at = v_next_poll_at,
      health_status = v_health,
      consecutive_failures = case
        when p_outcome in ('succeeded', 'partial') then 0
        else pb.consecutive_failures + 1
      end,
      last_attempt_at = v_finished_at,
      last_success_at = case
        when p_outcome in ('succeeded', 'partial') then v_finished_at
        else pb.last_success_at
      end,
      last_data_at = case
        when coalesce(p_data_changed, false) then v_finished_at
        else pb.last_data_at
      end,
      updated_at = v_finished_at
  where pb.id = v_binding.id;

  return query select p_run_id, p_outcome, v_health, v_next_poll_at, v_retry_at;
end;
$$;

revoke all on function public.finish_ingestion_run(uuid, text, text, timestamptz, timestamptz, timestamptz, boolean, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.finish_ingestion_run(uuid, text, text, timestamptz, timestamptz, timestamptz, boolean, text, text, jsonb)
  to service_role;
