#!/usr/bin/env python3
"""NO01/NO02 acceptance oracle. Parent executes; author performs no DB calls.
Local disposable Docker database only. No transport/network/provider operations.
--fresh installs all migrations under default ALL grants; --database uses an
already migrated disposable DB. Runs SQL, races, repeat repair twice, races again.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20261027000011_notification_operator_authority_repair.sql"
REPAIR = ROOT / "supabase/rollbacks/20261027000011_notification_operator_authority_forward_repair.sql"
SQL_TEST = ROOT / "supabase/tests/database/DB37_notification_operator_authority_test.sql"
BASE = []
TTL = 5  # deadline only; actual wait/expiry is observed, never inferred from sleep


def lit(value):
    return "null" if value is None else "'" + str(value).replace("'", "''") + "'"


def sql(statement):
    result = subprocess.run(BASE, input=statement, text=True, capture_output=True, timeout=40)
    assert result.returncode == 0, result.stdout + result.stderr
    return result.stdout.strip()


def until(predicate, message, seconds=20):
    end = time.monotonic() + seconds
    while not predicate():
        assert time.monotonic() < end, message
        time.sleep(.02)


def tap():
    output = sql(SQL_TEST.read_text())
    assert not re.search(r"(^|\n)not ok\b", output), output
    counts = re.findall(r"^ok\b", output, re.M)
    assert counts and re.search(r"^1\.\." + str(len(counts)) + r"$", output, re.M), output
    return len(counts)


class Fixture:
    def __init__(self):
        self.prefix = uuid.uuid4().hex[:8]
        self.credential = "synthetic-no11-credential-" + self.prefix
        self.id = lambda n: self.prefix + "-0000-4000-8000-" + f"{n:012d}"
        self.actor, self.event, self.binding, self.contest = map(self.id, (9, 4, 7, 6))
        source = (ROOT / "supabase/tests/database/DB34_event_operator_controls_test.sql").read_text()
        source = source.split("create function pg_temp.op34(")[0]
        source = source.replace("begin;", "").replace("select no_plan();", "")
        source = source.replace("b3400000", self.prefix).replace("op34", "no11-" + self.prefix)
        source = source.replace("operator34", "no11-" + self.prefix)
        source = source.replace("synthetic-operator-credential-34", self.credential)
        sql(source)
        self.scope = "principal_id=" + lit(self.actor)
        self.credential_scope = "credential_hash=encode(extensions.digest(" + lit(self.credential) + ",'sha256'),'hex')"
        self.trigger = "no11_audit_" + self.prefix
        self.advisory = int(self.prefix, 16)
        self.map_key = "no11-map"
        # AFTER INSERT deliberately blocks after the audit row and branch writes.
        sql("create function public." + self.trigger + """() returns trigger language plpgsql as $$
        begin perform pg_advisory_xact_lock(""" + str(self.advisory) + """); return new; end $$;
        create trigger """ + self.trigger + " after insert on event_operator_audit for each row when (new.principal_id=" +
            lit(self.actor) + ") execute function public." + self.trigger + "();")

    def clean_trigger(self):
        sql("drop trigger if exists " + self.trigger + " on event_operator_audit; drop function if exists public." + self.trigger + "();")

    def reset_authority(self):
        sql("update event_operator_principals set active=true where id=" + lit(self.actor) + ";" +
            "update event_operator_credentials set active=true,expires_at='infinity' where " + self.scope + ";" +
            "update event_operator_grants set active=true,expires_at='infinity' where " + self.scope + ";")

    def command(self, action):
        payload = {"bindingId": self.binding}
        if action == "global.stop":
            payload = {"stopped": True}
            version = sql("select version from event_runtime_control where singleton")
        elif action == "result.record":
            payload = {"contestId": self.contest, "status": "final", "outcome": "draw",
                       "winnerEntryId": None, "winningNominationIds": []}
            version = sql("select coalesce(max(version),0) from contest_results where contest_id=" + lit(self.contest))
        elif action == "manifest.review":
            payload = {"manifestKey": "no11-manifest", "manifest": {"source": "synthetic"}}
            version = sql("select coalesce(max(version),0) from event_operator_manifests where event_edition_id=" + lit(self.event))
        else:
            version = sql("select operator_version from provider_bindings where id=" + lit(self.binding))
            if action == "binding.mode":
                payload.update(mode="shadow", fetchEnabled=True)
            elif action == "mapping.review":
                payload.update(entityKind="contest", externalId=self.map_key, canonicalId=self.contest, status="reviewed")
        return "select event_operator_command(" + ",".join([
            lit(self.credential), "'local'", lit(None if action == "global.stop" else self.event),
            lit(action), version, "'Synthetic NO11 regression'", lit(json.dumps(payload))]) + ");"

    def snapshot(self):
        # Compare actual rows/content, not only counts; no registry expiry fields.
        parts = [
            "(select to_jsonb(g) from event_runtime_control g where singleton)",
            "(select to_jsonb(b) from provider_bindings b where id=" + lit(self.binding) + ")",
        ]
        for table, where in [
            ("contest_results", "contest_id=" + lit(self.contest)),
            ("provider_entity_refs", "binding_id=" + lit(self.binding)),
            ("event_operator_audit", self.scope),
            ("event_operator_manifests", "event_edition_id=" + lit(self.event)),
            ("notification_outbox", "true"),
            ("notification_attempts", "true"),
        ]:
            parts.append("(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from " + table + " t where " + where + ")")
        return json.loads(sql("select jsonb_build_array(" + ",".join(parts) + ");"))

    def expiry(self, kind, action, alternate=False):
        if kind == "credential":
            table, where = "event_operator_credentials", self.scope
        else:
            table, where = "event_operator_grants", self.scope + " and action=" + lit(action)
            if alternate:
                where += " and id<>" + lit(self.id(91))
        sql("update " + table + " set expires_at=clock_timestamp()+interval '" + str(TTL) + " seconds' where " + where + ";")
        return "select bool_and(expires_at>CLOCK_TIMESTAMP()) from " + table + " where " + where,                "select bool_and(expires_at<=CLOCK_TIMESTAMP()) from " + table + " where " + where

    def blocker(self, kind, action, revoke=False):
        table = {"credential": "event_operator_credentials", "principal": "event_operator_principals",
                 "grant": "event_operator_grants", "binding": "provider_bindings", "contest": "contests",
                 "mapping": "provider_entity_refs", "global": "event_runtime_control"}.get(kind)
        if kind == "audit":
            return "select pg_advisory_xact_lock(" + str(self.advisory) + ");", None
        where = {
            "credential": self.credential_scope, "principal": "id=" + lit(self.actor),
            "grant": self.scope + " and action=" + lit(action),
            "binding": "id=" + lit(self.binding), "contest": "id=" + lit(self.contest),
            "mapping": "binding_id=" + lit(self.binding) + " and external_id=" + lit(self.map_key),
            "global": "singleton",
        }[kind]
        if revoke:
            return "update " + table + " set active=false where " + where + ";", table
        return "select 1 from " + table + " where " + where + " order by 1 for update;", table

    def race(self, label, kind, expires=None, action="global.stop", allow=False, revoke=False, alternate=False):
        self.reset_authority()
        # Positive cases may stop global work; each scenario starts from runnable state.
        sql("update event_runtime_control set global_stopped=false where singleton;")
        if action == "mapping.review":
            # Distinct unresolved identity; no rewriting previously reviewed evidence.
            self.map_key = "no11-map-" + uuid.uuid4().hex
            sql("insert into provider_entity_refs(binding_id,provider_id,event_edition_id,entity_kind,external_id,resolution_status,metadata) values(" +
                ",".join(map(lit, [self.binding, self.id(1), self.event, "contest", self.map_key, "unresolved"])) + ",'{}');")
        statement = self.command(action)
        before = self.snapshot()
        blocker_sql, relation = self.blocker(kind, action, revoke)
        valid, expired = self.expiry(expires, action, alternate) if expires else (None, None)
        report = barrier(blocker_sql, statement, relation, valid, expired)
        code, out, error = report.pop("result")
        if allow:
            assert code == 0, (label, code, out, error)
            dto = json.loads(out)
            assert isinstance(dto, dict) and "version" in dto, (label, out)
            assert self.snapshot() != before, "successful command must persist its audit"
        else:
            assert code != 0 and re.search(r"ERROR:\s+42501:", error), (label, code, out, error)
            assert not out.strip(), (label, "unexpected successful DTO", out)
            assert self.snapshot() == before, (label, "business/version/audit rollback failed")
        report.update(case=label, outcome="accepted" if allow else "42501+atomic-rollback")
        print(json.dumps(report), flush=True)
        return report


def blocker_ready(blocker, seconds=20):
    """Read the complete marker without blocking on partial lines or stderr EOF."""
    deadline = time.monotonic() + seconds
    pending = bytearray()
    errors = bytearray()
    streams = (blocker.stdout, blocker.stderr)
    blocking = {stream: os.get_blocking(stream.fileno()) for stream in streams}
    try:
        with selectors.DefaultSelector() as selector:
            for stream in streams:
                os.set_blocking(stream.fileno(), False)
                selector.register(stream, selectors.EVENT_READ)
            stdout_eof = False
            while True:
                remaining = deadline - time.monotonic()
                assert remaining > 0, "blocker readiness timeout: " + errors.decode(errors="replace")
                for key, _ in selector.select(remaining):
                    # Raw, nonblocking reads avoid TextIOWrapper's hidden buffering
                    # and never wait for a newline or for another pipe to close.
                    try:
                        chunk = os.read(key.fd, 65536)
                    except BlockingIOError:
                        continue
                    if not chunk:
                        selector.unregister(key.fileobj)
                        stdout_eof |= key.fileobj is blocker.stdout
                    elif key.fileobj is blocker.stderr:
                        errors.extend(chunk)
                        del errors[:-4096]
                    else:
                        pending.extend(chunk)
                        while b"\n" in pending:
                            line, _, rest = pending.partition(b"\n")
                            pending = bytearray(rest)
                            if line.startswith(b"NO11_HELD:"):
                                return int(line.split(b":", 1)[1])
                        assert len(pending) <= 65536, "blocker readiness line too long"
                assert not stdout_eof, "blocker stdout closed before readiness: " + errors.decode(errors="replace")
    finally:
        for stream, was_blocking in blocking.items():
            os.set_blocking(stream.fileno(), was_blocking)


def barrier(blocker_sql, statement, relation, valid_sql, expired_sql):
    blocker = subprocess.Popen(BASE, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    worker = None
    try:
        blocker.stdin.write("begin; set statement_timeout='25s';\n" + blocker_sql + "\nselect 'NO11_HELD:'||pg_backend_pid();\n")
        blocker.stdin.flush()
        blocker_pid = blocker_ready(blocker)
        name = "no11-worker-" + uuid.uuid4().hex
        worker = subprocess.Popen(BASE, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        worker.stdin.write("\\set VERBOSITY verbose\nset statement_timeout='25s';\nset application_name=" + lit(name) +
                           ";\nset role service_role;\n" + statement + "\n")
        worker.stdin.close()

        observation = {}
        def blocked():
            assert worker.poll() is None, "worker ended before intended lock barrier: " + worker.stderr.read()
            raw = sql("select jsonb_build_object('workerPid',pid,'blockerPid'," + str(blocker_pid) +
                      ",'wait',wait_event,'blockers',pg_blocking_pids(pid)) from pg_stat_activity where application_name=" +
                      lit(name) + " and wait_event_type='Lock' and " + str(blocker_pid) + "=any(pg_blocking_pids(pid));")
            if raw:
                observation.update(json.loads(raw))
                return True
            return False
        until(blocked, "worker never blocked on intended PID")
        if relation:
            assert sql("select exists(select 1 from pg_locks where pid=" + str(blocker_pid) +
                       " and relation=" + lit("public." + relation) + "::regclass and granted and mode in ('RowShareLock','RowExclusiveLock'));") == "t"
        else:
            assert sql("select exists(select 1 from pg_locks where pid=" + str(blocker_pid) +
                       " and locktype='advisory' and granted);") == "t"
        if valid_sql:
            assert sql(valid_sql) == "t", "authority expired before observed barrier; fixture invalid"
            until(lambda: sql(expired_sql) == "t", "actual database expiry not observed")
            assert blocked(), "worker left intended barrier before expiry release"
        blocker.stdin.write("commit;\n\\q\n")
        blocker.stdin.flush()
        blocker.wait(timeout=10)
        assert blocker.returncode == 0, blocker.stderr.read()
        worker.wait(timeout=15)
        observation["result"] = (worker.returncode, worker.stdout.read().strip(), worker.stderr.read())
        observation["relation"] = relation or "AFTER audit INSERT advisory"
        return observation
    finally:
        for process in (worker, blocker):
            if process is not None:
                try:
                    if process.poll() is None:
                        process.kill()
                        process.wait(timeout=5)
                finally:
                    for pipe in (process.stdin, process.stdout, process.stderr):
                        if pipe is not None:
                            pipe.close()


def matrix(f):
    results = []
    # Both expiry directions: principal has no expiry; credential/grant do.
    for block in ("credential", "principal", "grant"):
        for expiry in ("credential", "grant"):
            results.append(f.race(block + "-wait/" + expiry + "-expiry", block, expiry))
    results.append(f.race("global-wait/grant-expiry", "global", "grant"))
    for block, action in (("binding", "binding.mode"), ("contest", "result.record"),
                          ("mapping", "mapping.review"), ("audit", "binding.mode")):
        for expiry in ("credential", "grant"):
            results.append(f.race(block + "-wait/" + expiry + "-expiry", block, expiry, action))
    for action in ("global.stop", "result.record", "manifest.review"):
        results.append(f.race("post-audit/" + action, "audit", "credential", action))
    for block in ("credential", "principal", "grant"):
        results.append(f.race(block + "-revoked", block, revoke=True))
    for block, action in (("credential", "global.stop"), ("principal", "global.stop"),
                          ("grant", "global.stop"), ("binding", "binding.mode"),
                          ("contest", "result.record"), ("mapping", "mapping.review"),
                          ("audit", "manifest.review")):
        results.append(f.race(block + "-unexpired-control", block, action=action, allow=True))
    # Multiple candidates: valid alternative survives the first grant's expiry.
    f.reset_authority()
    sql("insert into event_operator_grants(id,principal_id,environment,action) values(" +
        ",".join(map(lit, [f.id(91), f.actor, "local", "global.stop"])) + ");")
    results.append(f.race("multiple-valid-grants/one-expires", "grant", "grant", allow=True, alternate=True))
    results.append(f.race("multiple-grants/all-expire", "grant", "grant"))
    f.reset_authority()
    # Inactive + expired duplicates must not hide the remaining valid candidate.
    sql("update event_operator_grants set active=false where id=" + lit(f.id(91)) + ";" +
        "insert into event_operator_grants(principal_id,environment,action,expires_at) values(" +
        ",".join(map(lit, [f.actor, "local", "global.stop"])) + ",clock_timestamp()-interval '1 second');")
    before = f.snapshot()
    out = json.loads(sql("set role service_role;" + f.command("global.stop")))
    assert "version" in out and f.snapshot() != before
    # Remove only the disposable duplicate so matrix can run again after repair.
    sql("delete from event_operator_grants where " + f.scope + " and action='global.stop' and (id=" +
        lit(f.id(91)) + " or expires_at<clock_timestamp());")
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--fresh", action="store_true")
    mode.add_argument("--database")
    args = parser.parse_args()
    database = args.database or "bracket_no_authority_" + uuid.uuid4().hex[:12]
    assert re.fullmatch(r"bracket_(?:no_authority|lifecycle)_[0-9a-f]{12}", database), "disposable DB name required"
    BASE.extend(["docker", "exec", "-i", "supabase_db_bracket-fyi", "psql", "-X", "-U", "postgres",
                 "-d", database, "-Atq", "-v", "ON_ERROR_STOP=1"])
    if args.fresh:
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
        for path in sorted((ROOT / "supabase/migrations").glob("*.sql")):
            sql(path.read_text())
    print(json.dumps({"database": database, "migration": hashlib.sha256(MIGRATION.read_bytes()).hexdigest(),
                      "repair": hashlib.sha256(REPAIR.read_bytes()).hexdigest()}), flush=True)
    assert MIGRATION.read_bytes() == REPAIR.read_bytes(), "forward repair must carry identical protection"
    counts = [tap()]
    f = Fixture()
    try:
        results = matrix(f)
        before = f.snapshot()
        sql(REPAIR.read_text())
        assert f.snapshot() == before, "repair changed history/business data"
        sql(REPAIR.read_text())
        assert f.snapshot() == before, "second repair changed history/business data"
        counts.append(tap())
        results += matrix(f)
        print(json.dumps({"PASS": True, "database": database, "sqlAssertions": counts,
                          "observedBarriers": len(results), "repairReplays": 2}), flush=True)
    finally:
        f.clean_trigger()


if __name__ == "__main__":
    main()
