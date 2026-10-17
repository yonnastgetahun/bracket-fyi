#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd -P)"
readonly REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
readonly DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
readonly DB_NAME="postgres"
readonly TMP_DIR="$(mktemp -d /tmp/slice-2c-5b-r4.XXXXXX)"

RESET_ACK=false
RUN_A=""
RUN_B=""
LEASE_A=""
LEASE_B=""
readonly BINDING_A="e4000000-0000-4000-8000-000000000005"
readonly BINDING_B="e4000000-0000-4000-8000-000000000006"
readonly PROVIDER_ID="e4000000-0000-4000-8000-000000000001"

usage() {
  printf '%s\n' 'Usage: scripts/verify-slice-2c-5b-budget-probes.sh --ack-reset-local' >&2
}
fail() {
  printf 'R4_PROBE status=failed reason=%s\n' "$1" >&2
  exit 1
}
cleanup() {
  local exit_code=$?
  local reset_attempt
  set +e
  if [[ "$RESET_ACK" == true ]]; then
    for reset_attempt in 1 2 3; do
      if (cd "$REPO_ROOT" && SUPABASE_TELEMETRY_DISABLED=1 supabase db reset --local) >/dev/null 2>&1; then
        printf '%s\n' 'R4_PROBE cleanup=reset_pass'
        break
      fi
      if [[ "$reset_attempt" -eq 3 ]]; then
        printf '%s\n' 'R4_PROBE cleanup=reset_failed' >&2
        exit_code=1
      else
        sleep 2
      fi
    done
  fi
  rm -rf -- "$TMP_DIR"
  if [[ "$exit_code" -ne 0 ]]; then
    printf '%s\n' 'R4_PROBE status=failed' >&2
  fi
  exit "$exit_code"
}
trap cleanup EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ack-reset-local) RESET_ACK=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage; fail unknown_argument ;;
  esac
done
[[ "$RESET_ACK" == true ]] || { usage; fail reset_ack_required; }
cd "$REPO_ROOT"

psql_local() {
  psql -X -q -v ON_ERROR_STOP=1 "$DB_URL" "$@"
}
psql_local_quiet() {
  psql -X -q -v ON_ERROR_STOP=1 -At "$DB_URL" "$@"
}
reset_local() {
  local reset_attempt
  for reset_attempt in 1 2 3; do
    if SUPABASE_TELEMETRY_DISABLED=1 supabase db reset --local >/dev/null; then
      return 0
    fi
    if [[ "$reset_attempt" -lt 3 ]]; then
      sleep 2
    fi
  done
  return 1
}
assert_equals() {
  local label="$1" expected="$2" actual="$3"
  [[ "$actual" == "$expected" ]] || fail "$label:expected=$expected:actual=$actual"
}
assert_contains() {
  local label="$1" needle="$2" actual="$3"
  [[ "$actual" == *"$needle"* ]] || fail "$label:missing=$needle"
}

reset_local
[[ "$DB_URL" == "postgresql://postgres:postgres@127.0.0.1:54322/postgres" ]] || fail non_local_database_target
endpoint="$(psql_local_quiet -c "select current_database();")"
assert_equals local_database postgres "$endpoint"

psql_local <<'SQL'
begin;
insert into data_providers (id, adapter_key, display_name)
values ('e4000000-0000-4000-8000-000000000001', 'slice-2c-r4-probe', 'Slice 2C R4 Probe Provider');
insert into organizations (id, organization_key, name, kind)
values ('e4000000-0000-4000-8000-000000000002', 'slice-2c-r4-org', 'Slice 2C R4 Probe Org', 'league');
insert into competitions (id, organization_id, competition_key, name, domain)
values ('e4000000-0000-4000-8000-000000000003', 'e4000000-0000-4000-8000-000000000002', 'slice-2c-r4-cup', 'Slice 2C R4 Cup', 'sport');
insert into event_editions (id, competition_id, edition_key, name, season_label)
values ('e4000000-0000-4000-8000-000000000004', 'e4000000-0000-4000-8000-000000000003', '2026', 'Slice 2C R4 Edition', '2026');
insert into provider_bindings (id, provider_id, event_edition_id, binding_key, role, mode, health_status, next_poll_at, provider_cursor)
values
  ('e4000000-0000-4000-8000-000000000005', 'e4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000004', 'r4-primary', 'primary', 'write', 'healthy', clock_timestamp(), '{}'::jsonb),
  ('e4000000-0000-4000-8000-000000000006', 'e4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000004', 'r4-fallback', 'fallback', 'write', 'healthy', clock_timestamp(), '{}'::jsonb);
insert into provider_rate_budgets (provider_id, scope_key, configured_limit_count, configured_window_seconds, available_count, trusted_reset_at)
values ('e4000000-0000-4000-8000-000000000001', 'provider', 10, 60, 10, clock_timestamp() + interval '60 seconds');
commit;
SQL

claim_a="$(psql_local_quiet -c "select run_id::text || '|' || lease_token from public.claim_manual_ingestion_run('$BINDING_A', 'r4-primary-request', 'r4-worker-a', clock_timestamp(), 900);")"
IFS='|' read -r RUN_A LEASE_A <<<"$claim_a"
[[ -n "$RUN_A" && -n "$LEASE_A" ]] || fail primary_claim_missing
psql_local_quiet -c "select * from public.start_ingestion_run('$RUN_A', '$LEASE_A', clock_timestamp());" >/dev/null

claim_b="$(psql_local_quiet -c "select run_id::text || '|' || lease_token from public.claim_manual_ingestion_run('$BINDING_B', 'r4-fallback-request', 'r4-worker-b', clock_timestamp(), 900);")"
IFS='|' read -r RUN_B LEASE_B <<<"$claim_b"
[[ -n "$RUN_B" && -n "$LEASE_B" ]] || fail fallback_claim_missing
psql_local_quiet -c "select * from public.start_ingestion_run('$RUN_B', '$LEASE_B', clock_timestamp());" >/dev/null

page_key_a="$(psql_local_quiet -c "select public.slice_2c_page_key('$BINDING_A', 0, '{}'::jsonb, null);")"
page_key_b="$(psql_local_quiet -c "select public.slice_2c_page_key('$BINDING_B', 0, '{}'::jsonb, null);")"
attempt_a="v1:request:$RUN_A:0:$page_key_a"
attempt_b="v1:request:$RUN_B:0:$page_key_b"

run_pair() {
  local command_a="$1" command_b="$2"
  local output_a="$TMP_DIR/pair-a" output_b="$TMP_DIR/pair-b"
  local status_a=0 status_b=0
  psql_local_quiet -c "$command_a" >"$output_a" 2>&1 & local pid_a=$!
  psql_local_quiet -c "$command_b" >"$output_b" 2>&1 & local pid_b=$!
  wait "$pid_a" || status_a=$?
  wait "$pid_b" || status_b=$?
  [[ "$status_a" -eq 0 && "$status_b" -eq 0 ]] || fail "concurrent_psql_failure:a=$status_a:b=$status_b"
  PAIR_A="$(tr -d '\r\n' <"$output_a")"
  PAIR_B="$(tr -d '\r\n' <"$output_b")"
}

psql_local <<'SQL'
create or replace function public.slice_2c_r4_pause_reservation()
returns trigger language plpgsql as $$
begin
  perform pg_sleep(2);
  return new;
end;
$$;
create trigger slice_2c_r4_pause_reservation_trigger
after insert on public.provider_rate_budget_reservations
for each row execute function public.slice_2c_r4_pause_reservation();
SQL
run_pair \
  "select outcome || '|' || remaining_count from public.reserve_provider_budget('$RUN_A', '$LEASE_A', '$attempt_a', 1);" \
  "select outcome || '|' || remaining_count from public.reserve_provider_budget('$RUN_A', '$LEASE_A', '$attempt_a', 1);"
if [[ ! (("$PAIR_A" == reserved\|* && "$PAIR_B" == replayed\|*) || ("$PAIR_A" == replayed\|* && "$PAIR_B" == reserved\|*)) ]]; then
  fail "same_key_reservation:a=$PAIR_A:b=$PAIR_B"
fi
reservation_count="$(psql_local_quiet -c "select count(*) from public.provider_rate_budget_reservations where attempt_key='$attempt_a';")"
assert_equals same_key_reservation_count 1 "$reservation_count"
printf 'R4_PROBE same_key=pass a=%s b=%s reservations=%s\n' "$PAIR_A" "$PAIR_B" "$reservation_count"

psql_local <<'SQL'
drop trigger slice_2c_r4_pause_reservation_trigger on public.provider_rate_budget_reservations;
drop function public.slice_2c_r4_pause_reservation();
SQL
psql_local -c "update public.ingestion_runs set retry_index=1, lease_expires_at=clock_timestamp()+interval '15 minutes' where id in ('$RUN_A', '$RUN_B'); update public.provider_rate_budgets set available_count=0, trusted_reset_at=clock_timestamp()-interval '1 second' where provider_id='$PROVIDER_ID' and scope_key='provider';" >/dev/null
page_key_a="$(psql_local_quiet -c "select public.slice_2c_page_key('$BINDING_A', 0, '{}'::jsonb, null);")"
page_key_b="$(psql_local_quiet -c "select public.slice_2c_page_key('$BINDING_B', 0, '{}'::jsonb, null);")"
attempt_a_retry="v1:request:$RUN_A:1:$page_key_a"
attempt_b_retry="v1:request:$RUN_B:1:$page_key_b"

psql_local <<'SQL'
create or replace function public.slice_2c_r4_pause_reservation()
returns trigger language plpgsql as $$
begin
  perform pg_sleep(2);
  return new;
end;
$$;
create trigger slice_2c_r4_pause_reservation_trigger
after insert on public.provider_rate_budget_reservations
for each row execute function public.slice_2c_r4_pause_reservation();
SQL
run_pair \
  "select outcome || '|' || remaining_count from public.reserve_provider_budget('$RUN_A', '$LEASE_A', '$attempt_a_retry', 1);" \
  "select outcome || '|' || remaining_count from public.reserve_provider_budget('$RUN_B', '$LEASE_B', '$attempt_b_retry', 1);"
[[ "$PAIR_A" == reserved\|* && "$PAIR_B" == reserved\|* ]] || fail "expired_window_reset:a=$PAIR_A:b=$PAIR_B"
reset_available="$(psql_local_quiet -c "select available_count from public.provider_rate_budgets where provider_id='$PROVIDER_ID' and scope_key='provider';")"
reset_future="$(psql_local_quiet -c "select (trusted_reset_at > clock_timestamp())::text from public.provider_rate_budgets where provider_id='$PROVIDER_ID' and scope_key='provider';")"
assert_equals expired_window_final_available 8 "$reset_available"
assert_equals expired_window_reset_future true "$reset_future"
printf 'R4_PROBE expired_window_reset=pass a=%s b=%s available=%s reset_future=%s\n' "$PAIR_A" "$PAIR_B" "$reset_available" "$reset_future"

psql_local <<'SQL'
drop trigger slice_2c_r4_pause_reservation_trigger on public.provider_rate_budget_reservations;
drop function public.slice_2c_r4_pause_reservation();
SQL
psql_local -c "update public.ingestion_runs set lease_expires_at=clock_timestamp()+interval '15 minutes' where id in ('$RUN_A', '$RUN_B'); update public.provider_rate_budgets set available_count=10, trusted_reset_at=clock_timestamp()+interval '60 seconds', observed_at=timestamp '2000-01-01', observed_accepted_at=timestamp '2000-01-01', observed_remaining_count=10, observed_reset_at=clock_timestamp()+interval '60 seconds' where provider_id='$PROVIDER_ID' and scope_key='provider';" >/dev/null

psql_local <<'SQL'
create or replace function public.slice_2c_r4_pause_budget_update()
returns trigger language plpgsql as $$
begin
  perform pg_sleep(2);
  return new;
end;
$$;
create trigger slice_2c_r4_pause_budget_update_trigger
before update on public.provider_rate_budgets
for each row execute function public.slice_2c_r4_pause_budget_update();
SQL
run_pair \
  "select recorded from public.record_ingestion_response('$RUN_A', '$LEASE_A', 200, 10, 2, clock_timestamp()+interval '60 seconds', null, clock_timestamp());" \
  "select recorded from public.record_ingestion_response('$RUN_B', '$LEASE_B', 200, 10, 7, clock_timestamp()+interval '60 seconds', null, clock_timestamp());"
assert_equals headers_binding_a t "$PAIR_A"
assert_equals headers_binding_b t "$PAIR_B"
header_state="$(psql_local_quiet -c "select available_count || '|' || observed_remaining_count from public.provider_rate_budgets where provider_id='$PROVIDER_ID' and scope_key='provider';")"
header_available="$(printf '%s' "$header_state" | sed 's/|.*//')"
(( header_available <= 10 )) || fail "headers_increased:state=$header_state"
assert_equals headers_conservative_available 2 "$header_available"
printf 'R4_PROBE concurrent_headers=pass a=%s b=%s state=%s\n' "$PAIR_A" "$PAIR_B" "$header_state"

psql_local <<'SQL'
drop trigger slice_2c_r4_pause_budget_update_trigger on public.provider_rate_budgets;
drop function public.slice_2c_r4_pause_budget_update();
SQL
psql_local -c "update public.ingestion_runs set retry_index=2, lease_expires_at=clock_timestamp()+interval '15 minutes' where id='$RUN_B';" >/dev/null
page_key_b="$(psql_local_quiet -c "select public.slice_2c_page_key('$BINDING_B', 0, '{}'::jsonb, null);")"
attempt_b_expiry="v1:request:$RUN_B:2:$page_key_b"
lock_holder() {
  psql_local -c "begin; update public.provider_rate_budgets set updated_at=updated_at where provider_id='$PROVIDER_ID' and scope_key='provider'; select pg_sleep(4); rollback;"
}
lock_holder >"$TMP_DIR/lock-holder" 2>&1 &
lock_pid=$!
sleep 0.5
psql_local -c "update public.ingestion_runs set lease_expires_at=clock_timestamp()+interval '1 second' where id='$RUN_B';" >/dev/null
lease_output="$TMP_DIR/lease-expiry"
set +e
psql_local_quiet -c "select outcome from public.reserve_provider_budget('$RUN_B', '$LEASE_B', '$attempt_b_expiry', 1);" >"$lease_output" 2>&1
lease_status=$?
set -e
wait "$lock_pid"
lease_text="$(tr '\n' ' ' <"$lease_output")"
[[ "$lease_status" -ne 0 ]] || fail lease_expiry_call_succeeded
assert_contains lease_expiry lease_lost "$lease_text"
printf 'R4_PROBE lease_expiry_while_blocked=pass error=%s\n' "$lease_text"

psql_local -c "update public.ingestion_runs set lease_expires_at=clock_timestamp()+interval '15 minutes' where id='$RUN_A';" >/dev/null
helper_output="$TMP_DIR/helper"
if ! psql -X -q -v ON_ERROR_STOP=1 -v run_a="$RUN_A" -v provider_id="$PROVIDER_ID" "$DB_URL" >"$helper_output" 2>&1 <<'SQL'
begin;
create or replace function public.slice_2c_r4_fail_budget_helper()
returns trigger language plpgsql as $$
begin
  raise exception 'forced_header_helper_failure' using errcode = 'P0001';
end;
$$;
create trigger slice_2c_r4_fail_budget_helper_trigger
before update on public.provider_rate_budgets
for each row execute function public.slice_2c_r4_fail_budget_helper();
create temp table slice_2c_r4_context on commit drop as
select r.id as run_id, r.lease_token, b.provider_id
from public.ingestion_runs r
join public.provider_bindings b on b.id = r.binding_id
where r.id = :'run_a'::uuid;
do $$
declare
  before_run jsonb;
  before_budget jsonb;
  after_run jsonb;
  after_budget jsonb;
begin
  select jsonb_build_object('http_status', http_status, 'rate_limit_limit', rate_limit_limit,
    'rate_limit_remaining', rate_limit_remaining, 'rate_limit_reset_at', rate_limit_reset_at,
    'retry_after_at', retry_after_at, 'metadata', metadata)
  into before_run from public.ingestion_runs where id=(select run_id from slice_2c_r4_context);
  select jsonb_build_object('available_count', available_count, 'trusted_reset_at', trusted_reset_at,
    'observed_limit_count', observed_limit_count, 'observed_remaining_count', observed_remaining_count,
    'observed_reset_at', observed_reset_at, 'observed_at', observed_at,
    'observed_accepted_at', observed_accepted_at, 'updated_at', updated_at)
  into before_budget from public.provider_rate_budgets
  where provider_id=(select provider_id from slice_2c_r4_context) and scope_key='provider';
  begin
    perform recorded from public.record_ingestion_response(
      (select run_id from slice_2c_r4_context), (select lease_token from slice_2c_r4_context),
      201, 10, 1, clock_timestamp()+interval '60 seconds', null, clock_timestamp()
    );
    raise exception 'expected_header_helper_failure_not_raised';
  exception when others then
    if sqlerrm not like '%forced_header_helper_failure%' then raise; end if;
  end;
  select jsonb_build_object('http_status', http_status, 'rate_limit_limit', rate_limit_limit,
    'rate_limit_remaining', rate_limit_remaining, 'rate_limit_reset_at', rate_limit_reset_at,
    'retry_after_at', retry_after_at, 'metadata', metadata)
  into after_run from public.ingestion_runs where id=(select run_id from slice_2c_r4_context);
  select jsonb_build_object('available_count', available_count, 'trusted_reset_at', trusted_reset_at,
    'observed_limit_count', observed_limit_count, 'observed_reset_at', observed_reset_at,
    'observed_remaining_count', observed_remaining_count, 'observed_at', observed_at,
    'observed_accepted_at', observed_accepted_at, 'updated_at', updated_at)
  into after_budget from public.provider_rate_budgets
  where provider_id=(select provider_id from slice_2c_r4_context) and scope_key='provider';
  if before_run is distinct from after_run or before_budget is distinct from after_budget then
    raise exception 'helper_rollback_mismatch';
  end if;
end;
$$;
drop trigger slice_2c_r4_fail_budget_helper_trigger on provider_rate_budgets;
drop function public.slice_2c_r4_fail_budget_helper();
commit;
select 'R4_PROBE helper_rollback=pass';
SQL
then
  helper_error="$(tr '\n' ' ' <"$helper_output")"
  fail "helper_rollback_probe:$helper_error"
fi
cat "$helper_output"
printf 'R4_PROBE status=pass\n'
