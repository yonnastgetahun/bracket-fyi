begin;

-- R2 forward repair: preserve header provenance on no-header responses and
-- classify stale observations before changing local reset state.
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
  v_projected_reset_at timestamptz;
  v_has_header boolean;
begin
  if p_observed_limit_count is not null and p_observed_limit_count < 0
     or p_observed_remaining_count is not null and p_observed_remaining_count < 0
     or p_observed_limit_count is not null
        and p_observed_remaining_count is not null
        and p_observed_remaining_count > p_observed_limit_count then
    raise exception 'invalid_rate_limit_bounds' using errcode = '22023';
  end if;

  -- observed_at is metadata for ordering only. It is not itself a provider
  -- rate header and must never erase or advance header provenance.
  v_has_header := p_observed_limit_count is not null
    or p_observed_remaining_count is not null
    or p_observed_reset_at is not null;

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

  v_effective_at := case
    when p_observed_at is null or p_observed_at > v_acceptance_at then v_acceptance_at
    else p_observed_at
  end;
  if v_budget.observed_at is not null and v_effective_at < v_budget.observed_at then
    return query select false, v_budget.available_count, v_budget.trusted_reset_at;
    return;
  end if;

  -- Compute the current local boundary without mutating it. A stale provider
  -- reset is rejected before any replenishment or observational update.
  v_projected_reset_at := v_budget.trusted_reset_at;
  if v_acceptance_at >= v_budget.trusted_reset_at then
    v_window := make_interval(secs => v_budget.configured_window_seconds);
    v_elapsed_windows := floor(
      extract(epoch from (v_acceptance_at - v_budget.trusted_reset_at))
      / v_budget.configured_window_seconds
    )::bigint + 1;
    v_projected_reset_at := v_budget.trusted_reset_at + (v_window * v_elapsed_windows);
  end if;
  if p_observed_reset_at is not null and p_observed_reset_at < v_projected_reset_at then
    return query select false, v_budget.available_count, v_budget.trusted_reset_at;
    return;
  end if;

  if v_acceptance_at >= v_budget.trusted_reset_at then
    update public.provider_rate_budgets
    set available_count = configured_limit_count,
        trusted_reset_at = v_projected_reset_at,
        updated_at = v_acceptance_at
    where provider_id = v_budget.provider_id and scope_key = v_budget.scope_key;
    v_budget.available_count := v_budget.configured_limit_count;
    v_budget.trusted_reset_at := v_projected_reset_at;
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

commit;
