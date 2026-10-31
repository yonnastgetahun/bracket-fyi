# FD04 actual SQL rejection-seam proof (2026-10-30)

## Scope and authority

Authorized Phase2 P3/P4; bounded synthetic integration. No production source fix
was necessary. Existing source compatibility claims are now supplemented by
actual PostgreSQL execution for the rejection seam, **not** full provider/live,
PostgREST, scorer, numeric, or production attempt-admission acceptance.

Retained repaired disposable database:
`supabase_db_bracket-fyi / bracket_db38_1793407089368602000`.
No database/container/VM created, stopped, restarted or reconfigured.
No migration or function was installed: this DB already contains the corrected
series function from the DB38 repair. Installed function-definition hashes are
in the evidence manifest; the series function was not executed by this proof.

## Executed path and explicit doubles

Original synthetic two-match JSON (first mapped, second unmapped) →
real FootballDataAdapter → real createIngestionOrchestrator →
real run-ledger, budget, evidence, quarantine and projection repository adapters →
actual SQL RPCs via service-role psql.

The fetch implementation is in-memory, with no network; credentials are synthetic.
Attempt admission/start/complete are explicit synthetic ports. These allow the
in-memory adapter fixture to exercise rejection while the real runtime remains
stopped throughout. This is **not** production attempt-control/factory execution
or PostgREST wire-format proof. Binding-mode reader and window/phase resolvers are
fixture inputs. Structural/result repositories are real, but correctly never called.
No scorer or canonical result is needed or claimed for this rejected batch.

SQL failure injection executes the target RPC as `anon`, causing real PostgreSQL
`42501` permission errors; it does not replace repository results with fake errors.
Other RPCs remain service_role. This establishes actual persistence failure behavior,
not every possible database outage/constraint failure.

## Passing final execution

Command (via workspace exec guard, repository cwd):

```sh
BRACKET_FD04_SQL_DB=bracket_db38_1793407089368602000 npm test -- tests/events/provider-fd04-quarantine-db.test.ts
```

**1 file / 1 integration test PASS, zero skips, 6.009 seconds.**
Final fixture binding: `e66aca45-6862-4b5c-96be-3c95d43ee188`.
Final fixture stamp: `0e8f7010-5994-4a6c-9c99-64c136111df3`.

Five executed checkpoints:

1. Real adapter rejection persists a versioned bounded evidence witness, linked
   blocking `mapping_missing` quarantine, and failed run. Row index 1/count 2,
   first-rejected-row witness, entire-batch scope; no invented canonical IDs.
2. UPDATE and DELETE as table owner are both rejected by the immutable trigger;
   entire stored observation JSON remains identical. This is not just a grants test.
3. Identical same-run replay reuses evidence/quarantine IDs and leaves the entire
   observation unchanged; fresh run gets its own linked witness.
4. Actual SQL permission failure at evidence leaves neither record; failure at
   quarantine leaves immutable evidence only. Both record
   `system:adapter_quarantine_failed` and `reviewPersistenceFailed=true`.
   Same-run replay repairs the missing quarantine without duplicating evidence.
5. Zero fixture contests/results/mappings, zero projection/page-commit RPC calls,
   checkpoint generation remains 0. Raw sentinel, synthetic secret, SQL error text
   absent from retained evidence, quarantine and run metadata.

Final fixture totals: four failed runs, three immutable observations, three
quarantines (including the repaired evidence-before-quarantine partial write).
Both normalized and quarantined page counters remain zero honestly: rejected
diagnostics are not accepted normalized page items.

`npx tsc --noEmit --incremental false`: exit 0.
Scoped ESLint: exit 0. `git diff --check`: exit 0.
Protected baseline: **26/26 SHA-256 matches**.

## Harness-development failures retained honestly

- First invocation: harness forwarded extra `requestedAt` to strict budget
  repository schema; failed before adapter/evidence. Corrected argument mapping.
- Second: provider adapter-key uniqueness blocked rerun fixture creation.
  Fixture now reuses the same synthetic provider and leaves prior data untouched.
- Third: hand-written replay diagnostic omitted home/away IDs, so was not an exact
  replay; corrected fixture to match actual bounded adapter diagnostics.
- Initial typecheck: crypto UUID inferred template-literal type conflicted with
  SQL-returned provider string; explicit string annotation fixed it.
- Intermediate full SQL pass preceded the type-only edit; final rerun and typecheck
  passed on the final hash below. No production seam defect was demonstrated.

Prior synthetic rows/artifacts are retained, not erased. Database provider budgets
are genuinely consumed; repeated invocations require available synthetic budget
and deliberately fail closed when exhausted. Do not reset unrelated budgets.
This exact retained DB now has only one of the originally ten fixture budget units
remaining; a fresh isolated synthetic budget/DB or natural reset is needed for
another four-attempt full run. No numeric or broad SQL suite rerun is implied.

## Durable evidence and owned files

- `tests/events/provider-fd04-quarantine-db.test.ts`
  SHA-256 `ba0531586332c3e9cfa50124a10956454c74baed67869889d1beeafcdb2ec0aa`.
- [Evidence manifest](phase-2-fd04-sql-proof-evidence.json): exact source hashes,
  installed SQL function hashes, final observations/quarantines/runs, SQLSTATEs,
  RPC call inventory, database/server identity, command/results, all26 baseline hashes.
  SHA-256 `77f11ca0005dea34b368bac4183b3d744b0a2ce91ddeeabd4170166d9e85c34d`.
- This report.
- Local `tmp/fd04-sql-proof/result-*.json` artifacts retain first/intermediate/final
  executed checkpoints and exact candidate source hashes.
- Workspace TASKS item BRACKET-FD04-SQL-20261030.

## Safety closeout

Actual retained DB audit: `global_stopped=true`, `notifications_enabled=false`,
`real_sends_enabled=false`, notification attempts **0**, real provider attempts
**0**. These states/counters are checked before and after the test.
Four fetches were in-memory synthetic responses only.
No live credentials/provider traffic, transport sends, numeric reruns, container/VM
changes, function repair, commits, publication, deployment or spend.

## Independent skeptical disposition

Reviewer run 9c62f1a5-fe00-4283-a579-b3c4f2cabfd9: **ACCEPT** for bounded actual-SQL rejection seam; no concrete blocking defect. Read-only inspection, no independent runtime execution.

Reviewer inspected intermediate successful artifact 9758543b-a21e-4bd8-8f61-874d9ccef7ac and test SHA dc9f89ce0009830fd56995f8a2ccda4a56a3d16bd8ec9b533c0433462ce86cbe. Its description of that artifact as latest was superseded by the final run above. Closeout reconstructed the reviewed SHA from current bytes by removing only the type annotation in `let provider: string = randomUUID();`. Review-to-final delta is therefore proven type-only; final candidate has its own passing SQL run and typecheck. Seven source hashes and 26 protected baseline hashes rechecked and match the manifest.

Accepted limitations: SQL covers unmapped_match, not all rejection reasons; recovery is separate-transaction repair, not atomic insertion. Fetch, credentials and attempt controls are doubles; no production composition, PostgREST or live-provider acceptance. Artifacts written in finally are not standalone pass claims; final manifest records runner exit 0 and 1/1 pass. Older incomplete artifacts are retained solely as failed-development history.

Verdict: **ACCEPT** this bounded seam proof; wider Phase2 acceptance unchanged. No SQL rerun or runtime mutation during review closeout.
