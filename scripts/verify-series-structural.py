#!/usr/bin/env python3
"""Owned local database only. Fresh 00013 -> red boundary -> 00014/15 -> consumers -> repair replay.
No hosted configuration, existing application database reads/writes, or network services.
"""
import argparse
import hashlib
import json
import os
import re
from pathlib import Path
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--series-only", action="store_true")
args = parser.parse_args()
database = "bracket_series_" + uuid.uuid4().hex[:12]
container = "supabase_db_bracket-fyi"
evidence = {"database": database, "container": container, "scope": "local synthetic builder verification, not independent acceptance", "migrations": {}, "checks": []}

def command(argv, source=None):
    result = subprocess.run(argv, input=source, text=True, capture_output=True, timeout=240, cwd=ROOT)
    if result.returncode:
        raise RuntimeError(result.stdout[-8000:] + result.stderr[-8000:])
    return result.stdout.strip()

def sql(source):
    return command(["docker", "exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", database, "-Atq", "-v", "ON_ERROR_STOP=1"], source)

def check(name, actual, expected):
    evidence["checks"].append({"name": name, "passed": actual == expected, "actual": actual, "expected": expected})
    if actual != expected:
        raise AssertionError(name)

def apply(path):
    source = path.read_text()
    sql(source)
    evidence["migrations"][str(path.relative_to(ROOT))] = hashlib.sha256(source.encode()).hexdigest()

command(["docker", "exec", container, "createdb", "-U", "postgres", "--template=template0", database])
try:
    sql("""create schema extensions; create extension pgcrypto with schema extensions;
create extension pgtap with schema extensions; create extension supabase_vault;
grant usage on schema public,extensions to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on functions to anon,authenticated,service_role;
alter database """ + database + " set search_path=public,extensions;")
    migrations = sorted((ROOT / "supabase/migrations").glob("*.sql"))
    for path in migrations:
        if path.name[:14] <= "20261027000013":
            apply(path)
    # Populated 00013 compatibility lane: original legacy IDs, picks and canonical evidence.
    apply(ROOT / "supabase/tests/transitions/legacy.sql")
    apply(ROOT / "supabase/tests/transitions/canonical.sql")
    legacy_tables = ["templates", "leagues", "participants", "picks", "template_results", "league_result_overrides", "contest_results", "result_audit_events"]
    def legacy_snapshot():
        return {table: sql("select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]')::text) from " + table + " t") for table in legacy_tables}
    legacy_before = legacy_snapshot()
    check("RED 00013 has no persisted series capture", sql("select to_regprocedure('capture_event_series(uuid)') is null"), "t")
    for path in migrations:
        if "20261027000014" <= path.name[:14] <= ("20261027000014" if args.series_only else "20261027000015"):
            apply(path)
    check("series command is not public", sql("select not has_function_privilege('anon','review_event_series(text,uuid,integer,jsonb,text)','execute') and not has_function_privilege('authenticated','commit_event_series(uuid,text,jsonb)','execute')"), "t")
    check("populated 00013 upgrade preserves legacy rows and evidence", legacy_snapshot(), legacy_before)
    for filename in ["DB32_event_lifecycle_test.sql", "DB35_window_lifecycle_repair_test.sql", "DB36_reviewed_pairings_test.sql"]:
        output = sql((ROOT / "supabase/tests/database" / filename).read_text())
        if re.search(r"(?m)^not ok", output):
            raise AssertionError(filename + "\n" + output)
        evidence["checks"].append({"name": filename, "passed": True, "plan": re.findall(r"(?m)^1\.\.[0-9]+$", output)})
    targets = ["tests/events/series-persistence-db.test.ts", "tests/events/runtime.test.ts", "tests/events/runtime-cli.test.ts"]
    if not args.series_only:
        structural = sorted(ROOT.glob("tests/events/structural-qualifiers*.test.ts"))
        if not structural:
            raise RuntimeError("Structural consumer tests required")
        targets += [str(p.relative_to(ROOT)) for p in structural]
    env = os.environ.copy()
    env["BRACKET_SERIES_TEST_DATABASE"] = database
    env["RUN_STRUCTURAL_QUALIFIERS_DB"] = "1"
    result = subprocess.run(["npx", "vitest", "run", *targets], cwd=ROOT, env=env, capture_output=True, text=True, timeout=240)
    evidence["testCommand"] = ["npx", "vitest", "run", *targets]
    evidence["testExit"] = result.returncode
    evidence["testOutput"] = result.stdout + result.stderr
    print(evidence["testOutput"])
    if result.returncode:
        raise RuntimeError("Consumer tests failed")
    preserved = ["contest_results", "result_audit_events", "event_series_reviews", "event_operator_audit", "picks", "participants", "event_template_configs", "event_pairing_reviews", "event_pairing_corrections"]
    if not args.series_only:
        preserved.append("event_structural_qualifier_reviews")
    def snapshot():
        return {table: sql("select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]')::text) from " + table + " t") for table in preserved}
    before = snapshot()
    repairs = [ROOT / "supabase/rollbacks/20261027000014_reviewed_series_forward_repair.sql"]
    if not args.series_only:
        repairs += [ROOT / "supabase/rollbacks/20261027000015_structural_qualifiers_forward_repair.sql"]
    for repair in repairs:
        apply(repair)
    check("forward repairs preserve all immutable evidence and picks", snapshot(), before)
    state = sql("select md5(jsonb_agg(to_jsonb(e) order by league_id)::text) from event_league_evaluations e")
    for repair in repairs:
        apply(repair)
    check("repair replay leaves complete evaluation rows identical", sql("select md5(jsonb_agg(to_jsonb(e) order by league_id)::text) from event_league_evaluations e"), state)
    check("repair replay retains evidence and picks", snapshot(), before)
finally:
    # Owned DB intentionally retained, stopped, for independent inspection.
    sql("do $$ begin if to_regclass('event_runtime_control') is not null then update event_runtime_control set global_stopped=true,notifications_enabled=false; end if; end $$;")
    output = ROOT / "docs/architecture/implementation/series-structural-evidence.json"
    output.write_text(json.dumps(evidence, indent=2) + "\n")
    print("Owned stopped database:", database)
    print("Evidence:", output)
