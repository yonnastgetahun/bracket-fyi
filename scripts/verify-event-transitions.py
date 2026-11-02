#!/usr/bin/env python3
"""Local-only additive SQL transition rehearsal; never resets or copies public schema.
All processes use argument lists (no shell); writes target newly-created named DBs.
Run via /Users/yonnasgetahun/clawd/bin/exec -- 'cd ... && python3 scripts/verify-event-transitions.py'.
"""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import uuid

from transition_command import run_command

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIX = ROOT / "supabase/tests/transitions"
CONTAINER = os.environ.get("BRACKET_TEST_DB_CONTAINER", "supabase_db_bracket-fyi")
if CONTAINER != "supabase_db_bracket-fyi" and not re.fullmatch(r"bracket-p11-db-[a-f0-9]{12}", CONTAINER):
    raise ValueError("Only the known local or owned isolated DB container is allowed")
PIN = "20261027000005"
PRE_HISTORY = "20261027000004"
LEGACY = "20260725000005"
CURRENT = "20261010000008"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--through", default="20261027000010", help="Explicit inclusive migration timestamp; default integration target 00010 (later targets supported).")
args = parser.parse_args()
if not re.fullmatch(r"[0-9]{14}", args.through) or args.through < PIN:
    parser.error("--through must be a timestamp >= pinned 20261027000005")
run = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "_" + uuid.uuid4().hex[:6]
evidence = {"run": run, "container": CONTAINER, "through": args.through,
            "scope": "infrastructure only; not full P12/product acceptance", "steps": [], "assertions": [], "databases": []}
owned = set()

def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()

def command(argv, stdin=None):
    try:
        return run_command(argv, stdin=stdin)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(json.dumps({"argv": argv, "timeout": exc.timeout,
                                       "stdout": exc.stdout or "", "stderr": exc.stderr or ""})) from exc

def sql(db, source, label, record=True):
    if db not in owned:
        raise RuntimeError("Refusing SQL against non-harness database")
    argv = ["docker", "exec", "-i", CONTAINER, "psql", "-X", "-U", "postgres", "-d", db,
            "-v", "ON_ERROR_STOP=1", "-Atq"]
    result = command(argv, source)
    if record:
        evidence["steps"].append({"db": db, "label": label, "sql_sha256": sha(source), "output": result.strip()})
    return result.strip()

def check(name, actual, expected=True):
    passed = actual == expected
    evidence["assertions"].append({"name": name, "passed": passed, "actual": sha(json.dumps(actual, sort_keys=True)) if isinstance(actual, (dict, list)) else actual, "expected": sha(json.dumps(expected, sort_keys=True)) if isinstance(expected, (dict, list)) else expected})
    if not passed:
        raise AssertionError(name)

def file(db, path):
    source = path.read_text()
    if path.parent == ROOT / "supabase/tests/database" or path.name == "incarnation-held.sql":
        expected = "PT409" if args.through >= "20261027000012" else "40001"
        source = "set bracket.test_business_sqlstate='" + expected + "';\n" + source
    return sql(db, source, str(path.relative_to(ROOT)))

def snapshot(db):
    return json.loads(file(db, FIX / "reader.sql"))

def retained(db):
    # Whole-row hashes, not merely counts, for all rows whose contents repair must preserve.
    tables = ["templates", "template_matches", "picks", "participants", "leagues", "template_results", "league_result_overrides",
              "contest_results", "result_audit_events", "notification_outbox", "award_nominations", "award_nomination_credits", "event_league_windows", "event_template_configs", "event_window_incarnation_history"]
    if sql(db, "select to_regclass('public.event_window_incarnation_history') is not null;", "history available", False) != "t":
        tables.remove("event_window_incarnation_history")
    for table in ["notification_attempts", "event_lifecycle_revisions", "event_lifecycle_audit",
                  "event_notification_subscriptions", "event_notification_snapshots", "event_operator_audit",
                  "event_operator_manifests", "event_provider_attempts", "event_pairing_reviews", "event_pairing_corrections",
                  "league_competitor_names"]:
        if sql(db, "select to_regclass('public." + table + "') is not null;", "optional evidence table", False) == "t":
            tables.append(table)
    return {t: sql(db, "select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public." + t + " t;",
                   "preservation:" + t, False) for t in tables}

def backfill(db, kind):
    template = sql(db, "select id from templates where type='" + kind + "';", "backfill target")
    source = (ROOT / "supabase/backfills/20261008000001_legacy_template_results.sql").read_text()
    # UUID came from this disposable DB; no shell interpolation.
    source = source.replace(":'template_id'", "'" + template + "'")
    return sql(db, source, "bounded backfill:" + kind)

# Exact original IDs, independent of names or later fixture league additions.
LEGACY_IDS = "(" + ",".join("'" + hashlib.md5(("transition-league-" + kind + state).encode()).hexdigest() + "'::uuid"
    for kind in ("bracket", "pickem") for state in ("active", "locked", "complete")) + ")"

CHECKPOINTS = {
    "20261027000006": ("checkpoint-00006.sql", ["event_lifecycle_revisions", "event_lifecycle_audit"]),
    "20261027000007": ("checkpoint-00007.sql", ["event_notification_subscriptions", "event_notification_snapshots", "notification_attempts"]),
    "20261027000008": ("checkpoint-00008.sql", ["event_operator_audit", "event_operator_manifests", "event_provider_attempts"]),
    "20261027000010": ("checkpoint-00010.sql", ["event_pairing_reviews", "event_pairing_corrections"]),
    "20261027000013": ("checkpoint-00013.sql", ["league_competitor_names"]),
}

def populated(db, tables, label):
    for table in sorted(tables):
        check(label + ": nonempty " + table,
              sql(db, "select count(*)>0 from public." + table + ";", "populated precondition", False), "t")

def rename_contract(db, label):
    # Never resolve the new relation when rehearsing historical targets.
    if args.through < "20261027000013":
        return
    check(label + ": exact league-local names and untouched sibling leagues",
          sql(db, """with expected as (
            select md5('transition-league-'||kind||state)::uuid league_id,
                   md5('transition-template-'||kind)::uuid template_id, team team_id,
                   'Local '||kind||' '||state||' '||team name
            from unnest(array['bracket','pickem']) kind
            cross join unnest(array['active','locked']) state
            cross join unnest(array['A','B']) team)
            select count(*)=8 and bool_and(e.league_id is not null and n.league_id is not null
                and n.name is not distinct from e.name)
            from expected e full join public.league_competitor_names n
                using (league_id,template_id,team_id);""", "rename tenant isolation"), "t")
    check(label + ": rename service-only ACL and RLS",
          sql(db, """select
            (select relrowsecurity from pg_class where oid='public.league_competitor_names'::regclass)
            and not exists(select 1 from pg_policy where polrelid='public.league_competitor_names'::regclass)
            and not exists(
                select 1 from pg_class c cross join lateral aclexplode(c.relacl) a
                where c.oid='public.league_competitor_names'::regclass and a.grantee=0)
            and not exists(
                select 1 from pg_attribute c cross join lateral aclexplode(c.attacl) a
                where c.attrelid='public.league_competitor_names'::regclass and a.grantee=0)
            and (select bool_and(not has_table_privilege(r,'public.league_competitor_names',p))
                from unnest(array['anon','authenticated']) r
                cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p)
            and (select bool_and(not has_any_column_privilege(r,'public.league_competitor_names',p))
                from unnest(array['anon','authenticated']) r
                cross join unnest(array['SELECT','INSERT','UPDATE','REFERENCES']) p)
            and (select bool_and(has_table_privilege('service_role','public.league_competitor_names',p))
                from unnest(array['SELECT','INSERT','UPDATE','DELETE']) p);""", "rename grant boundary"), "t")

def oracle(db):
    check(db + ": original six leagues/twelve picks",
          sql(db, "select (select count(*) from leagues where id in " + LEGACY_IDS +
              ")||'/'||(select count(*) from picks where league_id in " + LEGACY_IDS + ");", "counts"), "6/12")
    check(db + ": original six independent 1/0 scores and ranks",
          sql(db, """select count(*)=12 and bool_and(v.total_points = case when p.display_name =
          case when l.name like '%locked' then 'B' else 'A' end then 1 else 0 end
          and v.rank = case when p.display_name = case when l.name like '%locked' then 'B' else 'A' end then 1 else 2 end)
          from v_leaderboard v join participants p on p.id=v.participant_id join leagues l on l.id=v.league_id
          where l.id in """ + LEGACY_IDS + ";", "score oracle"), "t")
    check(db + ": per-tenant pick linkage",
          sql(db, "select bool_and(p.league_id=pa.league_id) from picks p join participants pa on pa.id=p.participant_id;", "tenant oracle"), "t")

def pairing_hold_state(db):
    return sql(db, """select jsonb_build_object('disabled',lifecycle_disabled,'frozen',frozen,
        'generation',generation,'configurationVersion',configuration_version)
        from event_league_evaluations where league_id='b3610000-0000-4000-8000-000000000002';""",
        "pairing hold state", False)

def create_db(lane):
    db = "bracket_transition_" + run.lower() + "_" + lane
    command(["docker", "exec", CONTAINER, "createdb", "-U", "postgres", "--template=template0", db])
    owned.add(db)
    evidence["databases"].append(db)
    check(db + ": public starts empty", sql(db, "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public';", "empty public"), "0")
    # Supabase platform dependencies only. No application tables, data, auth data or secrets copied.
    sql(db, """create schema extensions;
create extension pgcrypto with schema extensions;
create extension pgtap with schema extensions;
create extension supabase_vault;
grant usage on schema public,extensions to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on functions to anon,authenticated,service_role;
""", "platform bootstrap")
    command(["docker", "exec", CONTAINER, "psql", "-X", "-U", "postgres", "-d", db,
             "-v", "ON_ERROR_STOP=1", "-c", 'alter database "' + db + '" set search_path=public,extensions;'])
    return db

try:
    migrations = sorted((ROOT / "supabase/migrations").glob("*.sql"))
    included = [p for p in migrations if p.name[:14] <= args.through]
    check("explicit upper migration exists", any(p.name[:14] == args.through for p in included))
    evidence["manifest"] = {str(p.relative_to(ROOT)): sha(p.read_text()) for p in included}
    evidence["excluded_migrations"] = [p.name for p in migrations if p not in included]
    evidence["integration_target"] = "00005 included; populated 00004 checkpoint before incarnation upgrade"
    evidence["inputs"] = {str(p.relative_to(ROOT)): sha(p.read_text()) for p in sorted(FIX.glob("*.sql"))}
    evidence["harness_sha256"] = sha(pathlib.Path(__file__).read_text())
    evidence["head"] = command(["git", "-C", str(ROOT), "rev-parse", "HEAD"]).strip()
    # Read-only preflight against installed postgres: never retrieves Vault contents or application rows.
    evidence["platform"] = command(["docker", "exec", CONTAINER, "psql", "-X", "-U", "postgres", "-d", "postgres", "-Atqc",
        "select version(); select extname||':'||extnamespace::regnamespace from pg_extension order by extname; select rolname from pg_roles where rolname in ('anon','authenticated','service_role') order by rolname;"]).strip()
    for lane in ["fresh", "legacy", "current"]:
        db = create_db(lane)
        cutoff = PRE_HISTORY if lane == "fresh" else LEGACY if lane == "legacy" else CURRENT
        for p in included:
            if p.name[:14] <= cutoff:
                file(db, p)
        file(db, FIX / "legacy.sql")
        oracle(db)
        before = snapshot(db)
        file(db, FIX / "legacy.sql")
        check(lane + ": setup replay identical", snapshot(db), before)
        if lane == "current":
            file(db, FIX / "canonical.sql")
            backfill(db, "bracket")
            backfill(db, "pickem")
            # Snapshot evidence before PR additions (new winner-membership table doesn't exist yet).
            evidence_before = {t: sql(db, "select jsonb_agg(to_jsonb(t)-'winner_nomination_ids' order by id) from " + t + " t;", t, False)
                               for t in ["contest_results", "result_audit_events", "notification_outbox"]}
        for p in included:
            if cutoff < p.name[:14] <= PRE_HISTORY:
                file(db, p)
        check(lane + ": old service reader survives upgrade", snapshot(db), before)
        oracle(db)
        if lane == "current":
            check("current: canonical evidence/outbox survive upgrade",
                  {t: sql(db, "select jsonb_agg(to_jsonb(t)-\'winner_nomination_ids\' order by id) from " + t + " t;", t, False) for t in evidence_before},
                  evidence_before)
        file(db, FIX / "canonical.sql")
        file(db, FIX / "canonical.sql")
        # Each template is a committed bounded batch; reconnect/resume after first batch.
        backfill(db, "bracket")
        check(lane + ": interrupted backfill leaves pickem untouched" if lane != "current" else lane + ": prior backfill retained",
              sql(db, "select count(*) from contest_results;", "batch count"), "1" if lane != "current" else "2")
        backfill(db, "pickem")
        after_backfill = retained(db)
        for repeat in range(2):
            backfill(db, "bracket")
            backfill(db, "pickem")
            check(lane + ": backfill replay " + str(repeat + 1), retained(db), after_backfill)
        check(lane + ": old reader survives canonical backfill", snapshot(db), before)
        # Committed pre-ledger histories in each replay-built lane.
        oracle(db)
        file(db, FIX / "incarnation-before.sql")
        incarnation_reader = snapshot(db)
        extant = sql(db, "select jsonb_agg(jsonb_build_array(league_id,window_key,version,cutoff) order by league_id,window_key) from event_league_windows;", "pre-upgrade extant history")
        pre_history_data = retained(db)
        for p in included:
            if PRE_HISTORY < p.name[:14] <= PIN:
                file(db, p)
        check(lane + ": 00005 old service reader", snapshot(db), incarnation_reader)
        oracle(db)
        post_history_data = retained(db)
        post_history_data.pop("event_window_incarnation_history")
        check(lane + ": 00005 existing whole rows preserved", post_history_data, pre_history_data)
        check(lane + ": exact extant ledger seeding",
              sql(db, "select jsonb_agg(jsonb_build_array(league_id,window_key,last_version,earliest_cutoff) order by league_id,window_key) from event_window_incarnation_history;", "seeded history"), extant)
        check(lane + ": deleted pre-upgrade history explicitly unrecoverable",
              sql(db, "select count(*) from event_window_incarnation_history where league_id=md5('transition-incarnation-lost')::uuid;", "missing prior history"), "0")
        # Verify each upgrade before checkpoint fixture mutations.
        populated_tables = set()
        for migration in included:
            if migration.name[:14] > PIN:
                populated(db, populated_tables, lane + ": before " + migration.name)
                reader_before_upgrade = snapshot(db)
                before_upgrade = retained(db)
                file(db, migration)
                after_upgrade = retained(db)
                check(lane + ": old reader preserved by " + migration.name, snapshot(db), reader_before_upgrade)
                oracle(db)
                populated(db, populated_tables, lane + ": after " + migration.name)
                if migration.name[:14] == "20261027000007":
                    # New nullable columns must be null on all preexisting legacy intents.
                    outbox = json.loads(after_upgrade["notification_outbox"])
                    added = ["lifecycle_audit_id", "subscription_id", "notification_basis", "binding_id"]
                    check(lane + ": legacy outbox new fields null",
                          all(all(row.get(key) is None for key in added) for row in outbox))
                    for row in outbox:
                        for key in added:
                            row.pop(key, None)
                    after_upgrade["notification_outbox"] = json.dumps(outbox)
                # Newly introduced evidence tables must not manufacture historical rows.
                added_tables = set(after_upgrade) - set(before_upgrade)
                check(lane + ": no fabricated evidence by " + migration.name,
                      all(json.loads(after_upgrade[t]) == [] for t in added_tables))
                # Compare parsed rows: SQL JSON whitespace is not a data mutation.
                check(lane + ": existing data preserved by " + migration.name,
                      {t: json.loads(v) for t, v in after_upgrade.items() if t in before_upgrade},
                      {t: json.loads(v) for t, v in before_upgrade.items()})
                checkpoint = CHECKPOINTS.get(migration.name[:14])
                if checkpoint:
                    fixture, required = checkpoint
                    checkpoint_before = retained(db) if migration.name[:14] == "20261027000013" else None
                    file(db, FIX / fixture)
                    if checkpoint_before is not None:
                        checkpoint_after = retained(db)
                        check(lane + ": rename fixture preserves all legacy and template rows",
                              {t: v for t, v in checkpoint_after.items() if t != "league_competitor_names"},
                              {t: v for t, v in checkpoint_before.items() if t != "league_competitor_names"})
                        check(lane + ": rename fixture preserves old service reader", snapshot(db), reader_before_upgrade)
                        oracle(db)
                        rename_contract(db, lane + ": 00013 checkpoint")
                        file(db, FIX / fixture)
                        check(lane + ": rename checkpoint replay identical", retained(db), checkpoint_after)
                    populated_tables.update(required)
                    populated(db, populated_tables, lane + ": checkpoint " + migration.name)
        # Isolate rename repair on populated rows before unrelated repair safety holds.
        if args.through >= "20261027000013":
            rename_saved = retained(db)
            rename_reader = snapshot(db)
            rename_repair = ROOT / "supabase/rollbacks/20261027000013_league_competitor_names_forward_repair.sql"
            for repeat in range(2):
                file(db, rename_repair)
                check(lane + ": isolated 00013 whole-row preservation " + str(repeat + 1), retained(db), rename_saved)
                check(lane + ": isolated 00013 legacy reader " + str(repeat + 1), snapshot(db), rename_reader)
                populated(db, populated_tables, lane + ": isolated 00013")
                rename_contract(db, lane + ": isolated 00013 replay " + str(repeat + 1))
                oracle(db)
        # Exercise 00010 before broad earlier repairs can pre-disable its target.
        if args.through >= "20261027000010":
            pairing_repair = ROOT / "supabase/rollbacks/20261027000010_reviewed_pairings_forward_repair.sql"
            pairing_saved = retained(db)
            pairing_reader = snapshot(db)
            pairing_before = json.loads(pairing_hold_state(db))
            check(lane + ": isolated pairing target initially enabled", pairing_before["disabled"], False)
            check(lane + ": adopted review and exact held correction",
                  sql(db, """select exists(select 1 from event_pairing_reviews
                    where league_id='b3610000-0000-4000-8000-000000000002' and status='adopted'
                    and from_version=1 and to_version=2 and pairings='{"m":["A","B"]}'::jsonb)
                    and exists(select 1 from event_pairing_corrections
                    where league_id='b3610000-0000-4000-8000-000000000002'
                    and configuration_version=2 and pairings='{"m":["A","C"]}'::jsonb);""", "pairing histories"), "t")
            for repeat in range(2):
                file(db, pairing_repair)
                expected = dict(pairing_before, disabled=True, frozen=True, generation=pairing_before["generation"] + 1)
                check(lane + ": isolated 00010 targeted hold " + str(repeat + 1), json.loads(pairing_hold_state(db)), expected)
                check(lane + ": isolated 00010 complete row preservation " + str(repeat + 1), retained(db), pairing_saved)
                check(lane + ": isolated 00010 reader " + str(repeat + 1), snapshot(db), pairing_reader)
                populated(db, populated_tables, lane + ": isolated 00010")
        # Earlier isolated forward repairs restore historical definitions; restore current conflict semantics last.
        if args.through >= "20261027000012":
            file(db, ROOT / "supabase/rollbacks/20261027000012_http_business_conflicts_forward_repair.sql")
        file(db, FIX / "incarnation-after.sql")
        check(lane + ": absent post-upgrade key retains v5 and tighter deadline",
              sql(db, """select h.last_version=5 and h.earliest_cutoff=(j.value->>3)::timestamptz-interval '1 hour'
                and not exists(select 1 from event_league_windows w where w.league_id=h.league_id)
                from event_window_incarnation_history h cross join jsonb_array_elements('""" + extant + """'::jsonb) j
                where h.league_id=md5('transition-incarnation-live')::uuid and j.value->>0=h.league_id::text;""",
                  "durable absent history"), "t")
        hold = ROOT / "supabase/rollbacks/20261027000005_window_incarnation_history_forward_repair.sql"
        hold_data = retained(db)
        evaluation_before = sql(db, "select jsonb_agg(jsonb_build_array(league_id,generation,frozen) order by league_id) from event_league_evaluations;", "before isolated hold")
        file(db, hold)
        check(lane + ": isolated hold advances only newly frozen",
              sql(db, """select bool_and(e.frozen and e.generation=(j.value->>1)::bigint+
                  case when (j.value->>2)::boolean then 0 else 1 end)
                  from event_league_evaluations e cross join jsonb_array_elements('""" + evaluation_before + """'::jsonb) j
                  where e.league_id::text=j.value->>0;""", "isolated hold generation"), "t")
        frozen = sql(db, "select jsonb_agg(to_jsonb(e) order by league_id) from event_league_evaluations e;", "frozen evaluations")
        file(db, hold)
        check(lane + ": isolated 00005 hold replay identical",
              sql(db, "select jsonb_agg(to_jsonb(e) order by league_id) from event_league_evaluations e;", "replayed evaluations"), frozen)
        check(lane + ": isolated hold preserves populated and absent histories", retained(db), hold_data)
        file(db, FIX / "incarnation-held.sql")
        check(lane + ": uncertain-history valid-token rejection writes no picks",
              sql(db, "select count(*) from picks where league_id=md5('transition-incarnation-lost')::uuid;", "held admission"), "0")
        # Actual pgTAP contracts run on replay-built schema, not installed application schema.
        for test in ["27_typed_outcomes_test.sql", "28_prediction_windows_test.sql", "DB29_window_integrity_test.sql", "30_security_boundary_test.sql", "DB31_window_incarnation_history_test.sql"]:
            test_path = ROOT / "supabase/tests/database" / test
            test_digest = sha(test_path.read_text())
            if test in evidence.setdefault("test_hashes", {}):
                check(lane + ": stable test " + test, test_digest, evidence["test_hashes"][test])
            evidence["test_hashes"][test] = test_digest
            output = file(db, test_path)
            tap_numbers = [int(n) for n in re.findall(r"(?m)^ok ([0-9]+)", output)]
            plans = re.findall(r"(?m)^1\.\.([0-9]+)$", output)
            check(lane + ": " + test, len(plans) == 1 and tap_numbers == list(range(1, int(plans[0]) + 1))
                  and not re.search(r"(?m)^not ok|Looks like you failed|Bail out!", output))
            evidence.setdefault("tap_counts", {})[lane + ":" + test] = len(tap_numbers)
        file(db, FIX / "typed.sql")
        repair_reader = snapshot(db)
        check(lane + ": new format gated from legacy binary",
              sql(db, "select legacy_event_format_supported(md5('transition-typed-league')::uuid);", "typed gate"), "f")
        populated(db, populated_tables, lane + ": before all repairs")
        saved = retained(db)
        repairs = [p for p in sorted((ROOT / "supabase/rollbacks").glob("*_forward_repair.sql")) if "20261027000001" <= p.name[:14] <= args.through]
        evidence["repairs"] = {str(p.relative_to(ROOT)): sha(p.read_text()) for p in repairs}
        for repeat in range(2):
            for repair in repairs:
                file(db, repair)
                populated(db, populated_tables, lane + ": after " + repair.name)
                check(lane + ": repair step preservation " + repair.name + ":" + str(repeat + 1), retained(db), saved)
                rename_contract(db, lane + ": after " + repair.name + ":" + str(repeat + 1))
            oracle(db)
            check(lane + ": repair data preservation " + str(repeat + 1), retained(db), saved)
            check(lane + ": repair old reader " + str(repeat + 1), snapshot(db), repair_reader)
            check(lane + ": typed repair frozen " + str(repeat + 1),
                  sql(db, "select frozen from event_league_evaluations where league_id=md5('transition-typed-league')::uuid;", "typed safety hold"), "t")
            check(lane + ": typed history survives " + str(repeat + 1),
                  sql(db, "select read_contest_result_typed(md5('transition-set-result')::uuid,true)->>'outcomeType';", "typed historical reader"), "winner_set")
        sql(db, """do $$
begin
  begin
    perform submit_event_window(md5('transition-typed-league')::uuid,md5('transition-typed-magic')::uuid,'w1',1,'{"m1":"home"}');
    raise exception 'repair failed to block writes';
  exception when sqlstate '40001' then null; end;
  begin
    insert into contest_results(contest_id,event_edition_id,version,result_status,outcome_type,winner_nomination_ids,source_type,supersedes_result_id,idempotency_key)
    values(md5('transition-category')::uuid,md5('transition-edition')::uuid,2,'awarded','winner_set',
      array[md5('transition-nomination-n1')::uuid],'operator',md5('transition-set-result')::uuid,'transition-blocked-set');
    raise exception 'repair failed to pause admission';
  exception when sqlstate '55000' then null; end;
end $$;""".replace("sqlstate '40001'", "sqlstate 'PT409'" if args.through >= "20261027000012" else "sqlstate '40001'"), "repair rejects writes and winner-set admissions")
        check(lane + ": failed admissions preserve all data", retained(db), saved)
        rename_contract(db, lane + ": final")
        check(lane + ": browser table access closed",
              sql(db, "select not has_table_privilege('anon','leagues','select') and not has_table_privilege('authenticated','picks','select') and has_table_privilege('service_role','picks','select');", "grant boundary"), "t")
    check("migration inputs unchanged during run",
          {str(p.relative_to(ROOT)): sha(p.read_text()) for p in included}, evidence["manifest"])
    check("synthetic inputs unchanged during run",
          {str(p.relative_to(ROOT)): sha(p.read_text()) for p in sorted(FIX.glob("*.sql"))}, evidence["inputs"])
    check("test inputs unchanged during run",
          {name: sha((ROOT / "supabase/tests/database" / name).read_text()) for name in evidence["test_hashes"]}, evidence["test_hashes"])
    check("repair inputs unchanged during run",
          {name: sha((ROOT / name).read_text()) for name in evidence["repairs"]}, evidence["repairs"])
    check("harness unchanged during run", sha(pathlib.Path(__file__).read_text()), evidence["harness_sha256"])
    evidence["status"] = "passed"
except Exception as exc:
    evidence["status"] = "failed"
    evidence["failure"] = str(exc)
finally:
    evidence["retention"] = "All named databases retained. No reset, DROP DATABASE, migration-history edits, hosted access, or provider transport."
    output = FIX / ("evidence-" + run + ".json")
    output.write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps({"status": evidence.get("status"), "evidence": str(output), "databases": evidence["databases"],
                      "assertions": len(evidence["assertions"]), "failure": evidence.get("failure")}, indent=2))
sys.exit(0 if evidence["status"] == "passed" else 1)
