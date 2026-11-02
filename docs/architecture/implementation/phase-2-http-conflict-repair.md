# HTTP conflict durable repair
project: BRACKET-FYI
done when:
- [x] Additive 00012 and identical forward repair change only deliberate business SQLSTATE literals in latest function definitions through 00011; historical files unchanged by this worker.
- [x] PT409 and historical 40001 map to application conflicts; lifecycle SQL adapter preserves actual SQLSTATE.
- [x] Focused non-DB tests/types pass; SQL regression and exact parent replay instructions supplied without DB execution.
evidence: tests/events/http-conflict-contract.test.ts; DB38_http_business_conflicts_test.sql; parent-owned SQL/HTTP execution pending.

## Implemented scope

Migration `20261027000012_http_business_conflicts.sql` and byte-identical forward repair contain explicit CREATE OR REPLACE definitions for 14 functions / 23 deliberate RAISE literals. No catalog-wide mutation, exception catch, or engine SQLSTATE remapping. Existing owners/ACLs survive CREATE OR REPLACE; bodies, signatures/defaults, security modes, search paths, guards, locks and all other error codes match latest definitions through 00011. Transaction-local public search_path makes the two formerly unqualified function definitions explicit without changing stored settings.

| Current definition source | Functions (replacement counts) |
| --- | --- |
| 00003 | assert_event_membership (1), adopt_event_configuration (1), configure_event_window (1), submit_event_window (3) |
| 00005 | protect_event_window (1) |
| 00006 | event_lifecycle_effective (1), mutate_event_lifecycle (2) |
| 00007 | emit_event_notification (2) |
| 00009 | join_event_league (1), commit_event_lifecycle (1) |
| 00010 | protect_event_evaluation_basis (1), event_lifecycle_basis (2), review_event_pairings (4) |
| 00011 | event_operator_command (2) |

Nested helper/trigger conflicts are included, not just browser-facing RPCs. Actual engine 40001 remains retryable by PostgreSQL/PostgREST. Application classification still accepts 40001 for explicitly required historical compatibility, alongside PT409; no application replay added.

Lifecycle DB harness now requests psql verbose errors and extracts the actual SQLSTATE. Unknown process/timeout/JSON failures become XX000/unavailable, not fictional conflicts. Error details remain suppressed.

## Verification completed (no DB/Docker/browser execution)

- Six focused Vitest files: **50/50 pass**, including 14 new contract tests.
- `npx tsc --noEmit --incremental false`: exit 0.
- ESLint on six touched TS files: exit 0.
- `git diff --check`: exit 0.
- Contract test independently reconstructs latest historical definitions and proves every repaired body differs ONLY in the intended SQLSTATE; asserts function inventory/counts and migration/repair equality.
- New DB38 runtime regression authored: locked/stale submission, stale lifecycle mutation/commit, notification basis, unchanged authorization and four write-history rollback checks, plus catalog coverage. **Not executed by this worker.**
- Initial contract run caught a test-loop variable shadowing bug; fixed, then complete focused suite/types passed.

## Ordering / replay requirements (parent owns DB)

1. Apply migrations 00001–00011 normally, then 00012. Never back-edit 00002–00011.
2. Full forward-repair replay remains ascending 00001–00012, twice for idempotence. Earlier repairs 00009 and 00011 restore historical function bodies, so **00012 must be last** after replaying either. Safety hold rows, lifecycle_disabled/frozen flags, append-only histories and grants must remain unchanged by 00012.
3. Applying 00012 alone a second time is also safe (CREATE OR REPLACE only). Do not run it against a pre-00011 schema.
4. DB38 belongs only to through-00012/final-schema runs. Historical prefix lanes must retain historical 40001 expectations.
5. Historical SQL tests and transition/race scripts were deliberately **not modified** while parent's through-00011 run owns them.

### Required assertion integration before final-schema/full-transition execution

Current SQL tests 28, DB29, DB31, DB32, DB33, DB34, DB35 and DB36 explicitly assert historical 40001. Those deliberate-business assertions must expect PT409 on a through-00012 schema while still supporting original prefix replay. In particular 28/DB29/DB31 are reused by the transition harness on multiple prefixes: do not globally replace literals. Use an explicit target-aware expected business SQLSTATE supplied by the harness (or a narrowly checked installed-version contract), keeping DB38's PT409 expectation unconditional.

`scripts/verify-event-transitions.py` also has a post-all-repairs block around line331 catching 40001; this becomes PT409 only when `--through >= 20261027000012`. `supabase/tests/transitions/incarnation-held.sql` is invoked around line290 after the selected final migration and isolated 00005 hold repair. It must retain 40001 for historical through-00005/00011 runs, but use PT409 for through-00012. The safety-hold repair does not replace function bodies; it does not restore the historical SQLSTATE.

Current-final-schema race assertions:
- `verify-event-lifecycle-races.py`: three deliberate stale conflict checks around lines144/159/180.
- `verify-window-incarnation-races.py`: stale window rejection around line71.
- `verify-window-lifecycle-independent-review.py`: late enrollment/stale basis catches around lines61/88.

Those must use PT409 for final-schema execution (or explicit prefix selection). Preserve genuine serialization assertions if added; never blanket-convert unrelated error catches. Application SQL adapter warning filters in application-db and application-pairings-db currently suppress logs for 40001 only; PT409 can optionally be added to that warning suppression, but parsed errors already preserve actual code.

### Parent commands after releasing/updating shared assertion files

From repository root, via the workspace exec wrapper:

```sh
python3 scripts/verify-event-transitions.py --through 20261027000012
RUN_EVENT_APPLICATION_HTTP=1 npx vitest run tests/events/application-http.test.ts
```

The HTTP command assumes parent's owned local Next/PostgREST preview is already serving the through-00012 database. It exercises all nine templates and real conflict responses; re-run the minimal REST oracle if needed, but do not leave the deliberate 40001 oracle request spinning.

For a parent-owned disposable DB already migrated through00011, feed the following files through its existing psql invocation with ON_ERROR_STOP=1:
1. `supabase/migrations/20261027000012_http_business_conflicts.sql`
2. `supabase/tests/database/DB38_http_business_conflicts_test.sql`
3. `supabase/rollbacks/20261027000012_http_business_conflicts_forward_repair.sql` twice
4. DB38 again, plus reviewed existing SQL/race regressions.

Require pgTAP no failures, row/ACL/hold preservation, exact stale conflict HTTP409 and bounded response time. SQL/HTTP/engine retry observations remain parent-owned evidence, not claimed from static/unit checks here.

changed: additive PT409 SQL repair, three application mappings, truthful lifecycle SQL error adapter, focused regression and handoff.
matters: deliberate business conflicts no longer request transaction replay.
risk: SQL/HTTP runtime and target-aware historical assertion integration pending parent.
verdict: iterate — implementation/non-DB checks complete; parent runtime proof pending.
