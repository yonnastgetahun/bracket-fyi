#!/usr/bin/env python3
"""P8 fresh RED/GREEN + deterministic lock races, disposable local Docker only."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("lifecycle", ROOT / "scripts/verify-event-lifecycle-races.py")
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
sql, literal, barrier = base.sql, base.literal, base.barrier


def races():
    prefix = uuid.uuid4().hex[:8]
    ident = lambda n: prefix + "-0000-4000-8000-" + str(n).zfill(12)
    fixture = (ROOT / "supabase/tests/database/DB33_event_notifications_test.sql").read_text()
    fixture = fixture[fixture.index("insert into organizations"):fixture.index("-- FIXTURE_END")]
    sql("begin;" + fixture.replace("a3300000", prefix).replace("db33", "p8-" + prefix) + "commit;")
    league, worker, worker2 = ident(11), ident(301), ident(302)
    board = [{"id": ident(101), "earned": 0, "maximum": 1, "wrong": 0, "pending": 1, "rank": 1}]
    def reconcile():
        c = base.capture(league)
        return sql("select commit_event_lifecycle(" + ",".join([literal(league), str(c["generation"]),
                    literal(c["basisToken"]), literal(json.dumps(board))]) + ");", True)
    def consent(enabled=True):
        return ("select set_event_notification_consent(" + ",".join([literal(league), literal(ident(201)),
                literal(ident(101)), "'fake://race-" + prefix + "'", "array['broadcast','result_final','result_correction','league_complete']",
                "true" if enabled else "false"]) + ");")
    sql(consent(), True)
    reconcile()
    def emit(key):
        c = base.capture(league)
        sql("select emit_event_notification(" + ",".join([literal(league), "'broadcast'", literal(key),
             literal(c["basisToken"]), "null", literal(ident(21))]) + ");", True)
        return sql("select id from notification_outbox where league_id=" + literal(league) +
                   " and idempotency_key like " + literal("%:" + key + ":%") + ";")
    def admit(oid, who=worker):
        return "select admit_event_notification(" + literal(oid) + "," + literal(who) + ");"
    def start(aid, who=worker):
        return "select start_event_notification(" + literal(aid) + "," + literal(who) + ");"
    def finish(aid):
        return "select finish_event_notification(" + literal(aid) + "," + literal(worker) + ",201);"
    def result(outputs):
        assert outputs[0][0] == 0, outputs
        return json.loads(outputs[0][1])
    def permit(oid):
        return json.loads(sql(admit(oid), True))["attemptId"]

    fake_send_log = []
    def fake_deliver(aid, who=worker):
        # The race transport is a recording fake invoked only after durable start.
        assert sql("select disposition from notification_attempts where id=" + literal(aid)) == "issued"
        fake_send_log.append(aid)
        response = json.loads(sql("select finish_event_notification(" + literal(aid) + "," +
                                  literal(who) + ",201);", True))
        assert response["outcome"] == "sent", response

    # Stop has the global row first: later admissions observe stopped, no permit.
    oid = emit("stop-first")
    sql("select set_event_notification_control(false,true);", True)
    stopped = result(barrier("select set_event_notification_control(true,true);", [admit(oid)]))
    assert stopped == {"admitted": False, "reason": "stopped"}, stopped
    assert sql("select count(*) from notification_attempts where outbox_id=" + literal(oid)) == "0"

    # Admission wins lock first: committed stop truthfully reports its permit.
    sql("select set_event_notification_control(false,true);", True)
    ack = result(barrier(admit(oid), ["select set_event_notification_control(true,true);"]))
    assert not ack["drained"] and len(ack["outstanding"]) == 1, ack
    aid = ack["outstanding"][0]["attemptId"]
    assert not json.loads(sql(start(aid), True))["started"]
    sql("select set_event_notification_control(false,true);", True)

    # Start already authorized before stop: one pre-stop fake send may finish.
    oid = emit("issued-first")
    aid = permit(oid)
    ack = result(barrier(start(aid), ["select set_event_notification_control(true,true);"]))
    assert any(a["attemptId"] == aid and a["state"] == "issued" for a in ack["outstanding"]), ack
    assert len(fake_send_log) == 0
    fake_deliver(aid)
    sql("select set_event_notification_control(false,true);", True)

    # Correction holds league lock; admission must wait then reject old basis.
    oid = emit("correction-first")
    captured = base.capture(league)
    mutation = base.mutate(league, ident(21), captured, "correction-race")
    changed = result(barrier(mutation, [admit(oid)]))
    assert changed["reason"] == "superseded", changed
    reconcile()
    # Permit before correction is deliberately pre-correction authorized work.
    oid = emit("permit-before-correction")
    aid = permit(oid)
    captured = base.capture(league)
    sql(base.mutate(league, ident(21), captured, "second-correction"), True)
    assert json.loads(sql(start(aid), True))["started"]
    fake_deliver(aid)
    reconcile()

    # Consent withdrawal racing admission serializes on league.
    oid = emit("consent-race")
    denied = result(barrier(consent(False), [admit(oid)]))
    assert denied["reason"] == "consent", denied
    sql(consent(), True)

    # Override expires during a blocked admission: sample DB time after lock.
    expiry = sql("select (clock_timestamp()+interval '2 seconds')::text;")
    captured = base.capture(league)
    sql(base.mutate(league, ident(21), captured, "expiry", expiry), True)
    reconcile()
    oid = emit("expiry-race")
    def cross_expiry():
        deadline = time.monotonic() + 8
        while sql("select clock_timestamp()>=" + literal(expiry) + "::timestamptz;") != "t":
            assert time.monotonic() < deadline
            time.sleep(0.02)
    expired = result(barrier("select id from leagues where id=" + literal(league) + " for update;",
                            [admit(oid)], cross_expiry))
    assert expired["reason"] == "superseded", expired
    reconcile()

    # Actual five-second DB deadline crosses while start waits on global row.
    oid = emit("deadline-race")
    aid = permit(oid)
    deadline_at = sql("select start_deadline::text from notification_attempts where id=" + literal(aid))
    def cross_deadline():
        until = time.monotonic() + 8
        while sql("select clock_timestamp()>" + literal(deadline_at) + "::timestamptz;") != "t":
            assert time.monotonic() < until
            time.sleep(0.02)
    expired = result(barrier("select * from event_runtime_control for update;", [start(aid)], cross_deadline))
    assert not expired["started"], expired

    # Commit-before-ack recovery: old permit becomes uncertain, never reusable.
    oid = emit("restart")
    aid = permit(oid)
    assert not json.loads(sql(start(aid, worker2), True))["started"]
    sql("update notification_attempts set start_deadline=clock_timestamp()-interval '16 seconds' where id=" + literal(aid))
    recovered = json.loads(sql(admit(oid, worker2), True))
    assert recovered["admitted"] and recovered["attemptId"] != aid
    assert sql("select disposition from notification_attempts where id=" + literal(aid)) == "uncertain"
    assert not json.loads(sql(start(aid), True))["started"]
    assert json.loads(sql(start(recovered["attemptId"], worker2), True))["started"]
    fake_deliver(recovered["attemptId"], worker2)

    # Binding disable participates between global and league locks.
    sql("insert into data_providers(id,adapter_key,display_name) values(" + literal(ident(401)) +
        "," + literal("p8-" + prefix) + ",'Synthetic');")
    sql("insert into provider_bindings(id,provider_id,event_edition_id,binding_key,mode) values(" +
        ",".join([literal(ident(402)),literal(ident(401)),literal(ident(3)),"'p8'","'write'"]) + ");")
    oid = emit("binding-stop")
    disabled = result(barrier("update provider_bindings set mode='disabled' where id=" + literal(ident(402)) + ";",
                              [admit(oid)]))
    assert disabled["reason"] == "binding-disabled", disabled
    sql("update provider_bindings set mode='write' where id=" + literal(ident(402)) + ";")
    # Two workers cannot consume one queue claim or authorize two attempts.
    duplicate = result(barrier(admit(oid), [admit(oid, worker2)]))
    assert duplicate["reason"] == "outstanding", duplicate
    aid = sql("select id from notification_attempts where outbox_id=" + literal(oid) + " order by attempt_number desc limit 1;")
    assert json.loads(sql(start(aid), True))["started"]
    fake_deliver(aid)

    # Atomic rollback leaves no lifecycle audit/recipient intent partial work.
    before = sql("select count(*) from notification_outbox where league_id=" + literal(league))
    captured = base.capture(league)
    sql("begin;set local role service_role;" + base.mutate(league, ident(21), captured, "rollback") +
        "select commit_event_lifecycle(" + literal(league) + ",(capture_event_lifecycle(" + literal(league) +
        ")->>'generation')::bigint,capture_event_lifecycle(" + literal(league) + ")->>'basisToken'," +
        literal(json.dumps(board)) + ");rollback;")
    assert sql("select count(*) from notification_outbox where league_id=" + literal(league)) == before
    # Repair is additive and replay-safe; uncertain remains explicitly outstanding.
    repair = (ROOT / "supabase/rollbacks/20261027000007_event_notifications_forward_repair.sql").read_text()
    sql(repair); sql(repair)
    assert sql("select count(*) from notification_outbox where league_id=" + literal(league)) == before
    assert json.loads(sql("select set_event_notification_control(true,false);", True))["drained"] is False
    return {"lock_barriers": 9, "fake_sends": len(fake_send_log), "restart_uncertain": True, "repair_twice": True}


def main():
    database = "bracket_notifications_" + uuid.uuid4().hex[:12]
    subprocess.run(["docker", "exec", "supabase_db_bracket-fyi", "createdb", "-U", "postgres", "--template=template0", database], check=True)
    base.BASE[base.BASE.index("-d") + 1] = database
    sql("""create schema extensions; create extension pgcrypto with schema extensions;
create extension pgtap with schema extensions; create extension supabase_vault;
grant usage on schema public,extensions to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on functions to anon,authenticated,service_role;
alter database """ + database + " set search_path=public,extensions;")
    for path in sorted((ROOT / "supabase/migrations").glob("*.sql")):
        if path.name[:14] <= "20261027000006":
            sql(path.read_text())
    test = (ROOT / "supabase/tests/database/DB33_event_notifications_test.sql").read_text()
    red = subprocess.run(base.BASE, input=test, text=True, capture_output=True)
    assert red.returncode != 0 and "does not exist" in red.stderr, red.stdout + red.stderr
    print(json.dumps({"database": database, "red": True}), flush=True)
    migration = ROOT / "supabase/migrations/20261027000007_event_notifications.sql"
    sql(migration.read_text())
    tap = sql(test)
    assert "not ok" not in tap, tap
    print(tap[tap.rfind("1.."):], flush=True)
    regression_files = 0
    regression_assertions = 0
    for path in sorted((ROOT / "supabase/tests/database").glob("*.sql")):
        # Packet owns through DB33; later parallel packets are tested by parent.
        if path.name.startswith("DB") and int(path.name[2:4]) > 33:
            continue
        output = sql(path.read_text())
        assert "not ok" not in output, path.name + "\n" + output
        regression_files += 1
        regression_assertions += sum(line.startswith("ok ") for line in output.splitlines())
    print(json.dumps({"sql_files": regression_files, "sql_assertions": regression_assertions}), flush=True)
    # Real repository/worker fake transport counts, isolated before race fixtures.
    env = dict(os.environ, NOTIFICATION_TEST_DATABASE=database)
    subprocess.run(["npx", "vitest", "run", "tests/events/notifications.test.ts", "tests/events/notifications-db.test.ts"],
                   cwd=ROOT, env=env, check=True, timeout=60)
    outcome = races()
    print(json.dumps({"database": database, "green": True, "races": outcome,
                      "migration_sha256": hashlib.sha256(migration.read_bytes()).hexdigest()}), flush=True)


if __name__ == "__main__":
    main()
