# Phase 2 — series and structural integration

Scope: E3/E4/E6, P2/P5/P7/P9 seams; approved dirty branch, local synthetic only. No publication, hosted database, live provider, real delivery, purchases or commits. Older migrations and unrelated case studies preserved.

## Changed

- `20261027000014_reviewed_series.sql`: operator-scoped immutable membership/rule revisions; explicit replacement associations; replacement-equivalence dedup; attributable authoritative-parent conflicts held. Child insert and derived parent/audit/fanout commit atomically. Parent lock is taken even before first membership is visible. Corrections retract clinches, and unplayed children do not block thresholds 2/3/4.
- `lib/events/series-repository.ts` plus `runtime.ts`: persisted capture → actual `deriveSeries` production call → compare-basis SQL commit; bounded scan/cursor before lifecycle sweep. SQL independently verifies the proposed outcome. Replay does not create a new derived result.
- `lifecycle.ts` and additive SQL resolver extension: membership version and actual child result IDs/versions survive the safe application DTO. Canonical holds do not override a live league-local override or alter its masked effective token.
- `20261027000015_structural_qualifiers.sql`: NCAA 12-opening-game/32-pairing review; separate NBA Play-In actual-path review and seed 7/8 handoff. Versioned initial orientations; original predictions retained. Compatible prelock corrections refresh; incompatible locked corrections disable/freeze evaluation and expose held with no stale leaderboard until reviewed disposition.
- `application-manifest.ts`, `application-pairings.ts`, `application.ts`, `application-contract.ts`: strict synthetic structure and authenticated qualifier service. NBA main stays closed until reviewed qualification; 15 scored markets remain separate from six Play-In markets.
- `app/events/[id]/data/route.ts`, `review-pairings.tsx`, `room.tsx`: actual organizer qualifier action/control. NCAA uses own structural results; NBA explicitly authenticates the source organizer. Credentials are transient input, never audit/DTO output. SQL captures a source basis under locks; an explicitly supplied service-level source basis still enforces exact freshness. No participant, pick or point copying.
- Matching additive forward repairs retain immutable evidence/picks and freeze affected consumers. `scripts/verify-series-structural.py` creates only a unique `bracket_series_<12hex>` database; never reads hosted env or uses the existing application database.

## Verification / independent findings

Independent reviewer `series-skeptical-review` found four concrete defects in the initial implementation. All reproduced and repaired:

1. Retired replacement appended later counted twice → recursive accepted association equivalence check; regression now holds.
2. Authoritative parent winner bypassed derivation → authority participates in capture basis; synchronous own-parent conflict derivation; regression held/unresolved.
3. First membership review raced invisible child projection → unconditional parent serialization; deterministic two-connection lock barrier fails under prior trigger and passes repaired trigger.
4. Canonical hold changed an active override token → canonical hold only when no active override; exact token stable/provenance changes regression.

Postrepair independent static review disproved those four against repaired code, and identified an additional HTTP retry source-basis issue. Exact immutable HTTP retry reproduced 409 after source correction. Fixed: SQL captures an omitted source basis once under both league locks *after* exact idempotent replay lookup; immutable request retains null, audit retains the actual source token. Both NCAA/NBA HTTP retry paths now return 200 after later target/source changes. UI retains the same command key until success or changed input. Red/green logs: `series-structural-red-green/`; final full green below. Neither builder nor static reviewer substitutes for parent acceptance.

Tests include persisted operator child results through `readApplication`, real scorer/leaderboard, complete→retract→recomplete with one coronation, same-ID resumed dedup, reviewed cross-ID replacement, ambiguity hold/retry, source/target separation, create/join/submit/lock, actual Next POST handler, cutoff-only hold, full-row pick/evidence retention and forward-repair replay.

## Browser-owner contract

- Recreate NBA synthetic leagues with the new builder; old literal-placeholder manifests are deliberately not silently rewritten.
- Organizer POST `/events/<target>/data` action `qualifiers`: `configurationVersion`, `basisToken`, stable `idempotencyKey`, `reason`, `syntheticAcknowledged:true`. NBA additionally supplies `sourceLeagueId` and transient `sourceOrganizerToken`; NCAA omits both. Target organizer credential remains its scoped HttpOnly cookie. The UI button is **Review latest qualifiers**.
- GET includes `structuralQualifierReviewSupported`; initial-round markets expose `actualPairing`. After successful review, refresh versions and explicitly open the scored window. Play-In entries/locks/leaderboard stay independent; source completion does not await main playoffs.
- Series synthetic canonical setup: actual `contests` parent (`kind=series`, `best_of=3/5/7`), child `kind=game` with that parent and same edition/two entrants. Authenticate an event operator with `manifest.review`, then `createSeriesRepository(db).review(credential,parentId,expectedVersion,[{id,replaces?}],reason)`. Existing operator `result.record` persists child outcomes. Link the parent UUID in the sealed market `contestId` before league participation. No browser organizer gains shared-event operator authority.
- Parent/source review and child result mutations produce durable reconciliation. `createEventRuntime(db).tick()` now returns `derived`; optional `seriesAfter` is the series scan cursor, separate from the league cursor. Safe provenance: `derivedProvenance.algorithm`, `algorithmVersion`, `membershipVersion`, played `children[{id,version,resultId}]`.

## Remaining boundaries

- Explicit reviewed qualifier handoff, not automatic cross-league result/entry/point transfer. Missing/conflicting qualification evidence rejects transition; postlock disposition is intentionally manual and never rewrites saved predictions.
- Synthetic manual league creation does not silently confer operator approval or provision live-provider series mappings. Canonical-series fixtures must explicitly establish reviewed membership and manifest links as above.
- Browser visual journeys and final repository-wide delivery acceptance remain parent/browser-owner checks. No browser server, existing browser database, live provider or public endpoint was used in this packet.

## Final verification

- `python3 scripts/verify-series-structural.py`: exit 0; **6 files / 29 tests passed**, 41.02s. Dedicated database `bracket_series_24256af2373c`, retained stopped with notifications disabled. Machine-readable evidence: `series-structural-evidence.json` (migration hashes, commands and test output).
- Populated 00013 → 00014/00015 upgrade preserved exact whole-row hashes across eight legacy/evidence tables. Existing pgTAP lifecycle/window/pairing suites passed **46 + 26 + 23 = 95 assertions**. Both forward repairs preserved ten immutable/evidence tables; repeating repairs left complete evaluation rows and evidence identical.
- `npm test -- --reporter=dot`: **77 files passed / 11 skipped; 1184 tests passed / 31 skipped**. Environment-gated database tests are separately covered by the dedicated run above for this packet, not claimed universally exercised.
- `npx tsc --noEmit`: exit 0. Scoped ESLint across 18 changed production/test paths: exit 0. Repository-wide `git diff --check`: exit 0.
- Expected permission/invalid-membership/stale-version rejection tests log SQL states 42501, 22023 and PT409; these are asserted negative paths.
- Actual Next POST handlers and persisted application consumers were exercised; browser visuals and production build were not run by this owner.

Verdict: **hold for independent parent acceptance**, not self-accepted full-roadmap delivery.
