# Four-family production normalization — source packet

2026-10-30. Builder report; **independent acceptance pending**. E3/E4/E6/E7; P3/P4/P6. Existing dirty branch preserved. HEAD at checks: `3ca08fbd7d3cfa5266a2114ab3bb3f9f391d83e8`; these additions are uncommitted. No deployment, provider request, spend, browser, Docker or DB execution occurred.

## Changed files

- `lib/ingestion/providers/balldontlie-family.ts`: shared implementation for these four new family consumers only; existing NFL/common transport unchanged.
- `lib/ingestion/providers/balldontlie-nba.ts`: `BdlNbaAdapter`.
- `lib/ingestion/providers/balldontlie-mlb.ts`: `BdlMlbAdapter`.
- `lib/ingestion/providers/balldontlie-ncaab.ts`: `BdlNcaabAdapter`.
- `lib/ingestion/providers/balldontlie-ncaaf.ts`: `BdlNcaafAdapter`.
- `tests/ingestion/providers/balldontlie-families.test.ts`: 82 network-free normalization/admission cases.
- `tests/events/provider-four-family-fixture.ts`: invented transport fixtures and reviewed synthetic config.
- `tests/events/provider-four-family-vertical-db.test.ts`: 10 non-DB contract tests; five separately opt-in real SQL scenarios.
- `docs/architecture/implementation/phase-2-four-family-task.md`: pre-mutation scoped task.
- This report. No shared task/ledger or case-study edits.

## Consumer contract

All implement the actual `ProviderAdapter`/`PullContext` interface, key `balldontlie`, using `fetchBdlPage` and the existing HTTP budget boundary. Exactly one HTTP attempt per pull; injected synthetic fetch only in tests. Manual mode returns without HTTP/credential access.

Config: `mode`, exact `sport`, explicit `phase`, provider `season`, reviewed `seasonStart`/`seasonEnd`, positive `manifestVersion`, edition external ID, `teamMappings`, `matchMappings`. Each game has stable contest external ID/key, stage, reviewed oriented home/away IDs, kickoff and explicit `membership` matching phase. CFP additionally requires reviewed week. Provider season is explicit, never guessed from calendar year. Config remains operator-reviewed input; adapters do not grant review authority themselves or bootstrap names.

| Family | Admission and settlement |
| --- | --- |
| NBA playoffs | `phase=playoffs`, explicit membership, postseason=true; child games only, inclusive total score |
| NBA Play-In | Independent `phase=playin` query and map; no playoff-map admission; postseason flag is not assumed to classify Play-In |
| MLB | `phase=postseason`, postseason=true and season_type=postseason; nested runs, including extra innings; one-day pulls |
| NCAAB | `phase=tournament`, only reviewed game IDs, inclusive totals without adding OT arrays; expanded Opening Round/region/seed placement remains upstream reviewed structure |
| NCAAF/CFP | `phase=cfp`, only reviewed CFP game IDs and week; no bowl-name inference, inclusive totals without adding OT columns |

Unknown/suspended/postponed lifecycle, contradictory final labels, missing/tied final scores, wrong season/date/kickoff/pairing, duplicates and unrelated IDs fail the entire page with review-required details. Valid prefixes never leak a partial batch. No fetched timestamp becomes revision/correction authority. Same-ID replay remains repository-idempotent; new-ID replacements require an explicit reviewed map change (duplicate canonical contest mappings in one manifest reject).

Pagination: numeric cursor only; shared transport rejects malformed/nonadvancing cursors. New consumers additionally reject empty continuations, row counts exceeding per-page, and full terminal pages. The common transport collapses absent/null terminal cursor, so a full terminal page conservatively holds rather than claiming exhaustive coverage. This can hold a legitimate exact-full terminal page; an explicit reviewed transport completion contract is needed to relax it. No transport changes made here.

## SQL harness boundary

Run only when separately authorized:

```sh
BRACKET_FOUR_FAMILY_VERTICAL_DB_TEST=1 npx vitest run tests/events/provider-four-family-vertical-db.test.ts
```

Five scenarios: NBA playoffs, NBA Play-In, MLB, NCAAB, CFP. Each creates and retains its own disposable migrated SQL database. Synthetic transport calls the production adapter, actual `createEventIngestionRuntime`, real run ledger/budget/evidence/structural/result repositories and `reconcileEventLifecycle`/production scorer. Tests assert stop/no HTTP, winner evidence, replay idempotency, correction quarantine, unmapped ID failure, authentication redaction and no real sends. Finalizer restores stopped state.

This is explicitly **bounded game normalization/scoring**, not full tournament completion. Play-In/college winner earns one point; NBA playoff/MLB child games are unscored and have no participant child-game picks, yielding zero points. It therefore does not silently score individual games as series wins. Full series clinch, qualification handoff and full graph/lifecycle integration remain separate owners' work/evidence. No test-only adapter or fake projector substitutes for production execution in the opt-in lane.

## Actual verification

All commands ran from `/Users/yonnasgetahun/bracket-fyi` via the authorized exec wrapper and Python subprocess `cwd`.

- Initial red: missing production adapter imports, suite exit 1.
- Behavioral red: malformed date suffix and ambiguous terminal pagination accepted; **8 failed / 49 passed**, exit 1. Fixed and green.
- Behavioral red: NBA explicit datetime contradicted reviewed kickoff but admitted; **1 failed / 81 passed**, exit 1. Fixed and green.
- Final `npx vitest run tests/ingestion/providers/balldontlie-families.test.ts tests/events/provider-four-family-vertical-db.test.ts tests/ingestion/providers/balldontlie.test.ts tests/ingestion/providers/balldontlie-nfl.test.ts`: **4 files passed; 138 tests passed; 5 SQL tests skipped**, exit 0. New-only coverage: 82 normalizer + 10 fixture/scorer = 92 passing.
- Focused `npx eslint` across all eight new TypeScript files: exit 0; modified test rerun also exit 0.
- Final `npx tsc --noEmit`: exit 0 (an intermediate heterogeneous-invalid-input test typing error was corrected).
- `git diff --check`: exit 0. New-file whitespace separately inspected.
- No DB/Docker runtime lane run. Existing FD/NFL SQL results are not relabeled as evidence for these families.

## Integration needs / residual gates

1. Parent must independently review this packet. Builder does not self-accept.
2. Existing runtime registry is injected by caller and indexes provider key. All BDL adapters share that key; binding-aware selection/router integration must select the configured sport before scheduling mixed-family production runs. No application/orchestrator changes were in this write scope.
3. Versioned series membership/clinch/retraction, NCAA Opening Round qualifier placement, NBA seed handoff and CFP bracket/byes belong to the reviewed structural/lifecycle boundary; adapters emit games, not inferred series or qualifiers. The harness deliberately tests zero child-game scoring rather than claiming complete series completion.
4. SQL harness source is checked/typechecked but **not runtime verified**. Parent DB owner may run the five opt-in scenarios in a later authorized batch.
5. No live entitlement, payload parity, series association, replacement provenance, expanded NCAA provider bracket support, terms or correction ordering claims. Existing named live/provider gates remain closed.

changed: four production normalization consumers plus original synthetic regressions and opt-in SQL harness.
matters: approved finite family transport seams now produce canonical observations without invented identity or finality.
checks: 138 passed, 5 intentionally skipped; focused lint/typecheck pass.
risk: SQL execution and mixed-binding registry/structural integration remain unverified here.
verdict: hold for independent integration acceptance, not a full E1–E8/P1–P12 delivery claim.
