#!/usr/bin/env python3
"""Fresh local disposable DB only. Independent probes plus labeled supporting tests."""
import importlib.util,json,subprocess,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
# Additional independently-authored atomicity/destructive-bypass probes roll back.
import sys,re
if len(sys.argv)>1:
 assert len(sys.argv)==3 and sys.argv[1]=="--extra" and re.fullmatch(r"bracket_lifecycle_[0-9a-f]{12}",sys.argv[2])
 argv=["docker","exec","-i","supabase_db_bracket-fyi","psql","-X","-U","postgres","-d",sys.argv[2],"-Atq","-v","ON_ERROR_STOP=1"]
 def extra_sql(s):
  r=subprocess.run(argv,input=s,text=True,capture_output=True,timeout=60)
  assert r.returncode==0,r.stdout+r.stderr
  print(r.stdout+r.stderr,flush=True)
  assert "not ok" not in r.stdout,r.stdout
 extra_sql("""begin;
 select jsonb_build_object('probe','before_service_truncate','attempts',count(*),'protected',count(*) filter(where worker_incarnation is not null)) from notification_attempts;
 set local role service_role;
 truncate notification_attempts;
 reset role;
 select jsonb_build_object('probe','after_service_truncate','attempts',count(*)) from notification_attempts;
 rollback;
 begin;
 select jsonb_build_object('probe','before_service_outbox_truncate','intents',count(*),'protected',count(*) filter(where subscription_id is not null)) from notification_outbox;
 set local role service_role;
 truncate notification_attempts,notification_outbox;
 reset role;
 select jsonb_build_object('probe','after_service_outbox_truncate','intents',count(*)) from notification_outbox;
 rollback;""")
 fixture=(ROOT/"supabase/tests/database/DB33_event_notifications_test.sql").read_text()
 fixture=fixture[fixture.index("insert into organizations"):fixture.index("-- FIXTURE_END")].replace("a3300000","c9ae0000").replace("db33","independent-atomic")
 extra_sql("begin;select no_plan();"+fixture+"""
 select set_event_notification_consent('c9ae0000-0000-4000-8000-000000000011','c9ae0000-0000-4000-8000-000000000201','c9ae0000-0000-4000-8000-000000000101','fake://independent',array['broadcast','result_final','league_complete'],true);
 create function pg_temp.ia_reconcile() returns jsonb language plpgsql as $$
 declare c jsonb; begin
 c:=capture_event_lifecycle('c9ae0000-0000-4000-8000-000000000011');
 return commit_event_lifecycle('c9ae0000-0000-4000-8000-000000000011',(c->>'generation')::bigint,c->>'basisToken',
 '[{"id":"c9ae0000-0000-4000-8000-000000000101","earned":0,"maximum":1,"wrong":0,"pending":1,"rank":1}]');
 end $$;
 select pg_temp.ia_reconcile();
 create function pg_temp.reject_intent() returns trigger language plpgsql as $$begin raise exception 'independent injected intent failure' using errcode='P0001'; end$$;
 create trigger independent_reject_intent before insert on notification_outbox for each row execute function pg_temp.reject_intent();
 set local role service_role;
 select throws_ok($q$select emit_event_notification('c9ae0000-0000-4000-8000-000000000011','broadcast','atomic-test',
 capture_event_lifecycle('c9ae0000-0000-4000-8000-000000000011')->>'basisToken',null,'c9ae0000-0000-4000-8000-000000000021','Must rollback')$q$,'P0001','independent injected intent failure','enqueue failure propagates');
 reset role;
 select is((select count(*) from event_lifecycle_audit where league_id='c9ae0000-0000-4000-8000-000000000011' and kind='notification'),0::bigint,'notification audit rolled back');
 select ok((select announcement_text is distinct from 'Must rollback' from leagues where id='c9ae0000-0000-4000-8000-000000000011'),'announcement rolled back');
 insert into contest_results(contest_id,event_edition_id,version,result_status,outcome_type,source_type,idempotency_key)
 values('c9ae0000-0000-4000-8000-000000000004','c9ae0000-0000-4000-8000-000000000003',1,'final','draw','system','independent-final');
 set local role service_role;
 select throws_ok('select pg_temp.ia_reconcile()','P0001','independent injected intent failure','lifecycle commit aborts on intent failure');
 reset role;
 select is((select lifecycle_state from event_league_evaluations where league_id='c9ae0000-0000-4000-8000-000000000011'),'locked','completion rolled back');
 select is((select count(*) from event_lifecycle_audit where league_id='c9ae0000-0000-4000-8000-000000000011' and kind='coronation'),0::bigint,'coronation rolled back');
 select * from finish();rollback;""")
 # Expiry must also be sampled after waiting on the credential/grant row itself.
 specx=importlib.util.spec_from_file_location("expiry",ROOT/"scripts/verify-event-lifecycle-races.py")
 ex=importlib.util.module_from_spec(specx);specx.loader.exec_module(ex)
 ex.BASE[ex.BASE.index("-d")+1]=sys.argv[2]
 import time
 for table in ["event_operator_credentials","event_operator_grants"]:
  ex.sql("update event_operator_credentials set expires_at='infinity';update event_operator_grants set expires_at='infinity';")
  version=ex.sql("select version from event_runtime_control;")
  ex.sql("update "+table+" set expires_at=clock_timestamp()+interval '10 seconds';")
  def expired():
   end=time.monotonic()+20
   while ex.sql("select bool_and(expires_at<clock_timestamp()) from "+table)!="t":
    assert time.monotonic()<end
    time.sleep(.02)
  cmd="""select event_operator_command('synthetic-operator-credential-34','local',null,'global.stop',"""+version+""",'row expiry wait','{"stopped":false}');"""
  result=ex.barrier("select * from "+table+" for update;",[cmd],expired)
  print("INDEPENDENT expiry during "+table+" row lock: "+json.dumps(result),flush=True)
 sys.exit(0)
spec=importlib.util.spec_from_file_location("nr",ROOT/"scripts/verify-event-notification-races.py")
nr=importlib.util.module_from_spec(spec);spec.loader.exec_module(nr)
db="bracket_lifecycle_"+uuid.uuid4().hex[:12]
subprocess.run(["docker","exec","supabase_db_bracket-fyi","createdb","-U","postgres","--template=template0",db],check=True)
nr.base.BASE[nr.base.BASE.index("-d")+1]=db
sql=nr.sql
print("INDEPENDENT DATABASE "+db,flush=True)
sql("""create schema extensions;create extension pgcrypto with schema extensions;create extension pgtap with schema extensions;create extension supabase_vault;
grant usage on schema public,extensions to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on functions to anon,authenticated,service_role;
alter database """+db+" set search_path=public,extensions;")
for p in sorted((ROOT/"supabase/migrations").glob("*.sql")):
 if p.name[:14]<="20261027000006":sql(p.read_text())
subprocess.run(["python3",str(ROOT/"scripts/verify-window-lifecycle-independent-review.py"),db],check=True)
sql((ROOT/"supabase/migrations/20261027000007_event_notifications.sql").read_text())
tap=sql((ROOT/"supabase/tests/database/DB33_event_notifications_test.sql").read_text())
assert "not ok" not in tap,tap
print("SUPPORTING DB33 "+str(sum(s.startswith("ok ") for s in tap.splitlines())),flush=True)
print("SUPPORTING notification barriers "+json.dumps(nr.races()),flush=True)
sql((ROOT/"supabase/migrations/20261027000008_event_operator_controls.sql").read_text())
tap=sql((ROOT/"supabase/tests/database/DB34_event_operator_controls_test.sql").read_text())
assert "not ok" not in tap,tap
print("SUPPORTING DB34 "+str(sum(s.startswith("ok ") for s in tap.splitlines())),flush=True)
# Catalog rather than merely source inspection of inherited defaults and old helpers.
print(sql("""select jsonb_build_object('probe','direct_write_acl','bindingMode',has_column_privilege('service_role','provider_bindings','mode','update'),
'fetchEnabled',has_column_privilege('service_role','provider_bindings','fetch_enabled','update'),
'control',has_table_privilege('service_role','event_runtime_control','insert,update,delete,truncate'),
'outboxTruncate',has_table_privilege('service_role','notification_outbox','truncate'),
'attemptTruncate',has_table_privilege('service_role','notification_attempts','truncate'));
select jsonb_build_object('probe','unexpected_execute','name',p.proname,'anon',has_function_privilege('anon',p.oid,'execute'),
'authenticated',has_function_privilege('authenticated',p.oid,'execute'))
from pg_proc p where p.pronamespace='public'::regnamespace and
(p.proname like '%event_notification%' or p.proname like '%event_operator%' or p.proname like '%event_provider_attempt%' or p.proname like '%before_operator_controls%')
and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'));
"""),flush=True)
fixture=(ROOT/"supabase/tests/database/DB34_event_operator_controls_test.sql").read_text().split("create function pg_temp.op34(")[0].replace("begin;","").replace("select no_plan();","")
sql(fixture)
print(sql("""begin;
select no_plan();
delete from event_runtime_control;
set local role service_role;
select throws_ok($q$select event_operator_command('synthetic-operator-credential-34','local',null,'global.stop',0,'missing control','{"stopped":false}')$q$,'42501',null,'missing singleton rejects operator');
select is((select outcome from project_provider_result('b3400000-0000-4000-8000-000000000099')),'skipped_non_write','missing singleton stops result projection');
select is((select outcome from project_structural_observation('b3400000-0000-4000-8000-000000000099')),'skipped_non_write','missing singleton stops structural projection');
select is(admit_event_provider_attempt('b3400000-0000-4000-8000-000000000008','synthetic-lease','no-budget')->>'allowed','false','missing singleton stops provider before reservation');
select is(admit_event_notification((select id from notification_outbox where subscription_id is not null limit 1),'b3400000-0000-4000-8000-000000000099')->>'reason','stopped','missing singleton stops notification');
reset role;
select * from finish();
rollback;
"""),flush=True)
# Test an expired grant after waiting, using a real observed lock barrier.
sql("update event_operator_grants set expires_at=clock_timestamp()+interval '2 seconds' where action='health.read';")
def cross():
 import time
 end=time.monotonic()+8
 while sql("select bool_and(expires_at<clock_timestamp()) from event_operator_grants where action='health.read';")!="t":
  assert time.monotonic()<end
  time.sleep(.02)
cmd="""select event_operator_command('synthetic-operator-credential-34','local','b3400000-0000-4000-8000-000000000004','health.read',0,'expiry wait','{"bindingId":"b3400000-0000-4000-8000-000000000007"}');"""
r=nr.barrier("select * from event_runtime_control for update;",[cmd],cross)
assert r[0][0]!=0 and "operator unauthorized" in r[0][2],r
print("INDEPENDENT grant expiry after observed global-lock wait denied",flush=True)
# Protected rows cannot lose protection by clearing marker columns.
print(sql("""begin;select no_plan();set local role service_role;
select throws_ok($q$update notification_outbox set subscription_id=null,lifecycle_audit_id=null where subscription_id is not null$q$,'42501',null,'marker stripping rejected');
select throws_ok($q$delete from notification_attempts where worker_incarnation is not null$q$,'42501',null,'protected attempt deletion rejected');
reset role;select * from finish();rollback;"""),flush=True)
print("DONE "+db,flush=True)
