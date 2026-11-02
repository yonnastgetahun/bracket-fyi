-- Bracket.fyi Slice 2C.2-R2 — fresh database-clock and schema-qualification repair.
-- Forward-only. Migrations 20261010000000 and 20261010000001 remain unchanged.

create or replace function public.slice_2c_claim_due_impl(
  p_claim_request_key text,
  p_now timestamptz,
  p_worker_id text,
  p_lease_seconds integer
)
returns table (
  run_id uuid, binding_id uuid, claim_key text, claim_request_key text,
  claim_generation bigint, retry_index integer, lease_token text,
  lease_acquired boolean, provider_id uuid, event_edition_id uuid,
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
        (pb.next_poll_at is null or pb.next_poll_at <= p_now)
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

create or replace function public.slice_2c_claim_manual_impl(
  p_binding_id uuid,
  p_request_key text,
  p_worker_id text,
  p_now timestamptz,
  p_lease_seconds integer
)
returns table (
  run_id uuid, binding_id uuid, claim_key text, claim_request_key text,
  claim_generation bigint, retry_index integer, lease_token text,
  lease_acquired boolean, provider_id uuid, event_edition_id uuid,
  adapter_key text, binding_key text, mode text, credential_ref text,
  adapter_config_version integer, adapter_config jsonb, poll_policy jsonb,
  provider_cursor jsonb, provider_etag text, lease_expires_at timestamptz
)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_request_key text := public.slice_2c_normalize_manual_claim_key(p_binding_id, p_request_key);
  v_existing public.ingestion_runs%rowtype;
  v_binding public.provider_bindings%rowtype;
  v_new public.ingestion_runs%rowtype;
  v_generation bigint;
  v_lease_seconds integer := public.slice_2c_lease_seconds(p_lease_seconds);
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
  where pb.id = p_binding_id
  for update;
  if not found then
    raise exception 'binding_not_found' using errcode = '23503';
  end if;
  if v_binding.mode = 'disabled' then
    raise exception 'disabled_binding' using errcode = '22023';
  end if;

  perform 1 from public.ingestion_runs ir
  where ir.binding_id = p_binding_id and ir.status in ('claimed', 'running')
  order by ir.created_at, ir.id
  for update
  limit 1;
  if found then
    return;
  end if;

  v_claim_now := clock_timestamp();
  begin
    update public.provider_bindings pb
    set claim_generation = pb.claim_generation + 1,
        next_poll_at = null,
        updated_at = v_claim_now
    where pb.id = p_binding_id
    returning pb.claim_generation into v_generation;

    insert into public.ingestion_runs (
      binding_id, provider_id, event_edition_id, claim_key, claim_request_key,
      claim_generation, trigger_kind, status, claimed_by, lease_token,
      lease_expires_at, cursor_before, retry_index
    ) values (
      v_binding.id, v_binding.provider_id, v_binding.event_edition_id,
      'v1:manual:' || v_binding.id::text || ':g' || v_generation::text,
      v_request_key, v_generation, 'manual', 'claimed', p_worker_id,
      pg_catalog.gen_random_uuid()::text, v_claim_now + make_interval(secs => v_lease_seconds),
      v_binding.provider_cursor, 0
    ) returning * into v_new;
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

create or replace function public.claim_due_ingestion_run(
  p_claim_request_key text, p_now timestamptz, p_worker_id text, p_lease_seconds integer default 300
)
returns table (
  run_id uuid, binding_id uuid, claim_key text, claim_request_key text,
  claim_generation bigint, retry_index integer, lease_token text,
  lease_acquired boolean, provider_id uuid, event_edition_id uuid,
  adapter_key text, binding_key text, mode text, credential_ref text,
  adapter_config_version integer, adapter_config jsonb, poll_policy jsonb,
  provider_cursor jsonb, provider_etag text, lease_expires_at timestamptz
)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  return query select * from public.slice_2c_claim_due_impl(
    p_claim_request_key, p_now, p_worker_id, p_lease_seconds
  );
end;
$$;

create or replace function public.claim_manual_ingestion_run(
  p_binding_id uuid, p_request_key text, p_worker_id text, p_now timestamptz,
  p_lease_seconds integer default 300
)
returns table (
  run_id uuid, binding_id uuid, claim_key text, claim_request_key text,
  claim_generation bigint, retry_index integer, lease_token text,
  lease_acquired boolean, provider_id uuid, event_edition_id uuid,
  adapter_key text, binding_key text, mode text, credential_ref text,
  adapter_config_version integer, adapter_config jsonb, poll_policy jsonb,
  provider_cursor jsonb, provider_etag text, lease_expires_at timestamptz
)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  return query select * from public.slice_2c_claim_manual_impl(
    p_binding_id, p_request_key, p_worker_id, p_now, p_lease_seconds
  );
end;
$$;

revoke all on function public.claim_due_ingestion_run(text, timestamptz, text, integer) from public, anon, authenticated;
revoke all on function public.claim_manual_ingestion_run(uuid, text, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.claim_due_ingestion_run(text, timestamptz, text, integer) to service_role;
grant execute on function public.claim_manual_ingestion_run(uuid, text, text, timestamptz, integer) to service_role;

create or replace function public.slice_2c_assert_lease(
  p_run_id uuid, p_lease_token text, p_now timestamptz
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.ingestion_runs ir
    where ir.id = p_run_id
      and ir.status in ('claimed', 'running')
      and ir.lease_token = p_lease_token
      and ir.lease_expires_at > clock_timestamp()
  ) then
    raise exception 'lease_lost' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.start_ingestion_run(
  p_run_id uuid, p_lease_token text, p_now timestamptz
)
returns table (run_id uuid, status text, started_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_binding_id uuid;
  v_status text;
  v_started_at timestamptz;
begin
  select ir.binding_id into v_binding_id
  from public.ingestion_runs ir where ir.id = p_run_id;
  if v_binding_id is null then
    raise exception 'run_not_found' using errcode = '23503';
  end if;
  perform 1 from public.provider_bindings pb where pb.id = v_binding_id for update;
  if not found then
    raise exception 'binding_not_found' using errcode = '23503';
  end if;
  select ir.status, ir.started_at into v_status, v_started_at
  from public.ingestion_runs ir where ir.id = p_run_id for update;
  perform public.slice_2c_assert_lease(p_run_id, p_lease_token, clock_timestamp());
  if v_status = 'running' then
    return query select p_run_id, v_status, v_started_at;
    return;
  end if;
  if v_status <> 'claimed' then
    raise exception 'run_not_claimed' using errcode = 'P0004';
  end if;
  return query
  update public.ingestion_runs ir
  set status = 'running', started_at = clock_timestamp()
  where ir.id = p_run_id
  returning ir.id, ir.status, ir.started_at;
end;
$$;

create or replace function public.renew_ingestion_run(
  p_run_id uuid, p_lease_token text, p_now timestamptz, p_lease_seconds integer default 300
)
returns table (run_id uuid, lease_expires_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_binding_id uuid;
  v_lease_seconds integer := public.slice_2c_lease_seconds(p_lease_seconds);
  v_renew_now timestamptz;
begin
  select ir.binding_id into v_binding_id
  from public.ingestion_runs ir where ir.id = p_run_id;
  if v_binding_id is null then
    raise exception 'run_not_found' using errcode = '23503';
  end if;
  perform 1 from public.provider_bindings pb where pb.id = v_binding_id for update;
  if not found then
    raise exception 'binding_not_found' using errcode = '23503';
  end if;
  perform 1 from public.ingestion_runs ir where ir.id = p_run_id for update;
  perform public.slice_2c_assert_lease(p_run_id, p_lease_token, clock_timestamp());
  v_renew_now := clock_timestamp();
  return query
  update public.ingestion_runs ir
  set lease_expires_at = v_renew_now + make_interval(secs => v_lease_seconds)
  where ir.id = p_run_id
  returning ir.id, ir.lease_expires_at;
end;
$$;

create or replace function public.record_ingestion_response(
  p_run_id uuid, p_lease_token text, p_http_status integer,
  p_rate_limit_limit integer, p_rate_limit_remaining integer,
  p_rate_limit_reset_at timestamptz, p_retry_after_at timestamptz, p_observed_at timestamptz
)
returns table (run_id uuid, recorded boolean)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_binding_id uuid;
  v_status text;
begin
  select ir.binding_id into v_binding_id
  from public.ingestion_runs ir where ir.id = p_run_id;
  if v_binding_id is null then
    raise exception 'run_not_found' using errcode = '23503';
  end if;
  perform 1 from public.provider_bindings pb where pb.id = v_binding_id for update;
  if not found then
    raise exception 'binding_not_found' using errcode = '23503';
  end if;
  select ir.status into v_status from public.ingestion_runs ir where ir.id = p_run_id for update;
  if v_status <> 'running' then
    raise exception 'run_not_running' using errcode = 'P0004';
  end if;
  perform public.slice_2c_assert_lease(p_run_id, p_lease_token, p_observed_at);
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
  return query
  update public.ingestion_runs ir
  set http_status = p_http_status,
      rate_limit_limit = p_rate_limit_limit,
      rate_limit_remaining = p_rate_limit_remaining,
      rate_limit_reset_at = p_rate_limit_reset_at,
      retry_after_at = p_retry_after_at
  where ir.id = p_run_id
  returning ir.id, true;
end;
$$;

create or replace function public.reclaim_expired_ingestion_runs(
  p_now timestamptz, p_reason text, p_retry_at timestamptz
)
returns table (run_id uuid, binding_id uuid, retry_index integer, reclaimed_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_binding public.provider_bindings%rowtype;
  v_run public.ingestion_runs%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_retry_at timestamptz;
  v_reclaimed_at timestamptz;
begin
  if p_now is null then
    raise exception 'reclaim requires now' using errcode = '22023';
  end if;
  for v_binding in
    select pb.*
    from public.provider_bindings pb
    where exists (
      select 1 from public.ingestion_runs ir
      where ir.binding_id = pb.id
        and ir.status in ('claimed', 'running')
        and ir.lease_expires_at <= clock_timestamp()
    )
    order by pb.id
    for update of pb skip locked
  loop
    for v_run in
      select ir.* from public.ingestion_runs ir
      where ir.binding_id = v_binding.id
        and ir.status in ('claimed', 'running')
        and ir.lease_expires_at <= clock_timestamp()
      order by ir.id
      for update skip locked
    loop
      if v_run.lease_expires_at > clock_timestamp() then
        continue;
      end if;
      v_reclaimed_at := clock_timestamp();
      v_retry_at := case when v_run.retry_index < 3 then p_retry_at else null end;
      update public.ingestion_runs ir
      set status = 'failed',
          finished_at = v_reclaimed_at,
          lease_token = null,
          lease_expires_at = null,
          next_retry_at = v_retry_at,
          error_class = 'system:lease_expired',
          error_message = left(coalesce(v_reason, 'lease expired'), 2048)
      where ir.id = v_run.id;
      update public.provider_bindings pb
      set next_poll_at = case when v_retry_at is null then v_reclaimed_at else v_retry_at end,
          last_attempt_at = v_reclaimed_at,
          updated_at = v_reclaimed_at
      where pb.id = v_binding.id;
      run_id := v_run.id;
      binding_id := v_binding.id;
      retry_index := v_run.retry_index;
      reclaimed_at := v_reclaimed_at;
      return next;
    end loop;
  end loop;
end;
$$;

create or replace function public.slice_2c_page_key(
  p_binding_id uuid, p_checkpoint_generation bigint, p_expected_cursor jsonb, p_expected_etag text
)
returns text language sql immutable set search_path = public, pg_temp
as $$
  select encode(extensions.digest(
    'slice-2c-page-v1'
    || octet_length(p_binding_id::text)::text || p_binding_id::text
    || octet_length(p_checkpoint_generation::text)::text || p_checkpoint_generation::text
    || octet_length(public.slice_2b_canonical_json(p_expected_cursor))::text
    || public.slice_2b_canonical_json(p_expected_cursor)
    || octet_length(coalesce(p_expected_etag, ''))::text || coalesce(p_expected_etag, ''),
    'sha256'
  ), 'hex');
$$;

create or replace function public.commit_ingestion_page(
  p_run_id uuid, p_lease_token text, p_page_key text, p_expected_checkpoint_generation bigint,
  p_expected_cursor jsonb, p_expected_etag text, p_next_cursor jsonb, p_response_etag text,
  p_fetched_delta integer, p_normalized_delta integer, p_projected_delta integer,
  p_unchanged_delta integer, p_quarantined_delta integer, p_skipped_delta integer, p_failed_delta integer
)
returns table (
  outcome text, page_ledger_id uuid, run_id uuid, checkpoint_generation bigint,
  cursor_after jsonb, provider_etag text
)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_binding_id uuid;
  v_binding public.provider_bindings%rowtype;
  v_ledger public.ingestion_page_ledger%rowtype;
  v_expected_key text;
  v_fingerprint text;
  v_result_generation bigint;
  v_status text;
begin
  select ir.binding_id into v_binding_id
  from public.ingestion_runs ir where ir.id = p_run_id;
  if v_binding_id is null then
    raise exception 'run_not_found' using errcode = '23503';
  end if;
  select pb.* into v_binding from public.provider_bindings pb where pb.id = v_binding_id for update;
  select ir.status into v_status from public.ingestion_runs ir where ir.id = p_run_id for update;
  if v_status is null then
    raise exception 'run_not_found' using errcode = '23503';
  end if;
  if v_status <> 'running' then
    raise exception 'run_not_running' using errcode = 'P0004';
  end if;
  perform public.slice_2c_assert_lease(p_run_id, p_lease_token, clock_timestamp());

  if btrim(coalesce(p_page_key, '')) = ''
    or p_expected_checkpoint_generation is null
    or p_expected_checkpoint_generation < 0
    or p_expected_cursor is null
    or jsonb_typeof(p_expected_cursor) <> 'object'
    or p_next_cursor is null
    or jsonb_typeof(p_next_cursor) <> 'object' then
    raise exception 'invalid_page_input' using errcode = '22023';
  end if;
  if p_fetched_delta < 0 or p_normalized_delta < 0 or p_projected_delta < 0
    or p_unchanged_delta < 0 or p_quarantined_delta < 0 or p_skipped_delta < 0
    or p_failed_delta < 0 then
    raise exception 'invalid_page_counts' using errcode = '22023';
  end if;
  if p_normalized_delta <> p_projected_delta + p_unchanged_delta
    + p_quarantined_delta + p_skipped_delta + p_failed_delta then
    raise exception 'count_conservation_failed' using errcode = '22023';
  end if;

  v_expected_key := public.slice_2c_page_key(
    v_binding.id, p_expected_checkpoint_generation, p_expected_cursor, p_expected_etag
  );
  if p_page_key <> v_expected_key then
    raise exception 'page_conflict' using errcode = 'P0003';
  end if;
  v_fingerprint := public.slice_2c_page_disposition_fingerprint(
    p_expected_checkpoint_generation, p_expected_cursor, p_expected_etag,
    p_next_cursor, p_response_etag, p_fetched_delta, p_normalized_delta,
    p_projected_delta, p_unchanged_delta, p_quarantined_delta,
    p_skipped_delta, p_failed_delta
  );

  select pl.* into v_ledger
  from public.ingestion_page_ledger pl
  where pl.binding_id = v_binding.id and pl.page_key = p_page_key
  for update;
  if found then
    if v_ledger.expected_checkpoint_generation <> p_expected_checkpoint_generation
      or v_ledger.expected_cursor is distinct from p_expected_cursor
      or v_ledger.expected_etag is distinct from p_expected_etag
      or v_ledger.next_cursor is distinct from p_next_cursor
      or v_ledger.response_etag is distinct from p_response_etag
      or v_ledger.fetched_delta <> p_fetched_delta
      or v_ledger.normalized_delta <> p_normalized_delta
      or v_ledger.projected_delta <> p_projected_delta
      or v_ledger.unchanged_delta <> p_unchanged_delta
      or v_ledger.quarantined_delta <> p_quarantined_delta
      or v_ledger.skipped_delta <> p_skipped_delta
      or v_ledger.failed_delta <> p_failed_delta
      or v_ledger.disposition_fingerprint <> v_fingerprint then
      raise exception 'page_conflict' using errcode = 'P0003';
    end if;
    return query select 'replayed'::text, v_ledger.id, p_run_id,
      v_ledger.result_checkpoint_generation, v_ledger.next_cursor, v_ledger.response_etag;
    return;
  end if;

  if v_binding.checkpoint_generation <> p_expected_checkpoint_generation
    or v_binding.provider_cursor is distinct from p_expected_cursor
    or v_binding.provider_etag is distinct from p_expected_etag then
    raise exception 'checkpoint_conflict' using errcode = 'P0002';
  end if;

  v_result_generation := v_binding.checkpoint_generation + 1;
  begin
    insert into public.ingestion_page_ledger (
      binding_id, run_id, page_key, expected_checkpoint_generation,
      expected_cursor, expected_etag, next_cursor, response_etag,
      fetched_delta, normalized_delta, projected_delta, unchanged_delta,
      quarantined_delta, skipped_delta, failed_delta, disposition_fingerprint,
      result_checkpoint_generation
    ) values (
      v_binding.id, p_run_id, p_page_key, p_expected_checkpoint_generation,
      p_expected_cursor, p_expected_etag, p_next_cursor, p_response_etag,
      p_fetched_delta, p_normalized_delta, p_projected_delta, p_unchanged_delta,
      p_quarantined_delta, p_skipped_delta, p_failed_delta, v_fingerprint,
      v_result_generation
    ) returning public.ingestion_page_ledger.id into v_ledger.id;
  exception when unique_violation then
    select pl.* into v_ledger
    from public.ingestion_page_ledger pl
    where pl.binding_id = v_binding.id and pl.page_key = p_page_key;
    if found
      and v_ledger.expected_checkpoint_generation = p_expected_checkpoint_generation
      and v_ledger.expected_cursor is not distinct from p_expected_cursor
      and v_ledger.expected_etag is not distinct from p_expected_etag
      and v_ledger.next_cursor is not distinct from p_next_cursor
      and v_ledger.response_etag is not distinct from p_response_etag
      and v_ledger.fetched_delta = p_fetched_delta
      and v_ledger.normalized_delta = p_normalized_delta
      and v_ledger.projected_delta = p_projected_delta
      and v_ledger.unchanged_delta = p_unchanged_delta
      and v_ledger.quarantined_delta = p_quarantined_delta
      and v_ledger.skipped_delta = p_skipped_delta
      and v_ledger.failed_delta = p_failed_delta
      and v_ledger.disposition_fingerprint = v_fingerprint then
      return query select 'replayed'::text, v_ledger.id, p_run_id,
        v_ledger.result_checkpoint_generation, v_ledger.next_cursor, v_ledger.response_etag;
      return;
    end if;
    raise exception 'page_conflict' using errcode = 'P0003';
  end;

  update public.ingestion_runs ir
  set cursor_after = p_next_cursor,
      fetched_count = ir.fetched_count + p_fetched_delta,
      normalized_count = ir.normalized_count + p_normalized_delta,
      projected_count = ir.projected_count + p_projected_delta,
      unchanged_count = ir.unchanged_count + p_unchanged_delta,
      quarantined_count = ir.quarantined_count + p_quarantined_delta,
      skipped_count = ir.skipped_count + p_skipped_delta,
      failed_count = ir.failed_count + p_failed_delta
  where ir.id = p_run_id;

  update public.provider_bindings pb
  set provider_cursor = p_next_cursor,
      provider_etag = p_response_etag,
      checkpoint_generation = v_result_generation,
      updated_at = clock_timestamp()
  where pb.id = v_binding.id;

  return query select 'committed'::text, v_ledger.id,
    p_run_id, v_result_generation, p_next_cursor, p_response_etag;
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
  select pb.* into v_binding from public.provider_bindings pb where pb.id = v_binding_id for update;
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
      consecutive_failures = case when p_outcome in ('succeeded', 'partial') then 0 else pb.consecutive_failures + 1 end,
      last_attempt_at = v_finished_at,
      last_success_at = case when p_outcome in ('succeeded', 'partial') then v_finished_at else pb.last_success_at end,
      last_data_at = case when coalesce(p_data_changed, false) then v_finished_at else pb.last_data_at end,
      updated_at = v_finished_at
  where pb.id = v_binding.id;

  return query select p_run_id, p_outcome, v_health, v_next_poll_at, v_retry_at;
end;
$$;

revoke all on function public.start_ingestion_run(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.renew_ingestion_run(uuid, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.record_ingestion_response(uuid, text, integer, integer, integer, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.reclaim_expired_ingestion_runs(timestamptz, text, timestamptz) from public, anon, authenticated;
revoke all on function public.commit_ingestion_page(uuid, text, text, bigint, jsonb, text, jsonb, text, integer, integer, integer, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.finish_ingestion_run(uuid, text, text, timestamptz, timestamptz, timestamptz, boolean, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.start_ingestion_run(uuid, text, timestamptz) to service_role;
grant execute on function public.renew_ingestion_run(uuid, text, timestamptz, integer) to service_role;
grant execute on function public.record_ingestion_response(uuid, text, integer, integer, integer, timestamptz, timestamptz, timestamptz) to service_role;
grant execute on function public.reclaim_expired_ingestion_runs(timestamptz, text, timestamptz) to service_role;
grant execute on function public.commit_ingestion_page(uuid, text, text, bigint, jsonb, text, jsonb, text, integer, integer, integer, integer, integer, integer, integer) to service_role;
grant execute on function public.finish_ingestion_run(uuid, text, text, timestamptz, timestamptz, timestamptz, boolean, text, text, jsonb) to service_role;
