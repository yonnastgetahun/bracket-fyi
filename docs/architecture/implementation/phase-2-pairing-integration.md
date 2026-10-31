# P2 reviewed pairing integration
project: BRACKET-FYI
Authorization: delegated approved Phase 2, local synthetic only; no hosted calls or real sends.
Done when:
- [x] Organizer-only versioned reviewed placement/orientation transition implemented; DB36 initial 20 assertions proved preservation and fail-closed holds. Final skeptical refinements await restored-DB rerun.
- [x] UCL/WWC opening is wired to explicit reviewed synthetic pairings, resolved/unheld prerequisites and current effective graph consistency. Full-manifest DB/scorer runtime proof remains separately open.
- [x] Explicit fake notification consent/broadcast use existing repository without transport/operator controls; navigation backend handoff below.
- [ ] Meaningful SQL and application regressions pass; browser evidence is not inferred.
Evidence: migration 20261027000010, DB36, application pairing tests and checks below.

## In-progress integration contract
- New `review_event_pairings` RPC authenticates exact league organizer, compares configuration/window/basis tokens, requires all target slots and settled unheld prerequisites, validates source/WWC group membership and consistent reversed UCL legs. Only unopened unpicked windows adopt.
- New immutable protected review ledger authorizes the narrow configuration-basis guard exception. Older manifests/picks remain unchanged; lifecycle capture accepts only contiguous compatible review ancestry. Target winner choices narrow to actual pair; broad eligible pools remain graph membership, not actual contestants.
- An attempted correction after opening/lock holds affected markets and freezes picks through existing audited lifecycle commands; no graph/pick rewrite. Exact rejected proposals are retained in protected append-only `event_pairing_corrections`, without consuming adopted versions.
- Necessary extra file: `lib/events/scoring-bridge.ts` now validates per-window picks against actual reviewed orientation, not prior losing predictions. Whole-league hypothetical-path behavior is unchanged. This was indispensable for later-round lifecycle reconciliation, not optional refactoring.
- Fake consent uses stable server-derived `fake://events/...` identifiers; no endpoint supplied by browser. Broadcast uses existing repository/capture basis and organizer credential. No control/transport exposed.
- **Notification navigation handoff:** existing backend outbox still emits `/l/:id` destinations; owned notification backend should route synthetic application templates to `/events/:id` before claiming fake-click navigation. No notification backend/migration modified here.
- Frontend-design skill applied with existing room typography/tokens and compact review desk; no redesign or browser proof.
## Verification (current)
- Application/scoring family: **44 passed**, 7 environment-gated DB/HTTP cases skipped in the default run. New tests cover strict command boundary, exact authentication before private operations, and actual next-round picks after losing prior picks.
- Final typecheck and scoped ESLint pass.
- **DB36: 20/20 pgTAP assertions passed**, real local PostgreSQL with service-role boundaries and rollback. Includes immutable old configuration/picks, ancestry capture, full-slot validation, unauthorized callers, narrowed SQL submission choices, current version checks, durable correction holds and preserved later picks.
- Full application two-template DB suite attempted twice: failed during template seed read, local runtime intermittently enters recovery or Docker exec exits 137. Earlier direct final-RPC apply succeeded and DB36 completed. These failures are not counted as successful full route proof.
- Atomic full UCL/WWC manifest→SQL→real scorer attempt also lost its connection; direct stderr: `server closed the connection unexpectedly` then `FATAL: the database system is in recovery mode`. Fixture setup optimized to bulk-create synthetic prior outcomes (DB36 separately proves the mutation RPC) before retry; do not claim passing unless final result below says so.
- No HTTP/browser rendering verification in this child. Parent owns restored runtime/browser acceptance.

## Independent review and final disposition
Read-only reviewer run 063e01db-e7cb-4454-8865-e598467ecc8f found two P2 defects; both repaired:
1. Existing target winner could be excluded by a new orientation. RPC now rejects before adoption; also rejects incompatible already-reviewed downstream loser sources. DB36 adds target-winner regression.
2. Held correction proposal was only hashed, not retained. Dedicated immutable correction ledger now stores exact pairings, old configuration/basis, reason and actor fingerprint. DB36 adds exact-payload and service-write-denial assertions.

**Final runtime state / resume:** The initial final-hold version of 00010 was applied locally and DB36 passed 20/20. The subsequent two skeptical repairs are present in the migration/forward-repair source, but their local apply plus expanded **23-assertion DB36** run was blocked by Connection refused on the local PostgreSQL socket. Therefore the live local database is not claimed equal to final source. Parent should apply final migration on the restored clean runtime (or its normal migration rehearsal), then run DB36 and:
RUN_EVENT_APPLICATION_DB=1 npx vitest run tests/events/application-pairings-manifest-db.test.ts tests/events/application-pairings-db.test.ts
The first is atomic rollback full UCL/WWC manifest SQL→real scorer; the second is application service→actual service-role SQL, consent and broadcast. Neither latest full-template suite is claimed passing. Forward-repair source exists and preserves evidence/freezes reviewed leagues, but its execution still needs the restored runtime.

No commits, hosted calls, real sends, notification backend changes, lifecycle*.ts/runtime*.ts edits, or 00009 edits. Necessary extra scoring-bridge.ts change is documented above. Browser verification absent.

changed: additive review/correction evidence + compatibility-checked configuration adoption; organizer review UI; fake consent/broadcast; per-window actual-pair scoring.
matters: unknown later pairings can be explicitly resolved without rewriting prior predictions or treating predictions as official qualification.
checks: 44 application/scoring tests pass; final typecheck/lint/whitespace pass; pre-review DB36 20/20 pass; final 23-assertion SQL/full manifests blocked by recovering/unavailable local DB.
risk: final SQL reapply/DB36/full UCL-WWC application and browser proofs outstanding; existing outbox /l destination needs owner /events integration.
verdict: iterate — code delivered, exact local-runtime verification gates remain.
