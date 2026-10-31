#!/usr/bin/env python3
"""P5/P7 deterministic service-role lock barriers; local disposable Docker only.
Original synthetic fixture retained under random IDs. No .env, hosted DB or sends.
"""
import argparse
import os
import hashlib
import json
from pathlib import Path
import re
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
CONTAINER = os.environ.get("BRACKET_TEST_DB_CONTAINER", "supabase_db_bracket-fyi")
if CONTAINER != "supabase_db_bracket-fyi" and not re.fullmatch(r"bracket-p11-db-[a-f0-9]{12}", CONTAINER):
    raise ValueError("Only the known local or owned isolated DB container is allowed")
BASE = ["docker", "exec", "-i", CONTAINER, "psql", "-X",
        "-U", "postgres", "-d", "", "-Atq", "-v", "ON_ERROR_STOP=1"]


def disposable_database(value):
    if not re.fullmatch(r"bracket_[a-z0-9_]{1,55}", value):
        raise argparse.ArgumentTypeError("database must be a disposable bracket_* name (lowercase letters, digits, underscores; max 63 characters)")
    return value


def literal(value):
    if value is None:
        return "null"
    return "'" + str(value).replace("'", "''") + "'"


def sql(statement, service=False):
    result = subprocess.run(BASE, input=("set role service_role;\n" if service else "") + statement,
                            text=True, capture_output=True, timeout=30)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


def capture(league):
    return json.loads(sql("select capture_event_lifecycle(" + literal(league) + ");", True))


def commit(captured):
    return ("select commit_event_lifecycle(" + literal(captured["leagueId"]) + "," +
            str(captured["generation"]) + "," + literal(captured["basisToken"]) + ",'[]');")


def mutate(league, credential, captured, key, expiry=None):
    effective = captured["basis"]["effective"]["m"]
    payload = {"outcome": {"kind": "draw"}}
    if expiry:
        payload["expiresAt"] = expiry
    return ("select mutate_event_lifecycle(" + ",".join([
        literal(league), literal(credential), "'m'", "'override'", literal(json.dumps(payload)),
        "'Synthetic race reason'", literal(effective["effectiveToken"]), "null", literal(key)]) + ");")


def barrier(blocker_sql, worker_statements, before_release=None, rollback=False):
    """Observe pg_stat_activity Lock, never use timing to infer serialization."""
    blocker = subprocess.Popen(BASE, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, text=True)
    workers = []
    try:
        blocker.stdin.write("begin;\n" + blocker_sql + "\n\\echo BARRIER_HELD\n")
        blocker.stdin.flush()
        while True:
            line = blocker.stdout.readline()
            if not line:
                raise RuntimeError("blocker ended: " + blocker.stderr.read())
            if line.strip() == "BARRIER_HELD":
                break
        for statement in worker_statements:
            name = "db32-worker-" + str(uuid.uuid4())
            worker = subprocess.Popen(BASE, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                      stderr=subprocess.PIPE, text=True)
            worker.stdin.write("\\set VERBOSITY verbose\nset application_name=" + literal(name) +
                               ";\nset role service_role;\n" + statement + "\n")
            worker.stdin.close()
            workers.append((name, worker))
        names = ",".join(literal(name) for name, _ in workers)
        deadline = time.monotonic() + 15
        while sql("select count(*) from pg_stat_activity where application_name in (" +
                   names + ") and wait_event_type='Lock';") != str(len(workers)):
            if time.monotonic() > deadline or any(w.poll() is not None for _, w in workers):
                raise AssertionError("workers failed to reach deterministic lock barrier")
            time.sleep(0.02)
        if before_release:
            before_release()
        blocker.stdin.write(("rollback;" if rollback else "commit;") + "\n\\q\n")
        blocker.stdin.flush()
        blocker.wait(timeout=15)
        if blocker.returncode:
            raise RuntimeError(blocker.stderr.read())
        errors = []
        for _, worker in workers:
            worker.wait(timeout=15)
            output, error = worker.stdout.read(), worker.stderr.read()
            errors.append((worker.returncode, output, error))
        return errors
    finally:
        for process in [blocker] + [worker for _, worker in workers]:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, type=disposable_database,
                        help="Explicit disposable bracket_* database; no default target.")
    parser.add_argument("--business-sqlstate", choices=("PT409", "40001"), default="PT409",
                        help="Expected business conflict: PT409 current schema, 40001 historical schema.")
    parser.add_argument("--fresh", action="store_true", help="Create --database; RED on 00005 then migrate 00006 and GREEN (requires --business-sqlstate 40001).")
    options = parser.parse_args(argv)
    if options.fresh and options.business_sqlstate != "40001":
        parser.error("--fresh installs historical 00006; supply --business-sqlstate 40001")
    database = options.database
    BASE[BASE.index("-d") + 1] = database
    red = None
    if options.fresh:
        subprocess.run(["docker", "exec", "supabase_db_bracket-fyi", "createdb", "-U", "postgres",
                        "--template=template0", database], check=True, timeout=30)
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
            if migration.name[:14] <= "20261027000005":
                sql(migration.read_text())
        baseline = subprocess.run(BASE, input=(ROOT / "supabase/tests/database/DB32_event_lifecycle_test.sql").read_text(),
                                  text=True, capture_output=True, timeout=30)
        red = baseline.returncode != 0 and "function capture_event_lifecycle(uuid) does not exist" in baseline.stderr
        assert red, baseline.stdout + baseline.stderr
        sql((ROOT / "supabase/migrations/20261027000006_event_lifecycle.sql").read_text())
    tap = sql((ROOT / "supabase/tests/database/DB32_event_lifecycle_test.sql").read_text())
    assert "not ok" not in tap and "1.." in tap, tap
    prefix = uuid.uuid4().hex[:8]
    ident = lambda tail: prefix + "-0000-4000-8000-" + str(tail).zfill(12)
    fixture = (ROOT / "supabase/tests/database/DB32_event_lifecycle_test.sql").read_text()
    fixture = fixture[fixture.index("insert into organizations"):fixture.index("create temp table")]
    fixture = fixture.replace("a3200000", prefix).replace("db32", "db32-" + prefix)
    sql("begin;\n" + fixture + "\ncommit;")
    a, b, c, credential = ident(11), ident(12), ident(13), ident(22)
    original = capture(b)
    sql("begin;set local role service_role;" + mutate(b, credential, original, "rolled-back") + "rollback;")
    assert capture(b) == original, "precommit crash must preserve entire generation/basis"
    assert sql("select count(*) from event_lifecycle_audit where league_id=" + literal(b)) == "0"

    errors = barrier("set local role service_role;\n" + mutate(b, credential, original, "committed"),
                     [commit(original), mutate(b, credential, original, "loser")])
    assert all(code != 0 and options.business_sqlstate in error for code, _, error in errors), errors
    current = capture(b)
    assert current["generation"] == original["generation"] + 1
    assert sql("select count(*) from event_lifecycle_revisions where league_id=" + literal(b)) == "1"
    assert json.loads(sql("select read_event_lifecycle(" + literal(b) + ");", True))["state"] == "reconciliation-pending"
    assert json.loads(sql(commit(current), True))["coronation"] is True
    assert json.loads(sql(commit(current), True))["replayed"] is True

    # A final canonical commit is a durable, ordered three-league fanout. A queued
    # worker holding its pre-result basis cannot acknowledge the newer generation.
    old_a = capture(a)
    result_sql = ("insert into contest_results(contest_id,event_edition_id,version,result_status,outcome_type,"
                  "source_type,idempotency_key) values(" + literal(ident(4)) + "," + literal(ident(3)) +
                  ",1,'final','draw','system'," + literal("race:" + prefix) + ");")
    errors = barrier(result_sql, [commit(old_a)])
    assert errors[0][0] != 0 and options.business_sqlstate in errors[0][2], errors
    assert sql("select count(*) from event_lifecycle_audit where kind='canonical' and league_id in (" +
               ",".join(literal(x) for x in [a, b, c]) + ");") == "3"
    masked = capture(b)
    assert masked["basis"]["effective"]["m"]["effectiveToken"] == current["basis"]["effective"]["m"]["effectiveToken"]
    assert masked["basis"]["effective"]["m"]["provenanceToken"] != current["basis"]["effective"]["m"]["provenanceToken"]
    assert json.loads(sql(commit(masked), True))["coronation"] is False

    # Expiry while an old worker waits on the league row: time sampled after lock.
    expiry = sql("select (clock_timestamp()+interval '2 seconds')::text;")
    sql(mutate(b, credential, masked, "expiring", expiry), True)
    expiring = capture(b)
    sql(commit(expiring), True)
    def cross_expiry():
        deadline = time.monotonic() + 8
        while sql("select clock_timestamp()>=" + literal(expiry) + "::timestamptz;") != "t":
            if time.monotonic() > deadline:
                raise AssertionError("database UTC failed to cross recorded expiry")
            time.sleep(0.02)
    errors = barrier("select id from leagues where id=" + literal(b) + " for update;",
                     [commit(expiring)], cross_expiry)
    assert errors[0][0] != 0 and options.business_sqlstate in errors[0][2], errors
    view = json.loads(sql("select read_event_lifecycle(" + literal(b) + ");", True))
    assert view["state"] == "reconciliation-pending" and view["leaderboard"] == []
    assert sql("select count(*) from scan_event_lifecycle_work(null,500) where league_id=" +
               literal(b) + " and generation is not null;", True) == "1"
    expired = capture(b)
    assert expired["basis"]["effective"]["m"]["source"] == "canonical"
    assert json.loads(sql(commit(expired), True))["coronation"] is False
    assert json.loads(sql(commit(expired), True))["replayed"] is True
    assert sql("select count(*) from event_lifecycle_audit where league_id=" + literal(b) +
               " and kind='coronation';") == "1"
    # Additive repair twice inside rollback: all user/evidence data retained.
    repair = (ROOT / "supabase/rollbacks/20261027000006_event_lifecycle_forward_repair.sql").read_text()
    repair = repair.replace("begin;", "").replace("commit;", "")
    repaired = sql("begin;" + repair + repair +
                   "select read_event_lifecycle(" + literal(b) + ")->>'state';rollback;")
    assert repaired == "held", repaired
    print(json.dumps({"result": "PASS", "database": database, "businessSqlstate": options.business_sqlstate, "redMissingCapture": red,
                      "migrationSHA256": hashlib.sha256((ROOT / "supabase/migrations/20261027000006_event_lifecycle.sql").read_bytes()).hexdigest(),
                      "retainedSyntheticLeagues": [a, b, c],
                      "barrier": "pg_stat_activity wait_event_type=Lock",
                      "scenarios": ["precommit rollback", "override vs stale override and ack",
                                    "postcommit recovery/retry", "canonical vs stale ack three-league fanout",
                                    "expiry during lock wait", "outage sweep convergence",
                                    "one coronation", "forward repair replay"]}))


if __name__ == "__main__":
    main()
