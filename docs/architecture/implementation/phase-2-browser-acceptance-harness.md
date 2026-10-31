# P11 browser acceptance harness — static repair

project: BRACKET-FYI

done when:
- [x] Harness scopes actions to visible forms/windows, re-resolves controls, and waits for the current HTTP action and rendered outcome.
- [x] Nine-template journeys encode privacy, lock, result and leaderboard assertions with explicit remaining coverage.
- [x] Static syntax validation passes; no browser, HTTP request or DB access during this repair.

Evidence: `node --check scripts/verify-event-browser.mjs` exited 0. This is **static validation only**, not nine passing browser journeys or P11 acceptance. Runtime execution was explicitly prohibited during the repair because HTTP diagnosis and local DB ownership are serialized with the parent.

## Requirements and implementation

Approved [spec v1.0 §6 P11](../bracket-fyi-spec-v1.0.md) requires actual create → join → pick → lock → manual/shared result → leaderboard journeys for each format, plus mobile, legacy first-run/PWA and secure recovery. This harness implements a deliberately bounded **first open scored window** journey on the actual `/events` components. It does not simulate React components or replace UI actions with mutation API calls.

Static inspection used `creator.tsx`, `room.tsx`, `window-picks.tsx`, the application DTO and command route. The diagnose skill informed the defect review; live reproduction/feedback was explicitly deferred by the assigned no-browser/no-HTTP/no-DB constraint.

Defects addressed:

- Reason input is resolved inside the form containing “Apply audited change”, not the first page-wide `input[name=reason]` (pairing review also has a reason).
- Each interaction resolves its selector anew; no retained ElementHandle arrays across React revisions. Prediction options are read again after each controlled-select change.
- Buttons must be visible, enabled and unambiguous. Only the target prediction window is expanded. Hidden buttons in other windows cannot receive an action.
- Mutation listeners are installed before click and require that action’s POST plus the ensuing GET, successful HTTP status, no rendered alert and re-enabled refresh control. An earlier “Saved” message alone cannot pass.
- Result editor explicitly selects the scored market tested, rather than trusting its first/default market.
- Organizer, participant and anonymous observer use separate ephemeral browser contexts; joining really follows the invitation fragment.
- Each run has a unique evidence directory. Partial checks and the first failure are persisted; a failed later template cannot leave a previous run’s nine-pass JSON looking current.
- Requests are restricted to the fixed `http://127.0.0.1:3137` origin (plus browser-local data/blob/about resources). No remote provider or existing user Chrome profile.

## Encoded coverage — not executed in this repair

Every row uses the same real-UI journey with its own fresh synthetic league:

| Template | Tested window scope | Result choices |
| --- | --- | --- |
| UCL `ucl-2026-27` | First open scored window | Prefer regulation draw; correct → entrant correction → release |
| NFL `nfl-2026-postseason` | First open scored window | Eligible predicted winner → different winner → release |
| NCAA men `ncaa-men-2027` | First open scored window | Eligible predicted winner → different winner → release |
| NBA `nba-2027` | First open scored window | Eligible predicted winner → different winner → release |
| NBA Play-In `nba-play-in-2027` | First open scored window | Eligible predicted winner → different winner → release |
| WWC `wwc-2027` | First open scored window | Prefer regulation draw; correct → entrant correction → release |
| MLB `mlb-2027` | First open scored window | Eligible predicted winner → different winner → release |
| CFP `cfp-2026-27` | First open scored window | Eligible predicted winner → different winner → release |
| Oscars `oscars-2027` | One synthetic Picture category | Single winning nomination → different nomination → release |

Assertions encoded for each template:

1. Create with synthetic acknowledgment and future local cutoff, navigate to actual room.
2. Join from invitation on a separate device/context; fragment removed; scoped participant cookie is HttpOnly and SameSite Strict; participant is not organizer and receives no invitation.
3. Select and save every scored prediction in that first open window; returned own picks match exactly.
4. Anonymous DTO has no open picks, organizer authority, invitation or basis token; recursively reject named raw-body/credential fields. Organizer-only context also cannot read another participant’s open picks. Anonymous DOM has no result editor.
5. Organizer locks target window; participant reopens room and sees disabled pick selects/save; anonymous payload reveals exactly those locked choices and UI exposes “Revealed picks”.
6. Correct manual result produces displayed rank 1 / earned 1 / wrong 0 and override provenance. Alternative winner produces earned 0 / wrong 1. Release to the untouched synthetic shared basis restores unresolved / earned 0 / wrong 0.
7. Maximum is either explicitly “Temporarily unverified” or at least earned; **not an independent numeric maximum oracle**.
8. Organizer/participant/anonymous pages fit 390px without page-level horizontal overflow; anonymous screenshot saved.

## Run only after parent resolves HTTP and owns the local DB

Prerequisites: installed Puppeteer/Chrome, healthy app on port 3137, explicitly enabled synthetic local event preview and loopback Supabase, migrations applied by the serialized parent. No package installation, server startup or database management is performed by this harness.

```sh
node --check scripts/verify-event-browser.mjs
node scripts/verify-event-browser.mjs
```

Runtime mutates only new synthetic rehearsal leagues via actual UI. It does not delete fixtures afterward; parent owns fixture/reset lifecycle. Output is `tmp/browser-acceptance/<run timestamp>/results.json` and one screenshot per completed template. It fails fast and records partial check names; cookies, invitation URLs and request/response bodies are not written. Runtime output establishes only the checks that actually completed at that tested revision.

## Still required / unverified

**All encoded UI journeys remain unverified until the parent runs them.** In addition, this harness does not cover these required P11/related paths:

- Remaining windows, qualifying/reviewed placements, re-seeding, later opponent resolution, all-event completion/reopen/recomplete or notifications.
- Canonical/shared result publication through a scoped operator and canonical correction propagation; release here targets an untouched unresolved synthetic shared basis, not an actual published shared result.
- Multi-participant ranking/ties, numeric maximum feasibility oracles, all template total scores, series clinches, two-leg coupling, medal rounds, Play-In qualification, tied nomination winner sets.
- Deadline-driven locking, post-cutoff join rejection, stale/conflicting submissions, server-side tampered-write rejection, freeze/resume, expiry/hold/disposition.
- Recovery success/failure/revocation/cross-league authorization and complete recursive privacy allowlist verification; this harness checks only the explicitly described anonymous/organizer/participant paths and forbidden-key sample.
- Legacy custom bracket/pick’em create/join/pick/lock/results, competitor rename and failed-rename controls, no-picks/empty-lock controls.
- PWA install, service-worker/offline behavior, first-run flow, keyboard/screen-reader accessibility, other viewport/device/browser sizes, visual design acceptance.

No commits, push, deployment, actual browser launch, HTTP probe or DB access occurred in this repair.
