# Window skeptic 2 — independent disprove attempt

Date: 2026-10-27. **Verdict: iterate. F2 High, F3 High, F4 Medium survive.**

## Scope / acceptance

Read-only review of F2–F4 in phase-2-window-review.md, installed local PostgreSQL catalog/functions, migration 20261027000002_prediction_windows.sql, repository.ts, and Spec v1.0.
Done criteria: inspect actual installed protections; try privileged service-role synthetic counterexamples with positive guard controls; roll back all data; write only this report. No code/schema fixes, real-data access, provider calls, or full-lifecycle acceptance.

Read the review skill, but followed the explicitly assigned bounded findings review rather than initiating a separate diff review or descendants.

## Actual database protections

Catalog inspection found exactly two non-internal triggers across the three event tables: event_window_guard BEFORE INSERT OR UPDATE, event_window_generation AFTER INSERT OR UPDATE, both on event_league_windows. No configuration trigger and no DELETE trigger. Constraints are row-shape/positive-version/state/primary-key/foreign-key checks, not sealed-content immutability. Installed protect_event_window, record_event_window_change and submit_event_window match the cited migration.

Privilege queries: anon and authenticated have neither configuration UPDATE, window DELETE nor submit RPC execution; service_role has all three. All adverse operations below ran after SET LOCAL ROLE service_role, not with superuser bypass or disabled triggers. PostgreSQL was used only to create isolated synthetic base fixtures first.

## F2 — High sustained, privileged integrity defect

Submitted a under sealed configuration version 1. Updated that same sealed row from choices [a,b] to [c,d], retaining version 1. Generation stayed **3 → 3**. Submitted c with expected window version 1; persisted pick still records configuration version **1**.

This is a demonstrably mutable identity for a published basis, and no generation is produced by its mutation. Service authority narrows the actor; it does not make two contradictory meanings for configuration version 1 an immutable contract. Spec §4's sealed configuration/lifecycle and generation-keyed reconciliation obligations are not satisfied by a boolean and an authorized writer.

No anonymous configuration-edit claim. No current product route for this mutation proved.

## F3 — High sustained, with precise guard limits

After tightening cutoff into the past, before advance, service-role UPDATE changed m1 to renamed. Window version stayed **1**, league locked_at was still NULL. Own read_event_picks count became **0** although the original pick persisted. Advance then locked the renamed window, not original m1; original pick remained unlocked.

After advancement:
- UPDATE changing market_ids correctly failed with check_violation.
- INSERT of a non-overlapping new-market window succeeded.
- DELETE of the now-locked original window succeeded; generation stayed **8 → 8**.

Thus the physical first-lock UPDATE guard is real but insufficient: semantic cutoff is earlier, and INSERT/DELETE bypass the membership sealing rule. INSERT/UPDATE do bump generation; do not overstate F3 as all window mutations missing generation. DELETE specifically lacks the obligation. An unopened inserted window is enough to alter required membership; no claim it immediately accepts picks.

Spec v1.0 lines 94 and 112 require immutable logical IDs, no silent new required markets after first lock, and audited dispositions preserving picks/audit. A row's physical locked state is not a substitute for those guarantees.

## F4 — Medium sustained, concurrency-only bypass

With valid participant token and an otherwise valid open window:
- Expected version 99 correctly rejected with serialization_failure.
- Expected version NULL succeeded and wrote one pick.
- After cutoff, NULL still rejected with serialization_failure.

NULL bypasses only the optimistic-version predicate, not credential, cutoff, freeze or choice checks. Installed function uses version <> p_expected_version; SQL NULL yields unknown, which PL/pgSQL IF does not treat as true. repository.ts forwards submission.version without runtime validation. Repository caller search found tests and its definition, no app route. This is a privileged RPC/runtime-contract bug, not proof of anonymous public execution.

## Authorization and severity judgment

The strongest disproof was service-only ACLs plus working cutoff and physical-lock guards. Those materially narrow exposure but do not repair database invariants expressly owned by this packet. Retain High for F2/F3 as scoring/basis/history integrity blockers before activation; retain Medium for F4. No stronger live-production exploit claim. F1 was not independently replayed here and is outside this verdict.

## Executed evidence

Command used the absolute guarded wrapper, with its nested command shell-quoted, invoking:
`docker exec -i supabase_db_bracket-fyi psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres`.
SQL arrived through a quoted heredoc. Execution returned BEGIN, inserts, SET, all notices below, DO, and ROLLBACK, exit 0.

```text
CONTROL stale nonnull rejected
F4 NULL expected version accepted; picks=1
F2 sealed config edited; generation before=3 after=3
F2 changed choice c accepted with persisted config version 1
CONTROL NULL does not bypass cutoff
F3 post-cutoff membership update accepted version=1, locked_at=NULL; read_event_picks=0
CONTROL post-advance membership UPDATE rejected
F3 INSERT after physical first lock accepted
F3 DELETE locked window accepted; generation before=8 after=8; original pick remains unlocked
```

### Reproducible rollback-only fixture

All DML is restricted to the synthetic UUID namespace b2920000. No production rows are read by the probe.

```sql
BEGIN;
INSERT INTO templates(id,name,type) VALUES('b2920000-0000-4000-8000-000000000001','Skeptic2 rollback only','bracket');
INSERT INTO leagues(id,name,template_id) VALUES('b2920000-0000-4000-8000-000000000002','Skeptic2 rollback only','b2920000-0000-4000-8000-000000000001');
INSERT INTO participants(id,league_id,display_name,magic_token) VALUES('b2920000-0000-4000-8000-000000000003','b2920000-0000-4000-8000-000000000002','Synthetic','b2920000-0000-4000-8000-000000000004');
SET LOCAL ROLE service_role;
INSERT INTO event_template_configs VALUES('b2920000-0000-4000-8000-000000000001',1,true,'{"markets":[{"id":"m1","windowId":"w1","choices":["a","b"]}]}',now());
INSERT INTO event_league_evaluations(league_id,configuration_version) VALUES('b2920000-0000-4000-8000-000000000002',1);
INSERT INTO event_league_windows(league_id,window_key,state,cutoff,pairings_reviewed,market_ids) VALUES('b2920000-0000-4000-8000-000000000002','w1','open',clock_timestamp()+interval '1 day',true,ARRAY['m1']);
DO $proof$
DECLARE l uuid:='b2920000-0000-4000-8000-000000000002'; tok uuid:='b2920000-0000-4000-8000-000000000004'; g bigint; n bigint;
BEGIN
 BEGIN
  PERFORM submit_event_window(l,tok,'w1',99,'{"m1":"a"}');
  RAISE EXCEPTION 'stale positive control unexpectedly accepted';
 EXCEPTION WHEN serialization_failure THEN RAISE NOTICE 'CONTROL stale nonnull rejected'; END;
 PERFORM submit_event_window(l,tok,'w1',NULL,'{"m1":"a"}');
 SELECT count(*) INTO n FROM picks WHERE league_id=l AND team_id='a';
 IF n<>1 THEN RAISE EXCEPTION 'NULL proof failed'; END IF;
 RAISE NOTICE 'F4 NULL expected version accepted; picks=%',n;
 SELECT generation INTO g FROM event_league_evaluations WHERE league_id=l;
 UPDATE event_template_configs SET manifest='{"markets":[{"id":"m1","windowId":"w1","choices":["c","d"]}]}' WHERE template_id='b2920000-0000-4000-8000-000000000001';
 SELECT generation INTO n FROM event_league_evaluations WHERE league_id=l;
 IF n<>g THEN RAISE EXCEPTION 'configuration generation unexpectedly advanced'; END IF;
 RAISE NOTICE 'F2 sealed config edited; generation before=% after=%',g,n;
 PERFORM submit_event_window(l,tok,'w1',1,'{"m1":"c"}');
 IF NOT EXISTS(SELECT 1 FROM picks WHERE league_id=l AND team_id='c' AND event_configuration_version=1) THEN RAISE EXCEPTION 'same version c proof failed'; END IF;
 RAISE NOTICE 'F2 changed choice c accepted with persisted config version 1';
 UPDATE event_league_windows SET cutoff=clock_timestamp()-interval '1 second' WHERE league_id=l;
 BEGIN
  PERFORM submit_event_window(l,tok,'w1',NULL,'{"m1":"c"}');
  RAISE EXCEPTION 'NULL bypassed cutoff';
 EXCEPTION WHEN serialization_failure THEN RAISE NOTICE 'CONTROL NULL does not bypass cutoff'; END;
 UPDATE event_league_windows SET market_ids=ARRAY['renamed'] WHERE league_id=l AND window_key='w1';
 IF NOT EXISTS(SELECT 1 FROM event_league_windows w JOIN leagues x ON x.id=w.league_id WHERE w.league_id=l AND w.version=1 AND x.locked_at IS NULL) THEN RAISE EXCEPTION 'pre-advance proof failed'; END IF;
 SELECT count(*) INTO n FROM read_event_picks(l,tok);
 IF n<>0 THEN RAISE EXCEPTION 'orphan visibility proof failed'; END IF;
 RAISE NOTICE 'F3 post-cutoff membership update accepted version=1, locked_at=NULL; read_event_picks=%',n;
 PERFORM advance_event_windows(l);
 BEGIN
  UPDATE event_league_windows SET market_ids=ARRAY['blocked'] WHERE league_id=l AND window_key='w1';
  RAISE EXCEPTION 'physical lock guard absent';
 EXCEPTION WHEN check_violation THEN RAISE NOTICE 'CONTROL post-advance membership UPDATE rejected'; END;
 INSERT INTO event_league_windows(league_id,window_key,market_ids) VALUES(l,'late',ARRAY['new-market']);
 RAISE NOTICE 'F3 INSERT after physical first lock accepted';
 SELECT generation INTO g FROM event_league_evaluations WHERE league_id=l;
 DELETE FROM event_league_windows WHERE league_id=l AND window_key='w1';
 SELECT generation INTO n FROM event_league_evaluations WHERE league_id=l;
 IF n<>g THEN RAISE EXCEPTION 'DELETE generation advanced'; END IF;
 IF NOT EXISTS(SELECT 1 FROM picks WHERE league_id=l AND slot_id='m1' AND NOT locked) THEN RAISE EXCEPTION 'original pick unexpectedly locked or removed'; END IF;
 RAISE NOTICE 'F3 DELETE locked window accepted; generation before=% after=%; original pick remains unlocked',g,n;
END $proof$;
ROLLBACK;
```

changed: only this report.
matters: independent installed-schema proof defeats ACL-only and physical-lock-only rebuttals.
checks: actual catalog inspection, service-role synthetic proof with negative/positive controls, explicit ROLLBACK.
risk: no two-session race, application activation, durable worker, or F1 replay verified here.
verdict: iterate.
