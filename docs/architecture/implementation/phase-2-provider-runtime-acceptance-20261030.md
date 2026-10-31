# Independent provider runtime acceptance — 2026-10-30

## Verdict

**ACCEPT the bounded FD and BDL synthetic adapter → orchestrator → SQL → real scorer seams, after two demonstrated BDL repairs.** This is not scaffold success, full E1/E2 acceptance, live-provider validation, browser acceptance, or release readiness.

Actual execution: FD **3/3 passed** (one SQL integration, two fixture tests); BDL final **3/3 passed** (one SQL integration, two fixture tests); focused provider/transport unit suite **107/107 passed** (49 FD, 33 NFL adapter, 13 BDL transport, 12 HTTP). No skipped DB cases in accepted runs. Scoped ESLint and TypeScript passed; final scoped ESLint and git diff --check passed. No whole-project test/build claim.

## Independent findings and repairs

1. **Confirmed production integration defect: initial cursor.** The durable run ledger passes `{}` as its first-page checkpoint. The BDL adapter accepted only absent cursor or a one-key numeric cursor; first SQL run failed with `provider:invalid_response / invalid_cursor`, zero observations/results. Pure fixture tests omitted cursor, concealing the mismatch. Added a regression using the actual empty-checkpoint shape: **32 pass / 1 fail before repair**. Normalize only an empty object to absent cursor; retain rejection of malformed/nonadvancing cursors and do not send a cursor query parameter. Regressions now pass.
2. **Confirmed harness accounting defect: stopped reservation.** After cursor repair, ingestion/scoring/replay/quarantine succeeded, but the planned 401 case became `rate_limited`: five budget reservations exhausted capacity before the fifth outbound attempt. The real orchestrator reserves before global-stop admission. Builder statement “stopped = zero” is true for outbound calls, **not budget reservations**. Set fixture capacity to six/60 seconds and assert five units remain after stopped run. Still require exactly five HTTP attempts and zero notification attempts. No production budget/stop behavior changed.
3. **Disproven scaffold equivalence.** Current BDL harness uses production BdlNflAdapter, actual ingestion repositories and service-role SQL RPCs. Accepted run stored an attributable winner and the real lifecycle scorer's independent winner oracle. Earlier schema-only scaffold and skipped DB checks do not establish this.
4. **Scope limits remain explicit.** A one-game NFL manifest removes championship/reseeding edges; “complete” is only that manifest. Three fixture leagues exist, but only league ending `0011` is reconciled; siblings `0012/0013` remain locked. No full NFL 13-game journey, full UCL progression, all-template coverage, live status/entitlement parity, deployed scheduling, PostgREST/HTTP endpoints or UI proven. Pagination is unit-tested, not multi-page SQL-tested. Correction rejection is proven, not trusted provider correction acceptance.

Diagnosis used the diagnose skill: reproducible SQL failure → sanitized retained diagnostics → minimal red regression → adapter repair → fresh SQL run exposed a separate budget-fixture failure → one-variable harness repair → fresh passing SQL run. Initial hypotheses were request validation, budget admission and adapter rejection; persisted `invalid_cursor` isolated the adapter. No broad payload/secret dump was needed.

## Actual retained databases and counts

| Lane | Database | Result |
| --- | --- | --- |
| FD accepted | `bracket_provider_vertical_6915530f02c7` | 3 pass |
| BDL initial | `bracket_bdl_vertical_c598fdbc9833` | 2 pass / 1 fail; invalid_cursor |
| BDL cursor repaired | `bracket_bdl_vertical_696255ecf0d4` | 2 pass / 1 fail; auth case rate_limited |
| BDL final accepted | `bracket_bdl_vertical_d8f188e9660e` | 3 pass |

Independent post-run SQL inspection of **each accepted DB**:

| Persisted quantity | FD | BDL final |
| --- | ---: | ---: |
| Ingestion runs | 6 | 6 |
| Normalized stored observations (after correction) | 4 | 4 |
| Canonical provider results | 1 | 1 |
| Result version | 1 | 1 |
| Quarantine rows | 1 | 1 |
| Reviewed identity refs | 5 | 5 |
| Provider attempt rows / asserted HTTP calls | 5 / 5 | 5 / 5 |
| Budget reservations | 6 | 6 |
| Notification attempts | 0 | 0 |

Both accepted sequences: canceled, succeeded, succeeded, partial, failed invalid_response (unmapped), failed authentication. Both final global stops true, notification and real-send flags false. FD result is a draw; BDL winner is home entry ending `0007`. Both results retain a source-observation link.

Both scoped stored leaderboards independently inspected: picker ending `0101` earned/max 1/1, wrong 0, pending 0, rank 1; picker ending `0102` earned/max 0/0, wrong 1, pending 0, rank 2. FD oracle is a draw pick; BDL oracle is home winning 24–17. Harness additionally checks initial normalizedCount=2, replay retains observations/result identity+version, lifecycle replay, conflicting final quarantine, unmapped/auth attempts adding no evidence, and absence of synthetic credential/raw sentinels in retained observations/run diagnostics.

## Provenance and commands

Cwd: `/Users/yonnasgetahun/bracket-fyi`.
HEAD: `3ca08fbd7d3cfa5266a2114ab3bb3f9f391d83e8`; branch `agent/bracket-roadmap-20261026`.
Working tree was already dirty/untracked; these are **source-hash-bound working-tree proofs, not exact-commit release proofs**.
Node `v26.12.0`, npm `11.20.0`, Vitest 4.1.11.

Executed via workspace wrapper with an explicitly quoted command and explicit repository cwd:

```sh
BRACKET_PROVIDER_VERTICAL_DB_TEST=1 npx --no-install vitest run tests/events/provider-vertical-db.test.ts
BRACKET_BDL_VERTICAL_DB_TEST=1 npx --no-install vitest run tests/events/provider-bdl-vertical-db.test.ts
npx --no-install vitest run tests/ingestion/providers/football-data.test.ts tests/ingestion/providers/balldontlie-nfl.test.ts tests/ingestion/providers/balldontlie.test.ts tests/ingestion/providers/http.test.ts
npx --no-install eslint lib/ingestion/providers/balldontlie-nfl.ts tests/ingestion/providers/balldontlie-nfl.test.ts tests/events/provider-bdl-vertical-db.test.ts tests/events/provider-vertical-db.test.ts
npx --no-install tsc --noEmit --incremental false --pretty false
git diff --check
```

All **36 migration files** applied in each new database. Per-file SHA-256 manifests and full relevant source hashes are retained. Migration-manifest SHA-256 (identical initial/final):
`841588a68fd188b1005bdf27957bc189fa2a0205fa9f7a72c3db1b7b1d0ce0f9`.
Hashed source/migration files did not change during either accepted run. FD dependencies were unchanged by the BDL-only repairs.

| Final source | SHA-256 |
| --- | --- |
| lib/ingestion/providers/balldontlie-nfl.ts | `40b63482b18b57ca3ee69ef7c6c319dd44a55adec4215b035a577edc524c38f7` |
| tests/ingestion/providers/balldontlie-nfl.test.ts | `c8ebd3d4717a84c79dcbfa1795a13a72f284c87cd1ba2927e6d8eb2b18d49012` |
| tests/events/provider-bdl-vertical-db.test.ts | `a96799c32cd5eadcd61073ed5b711659c5430f834aa8a14cd5daedb1adf9c76c` |
| tests/events/provider-vertical-db.test.ts | `e0619c212be5a80a6a7ba68a60bbfc258f22f19e7d549d0b80a34de6fc51fbb7` |
| package-lock.json | `b513a99a178dd4311823cccd43ea4c14e2f05ba57f2b686f660c27d2bac028e8` |

Evidence directory: [provider-runtime-acceptance-20261030](provider-runtime-acceptance-20261030/).
- [Initial provenance](provider-runtime-acceptance-20261030/provenance.json), [final BDL provenance](provider-runtime-acceptance-20261030/bdl-final-provenance.json): commands, UTC timestamps, outcomes and full source/migration hashes.
- [FD log](provider-runtime-acceptance-20261030/fd.log), [initial BDL failure](provider-runtime-acceptance-20261030/bdl.log), [red cursor regression](provider-runtime-acceptance-20261030/bdl-cursor-red.log), [budget failure](provider-runtime-acceptance-20261030/bdl-repaired.log), [accepted BDL](provider-runtime-acceptance-20261030/bdl-final.log), [107 unit passes](provider-runtime-acceptance-20261030/provider-unit-green.log).
- [Independent SQL counts](provider-runtime-acceptance-20261030/sql-counts.json) and [reproducible inspection SQL](provider-runtime-acceptance-20261030/inspection.sql).
- [Final migration hashes](provider-runtime-acceptance-20261030/bdl-final-provenance-migrations.sha256), [lint/typecheck outcomes](provider-runtime-acceptance-20261030/checks.json).

## Isolation / remaining risk

Only four newly named disposable proof DBs were created; all retained and stopped. Existing browser DB `bracket_http_439610679a15` was never targeted, queried or changed. No shared service restarts, role changes, migrations against existing DBs, provider network, real credentials, real sends, commits, pushes or activation. Synthetic fetch implementations are injected; RPC transport is Docker/psql, not mocked repositories or hosted services.

Stopped runs conservatively consume budget before admission and can resolve credentials before the final stop check; this verification proves zero outbound calls, not zero pre-admission work. Changing that production policy is outside this repair and was not undertaken. SQL harnesses are opt-in; ordinary test runs remain insufficient to claim DB acceptance. Broader final candidate verification and publication remain the orchestrator's responsibility.

changed: BDL empty-checkpoint handling, one focused regression, corrected BDL fixture budget/accounting, durable proof artifacts.
matters: converts an unexecuted provider claim into demonstrated SQL/scorer integration and preserves both discovered failures.
checks: 6/6 accepted vertical cases including 2 actual SQL cases; 107 provider unit cases; scoped lint/typecheck; direct persisted counts; source/migration hashes.
risk: bounded synthetic integration only; external/full-event/HTTP/UI/final-candidate gates remain.
verdict: accept bounded provider seams; do not infer full Phase 2 completion.
