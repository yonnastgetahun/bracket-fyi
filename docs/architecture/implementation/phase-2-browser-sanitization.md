# First-window browser failure evidence sanitization

2026-10-30; approved Phase 2 local synthetic scope. Diagnose workflow: executable reproduction before bounded repair. No browser, HTTP, DB, commits or external actions.

## Finding and repair

Confirmed: `scripts/verify-event-browser.mjs` persisted `report.error=String(error)`. Browser navigation errors can embed invitation URLs; assertion errors can embed response bodies. This contradicts the evidence contract in [browser acceptance harness](phase-2-browser-acceptance-harness.md): cookies, invitation URLs and request/response bodies are not written. Secret-bearing synthetic errors reproduced the defect in the actual runner's catch/finally path.

The catch now writes only the single allowlisted classification `browser-journey-failed`. It does not read error messages, names, URLs, stacks, bodies, causes or coercion hooks. The original exception is replaced with a new fixed-message error without a cause, preserving fail-fast behavior without rethrowing private data. Template key and completed checkpoints remain available for diagnosis. Removed the unused `keyboardActivate` import and incorrect comment claiming keyboard coverage on this runner's consent control. This runner has no keyboard-activation acceptance claim.

## Regression and checks

`node --experimental-vm-modules --test scripts/browser/event-browser-sanitization.test.mjs`

- Before repair: **0/5 pass**, reproducing persisted secret-bearing Error, assertion body, string and custom object; hostile coercion also prevents classification.
- After repair: **5/5 pass**. Tests execute the unchanged runner module through Node VM modules, injecting errors via mocked page creation. Filesystem/browser dependencies are inert; serialized `results.json` is captured in memory.
- Assertions: exact allowlisted failure field, failed status, no synthetic secret/invitation fragment in serialized report, no original message/stack/cause in rethrow, all three contexts and browser closed, one persisted fail-fast report.
- `node --check scripts/verify-event-browser.mjs`: exit 0.
- `npx --no-install eslint scripts/verify-event-browser.mjs scripts/browser/event-browser-sanitization.test.mjs`: exit 0 after renaming the test stub variable to satisfy the Next.js lint rule.
- Node emits its expected experimental VM Modules warning; no package dependency added.

Original packet scope: journey catch serialization/rethrow. Parent continuation below extends setup/cleanup and response-waiter handling; arbitrary successful report fields still require allowlisted review. No live-browser acceptance claimed; historical evidence files were not rewritten. Other runners and historical documentation remain untouched under exclusive file ownership.

changed: fixed allowlisted error classification, safe rethrow, honest keyboard comment/import, executable regression.
matters: private exception contents cannot flow into this journey failure report.
checks: red 0/5 → green 5/5; runner syntax passed.
risk: runtime browser/DB checks intentionally not run; independent review remains parent-owned.
verdict: local regression passes; ready for independent acceptance.

## Parent continuation — complete failure boundary

Independent inspection reproduced setup and cleanup leaks: the actual-runner regression was 5/7 passing, with launch and browser-close failures exposing a synthetic secret. Wrapped runtime setup, journey, and teardown in a fixed-message outer failure boundary. Both new cases now pass without reading/coercing the thrown value.

A separate subprocess regression reproduced an abandoned `visit()` response waiter leaking its rejection to stderr after navigation had already failed (0/1). An immediate no-op rejection handler now marks the waiter handled while retaining its original rejection for the normal awaited path; the regression passes (1/1). The first-window create waiter uses the same handling. Shared `action()` already enrolls all waiters in Promise.all before awaiting.

Actual combined command: `node --experimental-vm-modules --test scripts/browser/event-browser-sanitization.test.mjs scripts/browser/event-waiter-safety.test.mjs`: **8/8 passed**. Four affected modules pass `node --check`; scoped ESLint and `git diff --check` pass. No browser/runtime/database operation. These checks extend diagnostic privacy only and do not substitute for full event journeys. Tests intentionally use synthetic sentinels, never real credentials.
