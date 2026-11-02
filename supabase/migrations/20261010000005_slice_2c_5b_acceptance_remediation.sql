-- Bracket.fyi Slice 2C.5B-R1 — budget lease and header ordering repair.
-- Forward-only repair. Migration 00004 remains unchanged.

begin;

create or replace function public.reserve_provider_budget(
  p_run_id uuid,
  p_lease_token text,
  p_attempt_key text,
  p_cost integer
)
returns table (
  outcome text,
  reservation_id uuid,
  remaining_count integer,
  retry_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_binding_id uuid;
  v_binding public.provider_bindings%rowtype;
  v_run public.ingestion_runs%rowtype;
  v_budget public.provider_rate_budgets%rowtype;
  v_reservation public.provider_rate_budget_reservations%rowtype;
  v_expected_page_key text;
  v_expected_attempt_key text;
  v_now timestamptz;
  v_elapsed_windows bigint;
  v_window interval;
  v_reset_at timestamptz;
begin
  if p_run_id is null or btrim(coalesce(p_lease_token, '')) = ''
     or btrim(coalesce(p_attempt_key, '')) = '' or p_cost is null or p_cost <= 0 then
    raise exception 'invalid_budget_request' using errcode = '22023';
  end if;

  -- The run is resolved first, then binding → run are locked before any
  -- provider-budget lookup. This prevents an expired worker from learning
  -- configuration_missing instead of lease_lost.
  select ir.binding_id into v_binding_id
  from public.ingestion_runs ir
  where ir.id = p_run_id;
  if v_binding_id is null then
    raise exception 'run_not_found' using errcode = '23503';
  end if;

  select pb.* into v_binding
  from public.provider_bindings pb
  where pb.id = v_binding_id
  for update;
  if not found then
    raise exception 'binding_not_found' using errcode = '23503';
  end if;

  select ir.* into v_run
  from public.ingestion_runs ir
  where ir.id = p_run_id
  for update;
  if not found then
    raise exception 'run_not_found' using errcode = '23503';
  end if;
  if v_run.binding_id is distinct from v_binding.id
     or v_run.provider_id is distinct from v_binding.provider_id
     or v_run.event_edition_id is distinct from v_binding.event_edition_id then
    raise exception 'run_binding_mismatch' using errcode = '23503';
  end if;

  v_now := clock_timestamp();
  if v_run.status <> 'running'
     or v_run.lease_token is distinct from p_lease_token
     or v_run.lease_expires_at is null
     or v_run.lease_expires_at <= v_now then
    raise exception 'lease_lost' using errcode = 'P0001';
  end if;

  v_expected_page_key := public.slice_2c_page_key(
    v_binding.id,
    v_binding.checkpoint_generation,
    v_binding.provider_cursor,
    v_binding.provider_etag
  );
  v_expected_attempt_key := 'v1:request:' || v_run.id::text || ':'
    || v_run.retry_index::text || ':' || v_expected_page_key;
  if p_attempt_key <> v_expected_attempt_key then
    raise exception 'attempt_key_conflict' using errcode = 'P0005';
  end if;

  -- Lock the provider-wide state only after the initial lease check, then
  -- refresh the database clock and revalidate after any lock wait.
  select prb.* into v_budget
  from public.provider_rate_budgets prb
  where prb.provider_id = v_binding.provider_id
    and prb.scope_key = 'provider'
  for update;
  v_now := clock_timestamp();
  if v_run.status <> 'running'
     or v_run.lease_token is distinct from p_lease_token
     or v_run.lease_expires_at is null
     or v_run.lease_expires_at <= v_now then
    raise exception 'lease_lost' using errcode = 'P0001';
  end if;
  if not found then
    return query select 'configuration_missing'::text, null::uuid, null::integer, null::timestamptz;
    return;
  end if;

  -- Replay is checked before reset replenishment.
  select r.* into v_reservation
  from public.provider_rate_budget_reservations r
  where r.provider_id = v_binding.provider_id
    and r.scope_key = 'provider'
    and r.attempt_key = p_attempt_key
  for update;
  if found then
    if v_reservation.cost <> p_cost then
      raise exception 'attempt_key_conflict' using errcode = 'P0005';
    end if;
    return query select 'replayed'::text, v_reservation.id,
      v_reservation.remaining_after, null::timestamptz;
    return;
  end if;

  if v_now >= v_budget.trusted_reset_at then
    v_window := make_interval(secs => v_budget.configured_window_seconds);
    v_elapsed_windows := floor(
      extract(epoch from (v_now - v_budget.trusted_reset_at))
      / v_budget.configured_window_seconds
    )::bigint + 1;
    v_reset_at := v_budget.trusted_reset_at + (v_window * v_elapsed_windows);
    update public.provider_rate_budgets
    set available_count = configured_limit_count,
        trusted_reset_at = v_reset_at,
        updated_at = v_now
    where provider_id = v_budget.provider_id and scope_key = v_budget.scope_key;
    v_budget.available_count := v_budget.configured_limit_count;
    v_budget.trusted_reset_at := v_reset_at;
  end if;

  if v_budget.available_count < p_cost then
    return query select 'exhausted'::text, null::uuid,
      v_budget.available_count, v_budget.trusted_reset_at;
    return;
  end if;

  update public.provider_rate_budgets
  set available_count = v_budget.available_count - p_cost,
      updated_at = v_now
  where provider_id = v_budget.provider_id and scope_key = v_budget.scope_key;

  insert into public.provider_rate_budget_reservations (
    provider_id, scope_key, attempt_key, cost, reserved_at, remaining_after
  ) values (
    v_budget.provider_id, 'provider', p_attempt_key, p_cost, v_now,
    v_budget.available_count - p_cost
  ) returning * into v_reservation;

  return query select 'reserved'::text, v_reservation.id,
    v_reservation.remaining_after, null::timestamptz;
end;
$$;

create or replace function public.record_provider_rate_headers_for_run(
  p_run_id uuid,
  p_lease_token text,
  p_observed_limit_count integer,
  p_observed_remaining_count integer,
  p_observed_reset_at timestamptz,
  p_observed_at timestamptz
)
returns table (accepted boolean, available_count integer, trusted_reset_at timestamptz)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_binding_id uuid;
  v_binding public.provider_bindings%rowtype;
  v_run public.ingestion_runs%rowtype;
  v_budget public.provider_rate_budgets%rowtype;
  v_acceptance_at timestamptz;
  v_effective_at timestamptz;
  v_available integer;
  v_elapsed_windows bigint;
  v_window interval;
  v_reset_at timestamptz;
  v_has_header boolean;
begin
  if p_observed_limit_count is not null and p_observed_limit_count < 0
     or p_observed_remaining_count is not null and p_observed_remaining_count < 0
     or p_observed_limit_count is not null
        and p_observed_remaining_count is not null
        and p_observed_remaining_count > p_observed_limit_count then
    raise exception 'invalid_rate_limit_bounds' using errcode = '22023';
  end if;

  v_has_header := p_observed_limit_count is not null
    or p_observed_remaining_count is not null
    or p_observed_reset_at is not null
    or p_observed_at is not null;

  select ir.binding_id into v_binding_id
  from public.ingestion_runs ir
  where ir.id = p_run_id;
  if v_binding_id is null then
    raise exception 'run_not_found' using errcode = '23503';
  end if;
  select pb.* into v_binding
  from public.provider_bindings pb
  where pb.id = v_binding_id
  for update;
  if not found then
    raise exception 'binding_not_found' using errcode = '23503';
  end if;
  select ir.* into v_run
  from public.ingestion_runs ir
  where ir.id = p_run_id
  for update;
  if not found or v_run.binding_id is distinct from v_binding.id
     or v_run.provider_id is distinct from v_binding.provider_id
     or v_run.event_edition_id is distinct from v_binding.event_edition_id then
    raise exception 'run_binding_mismatch' using errcode = '23503';
  end if;

  -- The budget row is locked before acceptance time is captured. Thus equal
  -- effective timestamps are ordered by the actual serialized lock owner.
  select prb.* into v_budget
  from public.provider_rate_budgets prb
  where prb.provider_id = v_binding.provider_id
    and prb.scope_key = 'provider'
  for update;
  v_acceptance_at := clock_timestamp();
  if v_run.status <> 'running'
     or v_run.lease_token is distinct from p_lease_token
     or v_run.lease_expires_at is null
     or v_run.lease_expires_at <= v_acceptance_at then
    raise exception 'lease_lost' using errcode = 'P0001';
  end if;
  if not found then
    return query select false, null::integer, null::timestamptz;
    return;
  end if;
  if not v_has_header then
    return query select true, v_budget.available_count, v_budget.trusted_reset_at;
    return;
  end if;

  -- A header accepted in the current window must first make the local reset
  -- boundary current. Otherwise the next reservation could replenish over the
  -- provider's accepted remaining count.
  if v_acceptance_at >= v_budget.trusted_reset_at then
    v_window := make_interval(secs => v_budget.configured_window_seconds);
    v_elapsed_windows := floor(
      extract(epoch from (v_acceptance_at - v_budget.trusted_reset_at))
      / v_budget.configured_window_seconds
    )::bigint + 1;
    v_reset_at := v_budget.trusted_reset_at + (v_window * v_elapsed_windows);
    update public.provider_rate_budgets
    set available_count = configured_limit_count,
        trusted_reset_at = v_reset_at,
        updated_at = v_acceptance_at
    where provider_id = v_budget.provider_id and scope_key = v_budget.scope_key;
    v_budget.available_count := v_budget.configured_limit_count;
    v_budget.trusted_reset_at := v_reset_at;
  end if;

  v_effective_at := case
    when p_observed_at is null or p_observed_at > v_acceptance_at then v_acceptance_at
    else p_observed_at
  end;
  if v_budget.observed_at is not null and v_effective_at < v_budget.observed_at then
    return query select false, v_budget.available_count, v_budget.trusted_reset_at;
    return;
  end if;
  if p_observed_reset_at is not null and p_observed_reset_at < v_budget.trusted_reset_at then
    return query select false, v_budget.available_count, v_budget.trusted_reset_at;
    return;
  end if;

  v_available := v_budget.available_count;
  if p_observed_remaining_count is not null then
    v_available := least(
      v_available,
      v_budget.configured_limit_count,
      greatest(0, p_observed_remaining_count)
    );
  end if;
  update public.provider_rate_budgets
  set observed_limit_count = p_observed_limit_count,
      observed_remaining_count = p_observed_remaining_count,
      observed_reset_at = p_observed_reset_at,
      observed_at = v_effective_at,
      observed_accepted_at = v_acceptance_at,
      available_count = v_available,
      updated_at = v_acceptance_at
  where provider_id = v_budget.provider_id and scope_key = v_budget.scope_key;
  return query select true, v_available, v_budget.trusted_reset_at;
end;
$$;

create or replace function public.record_ingestion_response(
  p_run_id uuid, p_lease_token text, p_http_status integer,
  p_rate_limit_limit integer, p_rate_limit_remaining integer,
  p_rate_limit_reset_at timestamptz, p_retry_after_at timestamptz, p_observed_at timestamptz
)
returns table (run_id uuid, recorded boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_binding_id uuid;
  v_binding public.provider_bindings%rowtype;
  v_run public.ingestion_runs%rowtype;
  v_now timestamptz;
begin
  select ir.binding_id into v_binding_id
  from public.ingestion_runs ir
  where ir.id = p_run_id;
  if v_binding_id is null then
    raise exception 'run_not_found' using errcode = '23503';
  end if;
  select pb.* into v_binding
  from public.provider_bindings pb
  where pb.id = v_binding_id
  for update;
  if not found then
    raise exception 'binding_not_found' using errcode = '23503';
  end if;
  select ir.* into v_run
  from public.ingestion_runs ir
  where ir.id = p_run_id
  for update;
  if not found or v_run.binding_id is distinct from v_binding.id
     or v_run.provider_id is distinct from v_binding.provider_id
     or v_run.event_edition_id is distinct from v_binding.event_edition_id then
    raise exception 'run_binding_mismatch' using errcode = '23503';
  end if;
  v_now := clock_timestamp();
  if v_run.status <> 'running' then
    raise exception 'run_not_running' using errcode = 'P0004';
  end if;
  if v_run.lease_token is distinct from p_lease_token
     or v_run.lease_expires_at is null or v_run.lease_expires_at <= v_now then
    raise exception 'lease_lost' using errcode = 'P0001';
  end if;
  if p_http_status is not null and (p_http_status < 100 or p_http_status > 599) then
    raise exception 'invalid_http_status' using errcode = '22023';
  end if;
  if p_rate_limit_limit is not null and p_rate_limit_limit < 0 then
    raise exception 'invalid_rate_limit_limit' using errcode = '22023';
  end if;
  if p_rate_limit_remaining is not null and p_rate_limit_remaining < 0 then
    raise exception 'invalid_rate_limit_remaining' using errcode = '22023';
  end if;
  if p_rate_limit_limit is not null and p_rate_limit_remaining is not null
     and p_rate_limit_remaining > p_rate_limit_limit then
    raise exception 'invalid_rate_limit_bounds' using errcode = '22023';
  end if;
  update public.ingestion_runs ir
  set http_status = p_http_status,
      rate_limit_limit = p_rate_limit_limit,
      rate_limit_remaining = p_rate_limit_remaining,
      rate_limit_reset_at = p_rate_limit_reset_at,
      retry_after_at = p_retry_after_at
  where ir.id = p_run_id;
  perform 1 from public.record_provider_rate_headers_for_run(
    p_run_id, p_lease_token, p_rate_limit_limit, p_rate_limit_remaining,
    p_rate_limit_reset_at, p_observed_at
  );
  return query select p_run_id, true;
end;
$$;

revoke all on function public.reserve_provider_budget(uuid, text, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.reserve_provider_budget(uuid, text, text, integer) to service_role;
revoke all on function public.record_provider_rate_headers_for_run(uuid, text, integer, integer, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.record_ingestion_response(uuid, text, integer, integer, integer, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.record_ingestion_response(uuid, text, integer, integer, integer, timestamptz, timestamptz, timestamptz) to service_role;

commit;
