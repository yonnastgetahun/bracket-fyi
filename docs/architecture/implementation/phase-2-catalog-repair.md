# Phase 2 catalog repair
Date: 2026-10-27. Scope: lib/events/catalog.ts and tests/events/catalog.test.ts; this report only outside those files. No schema, app, other source, or commits.

## Work item and acceptance
project: BRACKET-FYI
done when:
- [x] C1–C7 semantic defects are repaired with behavioral regression evidence.
- [x] Nine original synthetic graphs have stable identities, complete references, correct branches and event rules.
evidence: focused Vitest, focused ESLint, isolated catalog TypeScript check; commands below.

## Baseline reproduction
Read v1 §§3/7 and all three batch-1 skeptical reports before implementation. Replaced the misleading count-only acceptance tests with exported-API reproductions, then ran:
`npm --prefix /Users/yonnasgetahun/bracket-fyi test -- tests/events/catalog.test.ts`

Observed **6 failures / 1 pass** before repair:
- C1: UCL 168 regulation markets instead of 188.
- C2/C7: NCAA eight entrants instead of 76 (and original 76 markets instead of 75).
- C3: NBA seven champion markets instead of one.
- C4: WWC champion in group window 3 rather than medal window 7.
- C6: category reordering changes category market IDs.
- C7: Play-In six entrants instead of eight.
- Honest draft/manual/unavailable labeling already passed.

C5 retains the adjudicated **partial** disposition: source lacked a whole-bracket lock contract, not evidence of a real downstream lock bypass. Repair supplies one window, lockMode, opening prerequisites and first-scored-start cutoff policy; new tests assert these semantics. No production consumer bypass is claimed.

## Changed contracts
Kept getEventDefinition/listEventDefinitions/buildSyntheticManifest names. Exported typed entrant slots, input sources, stage/role, outcome domains, explicit graph edges, tie membership, series membership version/bestOf/clinch targets, and lock/window opening policy.

Definitions contain logical slots only, with no official future names, dates, provider identity or activation. All remain draft/manual/automation-unavailable. Synthetic builds use a disjoint synthetic namespace consistently across markets, entrants, windows, series, ties, categories and every dependency. Recursive freezing protects nested slots, inputs and choices. IDs depend on immutable edition/slot identity, not schedule, category ordering or predicted winners.

### Event disposition
- **C1 / UCL:** 144 league regulation matches; 44 regulation legs belonging explicitly to 22 two-leg ties; 22 aggregate qualifier markets depending on their two legs; one inclusive final. 211 scored units, 13 windows. Reversed leg home/away membership, no final duplicate or away-goals inference. League schedule is an original eight-round pairing construction with distinct opponents. Reviewed qualification/draw sources prevent invented knockout participants.
- **C2 / NCAA:** 76 entrants; twelve unscored Opening Round contests feeding a 64-team field; 63 scored contests; 75 total. Four synthetic regions, seed metadata, fixed advancement, terminal championship. Opening winner replacement changes derived participants while retaining destination identity. One scored-bracket window requires all twelve qualifiers before opening.
- **C3 / NBA:** 16 entrants, fifteen versioned best-of-seven series, four wins to clinch, one Finals champion. One whole-bracket window requiring official seeds; no Play-In points or identities transferred.
- **C7 / Play-In:** eight entrants and six games in two conferences. Exact stable seven-eight/nine-ten/eighth-seed-decider suffixes; loser(7/8) and winner(9/10) feeds. Four graph edges, qualification-seed metadata, no champion market or extra points.
- **C4 / WWC:** 32 entrants, eight complete four-team groups, 48 regulation group games over three global matchdays. Reviewed group placements feed R16; winner paths feed final and explicit semifinal-loser paths feed bronze. 64 markets / seven windows; no extra fourth-place or qualification market.
- **NFL:** 14 entrants, 13 games, top-seed bye per conference, ranked ascending-seed survivor pools pair highest/lowest in divisional round. Explicit reseed edges; no bye market.
- **MLB:** twelve entrants, eleven series, 3/5/7/7 best-of lengths with versioned series identity and stop-at-clinch policy. Two top-seed byes per league; fixed division feeds.
- **CFP:** twelve entrants, eleven fixed games, four top-seed byes, correct 1-(8/9), 4-(5/12), 2-(7/10), 3-(6/11) quarterfinal paths. No reseeding or unrelated bowls.
- **C6 / Oscars:** nonempty, trimmed/NFC-normalized unique nonblank categories. Encoded edition/category identity independent of input ordering; category-scoped nominations independent of shared credit labels. One market per category with winner-set outcome domain; duplicate credits create no extra scoring units.

## Window integration
Each synthetic market has id/windowId/choices. Resolved direct synthetic pairings expose two entrant IDs (or home/draw/away for regulation), and Oscars exposes its category nominations. Conditional/reviewed future pairings have **empty choices and entrants**, with complete input dependencies retained for participant hypothetical paths or later reviewed actual resolution. Never offer the entire event field as every market’s choices.

Consumers must filter scored markets for submission requirements and honor opening prerequisites. NCAA structural qualifiers are not picks. Whole-bracket future hypothetical paths require evaluation before presenting choices; reviewed UCL/WWC placements cannot be inferred from participant regulation picks. This catalog does not authorize opening a window or installing official schedules. startsAt is a fixed synthetic time anchor, not official schedule evidence.

## Verification
After repair, expanded tests exercise exported data with an independent graph evaluator:
- Play-In decider branches under both possible 7/8 winners, both conferences.
- NFL actual survivor reseeding and changed opponents after a different Wild Card winner.
- NCAA twelve qualifier winners feeding 64 distinct participants, replacement identity stability.
- UCL per-tie legs/qualifier identity, reverse legs, per-window populations, league opponent uniqueness.
- WWC full group pair coverage, global matchdays, distinct final/bronze winner/loser feeds.
- MLB clinch lengths/targets and division parentage; CFP fixed upset paths and byes.
- Category order, Unicode-normalized duplicates, encoding collisions, nomination scope/shared credits.
- Every template: topologically ordered complete references, no cycles/dangling edges, unique IDs, window references, deep immutability, time-independent identity, and resolved-only choices.

Actual results:
1. `npm test -- tests/events/catalog.test.ts`: **20/20 pass**.
2. `npm test -- tests/events`: **34/34 pass, 5 files**.
3. `npx eslint lib/events/catalog.ts tests/events/catalog.test.ts`: pass after changing one non-reassigned let to const.
4. `npx tsc --noEmit --strict --target ES2022 --moduleResolution bundler --module esnext --skipLibCheck lib/events/catalog.ts`: pass.
5. `git diff --check -- lib/events/catalog.ts tests/events/catalog.test.ts docs/architecture/implementation/phase-2-catalog-repair.md`: no diagnostics (these paths are currently untracked).
6. Whole-repository `npx tsc --noEmit --incremental false` initially passed after the catalog rewrite, but the final run encountered concurrent out-of-scope oscarbase test errors: tests/ingestion/providers/oscarbase.test.ts line18 TS2493 twice, line28 TS2352, line54 TS2322. No catalog/test errors reported. Not repaired outside assigned scope.

No DB, app/browser, provider, live-event, public activation or full-roadmap acceptance claimed. No commits.

changed: semantic catalog and original synthetic full graphs replace count-only templates.
matters: consumers now have explicit identity/branch/outcome/lock contracts instead of ambiguous totals.
checks: 20 catalog and 34 event tests pass; focused lint and isolated catalog type check pass.
risk: whole-repo final type check has concurrent provider-test failures; actual reviewed schedules/placements and consumer enforcement remain separate.
verdict: accept scoped catalog repair; whole-roadmap acceptance remains with orchestrator.
