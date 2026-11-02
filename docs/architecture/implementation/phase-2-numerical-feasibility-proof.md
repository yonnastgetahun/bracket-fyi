# P11 trusted synthetic feasibility
project: BRACKET-FYI
done when:
  - [x] Application manifests attach exhaustive trusted worlds only for supported independent components.
  - [x] Independent UCL coupled-tie, full Play-In correction/invalidation/ranks, WWC future-window and medals numerical assertions pass.
  - [x] Unsupported placement, reseeding, structural membership and bounded-out domains remain unverified.
evidence: tests/events/synthetic-feasibility.test.ts; focused Vitest and TypeScript checks.

## Scope and implementation

Approved Phase 2 local synthetic only. No database, Docker, browser, provider, commits or publication in this lane. Changes limited to:

- `lib/events/application-manifest.ts`: persist server-generated feasibility components instead of `[]`; validate those exact components through the existing scorer.
- `lib/events/synthetic-feasibility.ts`: new exhaustive original-synthetic rule enumeration.
- `tests/events/synthetic-feasibility.test.ts`: 17 numerical/integration cases.
- This report.

Connected winner/loser/tie dependencies stay in one component. Complete worlds are constructed in topological order, including all nonempty nomination winner sets. Evidence carries the actual graph version and the explicit reference `original-synthetic-exhaustive-rules-v1`. It is not provider evidence.

Enumeration is bounded at 4,096 worlds per component for application creation. A trusted test/service caller can choose up to 65,536. Crossing the bound discards the **entire** component's worlds and evidence, not merely excess worlds. Unknown placement, reseeding, unscored structural sources, invalid local membership and unsupported rules also remain null/unverified. No sampled domain is certified. The application persists only evidenced components; unknown factors are omitted, allowing the existing uncovered-market fallback to return unverified while unresolved, but the exact earned maximum once every result is settled. A full NBA 15-market regression proves null before play and 15/15 after settlement.

## Numerical proofs

The independent expectations use literal arithmetic/tables, not a second invocation of the production generator as the oracle.

| Scenario | Exact earned / maximum / wrong / rank |
| --- | --- |
| Full six-game Play-In before play | P=0/6/0/1, Q=0/6/0/1 |
| East A wins 7–8, C wins 9–10 | P=2/6/0/1, Q=1/5/1/2 |
| East B wins decider | P=3/6/0/1, Q=1/4/2/2 |
| East decider corrected to C | P=2/5/1/1, Q=2/5/1/1 |
| East decider invalidated | P=2/6/0/1, Q=1/5/1/2 |
| Other conference then settles perfectly; East B wins | P=6/6/0/1, Q=4/4/2/2 |
| UCL A wins leg one; P picked B / draw / B | P=0/1/1/2; Q's coherent A / draw / A gives 1/3/0/1 |
| WWC all 48 group picks correct, future windows unopened | P=48/64/0/1; Q with one wrong group pick=47/63/1/2; 16 pending each |
| WWC all 64 correct | Both 64/64/0/1; zero pending |
| WWC opposite final/bronze choices, one correct each | Both 63/63/1/1 across the full 64-market event |
| WWC final settled, bronze unresolved | P=63/64/0/1, Q=62/63/1/2; one pending each |

Play-In expectations include the other conference's three still attainable points, so they are the accepted one-conference table plus three in the maximum column until that conference settles. The eight worlds for one conference are also compared with an explicitly hand-listed complete oracle.

The UCL projection has reviewed explicit synthetic entrants and uses the existing exact sign-domain tie solver. An A win followed by a draw cannot qualify B regardless of A's first-leg winning margin, so this proves the spec's 2–0 example without pretending the application outcome DTO stores goal margins. Arbitrary goal-margin-sensitive acceptance is **not** claimed.

The full WWC fixture explicitly replaces reviewed-placement placeholders with original synthetic entrants, removes those placeholder edges, then exhaustively enumerates all 65,536 knockout/medal worlds. Its fixed pairing arrangement is a test-owned reviewed hypothetical, not real qualification evidence. Unmodified application WWC placement remains unknown. Bronze is a loser-fed match, not an additional fourth-place market.

Additional boundaries: all nine application builders validate; stale graph evidence is rejected; removing evidence yields null maxima; an eight-world Play-In domain capped at seven discards all evidence; awards include tied nomination winners.

## Verification

Initial test run failed because the new feasibility module did not exist. After implementation, the dedicated suite passed; full WWC acceptance was added and passed. First TypeScript run found a nullable `flatMap` inference issue; explicit component typing fixed it.

Focused final verification command:

```sh
npx vitest run tests/events/synthetic-feasibility.test.ts tests/events/scoring-bridge.test.ts tests/events/outcomes.test.ts tests/events/ucl-tie.test.ts tests/events/lifecycle.test.ts tests/events/catalog.test.ts tests/events/application-pairings.test.ts
npx tsc --noEmit --incremental false
npx eslint lib/events/synthetic-feasibility.ts lib/events/application-manifest.ts tests/events/synthetic-feasibility.test.ts
git diff --check
```

Final checks: **7 files / 77 tests passed**; TypeScript no-emit, focused ESLint and whitespace checks exited 0. Dedicated numerical suite: **17 tests passed**, approximately 2.9 seconds including full WWC enumeration. Independent review disposition and corrective verification are recorded below.

## Evidence ceiling / parent integration

- New application Play-In manifests now carry two exhaustive eight-world factors and produce numeric maxima through the actual scorer/lifecycle data contract.
- Already persisted manifests with `components: []` are unchanged; do not claim a migration/backfill.
- Unknown future UCL/WWC placement, NFL reseeding, NCAA structural qualification and over-budget large bracket domains are deliberately still unverified. Their eventual reviewed rule/placement services are separate work; do not mark whole-domain maxima complete based on these proofs.
- The WWC numerical test exercises the full real TypeScript scorer with explicit trusted synthetic placement, not the database or browser.
- Parent owns database round-trip/HTTP/browser verification. No DB/client journey or lifecycle completion state is asserted by this lane.

## Final scoped status

changed: Application manifests now include bounded, complete trusted synthetic domains where derivable; new independent numerical acceptance tests.
matters: Play-In maxima are numeric without fabricated provider evidence, and coupled ties/medals/future windows have literal acceptance proof.
checks: 77 focused tests; TypeScript; focused ESLint; whitespace — pass.
risk: Existing persisted manifests and database/browser round-trip remain outside this lane; unknown domains remain intentionally unverified.
verdict: ACCEPT scoped original-synthetic integration/numerical proof; not whole P11 or provider/DB/browser acceptance.

## Independent review and corrective verification

Reviewer run `97bef4cf-ca27-4ce2-8bca-b329bd3dd161` returned **iterate**
with one P2 trust-boundary finding: reviewed-placement source market IDs were
excluded from component discovery. The unchanged WWC graph consequently exposed
48 certified group factors plus one unknown knockout factor, although qualification
connected them. The reviewer did not demonstrate an incorrect maximum (it remained
null), but the independence attestation was invalid.

Disposition: **fixed**. Dependency discovery now includes every reviewed-placement
`marketIds` reference, while unsupported placement resolution still rejects the
whole connected component. The strengthened regression asserts exactly one component,
coverage of every scored WWC market, and null worlds/evidence for that component.
It failed before the fix (49 components instead of 1) and passed afterward.
No qualification evidence or provider facts were invented.

Post-fix verification: all **77 tests across 7 files passed**, including **17 dedicated
numerical/integration tests**; TypeScript no-emit, focused ESLint, and git diff
whitespace checks all exited 0. TypeScript initially identified the readonly source
array; copying it into the mutable reference list resolved that compile error.
The reviewer was not rerun; the reported finding is closed by the focused
red/green regression and subsequent complete scoped checks.

Final disposition: **accept scoped implementation**, with the same evidence ceilings
above. In particular, the fixed-entrant WWC oracle does not certify qualification
feasibility for the unchanged application manifest. No DB, browser, commits or push.
