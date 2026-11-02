# Trusted numeric persistence → rendered UI proof source

2026-10-30 · E1/E4/E5, P7/P11/P12. **Source/preflight verified; SQL and browser NOT executed in this lane.** Runtime ownership remains with the designated worker. No production changes, DB/Docker/browser/server launch, providers, notifications, commits or spending.

## Existing coverage / specific gap

Read governing spec v1.0, provider/execution contracts, numerical-feasibility proof, and synthetic-feasibility/scoring/lifecycle implementation. Existing synthetic-feasibility tests already prove numerical Play-In/UCL/WWC scores in memory. Existing lifecycle DB proof covers one-market draw/correction without a trusted unresolved domain. Existing browser lane standings assertions check rank/earned/wrong but omit maximum. No replacement production scorer or duplicate journey implementation was necessary.

New files:

- tests/events/trusted-numeric-fixture.ts — original fixtures; hand-authored expected literals.
- tests/events/trusted-numeric-fixture.test.ts — JSON/scorer/lifecycle evaluator preflight only.
- tests/events/trusted-numeric-persistence.ts — explicit-owned actual SQL runner reusing fixture-sql and production lifecycle/application repositories.
- tests/events/trusted-numeric-db.test.ts — opt-in SQL suite, default skipped.
- scripts/browser/trusted-numeric.mjs — actual HTTP + visible five-column standings assertions.
- scripts/browser/trusted-numeric.test.mjs — checker negative tests, NOT browser evidence.
- scripts/verify-trusted-numeric.mjs — SQL or SQL+existing-browser driver, no runtime launch.

## Finite independent oracle

Rows: **earned / maximum / wrong / rank**. Expected numbers are literals, never production outputs used as expectations.

| Checkpoint | P | Q | Other |
| --- | --- | --- | --- |
| Play-In before | 0/6/0/1 | 0/6/0/1 | Coherent locked picks |
| East first games A, C | 2/6/0/1 | 1/5/1/2 | West unresolved |
| West settled, east B decider | 6/6/0/1 | 4/4/2/2 | Complete |
| Correct decider to C | 5/5/1/1 | 5/5/1/1 | Remains complete |
| Invalidate decider | 5/6/0/1 | 4/5/1/2 | Reopens locked, unchanged picks |
| Restore B | 6/6/0/1 | 4/4/2/2 | Single coronation in history |
| East A, D; C eliminated | 1/5/1/1 | 0/3/2/2 | Missing-submission F: 0/0/6/3 |
| UCL first leg A | 0/1/1/2 | 1/3/0/1 | P away/draw/B maximum **1, not 2** |
| UCL evidence absent | 0/null/1/2 | 1/null/0/1 | Temporarily unverified |
| Reviewed WWC groups | 48/64/0/1 | 47/63/1/2 | 16 future pending each |
| Reviewed WWC all 64 | 64/64/0/1 | 64/64/0/1 | Complete; 0 pending |
| Original WWC unknown placement | 48/null/0/1 | 47/null/1/2 | Unknown stays unknown |

Trusted WWC replaces placement placeholders with original hypothetical entrants, retains winner/loser topology, and enumerates all 65,536 knockout/medal worlds. Full orientations are test-owned reviewed hypothetical pairings, not inferred real qualification. Compact IDs bound serialized manifest below 24 MiB (asserted). No sampling/truncated certification. Unknown WWC retains original placement boundary. UCL proves sign-domain compatibility, not goal-margin persistence.

## Actual persistence / rendering path

Preflight: exact owned database/container, stopped runtime, disabled notifications/real sends, zero provider bindings/outstanding send attempts. No environment files or provider credentials.

Historical templates/participants/picks/windows are SQL fixture setup, **not browser submission proof**. All memberships precede first lock. Results use authenticated production mutate_event_lifecycle; capture → evaluate → commit → fresh repository read executes actual RPCs. Persisted evidence equals fixture evidence. Rows match independent literals; readApplication must preserve them. Replay, unchanged pick JSON and single-coronation counts are checked.

Six Play-In phases reuse one league/picks. WWC 48/64 use separate historical seeded leagues because pick/window states differ; no claim of an interactive stage-submission journey. Existing full-window harness owns that journey. Corrections here are local overrides, not canonical/provider transport proof.

Browser mode checks every checkpoint immediately: real room GET, exact UUID/state/safe anonymous DTO, then visible table. All five columns match literal strings, including Maximum. Missing text, zero substituted for null, null for a number, or maximum 2 for 1 fail. The driver creates an isolated context in an already-running local browser, then disconnects without closing that browser.

## Runtime-owner commands — NOT run here

Use the owner's already migrated, disposable isolated database. Accepted names: bracket_numeric_<12 lowercase hex> or the existing HTTP harness's bracket_http_<12 lowercase hex>. Containers: supabase_db_bracket-fyi or bracket-p11-db-<12 lowercase hex>. No postgres/hosted/default database accepted. Set actual owned values; these commands do not provision a database.

From repository root:

```sh
export BRACKET_NUMERIC_DATABASE="$OWNED_DISPOSABLE_DATABASE"
export BRACKET_NUMERIC_DISPOSABLE="$BRACKET_NUMERIC_DATABASE"
export BRACKET_NUMERIC_CONTAINER="$OWNED_DISPOSABLE_CONTAINER"
RUN_TRUSTED_NUMERIC_DB=1 npx vitest run tests/events/trusted-numeric-db.test.ts
```

Equivalent SQL-only artifact:

```sh
node --import ./scripts/event-runtime-register.mjs scripts/verify-trusted-numeric.mjs sql
```

For rendering, existing app **http://127.0.0.1:3137** must serve current source and that exact DB with local rehearsal enabled. Reuse the sole runtime worker's setup; no second stack. Wrong DB cannot pass: GET must contain the newly seeded UUID and expected board. Connect to that worker's already-running loopback CDP endpoint (replace example port with actual):

```sh
export BRACKET_NUMERIC_BROWSER_URL=http://127.0.0.1:9222
node --import ./scripts/event-runtime-register.mjs scripts/verify-trusted-numeric.mjs browser
```

Uses existing puppeteer-core installation from other browser harnesses; no installation. Browser mode seeds its own run and checks all 12 phases. SQL-only then browser mode are independent runs.

Artifacts: tmp/trusted-numeric/run-*/result.json. Only passed browser mode with **12 rendered checkpoints** is SQL+render evidence. A generic callback alone is never labeled browser execution. Failure remains failed; DB objects retained for diagnosis. No cleanup/deletion, activation or sends.

## Executed verification / disposition

```sh
npx vitest run tests/events/trusted-numeric-fixture.test.ts tests/events/trusted-numeric-db.test.ts
node --test scripts/browser/trusted-numeric.test.mjs
npx tsc --noEmit --incremental false
npx eslint tests/events/trusted-numeric* scripts/browser/trusted-numeric* scripts/verify-trusted-numeric.mjs
git diff --check
```

7 fixture checks and 4 assertion checks pass; actual SQL test explicitly skipped. Initial TypeScript issues were confined to new readonly fixture assignment/env typing/UUID map inference and corrected. No production defect demonstrated by this source work; no production patch proposed without runtime reproduction.

changed: finite trusted numeric SQL/UI harness and literal fixtures only.
matters: trusted-domain persistence and maximum-column checks are executable.
checks: source-only; SQL/browser execution outstanding.
risk: actual SQL trigger/runtime compatibility and rendering await sole runtime owner.
verdict: ACCEPT proof source; HOLD actual persistence/rendered acceptance pending runtime evidence.
