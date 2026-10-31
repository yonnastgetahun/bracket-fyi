# P11 full-window UI runner — implementation, not runtime proof

## Changed

New files only:

- `scripts/verify-event-full-browser.mjs`: fresh league creation and invitation join through the actual UI; every prediction, reviewed pairing, open, lock, and manual override uses existing rendered forms/buttons. Existing browser helpers are imported unchanged.
- `scripts/browser/full-window-plan.mjs`: deterministic original synthetic plan, literal score/count checkpoints, independent result/completion assertions. Imports no scorer or fixture builder.
- `scripts/browser/full-window-plan.test.mjs`: six meaningful pure tests, including semantic mutations and rejected false-completion/score/result/shape cases.
- `scripts/browser/full-window-task.md`: bounded task record.

The separate seeded final-stage fixture lane is untouched and is not used by this runner.

## Intended runtime coverage

| Template | Windows | Scored/required logical results | Literal cumulative earned |
| --- | --- | --- | --- |
| UCL | 13 | 144 league + 44 legs + 22 qualifiers + final = 211 | 18,36,54,72,90,108,126,144,168,192,204,210,211 |
| WWC | 7 | 48 groups + 8 R16 + 4 QF + 2 SF + final + bronze = 64 | 16,32,48,56,60,62,64 |

Both current manifests have zero separately unscored structural market units. UCL standings/qualification are structural *placement evidence*, supplied through the five real reviewed-pairing UI transitions, not invented bonus markets. WWC uses four reviewed transitions. The runner rejects changed manifests/new unscored units rather than silently skipping them.

UCL synthetic qualification policy: league wins, with original entrant order as an explicit synthetic tie-break; top eight get R16 placement, next sixteen play off, actual synthetic playoff winners fill the other R16 slots. Each two-leg pair reverses home/away; both legs favor the same entrant; the qualifier agrees. WWC lower-numbered group seeds win their matches, seeds 1/2 fill the declared synthetic placements; semifinal winners feed final and losers feed bronze. These are original rehearsal assignments, never official standings or qualification claims.

Each later window checks immutable prior picks, disabled older controls, anonymous/organizer open-pick privacy, and fresh-device late-join rejection. The runner checks every result from the public UI data response plus rendered rank/earned/maximum/wrong cells. It requires 211/211 and 64/64 at completion, wrong=0, rank=1; WWC final-only settlement must remain incomplete at 63 while bronze is unresolved. Interim maximum may be explicitly unverified; final maximum must equal the literal full total.

## Verified here

- `node --check scripts/verify-event-full-browser.mjs` — passed.
- `node --check scripts/browser/full-window-plan.mjs` — passed.
- `node --test scripts/browser/full-window-plan.test.mjs` — **6 passed, 0 failed**.
- Source-contract review: spec v1.0 §§3.1/3.3/4/6/7; full catalog manifests; application-manifest/application view; review-pairings/window-picks/result-desk UI; application-pairings and data route; migration 00010 reviewed placements and 00012 business conflicts. Late-join oracle uses the actual HTTP 409/application-error DTO.

No DB, Docker, browser, provider, external send, product edit, shared-helper edit, fixture-builder edit, or commit was performed.

## Parent-owned runtime prerequisite and command

Use the existing serialized disposable local application owner, current migrations including reviewed-pairing and HTTP-conflict migrations, at **http://127.0.0.1:3137**, with Chrome and existing puppeteer-core available. The ACK does not establish the app's underlying DB target; the runtime owner must establish that it is disposable before running.

```sh
BRACKET_FULL_BROWSER_ACK=synthetic-loopback-only node scripts/verify-event-full-browser.mjs
```

Optional `BRACKET_CHROME_PATH` selects the local Chrome executable. No origin override exists. Existing page helper blocks non-loopback application requests. Run through the repository's guarded shell. Allow time for **275 individual manual-result actions**, 20 complete-window saves/locks and nine placement reviews/openings, plus privacy and late-join checks.

Output: timestamped `tmp/browser-acceptance/full-window-*/results.json`, progress lines and final screenshots. Report persists after each result and records actual covered market IDs/window checkpoints. `allScoredMarketsAndWindowsCovered` is true only if both complete runs pass; failed/partial evidence stays false. No invitation/cookie/recovery credential is written into the report.

## Verdict

**Implementation/static proof: accept. Runtime/P11 closure: unverified, hold pending parent run.**
No semantic setup blocker was found in inspected synthetic UI contracts. Actual coverage achieved here: **0 browser windows, 0 browser result actions** because execution was explicitly delegated to the parent. This report must not be presented as completed full-window browser acceptance, nor as final-only browser coverage.
