# BRACKET-FULL-BROWSER-REVIEW P1/P2 repair
project: BRACKET-FYI
done when:
  - [x] Secret-bearing navigation errors cannot reach evidence or stderr.
  - [x] Rendered checkpoints match DTO; final maximum is exactly 211/64.
  - [x] Pure regressions reject unverified/999 final and capture sanitized stderr.
evidence: node --test scripts/browser/full-browser-evidence.test.mjs scripts/browser/full-window-plan.test.mjs

## Repair proof

changed: Full-browser runner uses dedicated full-browser-evidence.mjs, with fixed failure diagnostics in evidence and outer stderr boundary, no raw error/cause propagation. Dedicated safeVisit observes both navigation and response-waiter rejections. Every rendered checkpoint (including WWC champion-before-bronze) matches the validated DTO exactly; final maxima require 211/64 via the existing independent oracle. Shared event-helpers and full-window-plan unchanged.
matters: Browser navigation errors can contain invitation fragments; raw serialization/rethrow and dangling waiters exposed them. The former rendered maximum check accepted unverified or 999 despite a correct DTO.
checks: 15/15 pure Node tests pass (9 dedicated + 6 existing); runner node --check, scoped ESLint, git diff --check all pass. Subprocess regression checks real stdout JSON and stderr, nonzero exit, delayed response rejection, and secret-bearing navigation/setup/cleanup failures. Deliberate raw-stderr, permissive-maximum and dangling-waiter mutations each failed tests (exit 1); original helper restored and 15/15 rerun passed.
risk: Browser/runtime acceptance remains unverified here. No DB, Docker, browser launch, provider access, publication, commit, or shared-helper edits.
verdict: accept for scoped code/pure regression repair; parent owns independent review and runtime proof.
