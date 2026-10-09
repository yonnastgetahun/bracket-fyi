-- Bracket.fyi Slice 2C.2-R — acceptance remediation.
-- Forward-only repair. The original 20261010000000 migration remains unchanged.

create or replace function slice_2c_metadata_has_sensitive_key(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_entry record;
  v_key text;
begin
  if p_value is null then
    return false;
  end if;
  if jsonb_typeof(p_value) = 'object' then
    for v_entry in select key, value from jsonb_each(p_value) loop
      v_key := lower(v_entry.key);
      if v_key ~ '(authorization|cookie|credential|password|secret|token|payload|raw|body)' then
        return true;
      end if;
      if slice_2c_metadata_has_sensitive_key(v_entry.value) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for v_entry in select value from jsonb_array_elements(p_value) loop
      if slice_2c_metadata_has_sensitive_key(v_entry.value) then
        return true;
      end if;
    end loop;
  end if;
  return false;
end;
$$;

alter table ingestion_runs
  add constraint ingestion_runs_error_class_length
    check (error_class is null or char_length(error_class) <= 128),
  add constraint ingestion_runs_error_message_length
    check (error_message is null or char_length(error_message) <= 2048),
  add constraint ingestion_runs_metadata_size
    check (pg_column_size(metadata) <= 16384),
  add constraint ingestion_runs_metadata_no_sensitive_keys
    check (not slice_2c_metadata_has_sensitive_key(metadata));

create index ingestion_page_ledger_checkpoint_idx
  on ingestion_page_ledger (binding_id, expected_checkpoint_generation, committed_at);

alter function slice_2c_run_row(uuid, boolean) security invoker;

revoke all on function slice_2c_metadata_has_sensitive_key(jsonb) from public, anon, authenticated, service_role;

create or replace function slice_2c_claim_due_impl(
  p_claim_request_key text,
  p_now timestamptz,
  p_worker_id text,
  p_lease_seconds integer
)
returns table (
  run_id uuid,
  binding_id uuid,
  claim_key text,
  claim_request_key text,
  claim_generation bigint,
  retry_index integer,
  lease_token text,
  lease_acquired boolean,
  provider_id uuid,
  event_edition_id uuid,
  adapter_key text,
  binding_key text,
  mode text,
  credential_ref text,
  adapter_config_version integer,
  adapter_config jsonb,
  poll_policy jsonb,
  provider_cursor jsonb,
  provider_etag text,
  lease_expires_at timestamptz
)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_request_key text := slice_2c_normalize_automated_claim_key(p_claim_request_key);
  v_existing ingestion_runs%rowtype;
  v_binding provider_bindings%rowtype;
  v_parent ingestion_runs%rowtype;
  v_new ingestion_runs%rowtype;
  v_generation bigint;
  v_lease_seconds integer := slice_2c_lease_seconds(p_lease_seconds);
  v_has_due_retry boolean;
  v_db_now timestamptz := clock_timestamp();
begin
  if p_now is null or btrim(coalesce(p_worker_id, '')) = '' then
    raise exception 'claim requires now and nonblank worker_id' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_request_key, 0));
  select ir.* into v_existing
  from ingestion_runs ir
  where ir.claim_request_key = v_request_key
  for update;
  if found then
    return query select * from slice_2c_run_row(
      v_existing.id,
      v_existing.status in ('claimed', 'running')
        and v_existing.claimed_by = p_worker_id
        and v_existing.lease_expires_at > v_db_now
    );
    return;
  end if;

  select pb.* into v_binding
  from provider_bindings pb
  where pb.mode <> 'disabled'
    and not exists (
      select 1 from ingestion_runs active_run
      where active_run.binding_id = pb.id
        and active_run.status in ('claimed', 'running')
    )
    and (
      exists (
        select 1 from ingestion_runs due_parent
        where due_parent.binding_id = pb.id
          and due_parent.status in ('failed', 'rate_limited')
          and due_parent.retry_index < 3
          and due_parent.next_retry_at <= p_now
          and not exists (select 1 from ingestion_runs child where child.retry_of_run_id = due_parent.id)
      )
      or (
        (pb.next_poll_at is null or pb.next_poll_at <= p_now)
        and not exists (
          select 1 from ingestion_runs unresolved_retry
          where unresolved_retry.binding_id = pb.id
            and unresolved_retry.status in ('failed', 'rate_limited')
            and unresolved_retry.retry_index < 3
            and unresolved_retry.next_retry_at is not null
            and not exists (select 1 from ingestion_runs child where child.retry_of_run_id = unresolved_retry.id)
        )
      )
    )
  order by case when exists (
    select 1 from ingestion_runs due_parent
    where due_parent.binding_id = pb.id
      and due_parent.status in ('failed', 'rate_limited')
      and due_parent.retry_index < 3
      and due_parent.next_retry_at <= p_now
      and not exists (select 1 from ingestion_runs child where child.retry_of_run_id = due_parent.id)
  ) then 0 else 1 end,
  coalesce((select min(due_parent.next_retry_at) from ingestion_runs due_parent
    where due_parent.binding_id = pb.id
      and due_parent.status in ('failed', 'rate_limited')
      and due_parent.retry_index < 3
      and due_parent.next_retry_at is not null
      and not exists (select 1 from ingestion_runs child where child.retry_of_run_id = due_parent.id)), pb.next_poll_at),
  pb.id
  for update of pb skip locked
  limit 1;

  if not found then
    return;
  end if;

  select exists (
    select 1 from ingestion_runs retry_parent
    where retry_parent.binding_id = v_binding.id
      and retry_parent.status in ('failed', 'rate_limited')
      and retry_parent.retry_index < 3
      and retry_parent.next_retry_at <= p_now
      and not exists (select 1 from ingestion_runs child where child.retry_of_run_id = retry_parent.id)
  ) into v_has_due_retry;

  if v_has_due_retry then
    select retry_parent.* into v_parent
    from ingestion_runs retry_parent
    where retry_parent.binding_id = v_binding.id
      and retry_parent.status in ('failed', 'rate_limited')
      and retry_parent.retry_index < 3
      and retry_parent.next_retry_at <= p_now
      and not exists (select 1 from ingestion_runs child where child.retry_of_run_id = retry_parent.id)
    order by retry_parent.next_retry_at, retry_parent.id
    for update skip locked
    limit 1;
    if not found then
      return;
    end if;
  end if;

  begin
    update provider_bindings pb
    set claim_generation = pb.claim_generation + 1,
        next_poll_at = null,
        updated_at = v_db_now
    where pb.id = v_binding.id
    returning pb.claim_generation into v_generation;

    if v_has_due_retry then
      insert into ingestion_runs (
        binding_id, provider_id, event_edition_id, claim_key, claim_request_key,
        claim_generation, trigger_kind, status, claimed_by, lease_token,
        lease_expires_at, cursor_before, retry_index, retry_of_run_id
      ) values (
        v_binding.id, v_binding.provider_id, v_binding.event_edition_id,
        'v1:retry:' || v_binding.id::text || ':g' || v_generation::text,
        v_request_key, v_generation, 'retry', 'claimed', p_worker_id,
        gen_random_uuid()::text, v_db_now + make_interval(secs => v_lease_seconds),
        v_binding.provider_cursor, v_parent.retry_index + 1, v_parent.id
      ) returning * into v_new;
    else
      insert into ingestion_runs (
        binding_id, provider_id, event_edition_id, claim_key, claim_request_key,
        claim_generation, trigger_kind, status, claimed_by, lease_token,
        lease_expires_at, cursor_before, retry_index
      ) values (
        v_binding.id, v_binding.provider_id, v_binding.event_edition_id,
        'v1:schedule:' || v_binding.id::text || ':g' || v_generation::text,
        v_request_key, v_generation, 'schedule', 'claimed', p_worker_id,
        gen_random_uuid()::text, v_db_now + make_interval(secs => v_lease_seconds),
        v_binding.provider_cursor, 0
      ) returning * into v_new;
    end if;
  exception when unique_violation then
    select ir.* into v_existing from ingestion_runs ir where ir.claim_request_key = v_request_key;
    if found then
      return query select * from slice_2c_run_row(
        v_existing.id,
        v_existing.status in ('claimed', 'running')
          and v_existing.claimed_by = p_worker_id
          and v_existing.lease_expires_at > clock_timestamp()
      );
    end if;
    return;
  end;

  return query select * from slice_2c_run_row(v_new.id, true);
end;
$$;

create or replace function slice_2c_claim_manual_impl(
  p_binding_id uuid,
  p_request_key text,
  p_worker_id text,
  p_now timestamptz,
  p_lease_seconds integer
)
returns table (
  run_id uuid,
  binding_id uuid,
  claim_key text,
  claim_request_key text,
  claim_generation bigint,
  retry_index integer,
  lease_token text,
  lease_acquired boolean,
  provider_id uuid,
  event_edition_id uuid,
  adapter_key text,
  binding_key text,
  mode text,
  credential_ref text,
  adapter_config_version integer,
  adapter_config jsonb,
  poll_policy jsonb,
  provider_cursor jsonb,
  provider_etag text,
  lease_expires_at timestamptz
)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_request_key text := slice_2c_normalize_manual_claim_key(p_binding_id, p_request_key);
  v_existing ingestion_runs%rowtype;
  v_binding provider_bindings%rowtype;
  v_new ingestion_runs%rowtype;
  v_generation bigint;
  v_lease_seconds integer := slice_2c_lease_seconds(p_lease_seconds);
  v_db_now timestamptz := clock_timestamp();
begin
  if p_now is null or btrim(coalesce(p_worker_id, '')) = '' then
    raise exception 'claim requires now and nonblank worker_id' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_request_key, 0));
  select ir.* into v_existing from ingestion_runs ir where ir.claim_request_key = v_request_key for update;
  if found then
    return query select * from slice_2c_run_row(
      v_existing.id,
      v_existing.status in ('claimed', 'running')
        and v_existing.claimed_by = p_worker_id
        and v_existing.lease_expires_at > v_db_now
    );
    return;
  end if;

  select * into v_binding from provider_bindings pb where pb.id = p_binding_id for update;
  if not found then
    raise exception 'binding_not_found' using errcode = '23503';
  end if;
  if v_binding.mode = 'disabled' then
    raise exception 'disabled_binding' using errcode = '22023';
  end if;

  perform 1 from ingestion_runs ir
  where ir.binding_id = p_binding_id and ir.status in ('claimed', 'running')
  order by ir.created_at, ir.id
  for update
  limit 1;
  if found then
    return;
  end if;

  begin
    update provider_bindings pb
    set claim_generation = pb.claim_generation + 1,
        next_poll_at = null,
        updated_at = v_db_now
    where pb.id = p_binding_id
    returning pb.claim_generation into v_generation;

    insert into ingestion_runs (
      binding_id, provider_id, event_edition_id, claim_key, claim_request_key,
      claim_generation, trigger_kind, status, claimed_by, lease_token,
      lease_expires_at, cursor_before, retry_index
    ) values (
      v_binding.id, v_binding.provider_id, v_binding.event_edition_id,
      'v1:manual:' || v_binding.id::text || ':g' || v_generation::text,
      v_request_key, v_generation, 'manual', 'claimed', p_worker_id,
      gen_random_uuid()::text, v_db_now + make_interval(secs => v_lease_seconds),
      v_binding.provider_cursor, 0
    ) returning * into v_new;
  exception when unique_violation then
    select ir.* into v_existing from ingestion_runs ir where ir.claim_request_key = v_request_key;
    if found then
      return query select * from slice_2c_run_row(
        v_existing.id,
        v_existing.status in ('claimed', 'running')
          and v_existing.claimed_by = p_worker_id
          and v_existing.lease_expires_at > clock_timestamp()
      );
    end if;
    return;
  end;

  return query select * from slice_2c_run_row(v_new.id, true);
end;
$$;

revoke all on function slice_2c_claim_due_impl(text, timestamptz, text, integer) from public, anon, authenticated, service_role;
revoke all on function slice_2c_claim_manual_impl(uuid, text, text, timestamptz, integer) from public, anon, authenticated, service_role;

create or replace function claim_due_ingestion_run(
  p_claim_request_key text,
  p_now timestamptz,
  p_worker_id text,
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
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query select * from slice_2c_claim_due_impl(
    p_claim_request_key, p_now, p_worker_id, p_lease_seconds
  );
end;
$$;

create or replace function claim_manual_ingestion_run(
  p_binding_id uuid,
  p_request_key text,
  p_worker_id text,
  p_now timestamptz,
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
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query select * from slice_2c_claim_manual_impl(
    p_binding_id, p_request_key, p_worker_id, p_now, p_lease_seconds
  );
end;
$$;

revoke all on function claim_due_ingestion_run(text, timestamptz, text, integer) from public, anon, authenticated;
revoke all on function claim_manual_ingestion_run(uuid, text, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function claim_due_ingestion_run(text, timestamptz, text, integer) to service_role;
grant execute on function claim_manual_ingestion_run(uuid, text, text, timestamptz, integer) to service_role;

create or replace function slice_2c_assert_lease(
  p_run_id uuid,
  p_lease_token text,
  p_now timestamptz
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_db_now timestamptz := clock_timestamp();
begin
  -- p_now is retained for the public signature but is never authoritative for lease validity.
  if not exists (
    select 1 from ingestion_runs ir
    where ir.id = p_run_id
      and ir.status in ('claimed', 'running')
      and ir.lease_token = p_lease_token
      and ir.lease_expires_at > v_db_now
  ) then
    raise exception 'lease_lost' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function slice_2c_assert_lease(uuid, text, timestamptz) from public, anon, authenticated, service_role;

create or replace function start_ingestion_run(
  p_run_id uuid,
  p_lease_token text,
  p_now timestamptz
)
returns table (run_id uuid, status text, started_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_binding_id uuid;
  v_status text;
  v_started_at timestamptz;
  v_db_now timestamptz := clock_timestamp();
begin
  select ir.binding_id into v_binding_id from ingestion_runs ir where ir.id = p_run_id;
  if v_binding_id is null then
    raise exception 'run_not_found' using errcode = '23503';
  end if;
  perform 1 from provider_bindings pb where pb.id = v_binding_id for update;
  if not found then
    raise exception 'binding_not_found' using errcode = '23503';
  end if;
  select ir.status, ir.started_at into v_status, v_started_at
  from ingestion_runs ir where ir.id = p_run_id for update;
  perform slice_2c_assert_lease(p_run_id, p_lease_token, p_now);
  if v_status = 'running' then
    return query select p_run_id, v_status, v_started_at;
    return;
  end if;
  if v_status <> 'claimed' then
    raise exception 'run_not_claimed' using errcode = 'P0004';
  end if;
  return query
  update ingestion_runs ir
  set status = 'running', started_at = v_db_now
  where ir.id = p_run_id
  returning ir.id, ir.status, ir.started_at;
end;
$$;

create or replace function renew_ingestion_run(
  p_run_id uuid,
  p_lease_token text,
  p_now timestamptz,
  p_lease_seconds integer default 300
)
returns table (run_id uuid, lease_expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_binding_id uuid;
  v_lease_seconds integer := slice_2c_lease_seconds(p_lease_seconds);
  v_db_now timestamptz := clock_timestamp();
begin
  select ir.binding_id into v_binding_id from ingestion_runs ir where ir.id = p_run_id;
  if v_binding_id is null then
    raise exception 'run_not_found' using errcode = '23503';
  end if;
  perform 1 from provider_bindings pb where pb.id = v_binding_id for update;
  if not found then
    raise exception 'binding_not_found' using errcode = '23503';
  end if;
  perform 1 from ingestion_runs ir where ir.id = p_run_id for update;
  perform slice_2c_assert_lease(p_run_id, p_lease_token, p_now);
  return query
  update ingestion_runs ir
  set lease_expires_at = v_db_now + make_interval(secs => v_lease_seconds)
  where ir.id = p_run_id
  returning ir.id, ir.lease_expires_at;
end;
$$;

create or replace function record_ingestion_response(
  p_run_id uuid,
  p_lease_token text,
  p_http_status integer,
  p_rate_limit_limit integer,
  p_rate_limit_remaining integer,
  p_rate_limit_reset_at timestamptz,
  p_retry_after_at timestamptz,
  p_observed_at timestamptz
)
returns table (run_id uuid, recorded boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_binding_id uuid;
  v_status text;
begin
  select ir.binding_id into v_binding_id from ingestion_runs ir where ir.id = p_run_id;
  if v_binding_id is null then
    raise exception 'run_not_found' using errcode = '23503';
  end if;
  perform 1 from provider_bindings pb where pb.id = v_binding_id for update;
  if not found then
    raise exception 'binding_not_found' using errcode = '23503';
  end if;
  select ir.status into v_status from ingestion_runs ir where ir.id = p_run_id for update;
  if v_status <> 'running' then
    raise exception 'run_not_running' using errcode = 'P0004';
  end if;
  perform slice_2c_assert_lease(p_run_id, p_lease_token, p_observed_at);
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
  update ingestion_runs ir
  set http_status = p_http_status,
      rate_limit_limit = p_rate_limit_limit,
      rate_limit_remaining = p_rate_limit_remaining,
      rate_limit_reset_at = p_rate_limit_reset_at,
      retry_after_at = p_retry_after_at
  where ir.id = p_run_id
  returning ir.id, true;
end;
$$;

create or replace function reclaim_expired_ingestion_runs(
  p_now timestamptz,
  p_reason text,
  p_retry_at timestamptz
)
returns table (run_id uuid, binding_id uuid, retry_index integer, reclaimed_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_binding provider_bindings%rowtype;
  v_run ingestion_runs%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_retry_at timestamptz;
  v_db_now timestamptz := clock_timestamp();
begin
  if p_now is null then
    raise exception 'reclaim requires now' using errcode = '22023';
  end if;
  for v_binding in
    select pb.*
    from provider_bindings pb
    where exists (
      select 1 from ingestion_runs ir
      where ir.binding_id = pb.id
        and ir.status in ('claimed', 'running')
        and ir.lease_expires_at <= v_db_now
    )
    order by pb.id
    for update of pb skip locked
  loop
    for v_run in
      select ir.* from ingestion_runs ir
      where ir.binding_id = v_binding.id
        and ir.status in ('claimed', 'running')
        and ir.lease_expires_at <= v_db_now
      order by ir.id
      for update skip locked
    loop
      v_retry_at := case when v_run.retry_index < 3 then p_retry_at else null end;
      update ingestion_runs ir
      set status = 'failed',
          finished_at = v_db_now,
          lease_token = null,
          lease_expires_at = null,
          next_retry_at = v_retry_at,
          error_class = 'system:lease_expired',
          error_message = left(coalesce(v_reason, 'lease expired'), 2048)
      where ir.id = v_run.id;
      update provider_bindings pb
      set next_poll_at = case when v_retry_at is null then v_db_now else v_retry_at end,
          last_attempt_at = v_db_now,
          updated_at = v_db_now
      where pb.id = v_binding.id;
      run_id := v_run.id;
      binding_id := v_binding.id;
      retry_index := v_run.retry_index;
      reclaimed_at := v_db_now;
      return next;
    end loop;
  end loop;
end;
$$;

revoke all on function start_ingestion_run(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function renew_ingestion_run(uuid, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function record_ingestion_response(uuid, text, integer, integer, integer, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function reclaim_expired_ingestion_runs(timestamptz, text, timestamptz) from public, anon, authenticated;
grant execute on function start_ingestion_run(uuid, text, timestamptz) to service_role;
grant execute on function renew_ingestion_run(uuid, text, timestamptz, integer) to service_role;
grant execute on function record_ingestion_response(uuid, text, integer, integer, integer, timestamptz, timestamptz, timestamptz) to service_role;
grant execute on function reclaim_expired_ingestion_runs(timestamptz, text, timestamptz) to service_role;

create or replace function slice_2c_page_key(
  p_binding_id uuid,
  p_checkpoint_generation bigint,
  p_expected_cursor jsonb,
  p_expected_etag text
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select encode(extensions.digest(
    'slice-2c-page-v1'
    || octet_length(p_binding_id::text)::text || p_binding_id::text
    || octet_length(p_checkpoint_generation::text)::text || p_checkpoint_generation::text
    || octet_length(slice_2b_canonical_json(p_expected_cursor))::text
    || slice_2b_canonical_json(p_expected_cursor)
    || octet_length(coalesce(p_expected_etag, ''))::text || coalesce(p_expected_etag, ''),
    'sha256'
  ), 'hex');
$$;

create or replace function commit_ingestion_page(
  p_run_id uuid,
  p_lease_token text,
  p_page_key text,
  p_expected_checkpoint_generation bigint,
  p_expected_cursor jsonb,
  p_expected_etag text,
  p_next_cursor jsonb,
  p_response_etag text,
  p_fetched_delta integer,
  p_normalized_delta integer,
  p_projected_delta integer,
  p_unchanged_delta integer,
  p_quarantined_delta integer,
  p_skipped_delta integer,
  p_failed_delta integer
)
returns table (
  outcome text,
  page_ledger_id uuid,
  run_id uuid,
  checkpoint_generation bigint,
  cursor_after jsonb,
  provider_etag text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_binding_id uuid;
  v_binding provider_bindings%rowtype;
  v_ledger ingestion_page_ledger%rowtype;
  v_expected_key text;
  v_fingerprint text;
  v_result_generation bigint;
  v_status text;
begin
  select ir.binding_id into v_binding_id from ingestion_runs ir where ir.id = p_run_id;
  if v_binding_id is null then
    raise exception 'run_not_found' using errcode = '23503';
  end if;
  select * into v_binding from provider_bindings pb where pb.id = v_binding_id for update;
  select ir.status into v_status from ingestion_runs ir where ir.id = p_run_id for update;
  if v_status is null then
    raise exception 'run_not_found' using errcode = '23503';
  end if;
  if v_status <> 'running' then
    raise exception 'run_not_running' using errcode = 'P0004';
  end if;
  perform slice_2c_assert_lease(p_run_id, p_lease_token, clock_timestamp());

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

  v_expected_key := slice_2c_page_key(
    v_binding.id, p_expected_checkpoint_generation, p_expected_cursor, p_expected_etag
  );
  if p_page_key <> v_expected_key then
    raise exception 'page_conflict' using errcode = 'P0003';
  end if;
  v_fingerprint := slice_2c_page_disposition_fingerprint(
    p_expected_checkpoint_generation, p_expected_cursor, p_expected_etag,
    p_next_cursor, p_response_etag, p_fetched_delta, p_normalized_delta,
    p_projected_delta, p_unchanged_delta, p_quarantined_delta,
    p_skipped_delta, p_failed_delta
  );

  select * into v_ledger
  from ingestion_page_ledger pl
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
    insert into ingestion_page_ledger (
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
    ) returning ingestion_page_ledger.id into v_ledger.id;
  exception when unique_violation then
    select * into v_ledger
    from ingestion_page_ledger pl
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

  update ingestion_runs ir
  set cursor_after = p_next_cursor,
      fetched_count = ir.fetched_count + p_fetched_delta,
      normalized_count = ir.normalized_count + p_normalized_delta,
      projected_count = ir.projected_count + p_projected_delta,
      unchanged_count = ir.unchanged_count + p_unchanged_delta,
      quarantined_count = ir.quarantined_count + p_quarantined_delta,
      skipped_count = ir.skipped_count + p_skipped_delta,
      failed_count = ir.failed_count + p_failed_delta
  where ir.id = p_run_id;

  update provider_bindings pb
  set provider_cursor = p_next_cursor,
      provider_etag = p_response_etag,
      checkpoint_generation = v_result_generation,
      updated_at = clock_timestamp()
  where pb.id = v_binding.id;

  return query select 'committed'::text, v_ledger.id,
    p_run_id, v_result_generation, p_next_cursor, p_response_etag;
end;
$$;

revoke all on function commit_ingestion_page(uuid, text, text, bigint, jsonb, text, jsonb, text, integer, integer, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function commit_ingestion_page(uuid, text, text, bigint, jsonb, text, jsonb, text, integer, integer, integer, integer, integer, integer, integer) to service_role;

create or replace function finish_ingestion_run(
  p_run_id uuid,
  p_lease_token text,
  p_outcome text,
  p_finished_at timestamptz,
  p_next_poll_at timestamptz,
  p_next_retry_at timestamptz,
  p_data_changed boolean,
  p_failure_code text,
  p_error_message text,
  p_metadata jsonb
)
returns table (
  run_id uuid,
  status text,
  health_status text,
  next_poll_at timestamptz,
  next_retry_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_binding_id uuid;
  v_binding provider_bindings%rowtype;
  v_status text;
  v_retry_index integer;
  v_retry_at timestamptz := p_next_retry_at;
  v_next_poll_at timestamptz;
  v_health text;
  v_finished_at timestamptz := clock_timestamp();
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
  select ir.binding_id into v_binding_id from ingestion_runs ir where ir.id = p_run_id;
  if v_binding_id is null then
    raise exception 'run_not_found' using errcode = '23503';
  end if;
  select * into v_binding from provider_bindings pb where pb.id = v_binding_id for update;
  select ir.status, ir.retry_index into v_status, v_retry_index
  from ingestion_runs ir where ir.id = p_run_id for update;
  if v_status is null then
    raise exception 'run_not_found' using errcode = '23503';
  end if;
  if v_status <> 'running' then
    raise exception 'run_not_running' using errcode = 'P0004';
  end if;
  perform slice_2c_assert_lease(p_run_id, p_lease_token, p_finished_at);
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

  update ingestion_runs ir
  set status = p_outcome,
      finished_at = v_finished_at,
      lease_expires_at = null,
      lease_token = null,
      next_retry_at = v_retry_at,
      error_class = nullif(btrim(p_failure_code), ''),
      error_message = nullif(btrim(p_error_message), ''),
      metadata = coalesce(p_metadata, '{}'::jsonb)
  where ir.id = p_run_id;

  update provider_bindings pb
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

revoke all on function finish_ingestion_run(uuid, text, text, timestamptz, timestamptz, timestamptz, boolean, text, text, jsonb) from public, anon, authenticated;
grant execute on function finish_ingestion_run(uuid, text, text, timestamptz, timestamptz, timestamptz, boolean, text, text, jsonb) to service_role;
