"""Serialized owned local proof; never emits process diagnostics or credentials."""
import argparse,hashlib,importlib.util,json,os,subprocess,time,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"tmp/family-runtime"
OUT.mkdir(exist_ok=True)
def hashes():
 paths=list((ROOT/"lib/ingestion/providers").glob("balldontlie*.ts"))+list((ROOT/"supabase/migrations").glob("2026102700001[45]*"))+[ROOT/"tests/events/provider-four-family-vertical-db.test.ts"]
 return {str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
def databases():
 p=subprocess.run(["docker","exec","supabase_db_bracket-fyi","psql","-X","-U","postgres","-d","postgres","-Atq","-c","select datname from pg_database where datname ~ '^bracket_family_vertical_[a-f0-9]{12}$' order by datname"],capture_output=True,text=True,timeout=30)
 if p.returncode:raise RuntimeError("Database inventory failed")
 return set(p.stdout.split())
def sqlproof():
 stamp=str(time.time_ns())
 resultfile=OUT/(stamp+"-vitest-private.json")
 env=os.environ.copy();env["BRACKET_FOUR_FAMILY_VERTICAL_DB_TEST"]="1"
 before_dbs=databases()
 evidence={"before":hashes()}
 p=subprocess.run(["node","node_modules/vitest/vitest.mjs","run","tests/events/provider-four-family-vertical-db.test.ts","--reporter=json","--outputFile="+str(resultfile)],cwd=ROOT,env=env,capture_output=True,text=True,timeout=600)
 evidence["exit"]=p.returncode;evidence["after"]=hashes()
 evidence["databases"]=sorted(databases()-before_dbs)
 evidence["stopped"]={}
 for db in evidence["databases"]:
  check=subprocess.run(["docker","exec","supabase_db_bracket-fyi","psql","-X","-U","postgres","-d",db,"-Atq","-c","select global_stopped and not notifications_enabled and not real_sends_enabled from event_runtime_control"],capture_output=True,text=True,timeout=30)
  evidence["stopped"][db]=check.returncode==0 and check.stdout.strip()=="t"
 if resultfile.exists():
  resultfile.chmod(0o600);raw=json.loads(resultfile.read_text())
  evidence["counts"]={k:raw.get(k) for k in ["numPassedTests","numFailedTests","numPendingTests"]}
  evidence["tests"]=[{"name":t["fullName"],"status":t["status"]} for suite in raw["testResults"] for t in suite["assertionResults"]]
 out=OUT/(stamp+"-sql.json");out.write_text(json.dumps(evidence,indent=2));print(json.dumps({"evidence":str(out),"exit":p.returncode,"counts":evidence.get("counts")}))
 return p.returncode
def upgrade():
 spec=importlib.util.spec_from_file_location("http",ROOT/"scripts/local-event-http.py");m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 state=json.loads((m.STATE/"state.json").read_text())
 assert state["database"]=="bracket_http_439610679a15" and state["database_container"]==m.OWNED_DB_CONTAINER
 assert state["through"]=="20261027000013"
 for p in sorted((ROOT/"supabase/migrations").glob("2026102700001[45]*")):
  m.sql(state["database"],p.read_text(),m.OWNED_DB_CONTAINER)
  state["migrations"].append({"name":p.name,"sha256":hashlib.sha256(p.read_bytes()).hexdigest()})
  state["through"]=p.name[:14];m.private(m.STATE/"state.json",state)
 shutil.copytree(ROOT/"app",m.STATE/"app/app",dirs_exist_ok=True)
 m.sql(state["database"],"NOTIFY pgrst, 'reload schema';",m.OWNED_DB_CONTAINER)
 print(json.dumps({"database":state["database"],"through":state["through"],"appMirrorSynced":True}))
def audit():
 evidence={"familyDatabases":[]}
 for db in sorted(databases()):
  query="""select jsonb_build_object('stopped',global_stopped,'notificationsEnabled',notifications_enabled,'realSendsEnabled',real_sends_enabled,
  'notificationAttempts',(select count(*) from notification_attempts),'providerAttempts',(select count(*) from event_provider_attempts),
  'edition',(select manifest->>'editionKey' from event_template_configs limit 1),
  'state',(select lifecycle_state from event_league_evaluations where league_id='b4400000-0000-4000-8000-000000000011')) from event_runtime_control;"""
  p=subprocess.run(["docker","exec","supabase_db_bracket-fyi","psql","-X","-U","postgres","-d",db,"-Atq","-c",query],capture_output=True,text=True,timeout=30)
  if p.returncode:raise RuntimeError("Database audit failed")
  evidence["familyDatabases"].append({"database":db,**json.loads(p.stdout)})
 state=json.loads((ROOT/"tmp/local-event-http/state.json").read_text())
 assert state["database"]=="bracket_http_439610679a15"
 p=subprocess.run(["docker","exec",state["database_container"],"psql","-X","-U","postgres","-d",state["database"],"-Atq","-c","select jsonb_build_object('stopped',global_stopped,'notificationsEnabled',notifications_enabled,'realSendsEnabled',real_sends_enabled,'notificationAttempts',(select count(*) from notification_attempts)) from event_runtime_control"],capture_output=True,text=True,timeout=30)
 if p.returncode:raise RuntimeError("HTTP database audit failed")
 evidence["httpRuntime"]={"database":state["database"],"through":state["through"],**json.loads(p.stdout)}
 evidence["migrationHashesCurrent"]=all(hashlib.sha256((ROOT/"supabase/migrations"/m["name"]).read_bytes()).hexdigest()==m["sha256"] for m in state["migrations"])
 evidence["appMirrorCurrent"]=all((ROOT/"tmp/local-event-http/app/app"/p.relative_to(ROOT/"app")).read_bytes()==p.read_bytes() for p in (ROOT/"app").rglob("*") if p.is_file())
 out=OUT/"final-runtime-audit.json";out.write_text(json.dumps(evidence,indent=2));print(json.dumps(evidence))
parser=argparse.ArgumentParser();parser.add_argument("action",choices=["upgrade","sql","audit"]);args=parser.parse_args()
try:
 if args.action=="upgrade":upgrade()
 elif args.action=="audit":audit()
 else:raise SystemExit(sqlproof())
except Exception:
 print("Owned runtime proof failed; diagnostics withheld.");raise SystemExit(1)
