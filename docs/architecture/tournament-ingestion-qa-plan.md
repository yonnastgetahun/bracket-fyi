# Tournament and Event Ingestion QA Plan

**Date:** 2026-10-02
**Status:** Approved at G0 on 2026-10-03 — provider, beta, device, and production actions retain later gates

## Quality objective

Prove that external event data can update shared results without corrupting identities, scores, league-specific overrides, lifecycle state, or notifications. Evidence must progress from deterministic local tests to approved provider reads, bounded beta use, physical-device push delivery, and production acceptance. Passing mocks is necessary but never sufficient.

## Evidence ladder and environments

| Level | Environment | Permitted data/action | Exit evidence |
|---|---|---|---|
| Static/local | Local app and disposable local Supabase | Synthetic data only | Build/type/lint, unit and migration tests |
| Mocked provider | Local deterministic HTTP stub | Synthetic provider responses | Adapter contract and error behavior |
| Recorded fixture | Local replay harness | Sanitized real payloads obtained under approved terms | Normalization, ordering, correction, and regression evidence |
| Sandbox/provider | Approved non-production credential/environment | Read-only provider calls | Redacted request metadata, sanitized response, quota and contract verification |
| Shadow beta | Isolated deployed binding, no scoring writes | Provider observations and proposed projections | Parity report against official/manual results |
| Write beta | Named beta template/leagues | Bounded canonical writes and organizer overrides | End-to-end scoring, lifecycle, stale/recovery, and tester feedback |
| Device | Physical supported devices | Approved push sends to test subscriptions | Receipt, open, deduplication, expiry, and pruning evidence |
| Production canary | One approved catalog template | Monitored production writes | Acceptance window with freshness/error/feedback targets met |

Each evidence artifact records commit, migration version, provider/config version, event edition, timestamp/timezone, run ID, commands or procedure, observed result, expected result, and reviewer.

## Test layers

### Unit tests

- Provider status and winner maps.
- Time-window calculation, timezone boundaries, and daylight-saving transitions.
- Rate-budget calculations, jitter, and `Retry-After` handling with a fake clock.
- Unicode/name normalization and exact alias matching.
- Series, aggregate tie, single-elimination, and award-category completion rules.
- Result ordering, payload hashing, and idempotency-key construction.
- Override precedence, expiry, release, and completion holds.
- Notification intent deduplication.

### Adapter contract tests

Every adapter must pass one common suite:

- capabilities are explicit and configuration is schema-valid;
- pagination/cursor boundaries produce no missing or repeated projection effects;
- partial fields remain unknown rather than fabricated;
- provider IDs and provider timestamps are preserved;
- auth, permission, not-found, rate-limit, transient, validation, and permanent errors are classified consistently;
- secrets are absent from logs, fixture snapshots, exceptions, and browser bundles;
- provider payloads do not escape adapter types.

Each adapter also has domain-specific fixtures: football extra time/penalties and two-leg ties; baseball/basketball series; football byes/postponements; NCAA regions/seeds; and Oscars nominations/winners.

### Database and migration tests

- Fresh migration and upgrade from the current production schema.
- RLS/grants for anonymous participant, organizer, operator, ingestion worker, and service roles.
- Stable current IDs and score outputs after additive backfill.
- Uniqueness and foreign-key enforcement for observations, mappings, bracket edges, result versions, and outbox keys.
- Transaction rollback leaves no partial canonical result or orphan notification.
- Backfill replay is a no-op after success and resumes safely after interruption.
- Forward-repair procedure preserves observations and audit history.
- Effective-result resolver returns canonical rows for every league without requiring an override row.

### Route and authorization tests

For every privileged route:

- missing or malformed organizer credential returns no privileged information;
- one league's organizer cannot mutate another league;
- participant/match/result IDs are validated against the league;
- a valid organizer can perform only documented operations;
- invalid winner IDs, oversized payloads, illegal status transitions, and replayed stale versions fail safely;
- error responses and logs contain no organizer token, provider secret, service key, or push endpoint.

### Integration and browser tests

- Create a league from a calendar template, join, pick, lock, ingest results, score, compare, and complete.
- Verify one canonical result serves multiple leagues.
- Verify an override changes only its league, survives provider polling, and releases to the newest canonical result.
- Verify stale/failure banners and manual fallback on organizer and participant views.
- Verify correction reopening and winner-coronation removal/update.
- Verify existing custom bracket and all current seeded templates still work without provider configuration.
- Verify mobile and installed-PWA navigation for result, leaderboard, provenance, and notification flows.

## Core ingestion scenario matrix

| Scenario | Required assertion | Minimum evidence before beta |
|---|---|---|
| Duplicate page/payload | One observation identity, one canonical version, one notification intent | Recorded fixture |
| Same payload with reordered JSON | Stable semantic hash or no projection change | Recorded fixture |
| Out-of-order nonterminal update | Older state is audited but does not regress current state | Recorded fixture |
| Late provider correction | New version, audit event, score recompute, correction intent | Recorded fixture |
| Final changed to unresolved | Contest/league reopen under policy; no duplicate coronation | Database integration |
| Partial snapshot | Missing contests are not deleted or marked final | Recorded fixture |
| Unknown competitor | Quarantine; no guessed mapping or result projection | Recorded fixture |
| Ambiguous alias | Quarantine with candidates; operator resolution is audited | Recorded fixture |
| Postponed/canceled/void | Event-specific policy; only result-bearing terminal states count | Recorded fixture |
| Provider 401/403 | Binding disabled/degraded and operator alert; secret not logged | Mocked provider |
| Provider 404 | Configuration quarantined; no destructive sync | Mocked provider |
| Provider 429 | Honor reset/retry; preserve rate budget and current data | Mocked provider |
| Provider 5xx/network timeout | Bounded retry/backoff; run recorded; no duplicate effects | Mocked provider |
| Stale during live window | Public delayed state and organizer warning; no invented winner | Integration |
| Recovery after stale | Catch-up is idempotent; delayed marker clears only after fresh success | Integration |
| Concurrent dispatch | One binding claim; losing worker exits safely | Database integration |
| Scheduler missed run | Health alarm and bounded catch-up; no request storm | Integration |
| Manual override before provider final | Provider result stored; league continues to use override | Integration |
| Override after provider final | Only target league changes; audit captures replaced version | Integration |
| Override release/expiry | Latest canonical result becomes effective; scores/lifecycle reconcile once | Integration |
| Fallback disagreement | Shadow conflict quarantined; no automatic source blending | Recorded fixture |
| Replay entire event | No duplicate canonical versions, scores, or notifications | Database integration |

## Event-family coverage matrix

| Event family | Domain behavior that must be tested |
|---|---|
| MLB Playoffs | Best-of series, variable game count, postponements, clinch detection, home/away changes, Wild Card single series structure |
| College Football Playoff | Seeding, first-round byes, neutral sites, overtime, rescheduling, advancement graph |
| NFL Playoffs | Conference bracket, byes, reseeding if applicable to configured year, overtime/final statuses, neutral-site Super Bowl |
| UEFA Champions League | League-to-knockout transition, two-leg aggregate score, away-goal rule absence, extra time/penalties, single-match final |
| NBA Playoffs | Best-of-seven series, play-in exclusion/inclusion policy, variable game count, clinch detection, schedule changes |
| NCAA March Madness 2027 | First Four, 64-team bracket projection, four regions, seeds, advancement, championship completion |
| Women's World Cup 2027 | Group standings inputs if used, best-third-place/round-of-32 mapping per official format, extra time/penalties, third-place match policy |
| Oscars | Nominations, nominee identity, category aliases/order, ties or category changes if encountered, ceremony winner corrections, historical replay labeling |

## Shared-result and scoring acceptance

Create at least three leagues on one template:

1. League A uses only canonical results.
2. League B has an active organizer override on one contest.
3. League C creates then releases an override after a newer provider result arrives.

Assert that one provider poll creates one canonical result version; A reflects it, B remains overridden, and C resolves to the newest canonical result after release. All league score totals, ranks, compare views, and completion status must match independently computed expectations. No provider is polled per league.

## GitHub issue #3 acceptance matrix

The issue is not resolved until all of these pass:

- A locked league with one unresolved required contest remains locked.
- Entering or ingesting the last valid result transitions it to complete exactly once.
- Optional/non-scoring contests do not block completion.
- An active completion hold blocks the transition; releasing it completes the league if otherwise eligible.
- An active organizer override counts as the effective result.
- Releasing an override with no canonical fallback reopens a complete league to locked.
- An accepted provider correction that invalidates a required result reopens it and audits the reason.
- Replaying the last result does not repeat `completed_at`, audit, coronation, or push intents.
- An active league never auto-completes from preexisting historical results.
- Concurrent final-result writes produce one legal transition.
- Existing winner takeover/run-it-back behavior renders correctly after completion and correction reopening.
- Deployed beta evidence confirms the database and UI behavior before closing issue #3.

## Provider-backed beta procedure

Requires G2/G3 approval.

1. Record provider account, tier, accepted terms, credential owner, quota, target event, and data-retention rules.
2. Select an isolated event edition and beta template; do not reuse a production league with unconsenting participants.
3. Verify current provider IDs and mappings with read-only calls.
4. Run at least one full polling cycle in shadow and compare every observation/proposed result with the provider UI and an official event source.
5. Exercise normal, duplicate, delayed, partial, rate-limited, stale, and recovery scenarios. Use controlled injection for failures that cannot safely be induced against the provider.
6. Enable writes for the beta binding only. Keep a tested binding kill switch and manual result fallback available.
7. Create multiple leagues to prove shared results and one override league to prove isolation.
8. Observe at least one naturally completed contest if event timing permits; clearly label synthetic lifecycle tests otherwise.
9. Capture run/freshness/quarantine/outbox metrics for the agreed window.
10. Reconcile final beta results and scores independently, collect tester feedback, and present residual risk before G4.

## Real-device push test procedure

Requires G3 approval and a named physical device owner.

### Preconditions

- HTTPS beta environment and current service worker deployed.
- Physical iPhone/iPad using an installed Safari web app for the iOS path; a physical Android/Chrome device is strongly recommended as the second platform.
- Test participant with explicit notification permission and a removable beta subscription.
- VAPID keys and delivery worker configured without exposing private material.
- Outbox/attempt inspection and subscription cleanup available.

### Procedure

1. Install/open the PWA, grant notifications, and confirm exactly one current subscription is stored.
2. Send an approved test broadcast and record outbox ID, attempt, device receipt, displayed title/body, and tap destination.
3. Repeat with the app foregrounded, backgrounded, and device locked.
4. Trigger one provider-result notification through the beta ingestion path and one correction notification.
5. Replay their idempotency keys and confirm no duplicate outbox intent or duplicate display caused by the application.
6. Temporarily disconnect the device, create a bounded-TTL intent, reconnect, and record actual delivery/expiry behavior without claiming guarantees the push service does not provide.
7. Remove/expire a test subscription and verify 404/410 pruning where the push service exposes it.
8. Deny then re-enable permission where the platform permits, verifying UI recovery instructions.
9. Open each received notification and verify the link cannot expose organizer/participant secrets to the wrong context.
10. Remove the test subscription and retain only redacted evidence.

Acceptance requires receipt and correct navigation on at least one physical supported device. A successful Edge Function response with `sent: 0`, simulator-only behavior, or a stored subscription alone is not device-delivery evidence.

## Security and privacy QA

- Threat-model scheduler authentication, service-role functions, organizer links, operator endpoints, raw provider payloads, and push endpoints.
- Search built assets, logs, fixtures, database dumps, and error telemetry for secrets.
- Attempt cross-league object substitution and privilege escalation.
- Validate least-privilege grants and `SECURITY DEFINER` search paths.
- Confirm raw payload sanitization and retention/deletion policy.
- Confirm provider attribution and trademark/image usage at each rendered surface.
- Confirm beta participants understand the app stores their display name, picks, and push subscription; provide cleanup procedure.

## Nonfunctional acceptance targets

Exact numeric service targets require G0 approval. Proposed starting targets:

- No lost or duplicated scoring effect under replay or concurrent dispatch.
- Live-event freshness warning at the configured threshold, with a default target of 15 minutes for football-data UCL beta.
- 100% ingestion runs visible with terminal status and counts.
- 100% quarantined items operator-visible and non-projecting.
- No service-role/organizer/provider secret in client bundle or logs.
- Current non-provider league creation, picks, manual results, scoring, compare, lock/unlock, and PWA flows remain regression-clean.

## Feedback collection and triage

Use one repository issue form or private feedback form approved at G3. Collect event/template, league ID or redacted correlation ID, timestamp/timezone, device/browser, expected/actual behavior, screenshots, and permission to follow up. Never request participant or organizer secret links.

Triage daily during active beta:

| Severity | Definition | Response |
|---|---|---|
| P0 | Security exposure, wrong winner/scoring across leagues, destructive data loss | Disable affected write path; immediate owner notification |
| P1 | Stale live results beyond threshold, override failure, lifecycle corruption, widespread push failure | Stop expansion; investigate within support window |
| P2 | Isolated mapping/UI/push issue with manual workaround | Prioritize before production acceptance if core journey |
| P3 | Cosmetic, clarity, or future-provider request | Backlog with evidence |

Each report is linked to a run/result/outbox ID where available, assigned an owner, reproduced at an explicit evidence level, and either fixed/retested, accepted as residual risk, or removed from scope. Publish a beta summary before G4.

## QA exit criteria

- All required matrices have evidence at their named minimum level.
- No open P0/P1 issue and no unexplained scoring discrepancy.
- Security mutation tests and secret scans pass.
- The selected provider's real payload, quota behavior, and attribution have approved evidence.
- Organizer override, stale/recovery, duplicate/out-of-order, and issue #3 paths pass in beta.
- Physical-device push evidence passes or push-trigger rollout remains disabled.
- Regression suite passes for existing manual/custom templates.
- Rollback/kill switch is rehearsed.
- Residual risks and unsupported provider/event features are visible to the owner.
