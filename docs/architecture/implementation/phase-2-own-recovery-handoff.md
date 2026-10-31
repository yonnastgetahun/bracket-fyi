# P1/P11 own credential recovery handoff
project: BRACKET-FYI
done when:
- [x] Explicit same-origin export validates the exact role/league cookie; no arbitrary identity selection or bulk secrets.
- [x] Create/join and ordinary reads remain credential-free; auth stays HttpOnly; UI explains saving and restoring own access.
- [x] Focused no-DB tests cover fresh-context restore, wrong/revoked/cross-league rejection and non-mutating identity preservation; runtime gaps recorded.
evidence: tests/events/own-recovery-handoff.test.ts; focused tests/typecheck; report below.

## Implementation / boundaries

- Added `POST /events/[id]/recovery`: strict role-only JSON, same-origin body guard, exact scoped HttpOnly cookie and real `verifyApplicationCredential` before returning one own credential as a no-store, no-referrer, nosniff text attachment. No GET export, participant selector, arbitrary supplied token, bulk secret DTO, new database operation or migration.
- `OwnRecovery` shows separate organizer/participant download buttons only for active roles. Explicit click fetches a temporary blob; no secret React state, DOM field, localStorage, URL query/hash or automatic export. Blob URL is revoked after download dispatch. Download success copy deliberately says “requested,” not “saved.”
- Recovery instructions explain role/league binding, private storage, bearer access, cookie duration, revoked credentials, no recovery without saved credential/still-signed-in device, and preserving the original participant/picks. Existing create/join return only safe IDs/ok plus HttpOnly cookies, unchanged. Existing restore validates first and then sets the same scoped HttpOnly cookie; it does not join or write picks.
- Approved spec P1/P11 and own-identity journey authorize this explicit own-secret transfer. Older contract blanket organizer-payload prohibition is retained for ordinary DTO/rendering; this narrowly requested user-invoked attachment is the explicit handoff exception, not organizer recovery of other participants.

## Checks actually run (2026-10-28)

- `npx vitest run tests/events/own-recovery-handoff.test.ts tests/events/application-routes.test.ts tests/events/application-auth.test.ts tests/events/application-http.test.ts`: 19 passed, 2 opt-in HTTP tests skipped. Nine new cases use actual export/recover handlers and actual credential verifier with a filtered in-memory DB query fixture; test both roles, fresh-cookie-free restoration, unchanged identity/pick fixture, missing/wrong/revoked/cross-league/wrong-role denial, no cross-user export selector and cross-origin rejection.
- `npx tsc --noEmit`: PASS.
- Targeted ESLint on the five implementation/test files: PASS, no diagnostics.
- `git diff --check`: PASS (new files are untracked in the pre-existing Phase 2 working tree, so this is not full patch whitespace coverage).

## Parent runtime acceptance still required (sole DB/browser lane)

1. Refresh copied app tree in local preview (new recovery route and component, updated room); restart only owned preview if route discovery requires it.
2. Create a league in organizer context; explicitly download organizer recovery file. Join as participant A, save open-window picks, download A file. Join B separately and save different picks.
3. In a fresh cookie-free browser context open the league, restore A from file, verify same participant ID and exact own saved picks (no second roster entry, B open picks absent). Repeat organizer restore; verify organizer controls and invitation access without another participant credential.
4. Wrong, revoked/rotated, other-league and wrong-role credentials must return 403/no new cookie on both export and restore. To test revocation, change only synthetic disposable credential in parent DB lane, then retry old file.
5. Confirm ordinary create/join/room GET/HTML/RSC never include credentials; attachment only follows explicit button click. Cross-origin POST rejected, download headers no-store/no-referrer, production-mode cookie Secure + HttpOnly + SameSite Strict + league path unchanged.
6. Browser/mobile: both-role buttons usable at 390px, file actually downloads, copy/paste credential from file into password recovery field works, failed restore explains rejection, existing picks remain visible. No browser execution performed here.

changed: secure explicit own recovery-file acquisition and guidance, focused security regressions.
matters: create/join cookie holders can now acquire the credential needed to restore their own session on another device.
checks: 19 pass / 2 opt-in skip; typecheck and targeted lint pass.
risk: browser download and real persistence/revocation behavior await parent runtime lane; in-memory preservation is not DB persistence proof.
verdict: implementation ready for independent review and parent runtime verification; no full P11 acceptance claim.
