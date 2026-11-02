# P5/P7 durable lifecycle packet

## Binary criteria (written before implementation; verified below)

- [x] Service-only typed override/release validates exact league credential, reason, idempotency, effective token and release canonical token; cross-league writes impossible.
- [x] Canonical commits and scoped mutations atomically persist audit and dirty generation; masked canonical changes preserve effective token but change provenance.
- [x] Captured DB basis feeds existing scoreEvent; compare-generation/basis commit cannot acknowledge newer work, including expiry during computation.
- [x] Dirty/expired reads expose pending, never stale complete; restart scan recovers committed unacknowledged work.
- [x] Completion requires sealed nonempty required set, locked windows, settled typed outcomes, no hold/quarantine; reopening never reopens picks and coronation records once.
- [x] Real local service SQL + deterministic lock barriers prove three-league isolation, stale rejection and postcommit recovery; typed tests exercise scoring bridge.

Evidence: DB32_event_lifecycle_test.sql; scripts/verify-event-lifecycle-races.py; tests/events/lifecycle*.test.ts.

Only new assigned files. No hosted/provider actions, real credentials, notification transport, commits or existing-module edits.

## Storage and ordering

Migration: `20261027000006_event_lifecycle.sql`, additive after 00005. Uses existing `event_template_configs`, `event_league_evaluations`, windows, participants/picks, canonical `contest_results`, immutable nominations, existing holds/quarantine.

- Existing evaluation `generation/evaluated_generation` is the durable reconciliation obligation, not a second queue.
- New immutable `event_lifecycle_revisions`: whole typed override plus expiry, held/excluded flags, scoped revision, fingerprint, reason, exact idempotency request. Release preserves history and removes the override. Audited disposition toggles scored/required exclusion without deleting original markets/picks; reinstatement restores that basis.
- New immutable `event_lifecycle_audit`: mutation, canonical fanout, evaluated transition and unique-per-league coronation records. No bearer credential stored.
- Canonical insertion trigger inserts shared audit and synchronously fans out to every linked evaluation, ordered by league UUID. Each league generation and audit commit with the canonical result. Legacy-only canonical writes retain previous behavior. No fanout cursor/lease exists to lose membership; transaction failure rolls everything back.
- Local mutations lock exact authorized league, then evaluation. Existing window commands use the same league-first order. No new control/binding locks: upstream projector retains responsibility for its global/binding admission order before canonical insert.
- Capture and acknowledge lock league then evaluation. Scoring happens outside the DB transaction from the complete captured basis. Acknowledge re-reads current basis under lock and compares **both** generation and basis token. Expiry is sampled with DB UTC after lock acquisition. A stale worker gets 40001 and performs no write.
- Expiry itself is durable in the revision row. Dirty reads and scans compare current basis even if generation is unchanged during an outage. No lease cleanup or timer uptime required.
- `completed_at` records the current completion; invalidation reopens to locked/held, never active/picks-open. Same-winner/resolved corrections stay complete. Unique coronation index plus retained evaluation flag prevents recrowning.
- Active blocking/error quarantine is conservatively edition-wide; existing active completion holds also block. `frozen` prevents picks via existing commands, not completion of otherwise fully settled locked results.
- Zero remaining required markets do not auto-complete.

Synchronous canonical fanout is intentionally O(linked leagues), with atomic rollback and deterministic ordering. A later scale-out implementation may replace this with the existing operator-outbox fanout machinery, but must retain the same no-skip/current-basis contract.

## Sealed manifest integration contract

The **existing window manifest** is the scoring catalog (`EventDefinition | SyntheticManifest`), not a disconnected lifecycle model. Before sealing, parent setup supplies:

1. Existing `markets[].id/windowId/choices`, catalog entrants/inputs/edges/windows/domain, and scoring flags.
2. Optional `markets[].contestId`: UUID of the canonical contest in `templates.event_edition_id`. Omit for manual-only sports. Canonical entrant IDs must equal reviewed scoring IDs; no provider-ID/name lookup. Nomination markets require a canonical category and immutable nomination IDs.
3. Optional `markets[].required`: explicit required-set boolean; absent means `scored`. Structural/unscored contests are not implicitly required. Full future logical scored markets remain in the sealed manifest.
4. `manifest.lifecycle = { binding, components, weights? }`, using the existing `ReviewedGraphBinding`, trusted feasibility components and optional complete weights from `EventScoreInput`. Graph/scoring/required-set configuration shares the immutable configuration version; binding graphVersion must equal it.
5. Exact market coverage, supported domains and same-edition canonical mappings are checked in SQL; complete graph/choice/feasibility validation is performed by existing `scoreEvent`. Scored/required disposition revisions participate in the basis separately.
6. Picks retain matching `event_configuration_version`; mismatches fail closed. Participant identity/choices come from DB capture, never client score arguments.

Changing an immutable sealed manifest is not this packet's interface. Parent must build valid lifecycle-enabled configs before sealing/locking. Existing catalog/seeder records do not automatically gain reviewed bindings.

## RPC and TypeScript contracts

All RPCs below grant execute to **service_role only**. Browser principals receive none. Revision/audit direct writes and direct evaluation acknowledgments are revoked, including prior column grants.

| API | Contract |
| --- | --- |
| `mutate_event_lifecycle(league, organizer UUID, market, action, payload, reason, expectedEffectiveToken, expectedCanonicalToken, key)` | Exact credential checked under league lock before private reads. Actions: override `{outcome,expiresAt?}`, release `{}`, hold `{held}`, disposition `{excluded}`. Whole typed validation, membership/domain, strict payload fields, nonblank bounded reason/key. Release additionally compares canonical token. Identical scoped retry returns original revision; changed request/key reuse conflicts. |
| `capture_event_lifecycle(league)` | **Server-only private capture**: manifest, all saved picks, windows, effective/provenance, holds/quarantine, generation/token. Never serialize this to the browser. |
| `commit_event_lifecycle(league,generation,basisToken,leaderboard)` | Worker-only trust boundary; caller must compute with `evaluateLifecycle`. SQL validates current basis and participant/row field coverage, derives lifecycle itself, persists scores/audit/coronation atomically. SQL does not reimplement the TypeScript scorer. |
| `read_event_lifecycle(league)` | Safe result envelope. Dirty/expired => reconciliation-pending and no leaderboard. Pre-lock => no leaderboard or effective-result map. Disabled repair => held. No picks, credentials, reasons or raw manifest. Effective rows include whole outcome/source, canonical ID/version/token, override ID/revision/expiry, configuration/disposition versions, derived provenance, effective/provenance tokens. |
| `scan_event_lifecycle_work(after UUID,limit 1..500)` | Stable UUID-page cursor; returns every visited ID and null generation for clean rows. Do not use only dirty IDs as page cursor. Restart at null after exhaustion. |
| `createLifecycleRepository(client)` | Scoped RPC bindings and sanitized command errors. Recursive allowlisted public DTO removes unknown envelope/result/derived-child fields. |
| `evaluateLifecycle(capture)` | Calls existing `scoreEvent`. Exclusion removes scored credit/maximum/wrong count while preserving graph and saved picks. Open-window private choices are omitted from public score computation; future maxima remain selectable under existing scoring rules. |
| `reconcileEventLifecycle(repo,league)` | Capture → existing scorer → optimistic commit. No stale-score retry. |
| `reconcileEventLifecycleSweep(repo,{after,batchSize,maxBatches})` | Bounded restart sweep, resumes cursor, reports conflicts and per-league invalid-basis failures, continues independent leagues; never clears failed work. Returns nextCursor null at exhaustion. |

Effective token includes immutable configuration, local revision/hold/disposition and the active result identity. A masked canonical correction changes provenance/generation but not the effective conflict token. Release protects the separately captured underlying canonical token. Whole league basis includes all markets, windows/versions/cutoffs, picks, configuration, holds, quarantine, freeze and repair state.

## P8 integration seam — no transports implemented

`event_lifecycle_audit` is immutable committed transition evidence. A subsequent P8 migration can attach an AFTER INSERT trigger for `evaluated` and `coronation` rows to create existing `notification_outbox` intents **in the same transaction**. Use audit ID/basis plus league/trigger/audience as stable identity; unique coronation row is the one-time completion anchor. Recipient consent, issuance controls, recipient intents, delivery attempts and transports remain P8 work. Do not send directly from reconcile or a route, and do not interpret this packet as notification acceptance.

## Verification — local synthetic only

All shell actions used the absolute workspace guard. Docker target exclusively `supabase_db_bracket-fyi`. No `.env.local` read.

- **RED:** DB32 on migration 00005: missing `capture_event_lifecycle(uuid)`, no durable lifecycle API. The checked-in `--fresh` harness reproduces this assertion before migration.
- **GREEN fresh:** `python3 scripts/verify-event-lifecycle-races.py --fresh`: PASS; new isolated DB `bracket_lifecycle_a4c396f9afb1`; DB32 **46 assertions**, deterministic barriers all pass; fresh migration hash below.
- Barrier proof observes `pg_stat_activity.wait_event_type='Lock'` before releasing the transaction; no timing-based race inference. Override vs stale override + stale acknowledgment; canonical result vs stale acknowledgment; expiry while queued; precommit rollback; committed dirty recovery; lost acknowledgment replay; three-league fanout/provenance; one coronation; forward repair twice.
- Expiry crossing uses actual database UTC and waits for the recorded boundary while workers are locked. This is real-clock outage/lock-wait proof, not a virtual-clock claim.
- `RUN_EVENT_LIFECYCLE_DB=1 npx vitest run tests/events/lifecycle.test.ts tests/events/lifecycle-db.test.ts`: real service RPC repository → capture → scoreEvent → persistent SQL → safe reader. Hand-authored P(home)/Q(draw) oracle across canonical/active/released leagues, corrected draw, invalidation and recompletion. Retained original picks and one coronation each. Ordinary unit test runs skip the DB case unless explicitly opted in.
- Full isolated SQL regression: **32 files / 974 assertions passed**, DB `bracket_lifecycle_suite_678eacb4a3`, final lifecycle functions installed. No changes to older tests/migrations.
- Final bounded-sweep/DTO unit rerun: **11 tests passed**; real SQL integration case also passed. `npx tsc --noEmit --pretty false`, scoped ESLint and `git diff --check`: pass.

Final migration SHA256: `55bbb1f26e926041c71ed869ad290d91b5757a5cc11865ba9c1daea67f2362d2`.

Retained synthetic race leagues in fresh DB: `f23f57cf-0000-4000-8000-000000000011`, `...012`, `...013`. No data cleanup/destructive SQL performed.

## Remaining parent integration, deliberately outside owned files

- Wire HTTP/UI manual override/release/hold/disposition and provenance display using verified organizer session; never expose capture/commit/scan RPCs as client command surfaces.
- Build/seal reviewed lifecycle-enabled manifests and canonical links; preserve private future-window picks.
- Invoke bounded reconciliation sweep from the actual job/runtime and use safe pending-aware reads in typed leaderboard routes/pages.
- Bind actual derivation persistence/invalidation to existing canonical result commits; retain algorithm and ordered child ID/version provenance.
- P8 atomic recipient-intent trigger/worker, consent/admission/kill controls and fake transport acceptance.
- Parent-wide transition/browser/mobile/final-build proof and skeptical review. Existing transition worker stays pinned 00005 unless explicitly invoked with 00006. This packet does not claim full P5/P7 user-journey closure until those routes/UI/job integrations are verified.

changed: durable typed lifecycle SQL + repository/scoring integration + local SQL/race proof.
matters: corrections/expiry cannot display stale completion or erase newer reconciliation work.
risk: synchronous fanout scale; service worker must use captured scorer; parent integration and P8 remain.
verdict: packet ready for parent review; whole-roadmap acceptance not claimed.
