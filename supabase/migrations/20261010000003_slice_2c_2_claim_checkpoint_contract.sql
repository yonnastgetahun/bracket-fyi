-- Bracket.fyi Slice 2C.2-R3 — claim checkpoint contract bridge.
-- Forward-only. Applied migrations 20261010000000 through 20261010000002
-- remain unchanged.

-- PostgreSQL cannot change a function's OUT/RETURNS TABLE type in place.
-- Remove the dependent public wrappers, private claim helpers, and row mapper
-- in dependency order before recreating them with checkpoint_generation.
revoke all on function public.claim_due_ingestion_run(text, timestamptz, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.claim_manual_ingestion_run(uuid, text, text, timestamptz, integer) from public, anon, authenticated, service_role;
revoke all on function public.slice_2c_claim_due_impl(text, timestamptz, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.slice_2c_claim_manual_impl(uuid, text, text, timestamptz, integer) from public, anon, authenticated, service_role;
revoke all on function public.slice_2c_run_row(uuid, boolean) from public, anon, authenticated, service_role;

drop function public.claim_due_ingestion_run(text, timestamptz, text, integer);
drop function public.claim_manual_ingestion_run(uuid, text, text, timestamptz, integer);
drop function public.slice_2c_claim_due_impl(text, timestamptz, text, integer);
drop function public.slice_2c_claim_manual_impl(uuid, text, text, timestamptz, integer);
drop function public.slice_2c_run_row(uuid, boolean);

create function public.slice_2c_claim_manual_impl(
  p_binding_id uuid,
  p_request_key text,
  p_worker_id text,
  p_now timestamptz,
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

revoke all on function public.slice_2c_claim_manual_impl(uuid, text, text, timestamptz, integer) from public, anon, authenticated, service_role;

create function public.claim_due_ingestion_run(
  p_claim_request_key text,
  p_now timestamptz,
  p_worker_id text,
  p_lease_seconds integer default 300
)
returns table (
  run_id uuid, binding_id uuid, claim_key text, claim_request_key text,
  claim_generation bigint, retry_index integer, checkpoint_generation bigint,
  lease_token text, lease_acquired boolean, provider_id uuid, event_edition_id uuid,
  adapter_key text, binding_key text, mode text, credential_ref text,
  adapter_config_version integer, adapter_config jsonb, poll_policy jsonb,
  provider_cursor jsonb, provider_etag text, lease_expires_at timestamptz
)
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  return query select * from public.slice_2c_claim_due_impl(
    p_claim_request_key, p_now, p_worker_id, p_lease_seconds
  );
end;
$$;

create function public.claim_manual_ingestion_run(
  p_binding_id uuid,
  p_request_key text,
  p_worker_id text,
  p_now timestamptz,
  p_lease_seconds integer default 300
)
returns table (
  run_id uuid, binding_id uuid, claim_key text, claim_request_key text,
  claim_generation bigint, retry_index integer, checkpoint_generation bigint,
  lease_token text, lease_acquired boolean, provider_id uuid, event_edition_id uuid,
  adapter_key text, binding_key text, mode text, credential_ref text,
  adapter_config_version integer, adapter_config jsonb, poll_policy jsonb,
  provider_cursor jsonb, provider_etag text, lease_expires_at timestamptz
)
language plpgsql security definer
set search_path = public, pg_temp
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

create function public.slice_2c_run_row(p_run_id uuid, p_lease_acquired boolean)
returns table (
  run_id uuid,
  binding_id uuid,
  claim_key text,
  claim_request_key text,
  claim_generation bigint,
  retry_index integer,
  checkpoint_generation bigint,
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
language sql
set search_path = public, pg_temp
as $$
  select ir.id,
         ir.binding_id,
         ir.claim_key,
         ir.claim_request_key,
         ir.claim_generation,
         ir.retry_index,
         pb.checkpoint_generation,
         case when p_lease_acquired then ir.lease_token else null end,
         p_lease_acquired,
         pb.provider_id,
         pb.event_edition_id,
         dp.adapter_key,
         pb.binding_key,
         pb.mode,
         pb.credential_ref,
         pb.config_version,
         pb.adapter_config,
         pb.poll_policy,
         pb.provider_cursor,
         pb.provider_etag,
         case when p_lease_acquired then ir.lease_expires_at else null end
  from public.ingestion_runs ir
  join public.provider_bindings pb on pb.id = ir.binding_id
  join public.data_providers dp on dp.id = pb.provider_id
  where ir.id = p_run_id;
$$;

revoke all on function public.slice_2c_run_row(uuid, boolean) from public, anon, authenticated, service_role;

create function public.slice_2c_claim_due_impl(
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

revoke all on function public.slice_2c_claim_due_impl(text, timestamptz, text, integer) from public, anon, authenticated, service_role;
