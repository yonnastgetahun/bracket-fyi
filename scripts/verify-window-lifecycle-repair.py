#!/usr/bin/env python3
"""Fresh disposable DB: WL regression RED at 00008, GREEN at 00009; no app DB writes."""
import json
import importlib.util
import subprocess
import uuid
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
database = "bracket_lifecycle_" + uuid.uuid4().hex[:12]
BASE = ["docker", "exec", "-i", "supabase_db_bracket-fyi", "psql", "-X", "-U",
        "postgres", "-d", database, "-Atq", "-v", "ON_ERROR_STOP=1"]
def sql(statement):
    result = subprocess.run(BASE, input=statement, text=True, capture_output=True, timeout=60)
    if result.returncode:
        raise RuntimeError(f"psql exited {result.returncode}: " + result.stdout + result.stderr)
    return result.stdout
def tap(name):
    output = sql((ROOT / "supabase/tests/database" / name).read_text())
    assert "not ok" not in output and "1.." in output, output
    print(name + ": " + next(line for line in output.splitlines() if line.startswith("1..")), flush=True)
def main():
    print("Creating disposable database: " + database, flush=True)
    subprocess.run(["docker", "exec", "supabase_db_bracket-fyi", "createdb", "-U",
                    "postgres", "--template=template0", database], check=True, timeout=60)
    print("Disposable database: " + database, flush=True)
    sql("""create schema extensions;
create extension pgcrypto with schema extensions;
create extension pgtap with schema extensions;
create extension supabase_vault;
grant usage on schema public,extensions to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on functions to anon,authenticated,service_role;
alter database """ + database + " set search_path=public,extensions;")
    for migration in sorted((ROOT / "supabase/migrations").glob("*.sql")):
        if migration.name[:14] <= "20261027000008":
            sql(migration.read_text())
            if migration.name.startswith("20261027000007"):
                tap("DB33_event_notifications_test.sql")
    red = sql((ROOT / "supabase/tests/database/DB35_window_lifecycle_repair_test.sql").read_text())
    for assertion in ["WL-01 deleted first/live second rejects late enrollment",
                      "WL-02 poison basis does not abort page", "WL-03 exactly one recompletion audit"]:
        assert any("not ok" in line and assertion in line for line in red.splitlines()), red
    print("RED: all three counterexamples asserted against 00008", flush=True)
    repair = (ROOT / "supabase/migrations/20261027000009_window_lifecycle_repairs.sql").read_text()
    sql(repair)
    for name in ["DB31_window_incarnation_history_test.sql", "DB32_event_lifecycle_test.sql",
                 "DB34_event_operator_controls_test.sql",
                 "DB35_window_lifecycle_repair_test.sql"]:
        tap(name)
    sql(repair)
    tap("DB35_window_lifecycle_repair_test.sql")
    # Forward compatibility hold retains evidence; run twice to verify no additional changes.
    forward = (ROOT / "supabase/rollbacks/20261027000009_window_lifecycle_repairs_forward_repair.sql").read_text()
    fixture = (ROOT / "supabase/tests/database/DB32_event_lifecycle_test.sql").read_text()
    fixture = fixture[fixture.index("insert into organizations"):fixture.index("create temp table")]
    fixture = fixture.replace("a3200000","a3590000").replace("db32","db35-forward")
    sql(fixture)
    sql("""insert into contest_results(contest_id,event_edition_id,version,result_status,outcome_type,source_type,idempotency_key)
    values('a3590000-0000-4000-8000-000000000004','a3590000-0000-4000-8000-000000000003',1,'final','draw','system','db35-race');""")
    spec = importlib.util.spec_from_file_location("lifecycle_barriers", ROOT / "scripts/verify-event-lifecycle-races.py")
    barriers = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(barriers)
    barriers.BASE = BASE.copy()
    lid = "a3590000-0000-4000-8000-000000000012"
    sql(barriers.commit(barriers.capture(lid)))
    sql("""insert into league_completion_holds(league_id,event_edition_id,hold_key,reason,created_by_fingerprint,idempotency_key,expires_at)
    values('a3590000-0000-4000-8000-000000000012','a3590000-0000-4000-8000-000000000003',
    'race','Synthetic expiry race',repeat('a',64),'db35-race-hold',clock_timestamp()+interval '1 second');""")
    assert json.loads(sql(barriers.commit(barriers.capture(lid))))["state"] == "held"
    sql("select pg_sleep(1.1);")
    captured = barriers.capture(lid)
    outcomes = barriers.barrier("select 1 from leagues where id='"+lid+"' for update;",
                                [barriers.commit(captured),barriers.commit(captured)])
    assert all(code == 0 for code, _, _ in outcomes), outcomes
    assert sorted(json.loads(output)["replayed"] for _,output,_ in outcomes) == [False,True], outcomes
    assert sql("select count(*) from event_lifecycle_audit where league_id='"+lid+"' and kind='evaluated';").strip() == "3"
    assert sql("select count(*) from event_lifecycle_audit where league_id='"+lid+"' and kind='coronation';").strip() == "1"
    evidence = sql("select jsonb_agg(to_jsonb(a) order by id) from event_lifecycle_audit a;")
    print("WL-03 competing expiry acknowledgments: one evaluation, one replay, three audits, one coronation",flush=True)
    sql(forward)
    before = sql("select jsonb_agg(to_jsonb(e) order by league_id) from event_league_evaluations e;")
    assert sql("select count(*) from event_league_evaluations where not lifecycle_disabled or not frozen;").strip() == "0"
    sql(forward)
    assert sql("select jsonb_agg(to_jsonb(e) order by league_id) from event_league_evaluations e;") == before
    assert sql("select jsonb_agg(to_jsonb(a) order by id) from event_lifecycle_audit a;") == evidence
    tap("DB35_window_lifecycle_repair_test.sql")
    print(json.dumps({"database":database,"red":True,"green":True,"migrationReplay":True,"forwardRepairReplay":True}),flush=True)
if __name__ == "__main__":
    main()
