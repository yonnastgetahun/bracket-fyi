# P11 bounded browser expansion

project: BRACKET-FYI

done when:
- [x] Shared helper module preserves the nine-template first-window runner.
- [x] Fixture lanes assert three-league canonical/override/release and later-window privacy, lock, join rejection and scoring using actual browser UI.
- [x] Keyboard/named controls/live feedback and desktop/narrow checks are executable; fixture prerequisites and remaining P11 gaps are explicit.
- [x] Syntax and isolated contract tests pass; no browser, HTTP, Docker or DB executed by this builder.

evidence: `node --check` on each browser script and `node --test scripts/browser/harness.test.mjs`.

## Implementation and limits (2026-10-28)

Implemented source, **not browser-verified**. This packet does not claim full P11 completion.

| Lane | Actual assertions encoded | Setup boundary |
| --- | --- | --- |
| Existing nine-template runner | Existing first-window journeys, now keyboard creation, visible focus and 1280/390px named-control/layout checks | Creates fresh synthetic leagues through UI |
| `shared` | Three distinct leagues, exact canonical version/outcome/provenance, active override isolation, UI release to newer canonical, exact DTO **and rendered** standings before/after, reread isolation | Parent supplies three leagues on the **same** synthetic template and publishes canonical correction before launch |
| `later` | UCL final or WWC medal reviewed placements through UI; opening; existing participant save while overall locked; anonymous/organizer open-pick privacy; actual rejected new join; disabled older/newly locked controls; exact old pick identity/history; all final-window results and exact rendered scores; WWC final alone incomplete and bronze completes; keyboard fake-consent revoke/live status | Parent supplies full synthetic manifest, prerequisites resolved, older windows locked with nonempty saved picks, target window unopened |
| PWA | Actual manifest/icons, active same-origin SW and controlled reload, keyboard iOS install dismissal persisted, cached create shell offline, no subscribe/broadcast/send requests | Parent supplies one fresh legacy league URL; production local app preferable |

Helpers are in `scripts/browser/`. All app navigation uses the fixed loopback origin; external page requests are aborted. Contexts are fresh and separate. Fixture runners never invoke Docker, SQL, operator CLI, notification sender or a general command hook. Subscription coverage here is **event fake-consent revocation**, not legacy browser PushManager registration. PWA never requests permission/subscribes.

### Invocation / dependencies

Run from repository root, with serialized parent DB ownership, migrated loopback Supabase and healthy synthetic-enabled app on `http://127.0.0.1:3137`. Chrome and externally provisioned `puppeteer-core` must resolve; it is not currently declared in package.json and this packet did not install it. Fixture/PWA runners accept `BROWSER_EXECUTABLE`; the original runner retains its existing macOS Chrome path.

```sh
node --check scripts/verify-event-browser.mjs
node --check scripts/verify-event-browser-lanes.mjs
node --check scripts/verify-pwa-browser.mjs
node --check scripts/browser/event-helpers.mjs
node --check scripts/browser/accessibility.mjs
node --test scripts/browser/harness.test.mjs

node scripts/verify-event-browser.mjs
node scripts/verify-event-browser-lanes.mjs shared tmp/browser-fixtures/shared.json
node scripts/verify-event-browser-lanes.mjs later tmp/browser-fixtures/ucl-final.json
node scripts/verify-event-browser-lanes.mjs later tmp/browser-fixtures/wwc-medals.json
node scripts/verify-pwa-browser.mjs http://127.0.0.1:3137/l/LEGACY-LEAGUE-UUID
```

Only the first six static/unit commands were executed by this builder: syntax passed; 4/4 independent oracle tests passed. No browser/HTTP/Docker/DB invocation. Runtime artifacts are unique `tmp/browser-acceptance/<timestamp>-<lane>/results.json` plus screenshots. Fixture failures log only error type and last completed checkpoint to avoid exporting private inputs. A passed fixture lane is evidence only for that fixture at the tested revision. A missing fixture is a dependency, never a skip/pass.

### Parent fixture setup (local disposable DB only)

These are **setup instructions and an input contract, not an implemented automatic seeder**. Fixture provision remains parent-owned and must be recorded separately. Generate UUIDs per run, record IDs privately, and retain no recovery/invitation/cookie values in committed artifacts. Store fixture JSON under ignored `tmp/browser-fixtures/` with file mode 0600. Do not pass secrets in CLI arguments.

1. Use existing application create/join APIs or UI for fresh synthetic league/participant credentials; save the returned HttpOnly cookies privately. For same-template shared coverage do **not** create three independent UI events and assume they share a template: each UI create currently provisions its own template. Parent must provision three leagues referencing one synthetic template configuration. Existing integration fixture patterns: `tests/events/application-db.test.ts`, `tests/events/provider-vertical-db.test.ts`, `tests/events/application-pairings-manifest-db.test.ts`. Do not run those rollback/cleanup tests expecting durable fixtures.
2. Shared lane: use a synthetic manifest mapped to real local canonical contest IDs and its reviewed event graph. Keep one scored, locked target market unresolved until participants have submitted. Publish canonical winner A (version N), apply different winner B as local override in leagues “override” and “release”, then publish canonical correction C (version N+1; C must differ from B). Use the existing scoped local operator `result.record` with exact expected version, and reconcile all three. Parent records template identity, canonical publication audit IDs and the two override basis versions. Harness starts **after** publication; it does not itself prove an in-browser change while publication is occurring.
3. UCL final/WWC medal lane: build the **full** catalog via `buildApplicationManifest`, not a reduced one-market graph. Resolve all prior scored/required structural units consistently; preserve explicit winners/losers, including UCL leg/qualifier consistency. Lock all older scored windows, keep at least one prior participant's nonempty immutable picks. Leave final/medals unopened with its predecessor outcomes resolved. Set invitation, credentials and current evaluation. No excluded/held prerequisite units, stale workers or pending reconciliation. Reviewed final pairings must match semifinal winners; WWC bronze pairings must match semifinal losers. Have a hand-calculated score baseline from these prior picks/results.
4. Give the harness **only** private cookie values, fixed local room URL, expected reviewed pairs/picks and independently calculated score rows. It sets the later cutoff to tomorrow, reviews and opens through UI, submits and locks through UI, rejects a new invitation join, then settles each final-window unit. WWC `results` must list **final first, bronze second** to prove final-alone incompletion. Each step's expected state/score must be determined independently, never copied from production scorer output.
5. PWA lane: create a disposable legacy bracket/pick'em league with public room at `/l/<uuid>`; no participant magic token is needed. Keep provider/send workers disabled. iOS is user-agent emulation in desktop Chromium, not an actual installed Safari/device result.

### JSON contract

Every fixture: `{"schemaVersion":1,"synthetic":true,"origin":"http://127.0.0.1:3137",...}`.

Room object:

```json
{
  "url": "http://127.0.0.1:3137/events/00000000-0000-0000-0000-000000000001",
  "organizerCookie": {"name":"event_organizer_00000000-0000-0000-0000-000000000001","value":"PRIVATE"},
  "participantCookie": {"name":"event_participant_00000000-0000-0000-0000-000000000001","value":"PRIVATE"}
}
```

Shared top-level fields: `marketId`, `overrideBasisVersion` (N), `latestCanonicalVersion` (N+1), `latestOutcome`, `leagues` (exactly three room objects with unique URLs, `mode` canonical/override/release). Each has `before` and `beforeRows`; release also has `after` and `afterRows`.

Effective expectation: `{"source":"canonical","outcome":{"kind":"winner","entrant":"CANONICAL-ENTRANT-ID"},"canonicalVersion":2,"state":"locked"}`. Override expectations use source `override` but still latest canonical version. Standings row: `{"id":"PARTICIPANT-UUID","name":"Browser player","rank":1,"earned":1,"wrong":0}`. Supply **all** participants; no empty oracle. Maximum is not checked by these fixture score oracles.

Later top-level fields: `templateKey` (ucl-2026-27 or wwc-2027), `league` (room object), `windowId`, `pairings` mapping **every** target market ID to ordered [home, away] entrant IDs, `picks` mapping every scored market ID to choice, `results` array. Each result: `{"marketId":"...","choice":"WINNER-ID","state":"locked","rows":[...]}`; last state must be `complete`. WWC requires exactly final + bronze, one result per market; first state must not be complete. Use real IDs from the private fixture, not these placeholders.

### Remaining acceptance gaps

- **No runtime results in this packet.** Parent must provide fixtures, run these lanes, investigate any UI failures and record exact-head evidence.
- No automatic DB fixture generator; parent must provision the documented inputs. Shared runtime proves prepared corrected canonical visibility and release, not the publication operation itself or temporal browser propagation.
- UCL final / WWC medal are full-manifest **late-stage** journeys, not create-through-every-intermediate-window end-to-end runs. Earlier reviewed placement/reseed windows and all 211 UCL / 64 WWC scored units remain outside these lanes.
- Legacy custom bracket and pick'em create/join/pick/lock/results/recovery/rename-failure journeys remain unimplemented here. Other builders own rename/recovery product repairs; no edits were made to their files.
- Event own-recovery round trip/revocation, legacy PushManager subscribe/reject/rollback/unsubscribe, actual installs/devices, screen-reader speech, comprehensive WCAG/contrast and independent maximum-score feasibility remain unverified.
- Fake consent proves the UI command/HTTP success/live feedback and no real push APIs, not persistence reread or exact fake transport sends. Do not treat it as notification delivery acceptance.
- Existing nine-template harness still releases to an unresolved canonical basis; only the new **shared fixture lane** tests a published latest canonical result.

changed: shared helper extraction, keyboard/layout checks, bounded shared/later/PWA runners and negative-oracle unit tests.
matters: executable browser assertions extend beyond first-window unresolved release without conflating scoped fixtures with full P11.
checks: 5 syntax commands exited 0; 4/4 node contract tests passed; no runtime browser/DB actions.
risk: fixtures/runtime integration unverified; explicitly listed legacy/intermediate/provider/notification gaps remain.
verdict: iterate
