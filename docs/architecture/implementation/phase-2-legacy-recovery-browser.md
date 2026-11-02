# P11 legacy / own-recovery browser acceptance
project: BRACKET-FYI
done when:
- [x] Runnable legacy create/join/pick/lock/results/recovery and shared-template rename/fake-push assertions exist.
- [x] Runnable own-download/fresh-context restore and wrong/revoked/cross-league assertions preserve own picks.
- [x] Syntax and isolated harness tests pass; no browser, DB, Docker or commits executed.
evidence: node --check on both owned runners; node --test scripts/browser/legacy-recovery.test.mjs; targeted ESLint. Parent owns runtime.

## Delivered source, not runtime acceptance

Approved spec v1.0 preservation/P1/P11 scope; read the browser-lanes, legacy-rename-isolation and own-recovery-handoff implementation reports. Only four NEW files owned: this report, scripts/verify-legacy-browser.mjs, scripts/verify-event-recovery-browser.mjs, scripts/browser/legacy-recovery.test.mjs. No edits to product or peer harness files.

### Executable assertions

**Legacy runner:**
- Creates a four-team custom bracket and a seeded synthetic pick'em through the actual legacy creation UI; chooses flat scoring explicitly.
- Separate invitation contexts pick every match/category through UI and submit identity; request picks are matched to persisted non-champion picks. Custom champion is asserted separately against champion status after scoring.
- Fresh cookie-free magic-link recovery, then clean room reload, retains exact participant ID and choices; cookie is HttpOnly and rendered identity matches.
- Organizer locks through UI and confirmation; persisted picks are locked. Every result is entered through UI, successful HTTP responses required, result request IDs/winners matched against submitted choices. Independent all-correct flat oracle: custom 3 points, pick'em category-count points, rank 1, zero wrong. Public DTO and rendered leaderboard point/stat card checked. A post-lock invitation context has no submission/identity controls.
- Two fixture leagues must actually share the same template ID and initial custom registry. HTTP 403, HTTP 500 and aborted network rename requests must show retryable error, keep old committed label, and leave persisted names unchanged. Failed drafts are canceled before interception is removed. A real retry must persist only A's new name, preserve IDs/other labels, leave B's entire metadata unchanged, and render correct labels after admin reload.
- Legacy PushBell uses a fake browser Notification/PushManager/SW implementation installed before app code. Tests successful subscribe and unsubscribe, server 403 rollback, PushManager rejection, and permission denial; asserts request counts, null unsubscribe payload and fake subscription rollback. All subscription HTTP responses are intercepted: this is browser/UI transport-shape coverage, NOT real subscription DB persistence or real push delivery.

**Event recovery runner:**
- Requires an existing two-participant, open-window synthetic fixture with nonempty A picks and no locked/revealed picks. Organizer has no open picks.
- Explicit participant and organizer buttons produce actual Chromium file downloads via CDP download handling. Reads the completed file, compares it to attachment bytes, checks exact role/league binding, no-store/no-referrer/nosniff attachment headers, download-requested feedback, and no credential in DOM/localStorage.
- Downloads use ephemeral mode-0700 directories; completed files become mode 0600 and are deleted in finally. Tokens are held in process memory only; screenshots/response dumps/credentials are never written to evidence.
- Cookie-free browser contexts paste each downloaded credential into the real password recovery form. Same identity, roster, exact visible picks, rendered select values, role controls and scoped HttpOnly/SameSite Strict cookie are required; organizer invitation is retained without acquiring participant access.
- Both roles test wrong, already revoked, valid other-league and wrong-role credentials. Foreign credentials are first verified in their own league. Each invalid recovery is tried both while authenticated (old cookie/identity/picks must survive) and fresh (403, alert, no new event cookie/access). Invalid cookie export also returns 403 and no attachment.
- Final reread checks original A identity, roster, own picks and privacy again.

## Parent-only invocation

Run from repository root with the existing healthy synthetic loopback app and migrated disposable DB, including rename migration 00013. Only the parent may provision fixtures or run these browsers. Chrome and externally provisioned puppeteer-core must resolve; no dependencies installed by this packet.

```sh
node --check scripts/verify-legacy-browser.mjs
node --check scripts/verify-event-recovery-browser.mjs
node --test scripts/browser/legacy-recovery.test.mjs
./node_modules/.bin/eslint scripts/verify-legacy-browser.mjs scripts/verify-event-recovery-browser.mjs scripts/browser/legacy-recovery.test.mjs

node scripts/verify-legacy-browser.mjs tmp/browser-fixtures/legacy.json
node scripts/verify-event-recovery-browser.mjs tmp/browser-fixtures/own-recovery.json
```

Optional BROWSER_EXECUTABLE overrides Chrome path. Origin is fixed to http://127.0.0.1:3137; cross-origin requests abort. Broadcast/send/cron requests abort and fail the report. Keep real provider/send workers disabled in the parent runtime lane. Browser subscribe HTTP is always fake/intercepted in the legacy push test. Synthetic VAPID public key must be compiled into the preview for PushBell to render; absence fails, never skips.

Reports: unique tmp/browser-acceptance/<timestamp>-legacy or -event-recovery/results.json. Only checkpoint names/status/error type are recorded; failure messages/bodies/credentials are omitted. Fixture/setup failures are dependencies, never successful skipped lanes. Runners do not invoke SQL, Docker, operator commands, fixture seeders, shell hooks or senders.

## Private fixture contracts

Both JSON files must be mode 0600 (or stricter), under ignored tmp/browser-fixtures/. Header:

```json
{"schemaVersion":1,"synthetic":true,"origin":"http://127.0.0.1:3137"}
```

Placeholders below MUST be replaced with actual local values. Do not commit real fixture files. No credentials in CLI arguments.

### legacy.json additional fields

```json
{
  "pickem": {
    "templateId": "SYNTHETIC-OSCARS-TEMPLATE-UUID",
    "categories": [
      {"label":"Synthetic category A","winner":"Synthetic nominee A"},
      {"label":"Synthetic category B","winner":"Synthetic nominee B"}
    ]
  },
  "sharedRename": {
    "templateId": "SHARED-CUSTOM-TEMPLATE-UUID",
    "teamId": "seed-0",
    "before": "Synthetic original",
    "after": "Synthetic isolated rename",
    "a": {"url":"http://127.0.0.1:3137/l/LEAGUE-A-UUID","organizerToken":"PRIVATE-UUID"},
    "b": {"url":"http://127.0.0.1:3137/l/LEAGUE-B-UUID","organizerToken":"PRIVATE-UUID"}
  }
}
```

Parent setup:
1. The legacy picker finds the catalog entry by exact name **Oscars 2025 (97th Academy Awards)**. In this disposable synthetic DB, provision that catalog entry as a pick'em template with the supplied synthetic categories/nominees and matching template_matches. Use no production/provider contest. Supply every category, unique category labels, and one winning nominee label per category (nominee may recur across different categories). All are independently all-correct, one point each. The runner verifies created template ID equals fixture ID.
2. Shared rename fixtures must be **two custom bracket leagues referencing ONE synthetic template**, with equal initial registries, no preexisting overrides, valid organizer tokens, and a non-bye team. Seeded public templates do not expose competitors in the metadata endpoint used by this oracle. Recreate/reset these fixtures before rerunning: successful rename intentionally leaves A changed.
3. Custom create journey needs no precreated room. Four fixed Synthetic Alpha/Bravo/Charlie/Delta entrants are entered in order. New runs create new leagues, never clean up parent data.
4. Make no simultaneous changes to these disposable leagues during the runner.

### own-recovery.json additional fields

```json
{
  "league": {
    "url":"http://127.0.0.1:3137/events/LEAGUE-A-UUID",
    "organizerCookie":{"name":"event_organizer_LEAGUE-A-UUID","value":"PRIVATE-UUID"},
    "participantCookie":{"name":"event_participant_LEAGUE-A-UUID","value":"PRIVATE-A-UUID"}
  },
  "otherLeague": {
    "url":"http://127.0.0.1:3137/events/LEAGUE-B-UUID",
    "organizerCookie":{"name":"event_organizer_LEAGUE-B-UUID","value":"PRIVATE-OTHER-UUID"},
    "participantCookie":{"name":"event_participant_LEAGUE-B-UUID","value":"PRIVATE-OTHER-PARTICIPANT-UUID"}
  },
  "expectedParticipantId":"PARTICIPANT-A-UUID",
  "expectedOwnPicks":[{"marketId":"ACTUAL-MARKET-ID","choice":"ACTUAL-CHOICE"}],
  "revoked":{"organizer":"REVOKED-ORGANIZER-UUID","participant":"REVOKED-PARTICIPANT-UUID"}
}
```

Parent setup:
1. Use synthetic-enabled app create/join/open/submit workflows to prepare league A with organizer, A and B. Keep first window open, all scored A picks saved, different B picks saved, no locked/revealed windows. expectedOwnPicks includes ALL A visible picks. Keep fixture browser-role cookies separate (organizer context has no participant cookie).
2. A second independent league supplies genuinely valid organizer/participant credentials. Runner proves these work there before rejecting them in A.
3. Revoked values must be previously valid credentials for A that the parent rotated/revoked during fixture setup; current role cookies must be new valid values. Keep the revocation mutation and previous identity/pick-preservation evidence in the parent runtime report. The harness has no DB privileges and cannot prove a supplied invalid token's historical validity; it tests actual rejection of the already-revoked values.
4. Do not revoke current credentials or mutate A's roster/picks during the run. Successful restore must not create a participant or rewrite picks.

## Verification and limits

Executed source-only checks: both node syntax checks pass; **7/7** isolated node tests pass; targeted ESLint exits 0. Tests cover loopback/private-fixture guard, attachment binding, identity/pick/roster negative oracles, exact legacy scoring oracle, fake push lifecycle, and required fixture shape. Imports are side-effect-free; unit tests do not launch a browser or contact the app.

No browser, HTTP, DB, Docker, real push, product edits, commits or publication executed. This is implementation-ready acceptance tooling, NOT a passed P11 runtime gate. Actual browser selectors/download integration and fixture provisioning must be exercised by parent. Legacy public/compare/matches rename render paths, real subscription persistence/rejected-unsubscribe handling, true notification delivery, installed device behavior and screen-reader speech are not claimed. The legacy post-lock UI excludes new entry; this packet does not inject a stale pre-lock submission after lock. Event revoked credentials are fixture-prepared, not revoked interactively by this runner.

changed: two executable acceptance runners, seven isolated contract tests, private fixture/setup report.
matters: previously unimplemented legacy and own-credential browser lanes now contain runnable UI/persistence/negative assertions.
checks: syntax + 7/7 tests + targeted ESLint; no runtime lane entered.
risk: parent fixture/runtime integration pending; scoped omissions above remain explicit.
verdict: iterate — source packet complete; runtime acceptance pending.
