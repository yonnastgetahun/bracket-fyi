# Transition proof through 00005

## Pre-code criteria: BRACKET-TRANSITION-00005
project: BRACKET-FYI
done when:
- [x] Fresh, populated legacy and populated current lanes replay actual migrations through 00005 in new disposable databases.
- [x] Extant versions/deadlines seed exactly; committed post-upgrade deleted/recreated histories survive forward repair replay.
- [x] Unrecoverable pre-upgrade deleted history is explicitly absent, and a replay-stable freeze rejects otherwise-valid submissions.
- [x] Legacy service projections, populated data, and DB27–31 contracts pass; input hashes remain stable.
evidence: `python3 scripts/verify-event-transitions.py`, retained JSON artifacts and databases.

Scope: infrastructure only, not full P12. Earlier 00004 report/artifacts remain untouched. No existing database mutation, hosted/network operations or commits.

## Final run (2026-10-27)

Command:

```sh
/Users/yonnasgetahun/clawd/bin/exec -- 'python3 /Users/yonnasgetahun/bracket-fyi/scripts/verify-event-transitions.py'
```

**PASS, exit 0: 140/140 harness assertions and 747/747 pgTAP assertions** (249 per database). All 28 migrations through `20261027000005_window_incarnation_history.sql` replayed from actual source. Five forward repairs applied twice per database; 00005 additionally applied twice in isolation to prove its generation/replay contract. Five suites: typed outcomes 55, windows 25, parent-integrated DB29 47, security 54, DB31 68 per lane. TAP now verifies the complete numbered sequence against its plan, not merely presence of an `ok` line.

- [Final evidence](../../../supabase/tests/transitions/evidence-20261027T211220Z_9f036b.json): 311 recorded SQL steps, input fingerprints, assertion results and retained database names.
- Evidence SHA256: `0fc37d4471804f88446baf831b699ec708804373e0e9e7dec94e3d6e98d5b583`.
- Harness SHA256: `086c3041863ddedf5124ced4276edd0ef540d0a3154ba5639ff76ed301e49101`.
- HEAD at execution: `3ca08fbd7d3cfa5266a2114ab3bb3f9f391d83e8`; working-tree hashes, not HEAD alone, identify tested inputs.
- Migration, fixture, test, repair and harness hashes all unchanged across final execution.
- Concurrent `20261027000006_event_lifecycle.sql` explicitly excluded. This is **not final-PR migration-set coverage**.

Retained final disposable databases:

- `bracket_transition_20261027t211220z_9f036b_fresh`
- `bracket_transition_20261027t211220z_9f036b_legacy`
- `bracket_transition_20261027t211220z_9f036b_current`

## Proof boundaries and non-vacuous history fixture

Fresh begins with template0/empty public and actual migration replay. Legacy populates at 20260725000005; current populates at 20261010000008 with canonical results, audit and outbox before PR additions. The existing six-league/twelve-pick oracle, old service reader, committed bounded backfill interruption/resume/replay and typed draw/tied-result repair corpus are preserved.

Every lane pauses at 00004, after its baseline upgrade/backfill checks, to commit two synthetic window leagues:

1. **Extant:** create v1, tighten to v2/v3. Upgrade seeds exactly the extant v3/deadline; whole existing rows and service-reader projection compare equal.
2. **Previously deleted:** create/tighten to v3, physically delete before 00005. The new ledger correctly contains **no entry**: the migration cannot reconstruct historical v3/deadline.
3. After upgrade, delete the extant v3, recreate v4 at its exact deadline, tighten to v5 and delete again. Committed absent-key history retains **v5 and the earlier deadline**, verified independently against the pre-upgrade snapshot.
4. Apply actual 00005 hold: newly frozen generations advance once; second application leaves complete evaluation rows identical. All populated rows and absent-key histories survive.
5. For the unrecoverable key, configure a future open window while held and attempt a valid-credential, current-token eligible submission as actual service_role: **40001, zero picks**. A counterfactual transaction temporarily clears frozen, accepts the exact same submission and verifies one pick, then rolls back. This distinguishes the freeze barrier from invalid credentials/choices or an absent window. Final league remains frozen; no guessed historical maximum/deadline is inserted.
6. All five forward repairs are replayed twice over committed typed picks, results and incarnation histories; full-row preservation includes the ledger, including its absent window key.

The hold is an **explicit operational step**, not automatically applied by migration 00005. Configuration remains possible while frozen; participant submission is blocked. Never activate an uncertain league merely because migration succeeded. Seeding extant rows also cannot certify whether an earlier tighter deadline had already been lost. Individually reviewed evidence/disposition remains required before unfreeze. The counterfactual unfreeze above exists only inside a rolled-back synthetic test transaction.

Repair 00002 still increments generation on each replay; therefore combined repair evidence claims preservation/safety, not byte-identical generations. Isolated 00005 replay is byte-identical for evaluation rows. SQL old-reader compatibility is bounded; this does not prove application/HTTP/browser rollback journeys, hosted rollout, device behavior, full scoring oracles or complete P12.

## Failed attempts retained

Two earlier attempts encountered the local PostgreSQL server crash/recovery interval:

- `evidence-20261027T210823Z_b1fca5.json`: previous 00004 harness invocation, connection terminated because another server process crashed. An initial edit-helper quoting error had prevented the attempted harness edit; its subsequent shell command invoked that old harness. No partial code patch was applied.
- `evidence-20261027T210903Z_481a56.json`: new 00005 harness, `FATAL: the database system is in recovery mode`.

Both failed at two harness assertions, before transition proof. Their disposable databases and artifacts remain; neither is represented as green. Read-only `pg_isready` subsequently reported accepting connections. The final run started new databases and passed; no server reset/restart, migration-history repair or existing database writes were performed. Crash cause was not investigated or attributed by this integration task.

## Delivery

Only `scripts/verify-event-transitions.py`, three new `supabase/tests/transitions/incarnation-*.sql` fixtures, new JSON artifacts and this report were written. Prior 00004 artifacts/report and all migrations, source, rollbacks and database test files were preserved. Parent's DB29 reconciliation is exercised, not edited here.

changed: default transition target 00005; populated incarnation upgrade/hold/replay corpus and complete TAP/hash checks.
matters: proves the durable ledger survives real migration/repair with an explicit safe hold for unknowable prior deletion history.
checks: final command exit 0; 140/140 harness, 747/747 pgTAP; Python compilation and scoped whitespace inspection pass.
risk: absent historical data cannot be authenticated; 00006 and remaining product/release obligations unproved.
verdict: accept bounded infrastructure proof through 00005; **hold full P12/final-PR acceptance**.
