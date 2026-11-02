# Phase 2 runtime recovery — 2026-10-30

## Scope and safety

Runtime-only recovery on the explicitly owned `bracket-p11-db-9bd170c85c0f` container. No shared Docker restart, unrelated stop, deletion, deployment, provider call, notification send, or source edit was performed. Existing dirty work was preserved. The work item and binary criteria were recorded before starting the owned container.

## Diagnosis and recovery

- Initial inspect: owned DB was `exited`, `OOMKilled=true`, exit `137`, restart count `0`; it had last started 2026-10-28. Historical logs were sanitized for credential-like fields. The container is labeled `bracket.p11-owned=true`, `network=none`, `memory=536870912`, `NanoCpus=1000000000`, no published ports.
- Action: started only `bracket-p11-db-9bd170c85c0f`.
- Current inspect: `running=true`, `health=healthy`, `OOMKilled=false`, `restartCount=0`, `StartedAt=2026-10-30T21:02:59Z`.
- SQL readiness: three sequential `docker exec ... psql ... 'SELECT 1;'` probes each returned `1`.

## Runtime evidence

- `verify-event-lifecycle-races.py --database bracket_final_sql_395f48a82dad --business-sqlstate PT409`: **PASS**. Deterministic `pg_stat_activity` lock barrier; rollback, override/ack, recovery/retry, canonical fanout, expiry, sweep, coronation and forward-repair scenarios passed. Migration hash: `55bbb1f26e926041c71ed869ad290d91b5757a5cc11865ba9c1daea67f2362d2`.
- `verify-window-incarnation-races.py --database bracket_final_sql_395f48a82dad --business-sqlstate PT409`: **PASS**; state `2|2|4|0`, both workers observed waiting on a database lock.
- `verify-event-transitions.py --through 20261027000013`: attempted sequentially twice against the owned container. Both attempts exceeded the bounded 120-second and 300-second process limits without final output; no retry beyond those two bounded attempts. The second attempt created retained disposable `bracket_transition_20261030t210643z_6ef1b6_fresh` and `_legacy` before termination; no current-lane completion/evidence artifact was emitted. Owned DB remained healthy after termination. This is an infrastructure/runtime-timeout blocker, not a passing populated-13 claim.
- Existing HTTP runtime status points to separate owned DB `bracket_http_3ff79a5ca427` (`127.0.0.1:3137`, REST `127.0.0.1:54331`), not the recovered isolated DB. Therefore no B-contract fixture was regenerated and no HTTP/browser lane was run against the recovered DB.

## Source/parent handoff

No source fix was identified by the completed race lanes. Parent must resolve the bounded transition-runtime capacity/timeout (or provide an explicitly approved larger isolated resource) before regenerating private B fixtures and running HTTP/browser acceptance. Do not treat the retained historical transition artifacts or the partial 2026-10-30 databases as populated-13 acceptance.

changed: started only the owned isolated DB and added this runtime evidence report; no source or migration changes.
matters: SQL readiness and two deterministic race lanes are now concrete; populated-13 and HTTP/browser remain unverified.
checks: owned inspect healthy; 3x SELECT 1; lifecycle race PASS; incarnation race PASS; transition lane timed out at 120s and 300s.
risk: transition harness resource/time behavior and HTTP attachment remain unresolved; B fixture/browser evidence is absent.
verdict: HOLD — partial runtime recovery; exact external blocker is isolated transition execution exceeding 300 seconds on the bounded 512MiB/1CPU container.
