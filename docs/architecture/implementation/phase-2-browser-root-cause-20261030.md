# Browser runtime diagnosis — 2026-10-30

Approved Phase2, sole browser/HTTP/owned DB executor; no commits/deployment/providers/sends/resource increases. Target from private runtime state: DB `bracket_http_439610679a15`, owned container `bracket-p11-db-9bd170c85c0f`, app `127.0.0.1:3137`, REST `127.0.0.1:54331`.

## Reproduction and root causes

Applied diagnose skill. Initial ranked hypotheses: unsupported Puppeteer locator filter, invalid segmented datetime typing, missed submit/navigation response. A bounded real-browser create probe showed ISO `page.type` leaves datetime empty/invalid and the Playwright-style `filter({hasText})` times out. Native date setter plus bubbling input/change events and an exact visible-button locator repair those two defects.

Afterward the server recorded create 201 and real room navigation, but page-level POST listeners saw nothing. Differential probe with `setBypassServiceWorker(true)` observed the POST: service-worker-owned fetch transport concealed responses from these page listeners. Event/legacy/recovery assertion pages bypass worker; dedicated PWA lane explicitly retains it.

Next minimized join probe showed the scrubbed invitation input empty/invalid, despite valid name. Product effect scrubs fragment then starts fetch; StrictMode aborts it and replays effect with now-empty fragment. Room-scoped ref retains the invitation across replay and prevents reuse across room-ID changes. Before: zero-length invalid invitation, no join POST. After source mirror sync: valid 36-character invitation and actual join POST (no credential value logged).

Next nine-template failure `Prediction window missing`: adjacent summary spans concatenate label and state; word-boundary regex failed for labels ending in a digit. Selector now examines the state span itself.

## Scope changes

- `event-helpers.mjs`: exact fresh button targeting, correct datetime/text filling, worker-bypass option, state-span window matching.
- `app/events/[id]/room.tsx`: narrowly evidenced StrictMode fragment fix, also copied into disposable runtime source mirror.
- `verify-pwa-browser.mjs`: explicit real-worker opt-in.
- `verify-legacy-browser.mjs`: same worker-bypass repair for shared legacy/recovery runtime.
- `seed-event-browser-fixtures.ts`: pass explicit container env to existing validated adapter (otherwise it targets unrelated default DB container).
- `verify-event-browser-regression.mjs`: retained minimal real-browser regression.

All commands run through `/Users/yonnasgetahun/clawd/bin/exec`; Python subprocesses use explicit repo cwd. No raw fixtures/cookies/tokens printed. Private fixture output remains 0600.

## Checks

- `./node_modules/.bin/tsc --noEmit --incremental false`: exit 0.
- Original nine-template initial failure retained in earlier timestamped output. Current run and downstream outcomes appended below.

No E1–E8/P1–P12 closure claimed by this report.

### Additional narrowed findings

- Oscars failed before create because first controlled radio click raced hydration. Wait for actual React form attachment before selecting; assert checked radio and returned synthetic window namespace. Earlier eight-template partial output is not final acceptance evidence (it lacked identity oracle).
- With identity asserted, NCAA correctly has no initially open scored window. Harness now resolves exactly 12 unscored opening qualifiers through organizer result forms, then opens the scored window with the real prerequisite action. Isolated NCAA passed: `tmp/browser-acceptance/2026-10-30T22-16-41.705Z`.
- Isolated Oscars passed after readiness/identity correction: `tmp/browser-acceptance/2026-10-30T22-14-51.304Z`.
- Targeted ESLint on room.tsx and seed-event-browser-fixtures.ts: exit 0. `git diff --check`: exit 0.

- Final default nine-template runner: **9/9 PASS, exit 0**, `tmp/browser-acceptance/2026-10-30T22-17-15.699Z/results.json`. Real template namespace asserted, all nine create/join/picks/privacy/lock/result/correction/release/layout flows pass; NCAA includes 12 structural qualifiers. Scope remains first scored window per template, not complete E/P closure.

### Fixture readback transport diagnosis

First fresh fixture set retained at `tmp/browser-fixtures/80393b56-5641-42dd-8d1b-0db91a5ca6dd` (partial, not ready). UCL baseline SQL/public readback later verified 209 earned/1 wrong/final unopened. Minimal transport reproduction: native fetch `/events`, synchronous 15-second event-loop block, second fetch => `TypeError`, cause `ECONNRESET`. Synchronous docker/psql blocks prevent delivery of idle socket-close events before the pooled socket is reused. With `Connection: close` on both sparse probes, the identical 15-second reproducer passes, exit 0. Seeder readbacks now disable reuse; no blanket retry or partial-fixture deletion. Fresh batch follows only after this proved repair.

- Fresh fixture generation **PASS** after transport repair: `tmp/browser-fixtures/f9a6bde6-fedf-4698-ba39-bb47c9d4fd6e/complete.json`; all six JSON files mode 0600. Shared, UCL-final and WWC-medals readbacks asserted by seeder.
- Shared browser **PASS**: `tmp/browser-acceptance/2026-10-30T22-28-41.353Z-shared/results.json` (canonical, override, release/latest canonical, three-league isolation).
- UCL later browser **PASS**: `tmp/browser-acceptance/2026-10-30T22-28-53.282Z-later/results.json`.
- WWC later browser **PASS**: `tmp/browser-acceptance/2026-10-30T22-29-38.253Z-later/results.json`. Both later lanes assert versioned review/open, private later picks, late-join rejection, old immutable picks, all final/medal units, completion, keyboard fake-consent/live status, desktop/narrow layout.

### Full-window initial projection oracles

Full run failed before first window at the real active-room projection: public/participant effective map is empty, while authorized organizer result desk explicitly exposes full capture. Original oracle unconditionally required all 211/64 entries. Added two red/green role-specific regressions in `full-window-plan.test.mjs`; exact manifest membership remains required, active rooms cannot conceal a locked window, public active cardinality is exactly 0, organizer active and locked/complete cardinality is exactly total. All 10 full-window planning/oracle tests pass (including real application lifecycle/scorer checkpoints). Public-only original shape probe passes after correction. Full runner additionally asserts no seeded results in the initial organizer capture, and records only fixed phases, synthetic market IDs, and allowlisted error types on failure.

Failed full runs remain evidence, not acceptance: `full-window-2026-10-30T22-29-55.955Z`, `full-window-2026-10-30T22-31-57.740Z`. Current rerun starts `full-window-2026-10-30T22-33-13.160Z`.

### Repeated invitation visit

Full run reached UCL windows 1/2 (18/36 earned) then timed out on the reused late-join page. Minimized same-room fragment probe: initial public visit passes; `safeVisit(room + #invite=synthetic-probe)` times out in 3.5 seconds because Chromium performs same-document fragment navigation without mount/fetch. HTTP-backed visit helpers now go through about:blank for same-origin/path fragment revisits; identical probe passes. Real-browser regression now covers this sequence. Failure-sanitization/evidence tests: 9/9 pass, including actual stderr and consumed waiter rejection. Failed partial full run retained at `full-window-2026-10-30T22-33-13.160Z`, not counted as full acceptance.

- Full UI-created UCL/WWC browser **PASS**, `tmp/browser-acceptance/full-window-2026-10-30T22-37-40.801Z/results.json`, `allScoredMarketsAndWindowsCovered=true`: UCL 13 windows/211 unique scored markets, WWC 7 windows/64; final rank 1, earned/maximum 211/211 and 64/64, wrong 0, complete. Includes actual UI create, separate-context join, all manual picks/locks/results, every later review/open, old-pick immutability/disabled controls, repeated late-join rejection, public privacy, and WWC champion-known/bronze-unresolved noncompletion checkpoint. No seeded league/direct POST/SQL setup in this full lane.
- Isolated runtime `.env.local` created mode 0600 with only an ephemeral generated public VAPID key for browser-faked PushManager; private signing key was not persisted. Real providers/sends remain disabled. Repository/hosted env files untouched.

### Legacy/recovery fixture ordering

First legacy/recovery seed retained at `tmp/browser-fixtures/5fc48f6c-bfb2-4abe-8b81-7bcb1f141e85` (partial, not ready). Credential rotation can reorder SQL tuples, so raw participant-array equality incorrectly rejected unchanged identities. Minimized owned transaction: SELECT roster `[B,A]`, no-op UPDATE B, SELECT `[A,B]`, ROLLBACK. Seeder now canonicalizes identity/name lists by ID; credential-neutral SQL snapshots still compare all roster/pick fields and timestamps exactly. To allow a genuinely fresh seed without deleting history, verified the failed catalog had only the exact synthetic nominees and zero league references, then reversibly renamed only template `1788f38d-7aa9-48d7-88f0-19f634edcb8f` from `Oscars 2025 (97th Academy Awards)` to `Retained failed fixture 5fc48f6c-bfb2-4abe-8b81-7bcb1f141e85 — Oscars 2025` in the owned DB.

Fresh legacy/recovery seed **PASS**: `tmp/browser-fixtures/b16bed8a-6f17-422e-9dce-0eef9c9b150c/complete.json`. All JSON mode 0600; before/after preservation digests identical; roster count 2; prior-valid/revoked/current/foreign credentials and independent B picks asserted. No credential value printed. Error output now includes only error type and a fixed source filename/line pattern, never arbitrary stack/body.

### Legacy pickem pointer obstruction

First legacy browser passed custom create/join/recovery, locked results/rendered scoring, and fake-push subscribe/unsubscribe/server rejection rollback/manager rejection/permission denial, then timed out before pickem identity. Isolated pickem also failed. Minimized real page probe recorded intended submit center at y796 but `elementFromPoint` and captured click target were `Matches`: the layout's fixed z50 56px tab bar covered PickEmEntry's bottom-0 CTA. Narrow product fix moves CTA to bottom-14, honoring the existing layout reservation. After fix, real click target is Submit picks, identity form appears, controlled name enables final submit, and actual submit POST returns 200. Legacy runner includes a pointer hit-target regression before advancing. No browser DOM-click workaround or bypass used.

- Complete legacy browser **PASS**: `tmp/browser-acceptance/2026-10-30T22-57-27.997Z-legacy/results.json`, including custom+pickem UI creation, picks, fresh magic-link recovery, locked persisted results and rendered scores, blocked late entry, browser-faked push subscribe/unsubscribe/rejection rollback, and same-template rename 403/500/network failure/retry/isolation checks.

### Recovery attachment origin

Recovery browser stopped at first download. Metadata-only direct read with the real browser Origin confirmed status 200 and private/no-store/no-referrer/nosniff attachment headers, but file League was localhost:3137 instead of browser 127.0.0.1:3137. Next's internal URL hostname differs from validated Host/Origin. Added real-handler red/green test with internal localhost URL + Host/Origin 127.0.0.1. Export now uses the Origin already validated by applicationBody; no authorization relaxation. Copied only this route into owned preview. All 10 own-recovery-handoff handler tests pass, including both roles, missing/wrong/revoked/foreign/wrong-role negatives and cross-origin denial. Raw attachment contents/credentials never printed.

### Attachment integrity observation seam

After origin repair, browser download comparison failed because Puppeteer's CDP response body was empty (file 581 characters / 583 UTF-8 bytes; CDP response 0). No file or credential content was printed. The harness now clones the actual browser Fetch response transiently, compares that exact text to the downloaded file, restores native fetch and deletes the transient probe in finally. No substitute request, omitted integrity assertion, DOM/localStorage credential persistence, or transport bypass. Raw assertion comparisons changed to boolean equality so diagnostic errors cannot embed attachment credentials. Metadata-only debug logging removed.

### Negative recovery: duplicate React sibling keys

Latest failed lane stopped after participant restore. Ranked hypotheses were missing alert, blocked submit, or missed reload. Minimized real browser with existing private fixture: valid 36-character input; actual click hit NEXTJS-PORTAL; no POST; no alert. Overlay reported duplicate sibling key 1 at ReviewPairings / WindowPicks (both key=revision). Disabling development indicators did not remove the error overlay and was reverted; no overlay hiding retained. Namespaced sibling keys review-/picks- preserve revision reset while eliminating collision. Mirrored only room.tsx into owned preview. Same original probe now hits Recover session BUTTON, receives 403, renders authorization alert, clears input, and completes reload. Recovery runner now asserts zero duplicate-key console events across every context.

Fixture b16bed8a-6f17-422e-9dce-0eef9c9b150c reused only for recovery/PWA: recovery does not rotate current credentials or mutate picks; legacy rename lane was already consuming and was not rerun. Recovery setup itself verifies current identities, nonempty private picks and open window before proceeding. Owned state verified database bracket_http_439610679a15 and database container bracket-p11-db-9bd170c85c0f; no raw credentials emitted.

- Recovery/PWA continuation: **event-recovery FAILED**, exit 1, `tmp/browser-acceptance/2026-10-30T23-10-11.469Z-event-recovery/results.json`. Checkpoints: independent-B-context-has-expected-private-saved-picks-before-recovery, participant-explicit-real-file-download-private-headers-no-dom-storage-secret, organizer-explicit-real-file-download-private-headers-no-dom-storage-secret, participant-fresh-context-restore-same-identity-picks-and-scoped-cookie, participant-wrong-restore-export-denied-no-cookie-or-pick-mutation, participant-revoked-restore-export-denied-no-cookie-or-pick-mutation, participant-cross-league-restore-export-denied-no-cookie-or-pick-mutation, participant-wrong-role-restore-export-denied-no-cookie-or-pick-mutation, organizer-fresh-context-restore-same-identity-picks-and-scoped-cookie, organizer-wrong-restore-export-denied-no-cookie-or-pick-mutation, organizer-revoked-restore-export-denied-no-cookie-or-pick-mutation, organizer-cross-league-restore-export-denied-no-cookie-or-pick-mutation.

- Recovery/PWA continuation: **pwa PASSED**, exit 0, `tmp/browser-acceptance/2026-10-30T23-10-57.354Z-pwa/results.json`. Checkpoints: manifest-standalone-local-icons, actual-local-service-worker-active-and-controls-reload, keyboard-ios-install-dismissal-persists-per-league, offline-create-shell, no-notification-subscription-or-send-requests.

### Organizer wrong-role negative: ambiguous role selector

After unique React keys, recovery reached the last organizer wrong-role negative and got 200. Minimized browser probe proved selected global select was organizer, but actual request role was participant. Organizer room also contains FakeNotifications select[name=role]; the unscoped harness changed that first control, leaving recovery default participant. Therefore valid participant credential correctly restored participant access, not organizer escalation. Recovery now scopes select/input/button to its disclosure and asserts submitted role plus credential equality (boolean only). Same probe with scoped selector sends organizer and gets 403. No authorization product changes.

- Final recovery rerun **PASSED**, exit 0, `tmp/browser-acceptance/2026-10-30T23-12-22.223Z-event-recovery/results.json`; 16 recorded checkpoints.

- Recovery continuation checks: recovery runner syntax, legacy-recovery contract tests **9/9**, targeted room/recovery ESLint, TypeScript noEmit, minimal real-browser create/join/repeated-invitation regression, and git diff --check all pass. Prior full UCL/WWC scoring runs were not repeated: scoped key namespaces retain the same revision reset behavior; affected sibling rendering and exact saved-pick preservation are exercised across recovery contexts. No scoring/window-lifecycle/source helpers changed.
