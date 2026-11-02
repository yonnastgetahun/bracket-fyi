# Seven remaining families — source-only completion browser packet

2026-10-30. Builder report, **not acceptance**. Parent owns serialized DB/browser execution and independent review. HEAD observed: `3ca08fbd7d3cfa5266a2114ab3bb3f9f391d83e8`; intentional dirty tree preserved. Node `v26.12.0`.

## Changed

New files only:

- `scripts/browser/seven-family-task.md` — scoped criteria written before mutation.
- `scripts/browser/family-completion-plan.mjs` — independent topology walks, literal totals, two predictions, completion/correction assertions.
- `scripts/browser/family-completion-plan.test.mjs` — shape, changed-opponent, mutation rejection and real pure lifecycle/scorer comparisons.
- `scripts/browser/family-browser-evidence.mjs` and `.test.mjs` — non-coercing failure boundary, all-resource cleanup, exact rendered row assertions.
- `scripts/verify-event-families-browser.mjs` — UI-only seven-template full manual completion runner.
- This report.

Existing helpers, full-window runner, fixtures, application, lib/events, shared TASKS/ledger and case studies were not edited. No commit, DB operation, browser launch, server startup, provider call or send was performed.

## Implemented journey (runtime unexecuted)

Actual catalog UI creation → two independent browser-context invitation joins → every scored prediction submitted through its form → anonymous/organizer open-pick privacy → actual whole-window lock → disabled participant controls → every required result through organizer result desk → exact DTO **and rendered** earned/maximum/wrong/rank → terminal correction → release-to-unresolved/reopen without pick reopening → original-result recompletion. Source-only plan tests do not count as these browser actions passing.

NCAA resolves all 12 structural Opening Round markets through the result UI before opening the 63-point window; no qualifier picks or points. Oscars explicitly selects/seals three categories (Picture, Directing, Actor in a Leading Role) and settles **all three**, not merely the first. This is N=3 selected-category scope, not an assertion that the official 2027 category list is known. Correction adds a second winning nomination in the final selected category; both players earn only one point there.

Both NFL and Play-In include a challenger whose predicted opponent differs from the actual opponent while the selected downstream winner remains correct. NFL challenger predicts an AFC wildcard upset: reseeded seed-one opponent changes, seed-one advancement retains credit; two misses leave 11. Play-In challenger picks B over A in the east 7-v-8, C over D and C over A; actual A beats B and C beats B. C earns its decider point despite changed opponent; one miss leaves 5. Original pick IDs/choices are checked after every actual result.

| Template | Scored / structural | Perfect final earned/max/wrong/rank | Challenger final earned/max/wrong/rank |
| --- | --- | --- | --- |
| NFL | 13 / 0 | 13/13/0/1 | 11/11/2/2 |
| NCAA | 63 / 12 | 63/63/0/1 | 62/62/1/2 |
| NBA | 15 series / 0 | 15/15/0/1 | 14/14/1/2 |
| Play-In | 6 / 0 | 6/6/0/1 | 5/5/1/2 |
| MLB | 11 series / 0 | 11/11/0/1 | 10/10/1/2 |
| CFP | 11 / 0 | 11/11/0/1 | 10/10/1/2 |
| Oscars | 3 categories / 0 | 3/3/0/1 | 2/2/1/2 |

Correction expectations: NFL 12/12/1/1 vs 10/10/3/2; Play-In 5/5/1/1 vs 4/4/2/2. NCAA/NBA/MLB/CFP terminal alternative swaps first/second rank: perfect N−1/N−1/1/2; challenger N/N/0/1. Oscars tied nomination set yields 3/3/0/1 for both. These literals are independently authored; the production pure lifecycle is only the **actual** side of tests.

No early completion, excluded/held markets, absent effective results, guessed maxima, extra participants or duplicate logical markets can satisfy completion assertions. Final scored-set equality covers all selected categories. No byes/series children earn extra points.

## Actual checks

All commands executed via `/Users/yonnasgetahun/clawd/bin/exec`, subprocess cwd `/Users/yonnasgetahun/bracket-fyi` where needed.

- RED: `node --test scripts/browser/family-completion-plan.test.mjs` before plan implementation: exit 1, missing plan module (1 test-file failure). Subsequent negative tests explicitly reject inflated/incomplete/waived/held/incorrect-rank captures and malformed shape.
- GREEN: `node --test scripts/browser/family-completion-plan.test.mjs scripts/browser/family-browser-evidence.test.mjs`: **10 passed, 0 failed**, exit 0. Includes 14 complete/corrected production pure-scorer comparisons, seven families × two bases; no DB/runtime.
- `node --check` for runner, plan and evidence module: exit 0 each.
- `node node_modules/eslint/bin/eslint.js scripts/verify-event-families-browser.mjs scripts/browser/family-completion-plan.mjs scripts/browser/family-completion-plan.test.mjs scripts/browser/family-browser-evidence.mjs scripts/browser/family-browser-evidence.test.mjs`: exit 0, no diagnostics.
- `git diff --check`: exit 0. New-file whitespace also checked separately.
- No full suite/build/DB/browser claim.

## Parent execution

Prerequisites: integrated disposable local DB/application already running at **http://127.0.0.1:3137**, `puppeteer-core` resolvable using the same runtime setup as `verify-event-full-browser.mjs`, local Chrome (override via `BRACKET_CHROME_PATH`), serialized runtime ownership. New pages block non-loopback network requests.

```sh
BRACKET_FAMILIES_BROWSER_ACK=synthetic-loopback-only /Users/yonnasgetahun/clawd/bin/exec -- node /Users/yonnasgetahun/bracket-fyi/scripts/verify-event-families-browser.mjs
```

Optional targeted rerun: set `BRACKET_FAMILY_BROWSER_TEMPLATE=nfl-2026-postseason` (or another exact supported key). A subset never sets `allSevenComplete=true`.

Evidence: `tmp/browser-acceptance/seven-family-<timestamp>/results.json` and anonymous-only screenshots. Reports contain fixed phase/market IDs and literal score rows, never invitation URLs, cookies, credentials, raw transports or exception messages. Setup, journey and browser/context cleanup failures all set a failing exit code through a non-coercing boundary. Context acquisition retains each resource before the next allocation. Cleanup attempts every owned resource; failures cannot be reported as success.

## Remaining dependencies / exact missing integration hooks

1. **NBA/MLB child series persistence (other owner):** this runner currently enters manual **parent series results** using the existing `ResultEditor` / `action:"result"` contract. It does not fake child games, infer clinches in browser memory, or label manual parent results as derived. Application contract inspected currently has no child-result UI action. Needed for a child-backed browser extension: an organizer child schedule/result desk exposing parent series ID, stable child ID and ordinal, best-of/membership version, child outcome and audited correction; public parent projection exposing derived winner/unresolved plus child-version provenance. Then execute 3 wins→unresolved and 4th→clinch (NBA); targets 2/3/4/4 (MLB), unused games nonblocking, invalidate clinch→reopen, restore→recomplete. Direct DB seeding is not an acceptable replacement for those UI actions. Output explicitly retains `seriesChildPersistenceVerified:false`.
2. **NCAA structural persistence / Play-In→NBA qualification (other owner):** initial NCAA manual qualifier results and open-window action are exercised, but authoritative qualification import/version/replacement, pre-lock refresh, post-lock incompatible correction hold, and separate NBA seed population need their persistence contract and UI seam. Exact existing hooks used: organizer `Apply audited change` for structural market IDs, then `Open if prerequisites resolved` with cutoff. Needed extension: reviewed qualification snapshot/version/basis exposed on organizer UI and public held-state projection; selection must remain immutable after lock. No automatic picks/entries/points transfer. Output retains `qualificationPersistenceVerified:false`; 12 UI results alone do not prove that integration.
3. **Runtime and skeptical acceptance:** parent must run all seven against integrated schema/application and resolve any real failures. Static unit tests verify oracles and safe reporting, not hydration, selectors, joins, server authorization, durable reconciliation, browser scoring or screenshots. Existing UCL/WWC full proof remains separate and unchanged. No full E1–E8/P1–P12 acceptance claimed.

changed: seven source-only full manual completion journeys and independent tests.
matters: replaces first-market-only acceptance scope with explicit complete scored sets and two-player correction/rank oracles.
checks: 10 focused tests, syntax, scoped lint and whitespace passed.
risk: browser unexecuted; series child and qualification integration remain separately owned and explicitly unverified.
verdict: **hold for parent runtime execution and independent acceptance** (not self-accepted).
