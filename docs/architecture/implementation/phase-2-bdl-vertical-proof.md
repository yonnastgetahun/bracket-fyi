# Phase 2 E2 — bounded NFL provider seam (2026-10-30)

## Scope and verdict

Implemented production `BdlNflAdapter` against the stable `ProviderAdapter` port; replaced the test-only synthetic normalizer and schema-only DB scaffold. This is **one original synthetic NFL postseason game**, not the full 13-game/reseeding NFL journey, observed provider parity, live entitlement, or E2 completion.

**Source/pure checks passed; real DB execution pending parent.** No Docker, SQL connection, application runtime, provider network, credentials, commits or activation used in this implementation batch. Earlier scaffold claims are superseded: a schema setup and zero-observation assertion were not ingestion proof.

## Concrete behavior

- Fixed NFL endpoint, one explicit UTC day per pull, one HTTP call, 25-second/2-MiB transport bounds and at most 100 rows. No redirects, retries or provider-supplied URLs.
- Explicit reviewed season 2026 spanning January 2027; never derive season from calendar date. Multi-day windows fail before HTTP (caller must schedule explicit daily windows).
- Numeric advancing cursor maps to the orchestrator's typed `{cursor: number}` continuation.
- Reviewed game ID → contest/stage/key/kickoff/week/ordered team IDs; team IDs → distinct entry/competitor identities. Invalid/duplicate mappings, unexpected postseason/week/date/pairings and unmapped IDs fail closed.
- Date-only provider evidence cannot invent kickoff: use the exact reviewed kickoff within the requested window. Schedule changes require reconciliation.
- Supported synthetic lifecycle states: scheduled, in_progress, completed. Unknown/contradictory lifecycle, missing/tied/invalid final scores reject the whole page. Nonfinal scores never settle. Final/OT uses inclusive totals without adding OT twice.
- Minimal sanitized provenance only. No `updated_at` revision or automatic correction authority. Conflicting final results must pass existing quarantine/operator mechanisms.
- Manual mode accesses neither HTTP nor credentials. Adapter registration is dependency-injected by the existing runtime registry; no real binding enabled.

## Executable integration harness (not executed in this batch)

`tests/events/provider-bdl-vertical-db.test.ts` now creates a fresh **retained** disposable database and applies migrations only on explicit opt-in. The ordinary test run skips that case.

Its real path is synthetic HTTP → production BDL adapter → `createEventIngestionRuntime`/orchestrator → ledger/budget/evidence/structural/result repositories → service-role SQL RPCs → lifecycle capture/reconciliation → production scorer.

The fixture uses the NFL template's winner-including-overtime market with two canonical entry UUID choices and locked home/away winner picks, not UCL/draw choices. The bounded one-game manifest intentionally has no championship or reseeding claim. Independent oracle: home wins 24–17; home picker earns/maxes 1, wrong 0, rank 1; away picker earns/maxes 0, wrong 1, rank 2; both pending 0.

Opt-in assertions require:
1. Global stop cancels with zero outbound calls/observations.
2. Enabled isolated run persists two normalized observations and one attributable provider winner; no new identity aliases.
3. Real lifecycle reports complete for this bounded manifest; persisted leaderboard equals the independent oracle.
4. Replay preserves observation count/result identity+version and replays lifecycle.
5. Opposite final without trusted revision quarantines, preserving canonical result.
6. Unmapped game and HTTP 401 fail without new observations; retained rows exclude secret/raw sentinels.
7. Exactly five outbound attempts (stop costs zero), real repository RPC names, zero notification attempts; finally stop again. Synthetic budget is 5 requests/60 seconds.

## Commands and results

From `/Users/yonnasgetahun/bracket-fyi`:

```sh
env -u BRACKET_BDL_VERTICAL_DB_TEST npx vitest run tests/ingestion/providers/balldontlie-nfl.test.ts tests/ingestion/providers/balldontlie.test.ts tests/ingestion/providers/http.test.ts tests/events/provider-bdl-vertical-db.test.ts
npx tsc --noEmit --incremental false
npx eslint lib/ingestion/providers/balldontlie.ts lib/ingestion/providers/balldontlie-nfl.ts tests/ingestion/providers/balldontlie-nfl.test.ts tests/events/provider-bdl-vertical-fixture.ts tests/events/provider-bdl-vertical-db.test.ts
```

Focused suite: 59 passed, 1 DB case deliberately skipped (4 files). TypeScript and focused ESLint passed. TypeScript initially found two test typing errors; both repaired before final verification.

**Parent-only execution command**, with the existing local Supabase DB container running:

```sh
/Users/yonnasgetahun/clawd/bin/exec -- 'cd /Users/yonnasgetahun/bracket-fyi && BRACKET_BDL_VERTICAL_DB_TEST=1 npx vitest run tests/events/provider-bdl-vertical-db.test.ts'
```

The command prints the retained `bracket_bdl_vertical_<random>` database name. No deletion/teardown is performed. Any SQL/runtime failure remains an integration finding, not a passing result. Parent must record actual output and independently review before accepting the DB seam.

Remaining gates: full NFL structure/13-game/reseed journey; real provider season/status/date coverage, terms, account entitlement, shared-account quota/registration, live activation and deployment. Other BDL sports remain their existing transports, not implicitly covered production normalizers.
