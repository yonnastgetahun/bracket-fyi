# P8 durable fake notifications

## Binary criteria (written before implementation; verified below)

project: BRACKET-FYI

- [x] Atomic lifecycle audit → consented recipient intents; stable dedup and one coronation.
- [x] Durable service-only admission, basis validation, bounded retry/deadletter and subscription pruning.
- [x] Ordered stop/admission locks, five-second permits, ten-second fake timeout, no restart reuse.
- [x] All nine trigger policies have audience, expiry, routes and exact integration contract.
- [x] RED→GREEN fresh local SQL, deterministic races and fake counts recorded.

Evidence: DB33_event_notifications_test.sql; notifications tests; verify-event-notification-races.py. Acceptance is **backend packet**, not application-wide P8/P6 completion.

## Owned files / boundaries

Only nine new assigned files: migration 00007, matching additive forward repair, DB33, notifications.ts, notifications-repository.ts, two notifications test files, notification race script, this report. No lifecycle00006 or existing source edited. Other agents' work preserved. No commits, hosted database, .env.local, provider requests, real subscriptions/transports or real sends.

Read approved v1.0 §6, execution contract §D, lifecycle stable audit seam and existing schemas/grants. Applied TDD skill for behavioral RED/GREEN refinement; approved task supplied interface/testing authority.

## Durable architecture

- Extend existing notification_outbox and notification_attempts; no replacement delivery queue. Existing canonical result audit FK remains. New nullable lifecycle_audit_id references immutable lifecycle evidence. Legacy rows still require edition; typed manual-only notices may use their null-edition template. Existing legacy service insert/update grants preserved, with an invoker trigger rejecting direct service writes to P8 rows; new tables/RPCs remain service-only.
- AFTER INSERT lifecycle audit hook creates recipient intents in the same transaction for final results, changed scores/ranks, corrections and unique coronation. Snapshot of prior effective provenance/board allows comparisons without editing lifecycle00006. Audit/evaluation rollback rolls all intents/snapshots back. No transport in lifecycle callbacks.
- External producer RPC creates its own immutable notification audit with logical trigger/key/message and organizer fingerprint where applicable. Broadcast announcement update, audit and recipient intents are atomic. Exact replay returns zero; changed body/key reuse conflicts. No bearer credential stored.
- Explicit fake consent records per league/recipient/endpoint fingerprint and selected trigger kinds; never copies legacy push subscriptions or silently opts anyone in. Exact participant magic token or organizer token required. Only fake:// endpoints accepted and only hashes retained. Revocation/404/410 disables the record. Recipient records are not deleted, preserving dedup identity.
- Admission validates current coherent lifecycle basis, evaluated generation, expiry, current consent, control state, and associated binding write mode. Dirty/expired/corrected unadmitted work is canceled. Controls fail closed. Corrections wait for still-outstanding known attempts in their league.
- Stable intent key includes league, kind, logical transition and subscription. Retries retain transport dedup ID; each attempt has a distinct durable authorization and fresh five-second start deadline. Completion uses the existing unique coronation audit plus stable per-subscription coronation key.
- Worker lock order: singleton global control → associated provider binding → league/evaluation → outbox/attempt. Stop uses the same global row. Stop acknowledgment reports authorized/issued/uncertain attempt IDs and deadlines; not a drained promise. Issued work can finish after stop.
- Immediate start RPC consumes a permit once and rechecks control/binding/consent/expiry/deadline. A correction after admission is deliberately pre-correction authorized work; not falsely recalled. Worker also subtracts the complete start-RPC round trip from server-issued remaining start budget, preventing delayed acknowledgment from starting after expiry without depending on client wall-clock synchronization.
- Worker process factory generates a new incarnation UUID; it has no API to resume stored permits. Expired/crashed processing attempts become uncertain on recovery; retry creates another authorization, never reuses the old permit. Lost finish acknowledgment is not retried inline.
- Ten-second transport timeout uses AbortController plus Promise.race. Retry backoff is durable (10s then 20s; bounded formula), maximum three admissions; exhausted/transient and permanent failures become terminal failed outbox rows. Unknown remote outcome remains explicitly uncertain even if a later retry succeeds. No exactly-once-device claim.
- Real sends are forbidden in this packet: database real_sends_enabled has CHECK(not real_sends_enabled), consent accepts fake endpoints only, worker rejects any transport mode other than fake.

## Nine trigger policies

All require explicit selected-kind consent. Targets carry no organizer/magic token.

| Kind | Audience | Maximum TTL | Target | Producer |
| --- | --- | --- | --- | --- |
| lock_reminder | participant | 1 hour | /l/{league} | service producer; pass actual cutoff expiry |
| contest_live | participant | 1 hour | /l/{league} | service producer; stable contest/start revision |
| result_final | participant | 24 hours | /l/{league} | evaluated effective unresolved → resolved |
| score_change | participant | 6 hours | /l/{league} | evaluated board changes |
| schedule_change | participant | 24 hours | /l/{league} | service producer; stable schedule revision |
| result_correction | participant | 24 hours | /l/{league} | evaluated effective/provenance change |
| provider_stale | organizer | 1 hour | /l/{league}/admin | service producer; stable stale episode |
| league_complete | participant | 7 days | /l/{league} | unique coronation audit |
| broadcast | participant | 24 hours | /l/{league} | exact organizer command; optional message ≤500 chars |

Caller expiry may shorten TTL, never extend it. Expired production creates no recipient intents. Same-basis replay, retry and reopen/recomplete do not create another coronation.

## Exact parent integration contract — outstanding outside owned files

1. Apply migration 00007 after lifecycle00006. It creates event_runtime_control because no existing global-stop SQL row existed in migrations inspected. Defaults: stopped=true, notifications_enabled=false, real_sends_enabled=false.
2. Use createNotificationRepository(serviceClient) only on trusted server/job paths. No browser route may proxy capture/admit/start/finish/scan/control.
3. Consent: repo.consent(league, exactActorToken, participantId|null, fakeEndpoint, selectedKinds, enabled). Organizer uses null participant and can opt in only to provider_stale. Keep existing install/subscription rollback/double-tap UI intact; do not translate old real consent to new fake consent implicitly.
4. Lifecycle producer is already wired atomically by SQL trigger; no parent call needed. Its manifest and scoring integration remain lifecycle packet prerequisites.
5. Scheduled/provider producers: repo.emit(league, kind, stableLogicalKey, currentEvaluatedBasis, expiresAt|null, organizerToken?, message?). Supported external kinds: lock_reminder, contest_live, schedule_change, provider_stale, broadcast. Supply reviewed business-event/window identity and actual cutoff expiry, not a random retry key. Dirty/stale basis rejects with 40001 internally; repository intentionally sanitizes errors. Producer scheduling/source-event wiring is not implemented by this packet.
6. Broadcast: call emit with organizer token and message in one RPC instead of separately writing announcement and sending. Stable request key required. Broadcast plus audit/intents is transactional.
7. Worker: createNotificationWorker(repo, createFakeNotificationTransport()).run(limit) from bounded job runtime. Max scan 500. A new factory instance on process restart; never restore its worker UUID. Tests use actual service RPCs, not only mocked repository ports.
8. Operator control: repo.control(stop, notificationsEnabled) returns outstanding and drained. Parent must authorize operator principal before invoking this service-only control. API acknowledgment must be returned after RPC transaction commit.
9. **P6 shared global-stop integration remains:** provider fetch/project admission must lock/read this same event_runtime_control row before binding/league locks, fail closed on global_stopped, and preserve lock order. This packet cannot rewrite existing ingestion/projector files. A P8 stop is not proof that existing P6 projection currently obeys it.
10. **Application real-send gate remains:** existing app/api/admin/broadcast/route.ts inspected during this task still has a legacy direct fetch path unless local/fake environment flags suppress it. Parent must replace/gate that path and any other legacy notify callers before claiming application-wide real-sends-default-off. This new worker/substrate is unconditionally fake-only; no legacy path was executed here.
11. Parent owns actual browser recovery/open behavior for safe /l targets, participant/organizer UI, event producer scheduling, and full application/device evidence. Physical device receipt/open/deduplication remains unrun.
12. An uncertain prior transport is retained as outstanding even after a later retry. No operator uncertainty-adjudication API is added; do not present a drained guarantee by merely aging rows or deleting history.

## Verification — final bounded local results

All commands launched through /Users/yonnasgetahun/clawd/bin/exec; application cwd /Users/yonnasgetahun/bracket-fyi.

- Initial RED: fresh migration00006 database bracket_notifications_925ab0a952d3: DB33 fails because durable notification API/policy table absent.
- Additional behavioral RED: delayed start acknowledgment test observed one fake send when zero required. Added conservative server-budget/round-trip check; GREEN.
- Final command: python3 scripts/verify-event-notification-races.py.
- Final isolated DB: bracket_notifications_34bbe7b3a88c. Fresh install through 00006 → RED → 00007 → DB33 **54 assertions**.
- Full SQL regression on same fresh schema, before retained fixtures: **33 files / 1,028 assertions**, all pass. Legacy grant/audience/outbox tests retained unchanged.
- Real SQL repository → actual TypeScript worker → recording fake transport: disabled **0**, success **1**, three bounded retry sends **3**, prune **1**; stable retry dedup ID. 404 exercised here; 410 exercised DB33. Replayed logical event sends zero additional notices. Together with unit cases: **10 tests passed**.
- **Nine deterministic lock barriers**, observed pg_stat_activity wait_event_type=Lock before releasing blocker: stop-before-admit; admit-before-stop; issued-before-stop; correction-before-admit; consent withdrawal; override expiry during lock wait; actual five-second deadline during global lock wait; binding disable; competing workers.
- Race recording fake invoked **4 times** only after durable issued state; denied cases make no fake calls. Separately proved pre-correction authorized send, fresh restart authorization, uncertain old attempt, rollback atomicity and forward repair twice.
- No timing-based inference of lock acquisition. Expiry/deadline tests cross actual recorded database UTC boundaries, not a claimed virtual-clock simulation.
- npx tsc --noEmit --pretty false: pass on final shared tree. Earlier temporary concurrent error in application-awards.ts disappeared on recheck; no edit here.
- Scoped ESLint for both notification modules/tests: pass. git diff --check: pass.
- Migration SHA256: 36f453a18b35756f2cb52e0e03ad9dce4107dcae7e1d9827ec02b529638c9f2b.
- Forward repair disables delivery and preserves all intents/attempts/consent/audit. Replayed twice; uncertain outstanding remains visible.
- One intermediate disposable run was interrupted by a local PostgreSQL restart/connection rejection; retained as failed, not counted as evidence. Final fresh run passed.

changed: durable existing-outbox backend, atomic lifecycle/producer hooks, explicit fake consent, ordered issuance/retry/stop, recording fake worker and regression evidence.
matters: lifecycle work cannot commit without its recipient intents; crash/retry/stop cannot silently reuse an admission or invent drained/exactly-once success.
checks: fresh RED→GREEN, 54 DB33 / 1,028 total SQL assertions, 10 TS tests, nine lock barriers, scoped lint/types/whitespace pass.
risk: parent producer/runtime/UI and shared P6 control wiring; legacy direct-send route must be replaced/gated; real/device acceptance deliberately absent.
verdict: accept bounded backend packet for parent review; full P8/P6/application acceptance remains integration work.
