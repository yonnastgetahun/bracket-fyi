# Phase 2 final integration review

2026-10-30 local review; branch working tree based on `3ca08fbd7d3cfa5266a2114ab3bb3f9f391d83e8`. Independent read-only source/evidence review, plus source-only tests. No DB/browser/server/provider/network execution, production edits, commits or publication. Only this report written. Concurrent runtime owner retains child-only SQL and numeric-render execution.

## Review criteria

- [x] Inspect actual routing, series, qualification and trusted-maximum consumers, not reports alone.
- [x] Separate repaired/disproven findings and permitted unknown domains from demonstrated defects.
- [x] Inspect seven-family results and locate superseding transition/full-window evidence.
- [x] Identify remaining exact-candidate evidence without claiming pending runtime passed.

## Verdict

**Accept the inspected bounded production seams; HOLD full delivery until evidence reconciliation and final-candidate checks/publication. No new confirmed production-code defect found in this review.** This is not a universal security/code review or live-provider certification. The two actionable findings below concern acceptance evidence, not a request to change valid production semantics.

## Confirmed actionable findings

### FI-1 — requirement/finding ledgers do not describe the delivered candidate (medium, P12)

Locations: `docs/architecture/implementation/phase-2-evidence-ledger.md:58` (Requirement coverage section), `:175` (last integration checkpoint); `phase-2-findings.md:7` (historical unresolved rows); `phase-2-transition-diagnosis-20261030.md:22` (superseded populated-13 HOLD).

Minimal reproduction: read the requirement table: all E1–E8/P1–P12 rows remain Pending; compare its final checkpoint against `family-runtime-evidence.json` (`allSevenComplete=true`), the passed full-window artifact below, and `supabase/tests/transitions/evidence-20261030T212044Z_e8fa81.json` (`status=passed`, 2,093 assertions). The transition diagnosis still says no final acceptance although that later artifact exists. Historical finding rows similarly lack links to their accepted repair dispositions.

Fix: parent updates the canonical ledger with per-requirement links, current disposition, source/candidate identity and remaining limits; annotate superseded holds rather than delete their history. Do not convert every row to accepted solely because nine browser journeys passed. Reconcile P1/P3/P4/P5/P6/P7/P8/P9 against their scoped security, ordering, concurrency, notification and operator reports too.

### FI-2 — captured four-family SQL bundle still contains two early exits (medium, E4/E6/P6/P12; repair already in flight)

Location: `tests/events/provider-four-family-vertical-db.test.ts:234`; historical failing assertion was line 233. `phase-2-family-runtime-integration.md`, Final stable-source SQL rerun, and `family-runtime-evidence.json.sql` retain 13 pass / 2 fail.

Minimal reproduction/evidence: retained NBA/MLB cases stop after first child result because a zero-scored child-only manifest was expected complete. Consequently those runs do not execute their later replay, conflicting correction quarantine, unmapped/authentication and zero-send assertions. This is a bad test oracle, not a production completion failure. Current source now correctly expects `child ? "locked" : "complete"` and retains the independent zero-point board check. Parent/runtime owner must attach the fresh passing five-scenario result after that edit, with stable hashes; source correction alone cannot close the execution gap. No duplicate run performed here.

## Production seams inspected

### BDL routing — E2/E3/E4/E6/E7, P3/P6

`lib/events/runtime-providers.ts:10` constructs one `balldontlie` router; duplicate adapter keys reject. `lib/ingestion/providers/balldontlie-router.ts:48` selects per immutable pull context after exact binding and sport/phase admission, and retains explicit injected transport. `lib/events/runtime.ts:16` forces SQL attempt controls while allowing the explicit registry dependency. This is an actual supported production composition interface, not evidence that a deployed scheduler has been configured. Deployment/provider activation is outside this finish line; do not flag absence of implicit live wiring as a defect.

Independent source rerun covers six real-family orchestration routes plus malformed/manual/phase/isolation tests. Preserved report dispositions: negative scores rejected upstream; phase mismatches reject before transport; fetch time does not manufacture correction authority; exact-full terminal pagination conservatively holds. No claim that family adapters alone derive series or qualify teams.

### Persisted series — E4/E6, P2/P5/P7/P9

`series-repository.ts:21` captures persisted children, calls production `deriveSeries`, then commits against captured basis. `runtime.ts:46` consumes it before lifecycle evaluation. Migration 00014 lines 51–72 independently validates the outcome and atomically inserts parent result/audit; lines 136–170 serialize child projection and synchronously rederive, including before first membership is visible. Reviewed replacement equivalence is checked at lines 110–120. Authoritative-parent identity participates in the basis (31–37), and its insertion triggers re-evaluation (155–158). Canonical hold does not mask an active local override (203–215).

Credit retained 29-test SQL/application packet and independent parent review, including thresholds 2/3/4, unused children, correction/retraction/recompletion, same-ID resume, replacement ambiguity, first-review race and override-token stability. Checked all 42 recorded series migration/transition/repair hashes: zero mismatches. This packet's artifact hashes are not an entire production-source fingerprint. Seven-family browser deliberately enters manual parent winners; `seriesChildPersistenceVerified=false` is truthful, not a failed browser test. Do not infer child derivation from those clicks or demand a new organizer shared-operator child desk without a spec requirement.

### NCAA / NBA reviewed qualification — E3/E4, P2/P5/P7/P9

Migration 00015 lines 33–53 locks/authenticates both exact leagues and checks immutable retry before new basis validation. Lines 68–108 require twelve NCAA structural winners or the separate actual six-game Play-In path. Lines 113–138 validate 32/8 initial pairings and effective cutoff history. Lines 141–150 freeze incompatible locked corrections without replacing predictions; lines 153–162 version initial orientations and discard old feasibility attestations. Application service and actual organizer qualifiers form use this RPC. Source credentials stay transient; no entry/pick/point copying.

This is explicit reviewed synthetic qualification, not automatic cross-league source propagation. Prior lost-response source-basis issue is repaired by SQL first-use capture after exact retry lookup. Browser evidence now confirms NCAA review and independent Play-In-to-NBA handoff. Postlock correction/hold and replay depth comes from the separate persisted test packet, not the browser boolean alone.

### Trusted feasible maximum — E1/E4/E5, P7/P11

`scoring-bridge.ts:193` rejects stale graph attestations; `:227` treats absent evidence as unknown; `:229` rejects coupled-factor splitting. `synthetic-feasibility.ts:23` includes reviewed-placement dependencies and `:58` discards unsupported entire connected components. Enumeration overflow discards certification rather than sampling. `outcomes.ts:99` preserves a zero maximum for wholly forfeited factors, otherwise unknown unresolved outcomes remain null. `lifecycle.ts:69` evaluates the captured sealed configuration, not a caller's leaderboard.

Independent tests passed stale/absent evidence, Play-In branches and elimination, UCL sign-compatible coupled maxima, finite hypothetical WWC worlds and null for unknown actual placement. No universal unknown-domain solver is required. Reviewed explicit synthetic WWC worlds do not establish real placement; UCL sign proof does not claim persisted goal-margin solving. Twelve SQL/rendered checkpoints remain owned by the concurrent runtime lane; no completed numeric artifact was present at inspection.

## Evidence completeness by requirement

| Requirement | Credited evidence / remaining acceptance |
| --- | --- |
| E1 | Retained actual UCL 211 markets / 13 windows passed; bounded FD SQL accepted. Numeric persistence/render result pending; full-candidate binding needed. |
| E2 | Seven-family NFL 13-market browser passed, changed-opponent advancement oracle; bounded NFL SQL accepted. |
| E3 | NCAA 63 scored + 12 structural browser passed with real qualifier review; structural persistence packet credited. |
| E4 | Independent six-game Play-In and 15-series NBA browser passed; actual reviewed source handoff; separate persisted child-series proof credited. Child-only provider SQL rerun pending. |
| E5 | Retained WWC 64 markets / seven windows passed including bronze; numerical trusted/unknown distinction source-verified, rendering pending. |
| E6 | MLB 11 parent-series browser passed; 3/5/7/7 rules and persisted series proof credited. Child-only provider SQL rerun pending. |
| E7 | CFP 11-game browser and bounded NCAAF SQL passed; no invented regular season. |
| E8 | Three selected categories browser passed with persisted nomination UUID binding and tied winner set; not a claim of known future official categories. |
| P1 | Existing scoped security and actual recovery/embargo evidence must be linked in final ledger; not reopened by this review. |
| P2 | Inspected stable typed/graph/series/qualifier seams and source oracles; candidate-wide SQL/check reconciliation still required. |
| P3/P4 | Reviewed mapping/ordered immutable evidence and bounded provider proofs credited; live parity remains external. |
| P5/P7 | Separate durable lifecycle/race/expiry and series-retraction proofs plus browser correction/reopen/recomplete; numeric persistence execution remains pending. |
| P6 | Binding-aware registry/source proof and synthetic SQL admission/budgets; new child-case downstream assertions still need passing run. |
| P8/P9 | Prior fake-transport/operator/authority/race proofs need current ledger dispositions; no real-send requirement. |
| P10 | Nine manual/synthetic templates exercised across nine journeys; unknown future official data stays draft. |
| P11 | All nine complete manual journeys now have actual runtime artifacts; legacy/recovery/PWA passes also reported. Numeric checkpoint run pending; physical-device/deployed-beta gates separate. |
| P12 | Passed through-13 transition plus 13→14/15 scoped populated preservation credited; final candidate suite/build/lint/types/SQL matrix, resolved ledger and verified PR not established here. |

## Actual artifact verification (not runtime re-execution)

- `family-runtime-evidence.json`: all seven passed, 122 scored + 12 structural; qualification persistence true, child-series browser false. Compared 40 path-keyed recorded hashes against current files: zero mismatches at inspection. Retained SQL bundle is still the earlier failed run.
- `tmp/browser-acceptance/full-window-2026-10-30T22-37-40.801Z/results.json`: `allScoredMarketsAndWindowsCovered=true`; UCL 211/13 and WWC 64/7, complete. Supersedes source-only/full-window and earlier failed artifacts, not an exact-head build certificate.
- `supabase/tests/transitions/evidence-20261030T212044Z_e8fa81.json`: passed, through 00013, all three fresh/legacy/current databases, 2,093 assertions and zero false assertions; recorded TAP plans total 750. Current harness SHA matches, as do 48 recorded migration/input/test paths. This supersedes the stale transition timeout HOLD; do not unnecessarily diagnose it again.
- `series-structural-evidence.json`: 42 hashes match; recorded six files / 29 tests plus 95 existing SQL assertions and populated upgrade/repair equality.
- Recovery/PWA/legacy successes are documented in `phase-2-browser-root-cause-20261030.md`; organizer wrong-role false alarm was a selector error, not authorization bypass.

## Checks independently executed

From repository cwd via workspace wrapper, installed local Vitest only:

`node node_modules/vitest/vitest.mjs run tests/events/runtime-provider.test.ts tests/ingestion/providers/balldontlie-router.test.ts tests/events/synthetic-feasibility.test.ts tests/events/scoring-bridge.test.ts tests/events/trusted-numeric-fixture.test.ts tests/events/derivation.test.ts`

**6 files / 78 tests passed, exit 0.** No DB opt-ins or browser invoked. Reviewed canonical v1.0, repository AGENTS, current seam reports, production files, evidence ledgers and retained JSON. Review skill's diff-only/delegation workflow was not applied: assigned task is an independent current-tree integration review, not a fixed-base diff.

## Exact-candidate closeout still needed

1. Collect fresh repaired five-scenario provider SQL and twelve rendered numeric checkpoints; preserve expected-null and stale-evidence rejection, not just final numeric totals.
2. Reconcile all E/P rows and historical findings with the exact retained evidence and scope ceilings. Include actual nine-journey artifacts in durable publication evidence rather than relying only on ignored tmp paths.
3. Freeze/pin the final source candidate; capture final required aggregate tests, opted-in SQL coverage, typecheck, lint, build and whitespace with no undocumented source drift. Through-13 full transition + additive 14/15 populated packet is real compositional evidence; document its coverage or extend the matrix where final changes require it, rather than falsely claim no populated proof exists.
4. Publish/verify the authorized scoped PR with matching candidate and requirement ledger. This review neither publishes nor grants merge/deploy/live activation. Existing dirty owner documents/case studies remain excluded as already recorded.

changed: this report only.
matters: credits actual completed runtime evidence while keeping missing execution and publication distinct.
checks: 78 source tests; 40 family + 42 series + 48 transition recorded file hashes matched; retained results inspected.
risk: concurrent runtime results and final aggregate candidate not yet collected here; no fresh DB/browser run.
verdict: accept bounded inspected seams; hold full Phase 2 delivery closeout.
