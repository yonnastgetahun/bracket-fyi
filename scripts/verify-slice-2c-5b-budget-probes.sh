#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd -P)"
readonly REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
readonly DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
readonly DB_NAME="postgres"
readonly RESET_TIMEOUT_SECONDS=90
readonly PSQL_TIMEOUT_SECONDS=15
readonly WORKER_TIMEOUT_SECONDS=20
readonly POLL_TIMEOUT_SECONDS=15
readonly TERMINATE_GRACE_SECONDS=2
readonly LOCK_KEY=900000000000000501

RESET_ACK=false
SELF_TEST=false
RESET_ARMED=false
TMP_DIR=""
RUN_A=""
RUN_B=""
LEASE_A=""
LEASE_B=""
PAIR_A=""
PAIR_B=""
WORKER_PID=""
declare -a BG_PIDS=()
readonly BINDING_A="e4000000-0000-4000-8000-000000000005"
readonly BINDING_B="e4000000-0000-4000-8000-000000000006"
readonly PROVIDER_ID="e4000000-0000-4000-8000-000000000001"

usage() {
  cat >&2 <<'USAGE'
Usage:
  scripts/verify-slice-2c-5b-budget-probes.sh --ack-reset-local
  scripts/verify-slice-2c-5b-budget-probes.sh --self-test

--ack-reset-local  acknowledge that the disposable local Supabase database will be reset
--self-test        run reset-free assertion and timeout mechanism checks
USAGE
}
fail() {
  printf 'R5_PROBE status=failed reason=%s\n' "$1" >&2
  exit 1
}

command_required() {
  command -v "$1" >/dev/null 2>&1 || fail "missing_command:$1"
}

track_pid() {
  BG_PIDS+=("$1")
}

untrack_pid() {
  local pid="$1"
  local remaining=()
  local item
  for item in "${BG_PIDS[@]}"; do
    [[ "$item" == "$pid" ]] || remaining+=("$item")
  done
  if ((${#remaining[@]} > 0)); then
    BG_PIDS=("${remaining[@]}")
  else
    BG_PIDS=()
  fi
}

terminate_pid() {
  local pid="$1"
  local started now
  if ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi
  kill -TERM "$pid" 2>/dev/null || true
  started="$(date +%s)"
  while kill -0 "$pid" 2>/dev/null; do
    now="$(date +%s)"
    if (( now - started >= TERMINATE_GRACE_SECONDS )); then
      kill -KILL "$pid" 2>/dev/null || true
      break
    fi
    sleep 0.1
  done
}

wait_for_pid() {
  local pid="$1"
  local timeout_seconds="$2"
  local started now rc
  started="$(date +%s)"
  while kill -0 "$pid" 2>/dev/null; do
    now="$(date +%s)"
    if (( now - started >= timeout_seconds )); then
      terminate_pid "$pid"
      wait "$pid" 2>/dev/null || true
      untrack_pid "$pid"
      return 124
    fi
    sleep 0.1
  done
  rc=0
  if wait "$pid"; then
    rc=0
  else
    rc=$?
  fi
  untrack_pid "$pid"
  return "$rc"
}

run_with_timeout() {
  local timeout_seconds="$1"
  shift
  local pid rc stdin_file=""
  if [[ -n "$TMP_DIR" && ! -t 0 ]]; then
    stdin_file="$(mktemp "$TMP_DIR/stdin.XXXXXX")"
    cat >"$stdin_file"
    "$@" <"$stdin_file" &
  else
    "$@" &
  fi
  pid=$!
  track_pid "$pid"
  rc=0
  if wait_for_pid "$pid" "$timeout_seconds"; then
    rc=0
  else
    rc=$?
  fi
  return "$rc"
}

safe_trash_temp() {
  if [[ -z "$TMP_DIR" ]]; then
    printf '%s\n' 'R5_PROBE cleanup_temp=not_needed'
    return 0
  fi
  [[ "$TMP_DIR" == /tmp/slice-2c-5b-r5.* ]] || return 1
  [[ "$TMP_DIR" != /tmp && "$TMP_DIR" != / ]] || return 1
  if [[ -e "$TMP_DIR" ]]; then
    local inspected_entry inspected_count=0
    while IFS= read -r inspected_entry; do
      [[ -n "$inspected_entry" ]] || continue
      inspected_count=$((inspected_count + 1))
    done < <(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -print)
    printf 'R5_PROBE cleanup_inspect=pass entries=%s\n' "$inspected_count"
    trash "$TMP_DIR" || return 1
  fi
  [[ ! -e "$TMP_DIR" ]] || return 1
  printf '%s\n' 'R5_PROBE cleanup_temp=pass'
}

verify_cleanup_objects() {
  local cleanup_state
  cleanup_state="$(psql_local_quiet -c "
select
  (select count(*) from public.data_providers where id = 'e4000000-0000-4000-8000-000000000001') || '|' ||
  (select count(*) from public.organizations where id = 'e4000000-0000-4000-8000-000000000002') || '|' ||
  (select count(*) from public.competitions where id = 'e4000000-0000-4000-8000-000000000003') || '|' ||
  (select count(*) from public.event_editions where id = 'e4000000-0000-4000-8000-000000000004') || '|' ||
  (select count(*) from public.provider_bindings where id in ('e4000000-0000-4000-8000-000000000005', 'e4000000-0000-4000-8000-000000000006')) || '|' ||
  (select count(*) from public.ingestion_runs where binding_id in ('e4000000-0000-4000-8000-000000000005', 'e4000000-0000-4000-8000-000000000006')) || '|' ||
  (select count(*) from public.provider_rate_budgets where provider_id = 'e4000000-0000-4000-8000-000000000001' and scope_key = 'provider') || '|' ||
  (select count(*) from public.provider_rate_budget_reservations where provider_id = 'e4000000-0000-4000-8000-000000000001' and scope_key = 'provider') || '|' ||
  (select count(*) from pg_proc where proname like 'slice_2c_r4_%') || '|' ||
  (select count(*) from pg_trigger where tgname like 'slice_2c_r4_%' and not tgisinternal);
")"
  [[ "$cleanup_state" == "0|0|0|0|0|0|0|0|0|0" ]] || return 1
  printf '%s\n' 'R5_PROBE cleanup_objects=pass providers=0 organizations=0 competitions=0 editions=0 bindings=0 runs=0 budgets=0 reservations=0 functions=0 triggers=0'
}

cleanup() {
  local exit_code=$?
  local pid reset_ok objects_ok temp_ok
  trap - EXIT INT TERM
  set +e
  if ((${#BG_PIDS[@]} > 0)); then
    for pid in "${BG_PIDS[@]}"; do
      terminate_pid "$pid"
    done
    for pid in "${BG_PIDS[@]}"; do
      wait "$pid" 2>/dev/null || true
    done
  fi
  BG_PIDS=()

  if [[ "$SELF_TEST" == true ]]; then
    exit "$exit_code"
  fi

  reset_ok=0
  if [[ "$RESET_ARMED" == true ]]; then
    if reset_local; then
      printf '%s\n' 'R5_PROBE cleanup_reset=pass'
      reset_ok=1
    else
      printf '%s\n' 'R5_PROBE cleanup_reset=failed' >&2
      exit_code=1
    fi
    if [[ "$reset_ok" -eq 1 ]] && verify_cleanup_objects; then
      objects_ok=1
    else
      objects_ok=0
      if [[ "$reset_ok" -eq 1 ]]; then
        printf '%s\n' 'R5_PROBE cleanup_objects=failed' >&2
      else
        printf '%s\n' 'R5_PROBE cleanup_objects=skipped'
      fi
      exit_code=1
    fi
  else
    printf '%s\n' 'R5_PROBE cleanup_reset=not_armed'
    objects_ok=1
  fi

  temp_ok=0
  if safe_trash_temp; then
    temp_ok=1
  else
    printf '%s\n' 'R5_PROBE cleanup_temp=failed' >&2
    exit_code=1
  fi
  if [[ "$exit_code" -eq 0 && "$objects_ok" -eq 1 && "$temp_ok" -eq 1 ]]; then
    printf '%s\n' 'R5_PROBE cleanup=pass'
  else
    printf '%s\n' 'R5_PROBE cleanup=failed' >&2
    exit_code=1
  fi
  if [[ "$exit_code" -ne 0 ]]; then
    printf '%s\n' 'R5_PROBE status=failed' >&2
  fi
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ack-reset-local) RESET_ACK=true; shift ;;
    --self-test) SELF_TEST=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage; fail unknown_argument ;;
  esac
done

if [[ "$SELF_TEST" == true && "$RESET_ACK" == true ]]; then
  fail self_test_ack_conflict
fi

self_test_assertion() {
  [[ "$1" == "$2" ]]
}

conservative_header_assertion() {
  [[ "$1" == "2" ]]
}

run_self_test() {
  if self_test_assertion expected deliberately_wrong; then
    fail self_test_wrong_assertion_accepted
  fi
  if conservative_header_assertion 7; then
    fail self_test_conservative_wrong_state_accepted
  fi
  if run_with_timeout 1 sleep 2; then
    fail self_test_timeout_not_triggered
  else
    local timeout_result=$?
    [[ "$timeout_result" -eq 124 ]] || fail "self_test_timeout_status:$timeout_result"
  fi
  printf '%s\n' 'R5_SELF_TEST wrong_assertion=pass timeout=pass status=pass'
}

if [[ "$SELF_TEST" == true ]]; then
  command_required date
  command_required kill
  command_required sleep
  run_self_test
  exit 0
fi

if [[ "$RESET_ACK" != true ]]; then
  printf '%s\n' 'R5_PROBE reset=not_started reason=ack_required' >&2
  usage
  fail reset_ack_required
fi

command_required bash
command_required cat
command_required date
command_required env
command_required awk
command_required find
command_required git
command_required head
command_required kill
command_required mktemp
command_required psql
command_required sed
command_required supabase
command_required tail
command_required trash
command_required tr
command_required sleep
[[ -f "$REPO_ROOT/supabase/config.toml" ]] || fail missing_supabase_config
[[ -d "$REPO_ROOT/supabase/migrations" ]] || fail missing_supabase_migrations
[[ "$DB_URL" == "postgresql://postgres:postgres@127.0.0.1:54322/postgres" ]] || fail non_local_database_target
resolved_root="$(git -C "$REPO_ROOT" rev-parse --show-toplevel 2>/dev/null || true)"
[[ "$resolved_root" == "$REPO_ROOT" ]] || fail unexpected_repository_root
config_project_id="$(sed -nE 's/^[[:space:]]*project_id[[:space:]]*=[[:space:]]*"([^"]+)"[[:space:]]*$/\1/p' "$REPO_ROOT/supabase/config.toml" | head -n 1)"
[[ "$config_project_id" == "bracket-fyi" ]] || fail "invalid_supabase_project_id:$config_project_id"
config_db_port="$(awk '
  BEGIN { in_db = 0 }
  /^[[:space:]]*\[db\][[:space:]]*$/ { in_db = 1; next }
  /^[[:space:]]*\[/ { in_db = 0 }
  in_db && /^[[:space:]]*port[[:space:]]*=/ {
    value = $0
    sub(/^[^=]*=[[:space:]]*/, "", value)
    sub(/[[:space:]]*(#.*)?$/, "", value)
    print value
    exit
  }
' "$REPO_ROOT/supabase/config.toml")"
[[ "$config_db_port" == "54322" ]] || fail "invalid_supabase_db_port:$config_db_port"
[[ -z "${SUPABASE_DB_URL:-}" ]] || fail configurable_database_target
[[ -z "${DATABASE_URL:-}" ]] || fail configurable_database_target

TMP_DIR="$(mktemp -d /tmp/slice-2c-5b-r5.XXXXXX)" || fail temp_create_failed
RESET_ARMED=true
cd "$REPO_ROOT"

psql_local() {
  run_with_timeout "$PSQL_TIMEOUT_SECONDS" psql -X -q -v ON_ERROR_STOP=1 "$DB_URL" "$@"
}
psql_local_quiet() {
  run_with_timeout "$PSQL_TIMEOUT_SECONDS" psql -X -q -v ON_ERROR_STOP=1 -At "$DB_URL" "$@"
}
reset_local() {
  local reset_log="$TMP_DIR/reset.log"
  if run_with_timeout "$RESET_TIMEOUT_SECONDS" env SUPABASE_TELEMETRY_DISABLED=1 supabase db reset --local >"$reset_log" 2>&1; then
    return 0
  fi
  tail -n 12 "$reset_log" >&2 || true
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

poll_until() {
  local label="$1"
  local query="$2"
  local worker_pid="${3:-}"
  local started now result
  started="$(date +%s)"
  while true; do
    if [[ -n "$worker_pid" ]] && ! kill -0 "$worker_pid" 2>/dev/null; then
      fail "${label}_worker_exited"
    fi
    if result="$(psql_local_quiet -c "$query")" && [[ "$result" == "t" ]]; then
      printf 'R5_PROBE readiness=%s\n' "$label"
      return 0
    fi
    now="$(date +%s)"
    (( now - started < POLL_TIMEOUT_SECONDS )) || fail "${label}_timeout"
    sleep 0.1
  done
}

start_worker() {
  local app_name="$1"
  local command_text="$2"
  local output_file="$3"
  PGAPPNAME="$app_name" psql_local_quiet -c "$command_text" >"$output_file" 2>&1 &
  WORKER_PID=$!
  track_pid "$WORKER_PID"
}

run_pair() {
  local command_a="$1"
  local command_b="$2"
  local output_a="$TMP_DIR/pair-a" output_b="$TMP_DIR/pair-b"
  local status_a=0 status_b=0
  start_worker slice-2c-r5-pair-a "$command_a" "$output_a"
  local pid_a="$WORKER_PID"
  start_worker slice-2c-r5-pair-b "$command_b" "$output_b"
  local pid_b="$WORKER_PID"
  if wait_for_pid "$pid_a" "$WORKER_TIMEOUT_SECONDS"; then
    status_a=0
  else
    status_a=$?
  fi
  if [[ "$status_a" -ne 0 ]]; then
    terminate_pid "$pid_b"
  fi
  if wait_for_pid "$pid_b" "$WORKER_TIMEOUT_SECONDS"; then
    status_b=0
  else
    status_b=$?
  fi
  [[ "$status_a" -eq 0 && "$status_b" -eq 0 ]] || fail "concurrent_psql_failure:a=$status_a:b=$status_b"
  PAIR_A="$(tr -d '\r\n' <"$output_a")"
  PAIR_B="$(tr -d '\r\n' <"$output_b")"
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
printf 'R5_PROBE same_key=pass a=%s b=%s reservations=%s\n' "$PAIR_A" "$PAIR_B" "$reservation_count"

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
printf 'R5_PROBE expired_window_reset=pass a=%s b=%s available=%s reset_future=%s\n' "$PAIR_A" "$PAIR_B" "$reset_available" "$reset_future"

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
assert_equals concurrent_header_available 2 "$header_available"
printf 'R5_PROBE concurrent_headers=pass a=%s b=%s state=%s\n' "$PAIR_A" "$PAIR_B" "$header_state"

psql_local <<'SQL'
drop trigger slice_2c_r4_pause_budget_update_trigger on public.provider_rate_budgets;
drop function public.slice_2c_r4_pause_budget_update();
SQL
psql_local -c "update public.ingestion_runs set retry_index=2, lease_expires_at=clock_timestamp()+interval '15 minutes' where id='$RUN_B';" >/dev/null
page_key_b="$(psql_local_quiet -c "select public.slice_2c_page_key('$BINDING_B', 0, '{}'::jsonb, null);")"
attempt_b_expiry="v1:request:$RUN_B:2:$page_key_b"
lock_holder_sql="begin; update public.provider_rate_budgets set updated_at=updated_at where provider_id='$PROVIDER_ID' and scope_key='provider'; select pg_advisory_xact_lock($LOCK_KEY); select pg_sleep(4); rollback;"
start_worker slice-2c-r5-budget-holder "$lock_holder_sql" "$TMP_DIR/lock-holder"
lock_pid="$WORKER_PID"
poll_until budget_lock_held "select case when pg_try_advisory_lock($LOCK_KEY) then (pg_advisory_unlock($LOCK_KEY) and false) else true end;"
psql_local -c "update public.ingestion_runs set lease_expires_at=clock_timestamp()+interval '2 seconds' where id='$RUN_B';" >/dev/null
reservation_sql="select outcome from public.reserve_provider_budget('$RUN_B', '$LEASE_B', '$attempt_b_expiry', 1);"
start_worker slice-2c-r5-reservation-waiter "$reservation_sql" "$TMP_DIR/lease-expiry"
reservation_pid="$WORKER_PID"
poll_until reservation_waiting "select exists (select 1 from pg_stat_activity where application_name = 'slice-2c-r5-reservation-waiter' and state = 'active' and wait_event_type = 'Lock' and query like '%reserve_provider_budget%');" "$reservation_pid"
if wait_for_pid "$lock_pid" "$WORKER_TIMEOUT_SECONDS"; then
  lock_status=0
else
  lock_status=$?
fi
if wait_for_pid "$reservation_pid" "$WORKER_TIMEOUT_SECONDS"; then
  reservation_status=0
else
  reservation_status=$?
fi
[[ "$lock_status" -eq 0 ]] || fail "budget_lock_holder_status:$lock_status"
lease_text="$(tr '\n' ' ' <"$TMP_DIR/lease-expiry")"
[[ "$reservation_status" -ne 0 ]] || fail "lease_expiry_call_succeeded:$lease_text"
assert_contains lease_expiry lease_lost "$lease_text"
printf 'R5_PROBE lease_expiry_while_blocked=pass error=%s\n' "$lease_text"

psql_local -c "update public.ingestion_runs set lease_expires_at=clock_timestamp()+interval '15 minutes' where id='$RUN_A';" >/dev/null
helper_output="$TMP_DIR/helper"
if ! psql_local -v run_a="$RUN_A" -v provider_id="$PROVIDER_ID" >"$helper_output" 2>&1 <<'SQL'
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
select 'R5_PROBE helper_rollback=pass';
SQL
then
  helper_error="$(tr '\n' ' ' <"$helper_output")"
  fail "helper_rollback_probe:$helper_error"
fi
cat "$helper_output"
printf 'R5_PROBE status=pass\n'
