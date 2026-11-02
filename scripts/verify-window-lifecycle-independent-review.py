#!/usr/bin/env python3
"""Independent read-only-source review probes. Disposable Docker database only.
Usage: python3 scripts/verify-window-lifecycle-independent-review.py --database bracket_review_<hex>
Independent probes roll back; --barriers retains synthetic fixtures. Selected DB must exist.
"""
import argparse
import os
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
def disposable_database(value):
    if not re.fullmatch(r"bracket_[a-z0-9_]{1,55}", value):
        raise argparse.ArgumentTypeError("database must be a disposable bracket_* name (lowercase letters, digits, underscores; max 63 characters)")
    return value


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--database", required=True, type=disposable_database,
                    help="Explicit disposable bracket_* database; no default target.")
parser.add_argument("--business-sqlstate", choices=("PT409", "40001"), default="PT409",
                    help="Expected business conflict: PT409 current schema, 40001 historical schema.")
parser.add_argument("--barriers", action="store_true", help="Also rerun existing race harnesses against this disposable DB.")
args = parser.parse_args()
CONTAINER = os.environ.get("BRACKET_TEST_DB_CONTAINER", "supabase_db_bracket-fyi")
if CONTAINER != "supabase_db_bracket-fyi" and not re.fullmatch(r"bracket-p11-db-[a-f0-9]{12}", CONTAINER):
    raise ValueError("Only the known local or owned isolated DB container is allowed")
BASE = ["docker", "exec", "-i", CONTAINER, "psql", "-X", "-U",
        "postgres", "-d", args.database, "-Atq", "-v", "ON_ERROR_STOP=1"]
def run(sql):
    p = subprocess.run(BASE, input="set statement_timeout='20s';\n" + sql,
                       text=True, capture_output=True, timeout=60)
    if p.returncode:
        raise RuntimeError(p.stdout + p.stderr)
    return p.stdout
# Existing regressions are supporting evidence, not the independent oracle.
for name in ["DB31_window_incarnation_history_test.sql", "DB32_event_lifecycle_test.sql"]:
    output = run((ROOT / "supabase/tests/database" / name).read_text())
    if "not ok" in output:
        raise AssertionError(output)
    print(name + ": all assertions passed", flush=True)

# Independently generated two-window fixture: first window legitimately deleted
# before its cutoff, second stays open. The durable cutoff must close enrollment.
probe = """
begin;
insert into templates(id,name,type) values
 ('e5a10000-0000-4000-8000-000000000001','SYNTHETIC independent cutoff review','bracket');
insert into event_template_configs(template_id,version,sealed,manifest) values
 ('e5a10000-0000-4000-8000-000000000001',1,true,
 '{"markets":[{"id":"early","windowId":"first","choices":["a"]},{"id":"late","windowId":"second","choices":["a"]}]}');
insert into leagues(id,name,template_id,organizer_token,join_token) values
 ('e5a10000-0000-4000-8000-000000000002','SYNTHETIC review','e5a10000-0000-4000-8000-000000000001','e5a10000-0000-4000-8000-000000000003','e5a10000-0000-4000-8000-000000000004');
insert into event_league_evaluations(league_id,configuration_version) values
 ('e5a10000-0000-4000-8000-000000000002',1);
set local role service_role;
select configure_event_window('e5a10000-0000-4000-8000-000000000002','first',0,'open',clock_timestamp()+interval '1 second',true,array['early']);
select configure_event_window('e5a10000-0000-4000-8000-000000000002','second',0,'open',clock_timestamp()+interval '1 day',true,array['late']);
select configure_event_window('e5a10000-0000-4000-8000-000000000002','first',1,null,null,null,null,true);
select pg_sleep(1.1);
select jsonb_build_object('probe','elapsed_history','closed',event_membership_closed('e5a10000-0000-4000-8000-000000000002'),
 'elapsed',earliest_cutoff<=clock_timestamp()) from event_window_incarnation_history
 where league_id='e5a10000-0000-4000-8000-000000000002' and window_key='first';
do $$
declare joined uuid;
begin
 begin
  select participant_id into joined from join_event_league('e5a10000-0000-4000-8000-000000000002','e5a10000-0000-4000-8000-000000000004','Late entrant');
  raise notice 'FINDING WL-01: late enrollment accepted: %',joined;
 exception when sqlstate '__BUSINESS_SQLSTATE__' then raise notice 'PASS: late enrollment rejected'; end;
end $$;
select jsonb_build_object('probe','late_enrollment','participants',count(*)) from participants where league_id='e5a10000-0000-4000-8000-000000000002';
reset role;
rollback;
"""
p = subprocess.run(BASE,input=probe.replace("__BUSINESS_SQLSTATE__", args.business_sqlstate),text=True,capture_output=True,timeout=60)
if p.returncode:
    raise RuntimeError(p.stdout+p.stderr)
print(p.stdout+p.stderr,flush=True)

# Invalid pick basis is explicitly detected by capture. Does scanning one bad
# league suppress all independent leagues in a page instead of returning a cursor?
fixture = (ROOT / "supabase/tests/database/DB32_event_lifecycle_test.sql").read_text()
fixture = fixture[fixture.index("insert into organizations"):fixture.index("create temp table")]
fixture = fixture.replace("a3200000","e5a20000").replace("db32","independent-scan")
probe = "begin;\n"+fixture+"""
insert into participants(id,league_id,display_name) values
 ('e5a20000-0000-4000-8000-000000000060','e5a20000-0000-4000-8000-000000000011','SYNTHETIC legacy basis');
insert into picks(league_id,participant_id,slot_id,team_id,event_configuration_version) values
 ('e5a20000-0000-4000-8000-000000000011','e5a20000-0000-4000-8000-000000000060','m','home',null);
set local role service_role;
do $$
begin
 begin
  perform * from scan_event_lifecycle_work('e5a20000-0000-4000-8000-000000000010',500);
  raise notice 'PASS: scan survives invalid league basis';
 exception when sqlstate '__BUSINESS_SQLSTATE__' then
  raise notice 'FINDING WL-02: scan aborts entire page on invalid pick basis';
 end;
end $$;
select jsonb_build_object('probe','healthy_later_league_capture','league',capture_event_lifecycle('e5a20000-0000-4000-8000-000000000012')->>'leagueId');
reset role;
rollback;
"""
p = subprocess.run(BASE,input=probe.replace("__BUSINESS_SQLSTATE__", args.business_sqlstate),text=True,capture_output=True,timeout=60)
if p.returncode:
    raise RuntimeError(p.stdout+p.stderr)
print(p.stdout+p.stderr,flush=True)

print(run("""
select jsonb_build_object('probe','rpc_browser_grants','unexpected',count(*))
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
 ('event_lifecycle_hash','assert_event_lifecycle_configuration','event_lifecycle_effective',
 'event_lifecycle_basis','capture_event_lifecycle','mutate_event_lifecycle',
 'fanout_event_lifecycle_result','commit_event_lifecycle','read_event_lifecycle','scan_event_lifecycle_work')
and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'));
select jsonb_build_object('probe','service_direct_ack','allowed',
 has_column_privilege('service_role','public.event_league_evaluations','evaluated_generation','update'));
select jsonb_build_object('probe','history_service_mutation','allowed',
 has_table_privilege('service_role','public.event_window_incarnation_history','insert,update,delete,truncate'));
"""),flush=True)

# Repeating a legitimate whole basis after a time-limited completion hold must
# retain both evaluated transitions, not silently deduplicate the recompletion.
audit_fixture = fixture.replace("e5a20000", "e5a30000").replace("independent-scan", "independent-audit")
probe = "begin;\n" + audit_fixture + """
insert into contest_results(contest_id,event_edition_id,version,result_status,outcome_type,source_type,idempotency_key)
values('e5a30000-0000-4000-8000-000000000004','e5a30000-0000-4000-8000-000000000003',1,'final','draw','system','independent-audit-result');
set local role service_role;
do $$ declare s jsonb; begin
 s:=capture_event_lifecycle('e5a30000-0000-4000-8000-000000000011');
 raise notice 'initial: %', commit_event_lifecycle((s->>'leagueId')::uuid,(s->>'generation')::bigint,s->>'basisToken','[]');
end $$;
reset role;
insert into league_completion_holds(league_id,event_edition_id,hold_key,reason,created_by_fingerprint,idempotency_key,expires_at)
values('e5a30000-0000-4000-8000-000000000011','e5a30000-0000-4000-8000-000000000003','review','SYNTHETIC expiry review',repeat('a',64),'independent-audit-hold',clock_timestamp()+interval '1 second');
set local role service_role;
do $$ declare s jsonb; begin
 s:=capture_event_lifecycle('e5a30000-0000-4000-8000-000000000011');
 raise notice 'held: %', commit_event_lifecycle((s->>'leagueId')::uuid,(s->>'generation')::bigint,s->>'basisToken','[]');
end $$;
select pg_sleep(1.1);
do $$ declare s jsonb; begin
 s:=capture_event_lifecycle('e5a30000-0000-4000-8000-000000000011');
 raise notice 'recomplete: %', commit_event_lifecycle((s->>'leagueId')::uuid,(s->>'generation')::bigint,s->>'basisToken','[]');
end $$;
select jsonb_build_object('probe','hold_expiry_audit_cycle','transitions',jsonb_agg(details order by created_at))
 from event_lifecycle_audit where league_id='e5a30000-0000-4000-8000-000000000011' and kind='evaluated';
select jsonb_build_object('probe','hold_expiry_state','state',read_event_lifecycle('e5a30000-0000-4000-8000-000000000011')->>'state',
 'coronations',(select count(*) from event_lifecycle_audit where league_id='e5a30000-0000-4000-8000-000000000011' and kind='coronation'));
reset role;
rollback;
"""
p = subprocess.run(BASE,input=probe,text=True,capture_output=True,timeout=60)
if p.returncode:
    raise RuntimeError(p.stdout+p.stderr)
print(p.stdout+p.stderr,flush=True)

if args.barriers:
    import importlib.util
    for script in ["verify-window-incarnation-races.py", "verify-event-lifecycle-races.py"]:
        spec = importlib.util.spec_from_file_location("review_barrier", ROOT / "scripts" / script)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        print("Supporting barrier harness: " + script + "; actual DB=" + args.database, flush=True)
        module.main(["--database", args.database, "--business-sqlstate", args.business_sqlstate])
