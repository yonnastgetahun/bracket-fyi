# WL-01/02/03 lifecycle repair

# BRACKET-WL-REPAIR
project: BRACKET-FYI
done when:
  - [x] Deleted-first-window enrollment, poison-page scan, and recurring-basis audit reproductions become passing assertions.
  - [x] Healthy and expiry-driven scan work progresses; failures remain pending and surface per league.
  - [x] Recompletion records exactly one evaluated audit, replay adds none, coronation remains one; service-only ACLs retained.
evidence: DB35, focused lifecycle Vitest, typecheck, disposable database upgrade/repair checks.

Scope: additive 00009, matching forward repair, lifecycle repository/worker/tests. Historical 00005/00006 preserved. No hosted DB, network, secrets, real sends, commits or application/operator/notification edits. Approval: inherited Phase 2 task and approved execution plan.

Skeptic hypotheses ranked: (1) enrollment omits durable history, scan lacks per-row exception isolation, and permanent basis uniqueness suppresses legitimate recurrence; (2) existing guards make these states unreachable through supported entry points; (3) intended semantics allow late admission/page failure/missing audit. Inspect and run the independent scenarios against 00008 before repair; spec P1/P5/P7 and lines 79, 94, 110, 141 reject hypothesis 3. Legacy NULL pick basis is schema-supported, not claimed reachable through modern submission.

## Skeptical dispositions

| ID | Countercheck | Disposition and repair |
| --- | --- | --- |
| WL-01 | Exact invitation and league lock do authenticate/serialize enrollment, but neither checks retained cutoff history. The first window can legitimately be deleted before cutoff; the surviving later window does not close enrollment. Using `event_membership_closed` wholesale would wrongly forbid joining after another participant's first pick. | Confirmed. Enrollment now checks retained elapsed deadlines under its existing league lock, separately from prediction membership sealing. DB35 covers pre-cutoff joins both before and after first pick, late rejection and zero rejected writes. |
| WL-02 | A NULL legacy configuration version is schema-supported. Modern submission normally prevents it, but recovery must not strand other leagues. The TypeScript item catch cannot catch an exception from the preceding scan RPC. | Confirmed for legacy/invalid bases, not a claim that modern submissions create them. Scan catches basis errors per visited ID, returns a sanitized error plus the pending generation, and continues. Worker reports the failed ID without capture/commit, advances its cursor and reconciles healthy expiry work. |
| WL-03 | Current generation is unchanged by hold expiry, and the original complete basis legitimately returns. Thus uniqueness on basis (or generation+basis) is not occurrence identity. The existing league/evaluation row lock and current-basis replay guard already serialize/deduplicate acknowledgment. | Confirmed. Remove permanent evaluated-basis unique index and insert each actual evaluated occurrence without conflict suppression; preserve current-basis replay guard, immutable audit, one-coronation index and notification AFTER INSERT hook. |

The original independent diagnostic was run before edits on disposable `bracket_lifecycle_c47196e972d6`: accepted one late entrant, scan aborted with 40001, and only two evaluated transitions despite recompletion. DB35 then asserted all three failures against a fresh migration-00008 database before installing 00009. The two new worker/adapter tests also failed before their TypeScript changes (11 existing tests passed).

## Changed files and contracts

- `supabase/migrations/20261027000009_window_lifecycle_repairs.sql`: additive forward migration; replaces enrollment, scan and acknowledgment functions. Existing evidence is untouched. Historical 00005/00006 are byte-identical to independent review.
- `supabase/rollbacks/20261027000009_window_lifecycle_repairs_forward_repair.sql`: self-contained reapplication of repaired definitions/ACLs plus an idempotent conservative frozen/lifecycle-disabled hold of existing leagues. Never restores broken basis uniqueness or deletes evidence. Resume requires reviewed owner maintenance and reconciliation.
- `lib/events/lifecycle.ts`, `lifecycle-repository.ts`: per-league scan errors.
- `supabase/tests/database/DB35_window_lifecycle_repair_test.sql`, `tests/events/lifecycle.test.ts`, `tests/events/lifecycle-db.test.ts`, `scripts/verify-window-lifecycle-repair.py`: regression, upgrade/replay and real repository/scorer verification.

**Parent integration contract:** `scan_event_lifecycle_work(uuid,integer)` now returns `{league_id, generation, error_code}`. `error_code` is NULL or the bounded string `invalid-basis`; no database diagnostic/private basis is exposed. Every visited ID still appears, including clean and failing IDs. Errors do not acknowledge work. Persist the last visited ID, restart at null after exhaustion, and retain failures for later sweeps. The TS field is optional to support old two-column responses during paired rollout; old workers ignore the new error column and may count a capture conflict rather than report a failed league. Deploy updated worker with 00009 for the new reporting contract. Invalid limits and query cancellation still fail the RPC.

**Audit contract:** `(league_id,basis_token)` is no longer unique for evaluated history. Each audit row UUID identifies an occurrence. Immediate/repeated successful acknowledgment of current basis remains a no-op. Recurrent bases may produce another evaluated row, but never another coronation. 00007's audit trigger stays atomic with the evaluation; its own notification logical-intent identity is unchanged. No promise that previously suppressed historical audit rows can be reconstructed.

**Test invocation contract:** opt-in `lifecycle-db.test.ts` now additionally requires `EVENT_LIFECYCLE_TEST_DATABASE=bracket_lifecycle_<12 hex>`; it refuses the application database. Ordinary unit runs remain DB-free.

## Actual checks

All shell commands routed through `/Users/yonnasgetahun/clawd/bin/exec --`; cwd `/Users/yonnasgetahun/bracket-fyi`. Only local Docker disposable databases were written.

- `python3 scripts/verify-window-lifecycle-repair.py`: full fresh install through 00008; three expected failing assertions; migration 00009; DB31 **68**, DB32 **46**, DB34 **45**, DB35 **26** passing assertions; migration replay; populated compatibility hold and hold replay; DB35 passes again. Completed baseline run: `bracket_lifecycle_c21fea837288`.
- DB33 **54** assertions pass at its 00007 baseline. Running the old DB33 directly after 00008 stops at its service call to `set_event_notification_control`, whose service grant 00008 intentionally revoked. No test or ACL was weakened. Post-00008 DB34 and DB35 verify operator ACL retention and the live notification audit hook. Parent owns reconciling the older DB33 setup with scoped operator controls; this packet does not claim that suite green after 00008.
- `RUN_EVENT_LIFECYCLE_DB=1 EVENT_LIFECYCLE_TEST_DATABASE=bracket_lifecycle_dae536196c86 ./node_modules/.bin/vitest run tests/events/lifecycle.test.ts tests/events/lifecycle-db.test.ts`: **14/14** pass. Real repository RPC adapter → SQL scan → capture → scoreEvent → commit → safe read; poison league followed by clean and expiry-driven leagues; failed ID reporting, exact cursor, retained error, recompletion audit +1, lost-ack replay +0, one coronation.
- `./node_modules/.bin/tsc --noEmit --incremental false`: pass after the DB integration test edits.
- Scoped ESLint on lifecycle/repository and both lifecycle test files: pass. `git diff --check`: pass.
- `python3 scripts/verify-window-lifecycle-independent-review.py bracket_lifecycle_dae536196c86 --barriers`: original diagnostic now rejects enrollment, survives scan and records all three transitions with one coronation; supporting ABA and lifecycle lock-barrier harnesses pass. ABA final state `2|2|4|0`; lifecycle rollback, stale override/ack, canonical three-league fanout, expiry during lock wait, outage convergence, replay and one coronation pass. Imported harness prints a misleading default `database: postgres`; wrapper's BASE was explicitly redirected to the named disposable database, as announced before invocation.

Additional competing-recompletion barrier and final fresh run: results appended below. An initial attempt timed out creating `bracket_lifecycle_1438e257e947`; retry `bracket_lifecycle_7b0bee50bcd8` failed because PostgreSQL was in recovery mode. Neither failed attempt is counted as verification; readiness subsequently reported accepting connections. No container restart, app-DB repair or global setting change was performed.

## Fingerprints and limits

00005 SHA-256: `a3be839db1aaed9f7a7efb9b641b8f023a627eb4a98ece4a178dd3de26e05429`.
00006 SHA-256: `55bbb1f26e926041c71ed869ad290d91b5757a5cc11865ba9c1daea67f2362d2`.
00009 SHA-256: `0fb324e02359ca8f002ab0558f1bfa416fc7b076e02b8a9a835e6d24c7f2e721`.
Forward repair SHA-256: `6ff07808bec84a2112cb5733010747cb6ccccdaa5021b7b1df23d4e5125b1bf6`.

changed: WL-01/02/03 repaired with assertions and additive SQL; no application/operator/notification file edits, historical migration edits, commits, network/provider requests, secrets or real sends.
matters: durable cutoff closes enrollment, poisoned recovery work no longer starves neighbors, and recurrent completion retains its audit occurrence.
checks: focused actual results above; full roadmap/build/browser/provider acceptance not claimed.
risk: independent postrepair acceptance pending; old DB33/00008 setup mismatch remains parent-owned; pre-upgrade deleted cutoff history and already suppressed audits cannot be recovered from absent evidence.
verdict: **ITERATE — scoped repair implemented and locally verified, ready for independent recheck; not full Phase 2 acceptance.**

## Final verification appendix

- Additional unchanged-runtime focused run: `vitest run tests/events/lifecycle.test.ts tests/events/runtime.test.ts` — **17/17 pass**.
- Mechanical comparison confirms 00009 acknowledgment body changes only the evaluated-audit conflict suppression; league/evaluation locks, compare-basis validation, score validation, replay and coronation guards remain identical to 00006.
- The final harness adds a stronger optional concurrency assertion: two acknowledgments queued on the same league lock after hold expiry must yield one evaluated occurrence and one replay, exactly three evaluated audit rows and one coronation. **This newly added barrier was not reached in a successful run.** Final retry `bracket_lifecycle_f7125fb4a468` created its database but failed during baseline migration execution with empty subprocess diagnostics. A separate read-only query for that disposable database exited **137**. The cause is not established; do not label it an OOM or a code failure without evidence.
- The successful `bracket_lifecycle_c21fea837288` run predates only that extra harness assertion and improved subprocess diagnostics; the SQL/TypeScript repair and DB35 assertions are unchanged. Sequential exact-once recompletion/lost-ack, existing competing/stale-ack lock barriers, original counterexamples and populated forward-hold replay are actually verified. Do not count the unexecuted stronger barrier as acceptance.
- Resume command after local database stability: `python3 scripts/verify-window-lifecycle-repair.py`; then independently review 00009, scan worker/adapter and DB35. No host/container recovery actions were attempted.
