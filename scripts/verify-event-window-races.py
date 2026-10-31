#!/usr/bin/env python3
"""Disposable-local deterministic row-lock barrier. Original synthetic fixtures only.
No reset/delete, network/provider or notification transport. Retains a uniquely
named synthetic league per run so failure evidence is inspectable.
"""
import json
import subprocess
import time
import uuid

BASE = ["docker", "exec", "-i", "supabase_db_bracket-fyi", "psql", "-X", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"]

def sql(statement):
    result = subprocess.run(BASE, input=statement, text=True, capture_output=True, timeout=20)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()

def main():
    template, league, organizer, invitation, participant, credential = [str(uuid.uuid4()) for _ in range(6)]
    worker_name = "bracket-window-race-" + str(uuid.uuid4())
    manifest = json.dumps({"markets":[{"id":"m","windowId":"w","choices":["a","b"]}]})
    sql(f"""
begin;
insert into templates(id,name,type) values('{template}','SYNTHETIC cutoff barrier','bracket');
insert into leagues(id,name,template_id,organizer_token,join_token) values('{league}','SYNTHETIC cutoff barrier','{template}','{organizer}','{invitation}');
insert into participants(id,league_id,display_name,magic_token) values('{participant}','{league}','Synthetic P','{credential}');
insert into event_template_configs(template_id,version,sealed,manifest) values('{template}',1,true,'{manifest}');
insert into event_league_evaluations(league_id,configuration_version) values('{league}',1);
insert into event_league_windows(league_id,window_key,state,cutoff,pairings_reviewed,market_ids) values('{league}','w','open',clock_timestamp()+interval '1 day',true,array['m']);
commit;
""")
    blocker = subprocess.Popen(BASE, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
    worker = None
    try:
        blocker.stdin.write(f"begin;\nselect id from leagues where id='{league}' for update;\n\\echo BARRIER_HELD\n")
        blocker.stdin.flush()
        while True:
            line = blocker.stdout.readline()
            if not line:
                raise RuntimeError("Lock holder ended before barrier")
            if line.strip() == "BARRIER_HELD":
                break
        worker = subprocess.Popen(BASE, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        worker.stdin.write(f"set application_name='{worker_name}';\nselect submit_event_window('{league}','{credential}','w',1,'{{\"m\":\"a\"}}');\n")
        worker.stdin.close()
        deadline = time.monotonic() + 15
        while sql(f"select count(*) from pg_stat_activity where application_name='{worker_name}' and wait_event_type='Lock';") != "1":
            if worker.poll() is not None or time.monotonic() > deadline:
                raise RuntimeError("Submitter did not reach deterministic database lock barrier")
        # Change cutoff only AFTER the submitter is demonstrably blocked.
        blocker.stdin.write(f"update event_league_windows set cutoff=clock_timestamp() where league_id='{league}';\ncommit;\n\\q\n")
        blocker.stdin.flush()
        blocker.wait(timeout=15)
        worker.wait(timeout=15)
        stderr = worker.stderr.read()
        if worker.returncode == 0 or "window unavailable or stale" not in stderr:
            raise AssertionError("Blocked submission used a pre-lock time or wrong rejection: " + stderr)
        if sql(f"select count(*) from picks where league_id='{league}';") != "0":
            raise AssertionError("Rejected cutoff race wrote picks")
        print(json.dumps({"scenario":"cutoff-tightened-during-row-lock","result":"PASS","leagueId":league,"barrier":"pg_stat_activity wait_event_type=Lock","writes":0}))
    finally:
        if blocker.poll() is None:
            blocker.kill()
        if worker is not None and worker.poll() is None:
            worker.kill()

if __name__ == "__main__":
    main()
