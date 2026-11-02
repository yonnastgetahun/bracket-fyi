# Durable browser fixture generator

## Scope and authority

New source only; no product changes or commits. Builder executed **no DB, Docker, HTTP or browser operations**. Runtime remains the parent's serialized responsibility. This implements the missing fixture preparation described in `docs/architecture/implementation/phase-2-browser-lanes.md`; it does not claim browser acceptance.

## Exact invocation

Requires an already migrated disposable DB in local container `supabase_db_bracket-fyi`, and the healthy synthetic-enabled application **attached to that same DB** at `http://127.0.0.1:3137`. All current migrations must be applied by the parent. Requires Node 22.15+ (existing repository TypeScript import hook), repository dependencies, Docker CLI and local Unix socket `/var/run/docker.sock`. It does not use Docker's selected context or a remote DOCKER_HOST.

From repository root, replace the example database name with the actual parent-owned disposable DB:

```sh
BRACKET_FIXTURE_DATABASE=bracket_http_012345abcdef \
BRACKET_FIXTURE_DISPOSABLE=bracket_http_012345abcdef \
BRACKET_FIXTURE_ORIGIN=http://127.0.0.1:3137 \
node --import ./scripts/event-runtime-register.mjs scripts/seed-event-browser-fixtures.ts
```

No secrets or cookie values belong in argv. No dotenv or hosted environment is loaded. The only success output is the private fixture directory path.

Successful output is `tmp/browser-fixtures/<run-uuid>/`, a new 0700 directory under the existing ignored `tmp/` tree, with exclusively created 0600 files:

- `shared.json`
- `ucl-final.json`
- `wwc-medals.json`
- `evidence.json` (template/league/result/publication audit identities and independent baselines)
- `status.json` (initial start marker) and `complete.json` (written only after all three pass setup checks)

Use the returned run directory:

```sh
node scripts/verify-event-browser-lanes.mjs shared tmp/browser-fixtures/<run-uuid>/shared.json
node scripts/verify-event-browser-lanes.mjs later tmp/browser-fixtures/<run-uuid>/ucl-final.json
node scripts/verify-event-browser-lanes.mjs later tmp/browser-fixtures/<run-uuid>/wwc-medals.json
```

These browser lanes are consuming/mutating: use a fresh seeder run for another complete lane run. Never treat missing `complete.json` or a partial run as ready. Partial data is deliberately retained; no automatic retries, drops or cleanup are implemented.

## What is generated

### Shared canonical / active override / UI release

Exactly three leagues share **one template/configuration** and canonical contest mapping. The reduced reviewed UCL regulation manifest has two scored markets: the canonical target and an unresolved sentinel retaining overall locked state. Each league has independently joined home, away and draw participants, complete submitted picks and a locked window.

Scoped local operator `result.record` publishes a draw (version 1), organizer lifecycle paths apply away overrides in two leagues **against version 1**, and the same operator publishes a real correction to home (version 2). Thus publication and correction have genuinely different outcomes, and correction differs from the local override. This deliberately uses draw → home, not three distinct winners in a two-team contest.

The operator has only edition-scoped result authority plus the necessary local global-stop grant. Before mutation the DB name must match the explicit acknowledgment, global stop must be on, sends/notifications off, there must be no provider bindings or outstanding notification attempts. Global stop is temporarily cleared for operator publication, restored in `finally`, and its generated credential is deactivated. No provider or notification worker is invoked.

Hand oracle: one point for the target winner; losers have one wrong pick; all have a pending sentinel pick. Home wins canonical; away wins overrides; ranks are 1,2,2. The release fixture starts with its override active, with exact **post-browser-release** canonical home expectations. Generator never performs the release intended for the browser.

### Full UCL / WWC late-window fixtures

Both use the unabridged `buildApplicationManifest`: UCL 211 scored units; WWC 64. Earlier windows are actually opened/reviewed, submitted and locked through application/repository RPC paths. Outcomes use organizer lifecycle mutations, not direct revision inserts. Every UCL tie has reversed leg orientation, the same team winning both legs, and an agreeing aggregate qualifier. UCL reviewed placements contain distinct top-eight and play-off entrants; WWC group lower seeds win, reviewed round-of-16 slots honor groups, and final/bronze inputs use the actual semifinal winners/losers.

Only the target final/medals window remains unopened/unreviewed. All prior prerequisites and picks are retained, no hold/exclusion is fabricated. Expected rows are built from literal hand totals, **not copied from scorer output**:

| Fixture | Older locked picks | Older earned / wrong | After final | After bronze |
| --- | ---: | ---: | ---: | ---: |
| UCL | 210 | 209 / 1 | 210 / 1, complete | n/a |
| WWC | 62 | 61 / 1 | 62 / 1, locked | 63 / 1, complete |

One deliberately wrong first regulation draw accounts for the wrong count; all other picks are correct. WWC results are ordered final then bronze. Generator runs real reconciliation and checks actual baseline rows against the precomputed independent oracle, then verifies anonymous HTTP room identity/participants/state against the fixed local app to reject wrong-DB attachment.

## Static/non-DB checks

- 12/12 focused Vitest tests pass: explicit target rejection, complete catalogs, hand totals, topology, leg/qualifier consistency, WWC placements/losers, target prerequisites, shared tied ranks, and production graph/scorer comparison against independently specified rows. The production scorer is tested as the implementation, never used to create oracle expectations.
- `npx tsc --noEmit --pretty false`: pass.
- Scoped ESLint on the seeder/helpers/test: pass.
- Native-loader import of the generator: pass, inert (no DB/network).
- Existing browser contract tests remain separately parent-owned; no browser harness edits.

## Limitations / parent verification

Runtime integration is **unverified by this builder**. Parent must execute preparation and the three browser lanes, investigate any runtime mismatch, and record exact-head evidence. No PWA/legacy fixture is created. No live providers, subscriptions/sends, deployment or installed-device result is implied. This is late-stage synthetic coverage, not browser create-through-every-intermediate-window coverage; shared publication occurs before browser launch, not while a browser is observing propagation.

changed: durable guarded generator, pure original fixture plans, local SQL adapter and non-DB checks.
matters: shared and full later browser lanes no longer require ad-hoc manual SQL setup.
checks: targeted tests/typecheck/lint/inert import, no DB/HTTP/browser executed.
risk: runtime/SQL/application integration needs parent execution; retained partial runs are not ready fixtures.
verdict: iterate (runtime verification pending).
