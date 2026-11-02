# Phase 2 bridge/seeder repair

## Work item — BRACKET-P2-BRIDGE-SEEDER-REPAIR
project: BRACKET-FYI
done when:
- [x] F1 known structural qualification excludes eliminated picks from maximum with unresolved orientation; correction restores feasibility.
- [x] F2 lost-ack read-back requires template identity and preserves original insertion error.
- [x] Focused regressions and typecheck executed; integration exclusions recorded.
evidence: test-first red/green commands and results below.

Approved scoped repair; no interface changes. Applying the TDD skill: public scoreEvent and seedEventTemplates regressions, one finding per red/green cycle.

## Dispositions — 2026-10-27

### F1 — fixed; reproduced before implementation

Public `scoreEvent` regression uses the actual NCAA catalog opening-round structural market and its scored Round-of-64 successor. The successor orientation remains null, its window is locked, and a participant has saved the subsequently eliminated opening entrant. Trusted prequalification worlds enumerate all three possible winners.

Before repair: **1 failed / 15 passed**, expected maximum 0 but received 1; earned 0, wrong 0 and pending 1 matched. The feasible-world filter now checks canonical winners against recursively possible source membership even without an actual orientation. Unscored effective qualification results therefore remove eliminated entrants from scored worlds. Saved hypothetical picks remain unchanged and are not revalidated against actual winners.

After repair: **16/16 bridge tests passed**. The new regression verifies maximum 1 before qualification, 0 after elimination, 1 after winner correction, and 1 after qualification invalidation. Exact row assertions preserve earned/wrong/pending/rank semantics. Existing Play-In predicted-route, UCL, series, nomination, medal and pairing cases stay green.

### F2 — fixed; reproduced before implementation

Public `seedEventTemplates` regression supplies an empty initial listing, a failed insertion, and otherwise-identical version-1 unsealed manifest read-back carrying another template ID.

Before repair: **1 failed / 3 passed**. The seeder advanced to the NFL edition and threw a later `TemplateSeedConflictError`, losing the original insert error. After repair the catch branch requires `raced.templateId === templateId`, rejects immediately with the exact original error object, and stops after one ensure, one insert, two reads. Existing matching-identity lost-ack recovery and nine-edition replay remain green.

## Executed verification

Every command ran through `/Users/yonnasgetahun/clawd/bin/exec --`; absolute paths/npm --prefix avoid the guard's cwd reset. No commits, network, hosted access, or other source changes.

```sh
# F1 RED, then GREEN: 1 failed/15 passed, then 16 passed
/Users/yonnasgetahun/clawd/bin/exec -- npm --prefix /Users/yonnasgetahun/bracket-fyi test -- tests/events/scoring-bridge.test.ts
# F2 RED: 1 failed/3 passed; subsequent combined GREEN includes all four
/Users/yonnasgetahun/clawd/bin/exec -- npm --prefix /Users/yonnasgetahun/bracket-fyi test -- tests/events/template-seeder.test.ts
# Combined GREEN: 4 files, 45 tests passed (16 bridge, 4 seeder, 20 catalog, 5 outcomes)
/Users/yonnasgetahun/clawd/bin/exec -- npm --prefix /Users/yonnasgetahun/bracket-fyi test -- tests/events/scoring-bridge.test.ts tests/events/template-seeder.test.ts tests/events/catalog.test.ts tests/events/outcomes.test.ts
# Exit 0, no diagnostics; no incremental cache write
/Users/yonnasgetahun/clawd/bin/exec -- /Users/yonnasgetahun/bracket-fyi/node_modules/.bin/tsc --project /Users/yonnasgetahun/bracket-fyi/tsconfig.json --noEmit --incremental false
# Exit 0, no diagnostics
/Users/yonnasgetahun/clawd/bin/exec -- git -C /Users/yonnasgetahun/bracket-fyi diff --check
```

## Residual constraints

These are local public-helper regressions, not hosted or end-to-end product proof. Feasible-world completeness and factor independence remain trusted-service responsibilities; reviewed placement and exact reseeding still require domain evidence. Database adapter scoping, uniqueness and transaction races are not established by an injected repository. Full nine-event lifecycle/UI journeys, persistence/atomicity, reader transitions, notification reconciliation and deployment readiness remain outside this repair. The independent report's broader acceptance exclusions still apply; this does not close full P2/P10/P11/P12 delivery.

changed: two owned helpers, their two tests, this report only.
matters: eliminated structural qualifiers no longer inflate supported maxima; foreign-template read-back cannot acknowledge an insertion.
checks: both regressions failed on original implementation; 45 focused tests and repository typecheck pass.
risk: trusted feasibility and real repository/integration proof remain upstream gates.
verdict: accept bounded F1/F2 repair; full integration open.
