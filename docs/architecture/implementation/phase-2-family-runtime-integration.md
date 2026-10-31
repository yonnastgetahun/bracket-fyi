# Seven-family / five-provider runtime integration — execution report

Approved local synthetic scope; sole runtime owner. Builder execution evidence, **not acceptance**. No commits/push/deploy/live providers or real sends.

## Runtime

Existing owned HTTP DB `bracket_http_439610679a15` in `bracket-p11-db-9bd170c85c0f` additively upgraded 00013 → 00014/00015, migration hashes recorded in private runtime state. Current app routes recopied into isolated preview mirror; existing lib/components symlinks retained. No other databases removed or restarted. Browser skill used for Puppeteer workflow.

## Five-scenario SQL execution

`python3 scripts/family-runtime-integration.py sql` executed original opt-in `tests/events/provider-four-family-vertical-db.test.ts`: **13 passed / 2 failed / 0 skipped** (10 pure fixtures + 5 SQL cases). Sanitized evidence: `tmp/family-runtime/1793404160550547000-sql.json`; before/after adapter, harness and migration hashes included. Raw Vitest diagnostics retained privately, never emitted.

- NBA Play-In, NCAA basketball and CFP SQL scenarios passed.
- NBA playoffs and MLB SQL scenarios fail at original test line 233: zero-scored-child-only manifest stays **locked**, but harness expects **complete**. Both already passed stopped admission, exactly one ingested provider result, reviewed identity linkage and normalized winner assertions. Remaining replay/correction/quarantine/error/zero-send assertions were not reached for these two.
- Harness ownership stays with provider owner: requested disposition is change child-only expected state to locked (do not change production completion semantics), retain independent zero-point board oracle, rerun original five scenarios after handoff. No production edit made by runtime owner.

## Browser harness repairs / integration

- Play-In runs before NBA; its actual completed UI-created league supplies authenticated source ID + transient organizer credential to actual **Review latest qualifiers** form.
- Independent NBA oracle replaces seed-7/8 IDs from actual separate Play-In winners; no entries/picks/points copied.
- NCAA resolves twelve structural results and clicks actual **Review latest qualifiers**, checks persisted initial pairings, then explicitly opens scored window.
- Initial mixed run: NFL full journey passed; NCAA review and all 12 qualifiers passed, then open failed. Timing root cause: recalculating `future()` after qualifier work may extend immutable cutoff across minute boundary. Harness now leaves existing cutoff intact; only fills absent cutoffs. Narrow replay already progressed beyond open into scored results. No product relaxation.
- Results and final checks pending below.

### Second minimized NCAA finding

The narrow run reached all 63 results and exact 63/63/0 versus 62/62/1 persisted scores, but lifecycle stayed locked. Metadata-only DB read confirmed scored window locked and structural window unopened. Completion correctly requires all windows locked. Runner now explicitly locks the unscored structural window through its real organizer control, without adding predictions or points. This is a harness omission, not a production completion bug.

### Source-stability gate

The shared adapter implementation `lib/ingestion/providers/balldontlie-family.ts` changed during the first SQL invocation (independent owner). Both before/after SHA-256 values are retained; that run is therefore provisional. A fresh serialized five-scenario SQL invocation follows the browser run against stable final bytes.

### Awards identity diagnosis

Applied diagnose workflow. Narrow repeatable Oscars run failed at first prediction selection. Hypotheses: missing/incorrect form scope, unavailable category membership, or server-provisioned identity differing from source fixture. Status-only probes disproved scope: enabled control, five options, matching Picture category; expected synthetic string ID absent. Actual create service provisions immutable nomination UUIDs. Pure catalog fixture IDs are not persisted nomination IDs.

Harness now binds the independently authored plan to unique original synthetic nomination names returned by the real organizer GET, requires UUIDs, checks exact per-category membership and rejects duplicate identity/cross-category substitution. Point/rank/correction oracles remain unchanged. Two focused qualification/identity tests pass, including negative category substitution and duplicate identity. No UUIDs/credentials or raw errors emitted by diagnosis. Temporary control-value instrumentation removed.

Oscars post-binding reached completion, then exposed canonical set-order mismatch after tied-winner correction: SQL sorts nomination UUIDs, unlike fixture ordinal IDs. Bound correction oracle now sorts IDs (same two members, unchanged points). Reverse-ordered UUID regression passes. Full isolated Oscars correction→reopen→recomplete passes: `tmp/browser-acceptance/seven-family-2026-10-30T23-59-16.720Z/results.json`. Clean all-seven rerun follows.

## Scope / evidence boundaries

- Browser NBA/MLB evidence is full **manual parent-series** completion, not child-derived browser results. Existing persisted child-series proof in `phase-2-series-structural-integration.md` and `series-structural-evidence.json` remains distinct evidence. No requirement invented that every child/operator edge must have browser UI.
- Browser qualification proof covers actual NCAA review/adoption and separate completed Play-In → NBA authenticated handoff/open. Prelock refresh and postlock incompatible-correction hold remain the existing persisted structural test packet, not claimed re-exercised by this browser runner.
- Oscars is three explicitly selected categories, each with four original synthetic nominations; no assertion about an official 2027 award list.
- Anonymous screenshot crops for NCAA, NBA and Oscars were visually inspected: complete status and expected two-player standings fit the 390px viewport; whole-document horizontal overflow check passes in the runner. Full screenshots contain no organizer/participant recovery material.
- No product files changed by this owner. No public/provider network, notification transport, commit/push/deployment or paid operation performed.

## Final local harness checks

`node --test scripts/browser/family-completion-plan.test.mjs scripts/browser/family-browser-evidence.test.mjs scripts/browser/family-qualification-plan.test.mjs`: **12/12 passed**, zero skipped. Runner syntax, scoped ESLint, runtime-helper Python compile and `git diff --check`: exit 0. No repository-wide build/typecheck/full-suite claim.

## Final full browser result

**7/7 passed; exit 0**, fresh default run `tmp/browser-acceptance/seven-family-2026-10-30T23-59-49.048Z/results.json`; `allSevenComplete=true`, reviewed qualification UI flag true. All 122 scored markets plus 12 NCAA structural results covered. Two independent player contexts per league; every prediction, lock, manual result, correction, release/reopen and recompletion exercised. Literal rendered earned/maximum/wrong/rank asserted throughout. No source drift during this final run; sanitized result privacy marker scan negative.

| Family | Scored | Perfect earned/max/wrong/rank | Challenger earned/max/wrong/rank |
|---|---:|---|---|
| nfl-2026-postseason | 13 | 13/13/0/1 | 11/11/2/2 |
| ncaa-men-2027 | 63 | 63/63/0/1 | 62/62/1/2 |
| nba-play-in-2027 | 6 | 6/6/0/1 | 5/5/1/2 |
| nba-2027 | 15 | 15/15/0/1 | 14/14/1/2 |
| mlb-2027 | 11 | 11/11/0/1 | 10/10/1/2 |
| cfp-2026-27 | 11 | 11/11/0/1 | 10/10/1/2 |
| oscars-2027 | 3 | 3/3/0/1 | 2/2/1/2 |


## Final stable-source SQL rerun and handoff

After concurrent adapter review edits settled, repeated all five original opt-in SQL scenarios: **13 passed / 2 failed / 0 skipped**, exit 1. Final evidence: `tmp/family-runtime/1793404968355922000-sql.json`. Before/after hashes identical; failures again precisely test line 233, NBA playoffs and MLB child-only manifests locked versus expected complete.

**Parent/provider-test owner action:** repair the out-of-scope original harness assertion at `tests/events/provider-four-family-vertical-db.test.ts:233` to require `child ? "locked" : "complete"`, retaining the zero-point board assertions and all downstream replay/quarantine/auth/error/zero-send checks. Re-execute those original SQL cases. This owner did not edit that file or relax production completion. No claim that the currently unreached downstream child-case assertions pass.

| Final isolated SQL DB | Family | Outcome |
|---|---|---|
| bracket_family_vertical_008280a757a5 | NBA Play-In | passed |
| bracket_family_vertical_101c41ad1b31 | NCAA basketball | passed |
| bracket_family_vertical_3fdc4d411721 | CFP | passed |
| bracket_family_vertical_4ecca69dab32 | NBA playoffs child-only | failed at completion oracle |
| bracket_family_vertical_9ddecacce7df | MLB child-only | failed at completion oracle |

Final audit inspected all ten databases from both invocations: retained; global stop true, notifications disabled, real sends disabled, notification attempts zero. Passing SQL scenarios recorded five fake provider attempts; failed child cases stopped after one. Owned HTTP DB remains global-stopped with zero notification attempts and both delivery flags off; migrations through 00015 match recorded SHA-256, application preview mirror matches current source exactly. Existing HTTP server retained; all owned browser/test jobs finished.

Durable sanitized bundle: **`docs/architecture/implementation/family-runtime-evidence.json`** (full seven-family result, exact browser/SQL source hashes, final SQL results and stopped-state audit). Raw Vitest files remain private mode 0600 and are not included.

changed: qualified seven-family browser harness, strict awards UUID/set binding, serialized runtime helper, scoped criteria and evidence.
matters: actual complete 122-point/12-structural browser coverage replaces source-only claims; two precise SQL harness seams remain visible.
checks: seven browser journeys passed; twelve harness tests passed; syntax/lint/whitespace passed; stable-source SQL 13 passed/2 failed; all retained DBs stopped and zero sends.
risk: provider child-case downstream assertions remain unexecuted until original test oracle repair; parent independent review still required.
verdict: **hold for parent review and provider-test repair; no self-acceptance.**
