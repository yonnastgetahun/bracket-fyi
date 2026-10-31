#!/usr/bin/env python3
"""Local disposable DB only; deterministic two-worker incarnation lock barrier.
Retains one uniquely named synthetic fixture for inspection; no reset or cleanup.
"""
import argparse
import os
import json
import re
import subprocess
import time
import uuid

CONTAINER = os.environ.get("BRACKET_TEST_DB_CONTAINER", "supabase_db_bracket-fyi")
if CONTAINER != "supabase_db_bracket-fyi" and not re.fullmatch(r"bracket-p11-db-[a-f0-9]{12}", CONTAINER):
    raise ValueError("Only the known local or owned isolated DB container is allowed")
BASE = ["docker", "exec", "-i", CONTAINER, "psql",
        "-X", "-U", "postgres", "-d", "", "-At", "-v", "ON_ERROR_STOP=1"]

def disposable_database(value):
    if not re.fullmatch(r"bracket_[a-z0-9_]{1,55}", value):
        raise argparse.ArgumentTypeError("database must be a disposable bracket_* name (lowercase letters, digits, underscores; max 63 characters)")
    return value


def literal(value):
    return "'" + value.replace("'", "''") + "'"

def sql(statement):
    r = subprocess.run(BASE, input=statement, text=True, capture_output=True, timeout=20)
    if r.returncode:
        raise RuntimeError(r.stderr)
    return r.stdout.strip()

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, type=disposable_database,
                        help="Explicit disposable bracket_* database; no default target.")
    parser.add_argument("--business-sqlstate", choices=("PT409", "40001"), default="PT409",
                        help="Expected business conflict: PT409 current schema, 40001 historical schema.")
    options = parser.parse_args(argv)
    BASE[BASE.index("-d") + 1] = options.database
    template, league, participant, credential = [literal(str(uuid.uuid4())) for _ in range(4)]
    sql(f"""begin;
insert into templates(id,name,type) values({template},'SYNTHETIC DB31 ABA race','bracket');
insert into leagues(id,name,template_id) values({league},'SYNTHETIC DB31 ABA race',{template});
insert into participants(id,league_id,display_name,magic_token) values({participant},{league},'Synthetic',{credential});
insert into event_template_configs(template_id,version,sealed,manifest)
values({template},1,true,'{{"markets":[{{"id":"m","windowId":"w","choices":["a","b"]}}]}}');
insert into event_league_evaluations(league_id,configuration_version) values({league},1);
set local role service_role;
select configure_event_window({league},'w',0,'open','2090-01-01Z',true,array['m']);
commit;""")
    blocker = subprocess.Popen(BASE, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    workers = []
    try:
        blocker.stdin.write(f"""begin;
set local role service_role;
select configure_event_window({league},'w',1,null,null,null,null,true);
\\echo BARRIER_HELD
""")
        blocker.stdin.flush()
        while True:
            line = blocker.stdout.readline()
            if not line:
                raise RuntimeError("blocker ended: " + blocker.stderr.read())
            if line.strip() == "BARRIER_HELD":
                break
        for kind, statement in [
            ("submit", f"select submit_event_window({league},{credential},'w',1,'{{\"m\":\"a\"}}');"),
            ("configure", f"select configure_event_window({league},'w',1,'open','2090-01-01Z',true,array['m']);"),
        ]:
            name = "db31-" + kind + "-" + str(uuid.uuid4())
            worker = subprocess.Popen(BASE, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            workers.append((kind, name, worker))
            worker.stdin.write(f"\\set VERBOSITY verbose\nset application_name={literal(name)};\nset role service_role;\n" + statement + "\n")
            worker.stdin.close()
        deadline = time.monotonic() + 15
        names = ",".join(literal(name) for _, name, _ in workers)
        while sql(f"select count(*) from pg_stat_activity where application_name in ({names}) and wait_event_type='Lock';") != "2":
            if any(w.poll() is not None for _, _, w in workers) or time.monotonic() > deadline:
                raise RuntimeError("both service workers must reach lock barrier")
        blocker.stdin.write(f"select configure_event_window({league},'w',0,'open','2090-01-01Z',true,array['m']);\ncommit;\n\\q\n")
        blocker.stdin.flush()
        blocker.wait(timeout=15)
        if blocker.returncode:
            raise RuntimeError(blocker.stderr.read())
        for kind, _, worker in workers:
            worker.wait(timeout=15)
            error = worker.stderr.read()
            if worker.returncode == 0 or options.business_sqlstate not in error or "window unavailable or stale" not in error:
                raise AssertionError(kind + ": " + error)
        actual = sql(f"""select w.version,h.last_version,e.generation,
(select count(*) from picks where league_id={league})
from event_league_windows w join event_window_incarnation_history h using(league_id,window_key)
join event_league_evaluations e using(league_id) where w.league_id={league};""")
        assert actual == "2|2|4|0", actual
        print(json.dumps({"scenario": "queued stale configure and submit across delete/recreate", "result": "PASS",
                         "database": options.database, "businessSqlstate": options.business_sqlstate,
                         "barrier": "both pg_stat_activity wait_event_type=Lock", "state": actual,
                         "retainedSyntheticLeague": league.strip("'")}))
    finally:
        for process in [blocker] + [w for _, _, w in workers]:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)

if __name__ == "__main__":
    main()
