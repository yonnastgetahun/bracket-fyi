# Phase 2 runtime recovery — 2026-10-30 local
project: BRACKET-FYI; synthetic-only; no commits/deploy/spend/sends
Done when:
- [ ] All 12 numeric SQL and rendered checkpoints pass unchanged exhaustive oracles.
- [x] Final through-00015 DB/transition/lint checks have retained evidence (two DB assertions fail; not acceptance).
- [x] Runtime/harness changes independently reviewed; restart inventory recorded.
Evidence: [durable result and SHA-256 manifest](phase-2-runtime-recovery-evidence.json), `tmp/runtime-recovery/`, and artifacts below. All owned jobs finished.

## Diagnosis and bounded attempt
Prior failure already reproduced three global OOM kills. Ranked hypotheses: shared VM memory pressure; avoidable giant SQL-literal parse copies; irreducible full-JSONB construction under available headroom. Before this attempt the shared VM had 8,127,876 kB total, 368,672 kB available. Isolated DB used 94.56 MiB of its 512 MiB limit; HTTP adapter 92.41 MiB; longstanding local Supabase DB 180.6 MiB. Hundreds of unrelated containers were left untouched.

Only active bracket runtimes and the longstanding local Supabase DB were running. The latter has retained baseline/data and was not proven a disposable idle task container; no authority was inferred to stop it. Two old HTTP adapters were already exited. No container was stopped, restarted, resized, or deleted. `tmp/runtime-recovery/restart-inventory.json` records exact IDs, statuses, mounts, limits, restart commands, and `stoppedByThisTask: []`. Volumes/data retained; shared VM never restarted.

Changed only `tests/events/trusted-numeric-persistence.ts` fixture transport: COPY text replaces the giant INSERT SQL literal. Complete JSON, all 65,536 worlds, SQL transaction, manifest budget, assertions, and literal numeric oracles retained. COPY escapes backslash first, then tab/newline/CR, and uses explicit end-of-data. No production edits.

Command (guard wrapper, absolute path): `python3 /Users/yonnasgetahun/bracket-fyi/scripts/trusted-numeric-runtime.py sql`.
Result: **failed, 9/12 persisted checkpoints**, zero rendered in this SQL-only run. `tmp/trusted-numeric/run-mzUnEY/result.json`; source evidence `tmp/trusted-numeric/1793405859841072000-source.json` confirms before/after source identity. Full WWC insertion failed again; `oom_kill` increased **3 → 4**, while cgroup `max=0`, `oom=0`. Concurrent read-only psql probe returned `FATAL: the database system is in recovery mode`; Docker status temporarily stalled. No blind repeat. Database recovered automatically, with `global_stopped=t`, both send flags false, and notification attempts 0; available VM memory was then 487,580 kB.

Historical nine rendered checkpoints remain in `final-numeric-runtime.md`; this task did not rerun browser after a proven same-input resource failure. Still unverified: reviewed WWC 48-of-64, reviewed WWC 64-of-64, unknown-placement WWC. No claim of successful 12/12 SQL/browser acceptance.

## Independent review
Read-only reviewer run `856e34cb-b3d5-4a68-93e6-4e92a385d23a` accepted transport implementation with no blocking findings. Escaping/transaction correct; fixture SHA matches preserved baseline. Capture equality checks the full **lifecycle section** (binding plus exhaustive components), not the whole manifest. OOM avoidance remains unproven and, in this attempt, failed.

Reviewed SHA-256:
- persistence: `836d6407cbde466147adf5aa86632d2ca88f30d59898118446b62f214abd65c9`
- unchanged fixture/oracles: `a2c005c14b4c233e1b9db8b62d2088222d85c9d369a3c0be69d0fe44f2ef7f6d`
- unchanged SQL adapter: `9eb1f2c9bb0335486737edcafaba8cc89e7cf386296aa2bb36079001d721694b`

## Independent checks
- `npm run lint`: 0 errors, 13 warnings; `tmp/runtime-recovery-lint.log`.
- `vitest run tests/events/trusted-numeric-fixture.test.ts`: 7/7 passed, including full WWC JSON serialization/numeric literals; `tmp/runtime-recovery-fixture-tests.log`.
- Python compile (numeric and transition runners), Node syntax (numeric entrypoint/browser wrapper), `git diff --check`: passed.
- `BRACKET_TEST_DB_CONTAINER=bracket-p11-db-9bd170c85c0f python3 scripts/verify-event-transitions.py --through 20261027000015`: **2,429 assertions passed**, fresh/legacy/current lanes. Retained evidence: `supabase/tests/transitions/evidence-20261031T002058Z_1a4065.json`, SHA-256 `86dd82c9886267c26b05816a78007c8170f63fce010ffb46cdce63936e18e2b9`. All three retained database names in durable JSON.
- Full SQL suite, fresh `template0` database `bracket_final_1793406820453880000` on local `supabase_db_bracket-fyi`: **38 migrations through 00015, all 39 SQL files; 1,161 assertions passed, 2 failed (1,163 planned)**. Ephemeral driver `tmp/runtime-recovery-db.py` stopped on DB38 failure; `tmp/runtime-recovery-finish-db.py` explicitly executed the remaining DB39 file, which passed 11/11. This is direct psql/pgTAP execution, not a claim that the Supabase test CLI ran.
- `supabase db lint --db-url [fresh local DB] --schema public --level warning --fail-on error`: exit 0, **18 warnings**, not a warning-free result. Full findings retained in durable JSON and `tmp/runtime-recovery/db-lint.log`; include preexisting unused parameters, text/jsonb initialization notices, shadow/unused variables, and the series function volatility warning.
- Read-only independent reviewer `97ed88e5-11b5-4d75-ab7d-18275b802653` verified transition evidence, all 244 hash-valued assertions, and source identity (38 migrations/12 fixtures/15 repairs/5 tests/harness). Accepted DB driver for current inputs; noted recorded-only safety and empty-discovery hardening gaps. Final `tmp/runtime-recovery-close.py` explicitly asserts 38 migrations ending at 00015, all 39 tests, positive assertion counts, source hash identity, and exact safety `t|f|f|0` for both final DB and HTTP DB. These checks passed. Driver verdict remains failed, never promoted to passed.
- No additional OOM kills during smaller checks. No final DB rows/volumes removed; numeric sources and DB test/migration hashes verified stable through closeout.

## Separate final DB findings (product migrations unchanged)
DB38 assertion 11 found one deliberate retryable business raise: `commit_event_series`, migration `supabase/migrations/20261027000014_reviewed_series.sql:56`, raises `runtime stopped` using `40001`. This is not an engine-generated serialization failure. Existing HTTP conflict contract requires deliberate business conflicts to use PT409, including nested helpers; adjacent runtime-stop guards already use PT409. The query and 10 passing behavioral DB38 assertions are retained in `tmp/runtime-recovery/DB38_http_business_conflicts_test.tap`.

DB38 assertion 12 expects exactly 23 PT409 raises from the older through-12 schema; through-15 contains **34**. This inventory expectation is stale after migrations 14/15. Do not merely relax both assertions: the 40001 occurrence requires disposition/repair separately. A PT409 repair of that occurrence would make the through-15 inventory 35, so a schema-aware inventory test is preferable to another unconditional stale count.

These are concrete final acceptance findings, not repaired in this runtime/harness ownership pass. Parent must coordinate product migration/test repair, independent review, and rerun affected final-schema checks; retained old migration hashes must not be represented as proof of a later repaired candidate.

## Numeric blocker / safe next action
Available shared-VM headroom is insufficient for full WWC persistence even after eliminating SQL-literal parse overhead. An owner of unrelated shared workloads must release memory (or separately arrange a shared-VM capacity change). Obtain demonstrably greater sustained free memory before rerunning unchanged SQL then browser serially; ≥1 GiB free is a diagnostic starting target, not a proven sufficient threshold. Do not sample worlds, lower oracles, restart the shared VM without coordination, or indiscriminately stop unrelated containers. This task cannot safely reclaim that memory within its ownership scope.

changed: fixture transport only; diagnostic and retained evidence.
matters: preserves exhaustive semantics and identifies an external shared-memory gate.
checks: numeric 9/12 then global OOM; independent transport review accepted; transitions 2,429/2,429; full DB 1,161 pass/2 fail; DB lint exit 0 with 18 warnings; app lint 0 errors/13 warnings.
risk: full 12/12 SQL/rendered numeric acceptance blocked on shared VM headroom; final DB acceptance also blocked on DB38 findings.
verdict: **HOLD numeric and final DB acceptance**; transition proof accepted. No commits, live calls, deployments, notifications, container stops, or VM restarts.
