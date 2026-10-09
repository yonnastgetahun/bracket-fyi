-- Bracket.fyi Slice 2C.2 — atomic run ledger and page checkpoint boundary.
-- Forward-only local migration. All writes are owned by SECURITY DEFINER RPCs.

alter table provider_bindings
  add column provider_etag text,
  add column claim_generation bigint not null default 0,
  add column checkpoint_generation bigint not null default 0,
  add constraint provider_bindings_claim_generation_nonnegative check (claim_generation >= 0),
  add constraint provider_bindings_checkpoint_generation_nonnegative check (checkpoint_generation >= 0);

alter table ingestion_runs
  add column claim_request_key text,
  add column claim_generation bigint,
  add column lease_token text,
  add column retry_index integer not null default 0,
  add column retry_of_run_id uuid,
  add column next_retry_at timestamptz,
  add column skipped_count integer not null default 0;

update ingestion_runs
set claim_request_key = 'legacy:' || id::text
where claim_request_key is null;

alter table ingestion_runs
  add constraint ingestion_runs_claim_request_key_not_blank
    check (btrim(claim_request_key) <> ''),
  alter column claim_request_key set not null,
  add constraint ingestion_runs_claim_generation_nonnegative
    check (claim_generation is null or claim_generation >= 0),
  add constraint ingestion_runs_retry_index_valid
    check (retry_index between 0 and 3),
  add constraint ingestion_runs_skipped_count_nonnegative
    check (skipped_count >= 0),
  add constraint ingestion_runs_retry_at_requires_retryable_status
    check (next_retry_at is null or status in ('failed', 'rate_limited')),
  add constraint ingestion_runs_retry_parent_self_check
    check (retry_of_run_id is null or retry_of_run_id <> id),
  add constraint ingestion_runs_retry_parent_fk
    foreign key (retry_of_run_id) references ingestion_runs(id) on delete restrict;

create unique index ingestion_runs_claim_request_key_idx
  on ingestion_runs (claim_request_key);

create unique index ingestion_runs_one_retry_child_idx
  on ingestion_runs (retry_of_run_id)
  where retry_of_run_id is not null;

create index ingestion_runs_retry_due_idx
  on ingestion_runs (next_retry_at, binding_id, retry_index)
  where next_retry_at is not null and status in ('failed', 'rate_limited');

create index ingestion_runs_retry_parent_idx
  on ingestion_runs (binding_id, retry_of_run_id, next_retry_at)
  where retry_of_run_id is not null;

create or replace function slice_2c_backfill_claim_request_key()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.claim_request_key is null then
    new.claim_request_key := 'legacy:' || new.id::text;
  end if;
  return new;
end;
$$;

create trigger ingestion_runs_claim_request_key_backfill_trigger
  before insert on ingestion_runs
  for each row
  execute function slice_2c_backfill_claim_request_key();

create table ingestion_page_ledger (
  id                              uuid primary key default gen_random_uuid(),
  binding_id                      uuid not null references provider_bindings(id) on delete restrict,
  run_id                          uuid not null references ingestion_runs(id) on delete restrict,
  page_key                        text not null,
  expected_checkpoint_generation  bigint not null,
  expected_cursor                 jsonb not null,
  expected_etag                   text,
  next_cursor                     jsonb not null,
  response_etag                   text,
  fetched_delta                   integer not null default 0,
  normalized_delta                integer not null default 0,
  projected_delta                 integer not null default 0,
  unchanged_delta                 integer not null default 0,
  quarantined_delta               integer not null default 0,
  skipped_delta                   integer not null default 0,
  failed_delta                    integer not null default 0,
  disposition_fingerprint         text not null,
  result_checkpoint_generation    bigint not null,
  committed_at                    timestamptz not null default now(),
  unique (binding_id, page_key),
  constraint ingestion_page_ledger_page_key_not_blank check (btrim(page_key) <> ''),
  constraint ingestion_page_ledger_expected_cursor_object check (jsonb_typeof(expected_cursor) = 'object'),
  constraint ingestion_page_ledger_next_cursor_object check (jsonb_typeof(next_cursor) = 'object'),
  constraint ingestion_page_ledger_fingerprint_not_blank check (btrim(disposition_fingerprint) <> ''),
  constraint ingestion_page_ledger_generations_nonnegative check (
    expected_checkpoint_generation >= 0 and result_checkpoint_generation >= 0
  ),
  constraint ingestion_page_ledger_deltas_nonnegative check (
    fetched_delta >= 0 and normalized_delta >= 0 and projected_delta >= 0
    and unchanged_delta >= 0 and quarantined_delta >= 0 and skipped_delta >= 0
    and failed_delta >= 0
  ),
  constraint ingestion_page_ledger_count_conservation check (
    normalized_delta = projected_delta + unchanged_delta + quarantined_delta + skipped_delta + failed_delta
  )
);

create index ingestion_page_ledger_run_idx
  on ingestion_page_ledger (run_id, committed_at);

create trigger ingestion_page_ledger_immutable_trigger
  before update or delete on ingestion_page_ledger
  for each row
  execute function reject_immutable_evidence_change();

alter table ingestion_page_ledger enable row level security;

-- Existing Slice 1B grants were intentionally broad for direct service-role writes.
-- Slice 2C.2 moves all run-ledger mutations behind its RPC boundary.
revoke all privileges on table provider_bindings, ingestion_runs, ingestion_page_ledger
  from service_role, public, anon, authenticated;
grant select on table provider_bindings, ingestion_runs, ingestion_page_ledger to service_role;

create or replace function slice_2c_normalize_automated_claim_key(p_key text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_key text := btrim(coalesce(p_key, ''));
begin
  if v_key = '' then
    raise exception 'claim_request_key must not be blank' using errcode = '22023';
  end if;
  return 'automated:v1:' || v_key;
end;
$$;

create or replace function slice_2c_normalize_manual_claim_key(p_binding_id uuid, p_key text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_key text := btrim(coalesce(p_key, ''));
begin
  if p_binding_id is null or v_key = '' then
    raise exception 'manual claim request key requires binding and nonblank key' using errcode = '22023';
  end if;
  return 'manual:v1:' || p_binding_id::text || ':' || v_key;
end;
$$;

create or replace function slice_2c_lease_seconds(p_lease_seconds integer)
returns integer
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p_lease_seconds is null then
    return 300;
  end if;
  if p_lease_seconds < 60 or p_lease_seconds > 900 then
    raise exception 'lease_seconds must be between 60 and 900' using errcode = '22023';
  end if;
  return p_lease_seconds;
end;
$$;

create or replace function slice_2c_run_row(p_run_id uuid, p_lease_acquired boolean)
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
language sql
security definer
set search_path = public, pg_temp
as $$
  select ir.id,
         ir.binding_id,
         ir.claim_key,
         ir.claim_request_key,
         ir.claim_generation,
         ir.retry_index,
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
  from ingestion_runs ir
  join provider_bindings pb on pb.id = ir.binding_id
  join data_providers dp on dp.id = pb.provider_id
  where ir.id = p_run_id;
$$;

create or replace function slice_2c_assert_lease(
  p_run_id uuid,
  p_lease_token text,
  p_now timestamptz
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from ingestion_runs
    where id = p_run_id
      and status in ('claimed', 'running')
      and lease_token = p_lease_token
      and lease_expires_at > p_now
  ) then
    raise exception 'lease_lost' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function slice_2c_backfill_claim_request_key() from public, anon, authenticated, service_role;
revoke all on function slice_2c_normalize_automated_claim_key(text) from public, anon, authenticated, service_role;
revoke all on function slice_2c_normalize_manual_claim_key(uuid, text) from public, anon, authenticated, service_role;
revoke all on function slice_2c_lease_seconds(integer) from public, anon, authenticated, service_role;
revoke all on function slice_2c_run_row(uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function slice_2c_assert_lease(uuid, text, timestamptz) from public, anon, authenticated, service_role;

create or replace function claim_due_ingestion_run(
  p_claim_request_key text,
  p_now timestamptz,
  p_worker_id text,
  p_lease_seconds integer default 300
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
security definer
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
begin
  if p_now is null or btrim(coalesce(p_worker_id, '')) = '' then
    raise exception 'claim requires now and nonblank worker_id' using errcode = '22023';
  end if;

  -- Request-key replay is resolved before any binding is selected.
  select ir.* into v_existing
  from ingestion_runs ir
  where ir.claim_request_key = v_request_key
  for update;
  if found then
    return query select * from slice_2c_run_row(
      v_existing.id,
      v_existing.status in ('claimed', 'running')
        and v_existing.claimed_by = p_worker_id
        and v_existing.lease_expires_at > p_now
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
      and retry_parent.next_retry_at is not null
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

  update provider_bindings pb
  set claim_generation = pb.claim_generation + 1,
      next_poll_at = null,
      updated_at = p_now
  where pb.id = v_binding.id
  returning pb.claim_generation into v_generation;

  begin
    if v_has_due_retry then
      insert into ingestion_runs (
        binding_id, provider_id, event_edition_id, claim_key, claim_request_key,
        claim_generation, trigger_kind, status, claimed_by, lease_token,
        lease_expires_at, cursor_before, retry_index, retry_of_run_id
      )
      values (
        v_binding.id, v_binding.provider_id, v_binding.event_edition_id,
        'v1:retry:' || v_binding.id::text || ':g' || v_generation::text,
        v_request_key, v_generation, 'retry', 'claimed', p_worker_id,
        gen_random_uuid()::text, p_now + make_interval(secs => v_lease_seconds),
        v_binding.provider_cursor, v_parent.retry_index + 1, v_parent.id
      ) returning * into v_new;
    else
      insert into ingestion_runs (
        binding_id, provider_id, event_edition_id, claim_key, claim_request_key,
        claim_generation, trigger_kind, status, claimed_by, lease_token,
        lease_expires_at, cursor_before, retry_index
      )
      values (
        v_binding.id, v_binding.provider_id, v_binding.event_edition_id,
        'v1:schedule:' || v_binding.id::text || ':g' || v_generation::text,
        v_request_key, v_generation, 'schedule', 'claimed', p_worker_id,
        gen_random_uuid()::text, p_now + make_interval(secs => v_lease_seconds),
        v_binding.provider_cursor, 0
      ) returning * into v_new;
    end if;
  exception when unique_violation then
    select ir.* into v_existing from ingestion_runs ir where ir.claim_request_key = v_request_key;
    if not found and v_has_due_retry then
      select * into v_existing from ingestion_runs where retry_of_run_id = v_parent.id;
    end if;
    if not found then
      raise;
    end if;
    return query select * from slice_2c_run_row(
      v_existing.id,
      v_existing.status in ('claimed', 'running')
        and v_existing.claimed_by = p_worker_id
        and v_existing.lease_expires_at > p_now
    );
    return;
  end;

  return query select * from slice_2c_run_row(v_new.id, true);
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
security definer
set search_path = public, pg_temp
as $$
declare
  v_request_key text := slice_2c_normalize_manual_claim_key(p_binding_id, p_request_key);
  v_existing ingestion_runs%rowtype;
  v_binding provider_bindings%rowtype;
  v_active ingestion_runs%rowtype;
  v_new ingestion_runs%rowtype;
  v_generation bigint;
  v_lease_seconds integer := slice_2c_lease_seconds(p_lease_seconds);
begin
  if p_now is null or btrim(coalesce(p_worker_id, '')) = '' then
    raise exception 'claim requires now and nonblank worker_id' using errcode = '22023';
  end if;

  select ir.* into v_existing from ingestion_runs ir where ir.claim_request_key = v_request_key for update;
  if found then
    return query select * from slice_2c_run_row(
      v_existing.id,
      v_existing.status in ('claimed', 'running')
        and v_existing.claimed_by = p_worker_id
        and v_existing.lease_expires_at > p_now
    );
    return;
  end if;

  select * into v_binding from provider_bindings where id = p_binding_id for update;
  if not found then
    raise exception 'binding_not_found' using errcode = '23503';
  end if;
  if v_binding.mode = 'disabled' then
    raise exception 'disabled_binding' using errcode = '22023';
  end if;

  select ir.* into v_active from ingestion_runs ir
  where ir.binding_id = p_binding_id and ir.status in ('claimed', 'running')
  order by ir.created_at, ir.id
  limit 1
  for update;
  if found then
    return query select * from slice_2c_run_row(
      v_active.id,
      v_active.claimed_by = p_worker_id and v_active.lease_expires_at > p_now
    );
    return;
  end if;

  update provider_bindings pb
  set claim_generation = pb.claim_generation + 1,
      next_poll_at = null,
      updated_at = p_now
  where pb.id = p_binding_id
  returning pb.claim_generation into v_generation;

  begin
    insert into ingestion_runs (
      binding_id, provider_id, event_edition_id, claim_key, claim_request_key,
      claim_generation, trigger_kind, status, claimed_by, lease_token,
      lease_expires_at, cursor_before, retry_index
    )
    values (
      v_binding.id, v_binding.provider_id, v_binding.event_edition_id,
      'v1:manual:' || v_binding.id::text || ':g' || v_generation::text,
      v_request_key, v_generation, 'manual', 'claimed', p_worker_id,
      gen_random_uuid()::text, p_now + make_interval(secs => v_lease_seconds),
      v_binding.provider_cursor, 0
    ) returning * into v_new;
  exception when unique_violation then
    select ir.* into v_existing from ingestion_runs ir where ir.claim_request_key = v_request_key;
    if not found then
      select ir.* into v_existing from ingestion_runs ir
      where ir.binding_id = p_binding_id and ir.status in ('claimed', 'running')
      order by ir.created_at, ir.id limit 1;
    end if;
    if not found then
      raise;
    end if;
    return query select * from slice_2c_run_row(
      v_existing.id,
      v_existing.status in ('claimed', 'running')
        and v_existing.claimed_by = p_worker_id
        and v_existing.lease_expires_at > p_now
    );
    return;
  end;

  return query select * from slice_2c_run_row(v_new.id, true);
end;
$$;

revoke all on function claim_due_ingestion_run(text, timestamptz, text, integer) from public, anon, authenticated;
revoke all on function claim_manual_ingestion_run(uuid, text, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function claim_due_ingestion_run(text, timestamptz, text, integer) to service_role;
grant execute on function claim_manual_ingestion_run(uuid, text, text, timestamptz, integer) to service_role;

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
begin
  perform slice_2c_assert_lease(p_run_id, p_lease_token, p_now);
  return query
  update ingestion_runs ir
  set status = 'running', started_at = p_now
  where ir.id = p_run_id
    and ir.status = 'claimed'
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
  v_lease_seconds integer := slice_2c_lease_seconds(p_lease_seconds);
begin
  perform slice_2c_assert_lease(p_run_id, p_lease_token, p_now);
  return query
  update ingestion_runs
  set lease_expires_at = p_now + make_interval(secs => v_lease_seconds)
  where id = p_run_id
  returning id, ingestion_runs.lease_expires_at;
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
  v_now timestamptz := coalesce(p_observed_at, clock_timestamp());
begin
  perform 1 from ingestion_runs ir where ir.id = p_run_id for update;
  if not found then
    raise exception 'run_not_found' using errcode = '23503';
  end if;
  perform slice_2c_assert_lease(p_run_id, p_lease_token, v_now);
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
  update ingestion_runs
  set http_status = p_http_status,
      rate_limit_limit = p_rate_limit_limit,
      rate_limit_remaining = p_rate_limit_remaining,
      rate_limit_reset_at = p_rate_limit_reset_at,
      retry_after_at = p_retry_after_at
  where id = p_run_id
  returning id, true;
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
  v_run ingestion_runs%rowtype;
  v_binding provider_bindings%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_retry_at timestamptz;
begin
  if p_now is null then
    raise exception 'reclaim requires now' using errcode = '22023';
  end if;
  for v_run in
    select ir.* from ingestion_runs ir
    where ir.status in ('claimed', 'running')
      and ir.lease_expires_at <= p_now
    order by ir.binding_id, ir.id
    for update skip locked
  loop
    select * into v_binding from provider_bindings where id = v_run.binding_id for update;
    v_retry_at := case when v_run.retry_index < 3 then p_retry_at else null end;
    update ingestion_runs
    set status = 'failed',
        finished_at = p_now,
        lease_token = null,
        lease_expires_at = null,
        next_retry_at = v_retry_at,
        error_class = 'system:lease_expired',
        error_message = left(coalesce(v_reason, 'lease expired'), 2048)
    where id = v_run.id;
    update provider_bindings
    set next_poll_at = case when v_retry_at is null then p_now else v_retry_at end,
        last_attempt_at = p_now,
        updated_at = p_now
    where id = v_binding.id;
    run_id := v_run.id;
    binding_id := v_run.binding_id;
    retry_index := v_run.retry_index;
    reclaimed_at := p_now;
    return next;
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
    || length(p_binding_id::text)::text || p_binding_id::text
    || length(p_checkpoint_generation::text)::text || p_checkpoint_generation::text
    || length(slice_2b_canonical_json(p_expected_cursor))::text
    || slice_2b_canonical_json(p_expected_cursor)
    || length(coalesce(p_expected_etag, ''))::text || coalesce(p_expected_etag, ''),
    'sha256'
  ), 'hex');
$$;

create or replace function slice_2c_page_disposition_fingerprint(
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
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select encode(extensions.digest(slice_2b_canonical_json(jsonb_build_object(
    'expectedCheckpointGeneration', p_expected_checkpoint_generation,
    'expectedCursor', p_expected_cursor,
    'expectedEtag', p_expected_etag,
    'nextCursor', p_next_cursor,
    'responseEtag', p_response_etag,
    'fetchedDelta', p_fetched_delta,
    'normalizedDelta', p_normalized_delta,
    'projectedDelta', p_projected_delta,
    'unchangedDelta', p_unchanged_delta,
    'quarantinedDelta', p_quarantined_delta,
    'skippedDelta', p_skipped_delta,
    'failedDelta', p_failed_delta
  )), 'sha256'), 'hex');
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
begin
  -- Resolve and lock the binding before the run so every projection path has a
  -- stable lock order. The lease is checked before any replay lookup.
  select binding_id into v_binding_id from ingestion_runs where id = p_run_id;
  if v_binding_id is null then
    raise exception 'run_not_found' using errcode = '23503';
  end if;
  select * into v_binding from provider_bindings where id = v_binding_id for update;
  perform 1 from ingestion_runs ir where ir.id = p_run_id for update;
  if not found then
    raise exception 'run_not_found' using errcode = '23503';
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

  -- Replay is checked before the current checkpoint CAS. A response lost after
  -- commit therefore remains replayable even after the binding generation moved.
  select * into v_ledger
  from ingestion_page_ledger
  where binding_id = v_binding.id and page_key = p_page_key
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

  update ingestion_runs
  set cursor_after = p_next_cursor,
      fetched_count = fetched_count + p_fetched_delta,
      normalized_count = normalized_count + p_normalized_delta,
      projected_count = projected_count + p_projected_delta,
      unchanged_count = unchanged_count + p_unchanged_delta,
      quarantined_count = quarantined_count + p_quarantined_delta,
      skipped_count = skipped_count + p_skipped_delta,
      failed_count = failed_count + p_failed_delta
  where id = p_run_id;

  update provider_bindings
  set provider_cursor = p_next_cursor,
      provider_etag = p_response_etag,
      checkpoint_generation = v_result_generation,
      updated_at = clock_timestamp()
  where id = v_binding.id;

  return query select 'committed'::text, v_ledger.id,
    p_run_id, v_result_generation, p_next_cursor, p_response_etag;
exception
  when unique_violation then
    raise exception 'page_conflict' using errcode = 'P0003';
end;
$$;

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
  v_started_at timestamptz;
  v_retry_index integer;
  v_retry_at timestamptz := p_next_retry_at;
  v_next_poll_at timestamptz;
  v_health text;
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
  select binding_id into v_binding_id from ingestion_runs where id = p_run_id;
  if v_binding_id is null then
    raise exception 'run_not_found' using errcode = '23503';
  end if;
  select * into v_binding from provider_bindings where id = v_binding_id for update;
  select ir.started_at, ir.retry_index into v_started_at, v_retry_index
  from ingestion_runs ir where ir.id = p_run_id for update;
  if not found then
    raise exception 'run_not_found' using errcode = '23503';
  end if;
  perform slice_2c_assert_lease(p_run_id, p_lease_token, p_finished_at);
  if p_finished_at < v_started_at then
    raise exception 'finish precedes start' using errcode = '22023';
  end if;
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

  update ingestion_runs
  set status = p_outcome,
      finished_at = p_finished_at,
      lease_expires_at = null,
      lease_token = null,
      next_retry_at = v_retry_at,
      error_class = nullif(btrim(p_failure_code), ''),
      error_message = left(nullif(btrim(p_error_message), ''), 2048),
      metadata = coalesce(p_metadata, '{}'::jsonb)
  where id = p_run_id;

  update provider_bindings
  set next_poll_at = v_next_poll_at,
      health_status = v_health,
      consecutive_failures = case when p_outcome in ('succeeded', 'partial') then 0 else consecutive_failures + 1 end,
      last_attempt_at = p_finished_at,
      last_success_at = case when p_outcome in ('succeeded', 'partial') then p_finished_at else last_success_at end,
      last_data_at = case when coalesce(p_data_changed, false) then p_finished_at else last_data_at end,
      updated_at = p_finished_at
  where id = v_binding.id;

  return query select p_run_id, p_outcome, v_health, v_next_poll_at, v_retry_at;
end;
$$;

revoke all on function slice_2c_page_key(uuid, bigint, jsonb, text) from public, anon, authenticated, service_role;
revoke all on function slice_2c_page_disposition_fingerprint(bigint, jsonb, text, jsonb, text, integer, integer, integer, integer, integer, integer, integer) from public, anon, authenticated, service_role;
revoke all on function commit_ingestion_page(uuid, text, text, bigint, jsonb, text, jsonb, text, integer, integer, integer, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function finish_ingestion_run(uuid, text, text, timestamptz, timestamptz, timestamptz, boolean, text, text, jsonb) from public, anon, authenticated;
grant execute on function commit_ingestion_page(uuid, text, text, bigint, jsonb, text, jsonb, text, integer, integer, integer, integer, integer, integer, integer) to service_role;
grant execute on function finish_ingestion_run(uuid, text, text, timestamptz, timestamptz, timestamptz, boolean, text, text, jsonb) to service_role;
