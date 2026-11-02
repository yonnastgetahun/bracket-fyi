# P11 private legacy/recovery fixture seeder
project: BRACKET-FYI
done when:
- [x] Inert, strictly opt-in synthetic disposable seeder supplies both runner contracts.
- [x] Runtime logic asserts prior-valid/revoked credentials and unchanged identity/picks.
- [x] Focused source-only tests pass; runtime evidence remains explicitly pending.
evidence: scripts/browser/legacy-recovery-fixture-plan.test.ts; parent-only runtime evidence.json.

## Initial source delivery; runtime NOT executed

Owned NEW files only:
- scripts/seed-legacy-recovery-browser-fixtures.ts
- scripts/browser/legacy-recovery-fixture-plan.ts
- scripts/browser/legacy-recovery-fixture-plan.test.ts
- This report.

Initial delivery made no changes to product files, existing shared/UCL/WWC seeder, adapter, harnesses or migrations. The P2 follow-up below additionally changes the recovery harness and the shared adapter's optional container argument. Existing Phase 2 task/authority applies. No commits. No DB, Docker, HTTP or browser execution. Parent reports Docker unavailable; runtime remains blocked, not passed.

## Prerequisites / exact boundary

Parent must supply an already-created, migrated **disposable synthetic** database named exactly **bracket_browser_legacy_recovery** in **supabase_db_bracket-fyi** (unchanged default) or an explicitly acknowledged owned **bracket-p11-db-<12 lowercase hex>** container, including migration 20261027000013. Set BRACKET_FIXTURE_CONTAINER to that exact name. Adapter pins Docker's local unix:///var/run/docker.sock endpoint and passes the validated container unchanged. Other database/container names fail closed before SQL. No DB creation, migration, environment-file loading or cleanup is performed.

Runtime control must have global_stopped=true, notifications_enabled=false and real_sends_enabled=false; no provider_bindings and no authorized/issued/uncertain notification_attempts. Keep all external provider/send workers disabled. Application connected to this SAME DB must be synthetic-enabled at http://127.0.0.1:3137. This seeder intentionally does not probe HTTP; browser runs must establish app/DB attachment.

Catalog must not already contain **Oscars 2025 (97th Academy Awards)**. Collision aborts before mutation; no overwrites/deletion/renaming of prior catalog data. Fresh disposable DB required for reseeding. Do not run concurrent seeders or mutate these fixtures during acceptance.

## Parent-only invocation

From repository root after runtime prerequisites are satisfied (not executed by this packet):

```sh
BRACKET_FIXTURE_DATABASE=bracket_browser_legacy_recovery \
BRACKET_FIXTURE_DISPOSABLE=bracket_browser_legacy_recovery \
BRACKET_FIXTURE_CONTAINER=supabase_db_bracket-fyi \
BRACKET_FIXTURE_ORIGIN=http://127.0.0.1:3137 \
BRACKET_SEED_LEGACY_RECOVERY=synthetic-only \
node --import ./scripts/event-runtime-register.mjs scripts/seed-legacy-recovery-browser-fixtures.ts
```

Success prints only the non-secret output directory. No credential arguments. Failure prints one fixed message, never a SQL statement, stack, token, response body or environment value. Partial disposable data is retained, never automatically retried or cleaned.

Output: ignored tmp/browser-fixtures/<random UUID>/; directory mode 0700, files mode 0600, exclusive writes, symlink ancestors rejected. status.json records a start; **complete.json must exist** before using legacy.json / own-recovery.json. evidence.json is also private. No fixture/evidence output was generated in this source-only task.

Run each once using the actual printed directory:

```sh
node scripts/verify-legacy-browser.mjs tmp/browser-fixtures/RUN-UUID/legacy.json
node scripts/verify-event-recovery-browser.mjs tmp/browser-fixtures/RUN-UUID/own-recovery.json
```

Legacy runner additionally requires synthetic VAPID preview key and Chrome/puppeteer per phase-2-legacy-recovery-browser.md. Successful rename intentionally mutates league A; re-running requires a newly provisioned disposable setup.

## Fixture construction and proof logic

- Exact Oscars catalog label, two synthetic categories with two nominees each, valid category:<id> template_matches, independent all-correct one-point winner labels. No real provider contest.
- Two custom four-team bracket leagues reference **one** new synthetic template with equal initial team_registry and no competitor overrides. Non-bye seed-0 starts as Synthetic original; target Synthetic isolated rename.
- Two independent WWC-2027 synthetic event leagues created through createApplicationLeague; joins and complete first-window submissions use actual application/repository workflows. These are application-service calls, **not HTTP setup acceptance**. A has organizer plus participants A and B, all scored first-window picks home versus away. B's saved rows are explicitly read/asserted. Foreign league has its own valid organizer/participant and saved picks. Other windows stay unopened, no locked/revealed picks.
- Actual old organizer/participant credentials are successfully verified in A before atomic compare-and-set replacement of organizer_token and A.magic_token. Both affected row counts must be exactly one.
- Old values must subsequently fail unauthorized; new values must authenticate the same identities. Foreign credentials must succeed in the foreign league and fail in A.
- Credential-neutral before/after persistence snapshots include league metadata, roster, ALL A/B pick rows, UUIDs, submitted timestamps and lock flags. Deep equality required before and after authenticated reads. Private evidence includes matching SHA-256 snapshot digests, identity/counts, mutation description and verification checkpoints; raw snapshots containing invitation data are never serialized.
- Current participant view must preserve exact visible picks/roster; organizer has no participant identity or visible open picks and retains invitation. Export JSON matches existing runner contracts; revoked tokens are former valid values, never random invalid placeholders.
- Evidence/complete files written only after all assertions pass. A source test pass is not substituted for these runtime assertions.

## Executed checks

From repo root, guarded shell:
- node --import ./scripts/event-runtime-register.mjs --test scripts/browser/legacy-recovery-fixture-plan.test.ts — **6/6 pass**.
- Targeted ESLint on all three new TS files — **0 errors/warnings**.
- ./node_modules/.bin/tsc --noEmit --incremental false — **exit 0**.

Tests cover exact target/opt-in refusal, legacy registry/category/match/winner agreement, scored-window A/B plan, identity/pick/timestamp drift rejection, inert import and pre-I/O rejection, exclusive private file permissions and symlink refusal. Only temporary unit-test files were created/removed.

changed: private legacy/recovery seeder, pure planning helpers, six isolated tests.
matters: missing runnable fixture preparation now includes verifiable credential revocation history.
checks: source tests/lint/typecheck pass; runtime not attempted.
risk: Docker/DB/browser integration and actual fixture evidence pending parent runtime.
verdict: iterate — source complete, runtime gate outstanding.

# RECOVERY-P2 Independent private B preservation
project: BRACKET-FYI
done when:
- [x] Recovery uses a separate B cookie and independent nonempty expected B snapshot before/after attempts.
- [x] B-only deletion regression and explicit isolated-container validation pass without runtime I/O.
evidence: legacy-recovery tests and source checks; runtime remains parent-only.

## P2 follow-up — private B preservation (2026-10-28)

Diagnosis: the browser's original preservation checks observed A and organizer views, which cannot see B's private open picks. Deleting only B's saved rows could pass. The seeder had B rows but omitted B authorization and the B oracle from the browser fixture.

- own-recovery.json now includes otherParticipant with a separate B cookie, expected B identity and nonempty independent expectedOwnPicks. Expected B selections come from the intended firstWindowPicks plan (away), not a response snapshot.
- Browser establishes B's actual saved/rendered picks in a separate authenticated context before recovery, then re-reads via that context after both successful restores, every authenticated and anonymous negative restore, every denied export, and at final verification. Every read compares identity, role, roster and private picks to B's independent fixture and baseline. A privacy/organizer assertions remain intact.
- Seeder re-reads B after credential rotation and includes only B's count in private evidence. Credentials remain within the existing 0700/0600 private output. Recovery CLI now catches pre-runtime validation/cleanup errors with a fixed diagnostic; runtime still records only error type, not raw error/stack/body.
- Shared adapter minimal integration change: optional validated container parameter, unchanged supabase_db_bracket-fyi default. No other fixture seeder changes. Unit subprocess mock proves exact local socket/container routing and raw-error suppression; it never launches Docker.

Proof:
- Red: 6/8 browser-contract tests passed; missing independent B baseline and fixture guards failed with Missing expected exception. This followed initial missing-export scaffolding failure.
- Green: node --import ./scripts/event-runtime-register.mjs --test scripts/browser/legacy-recovery.test.mjs scripts/browser/legacy-recovery-fixture-plan.test.ts — 17/17 pass.
- B-only deletion regression explicitly preserves A unchanged, then rejects missing B picks both before and after recovery, altered choice, foreign picks and wrong identity.
- CLI private-input canary test uses a rejected nonlocal fixture, exits before browser setup, and checks exact sanitized stderr.
- Scoped ESLint on the six touched JS/TS files: exit 0, no diagnostics.
- ./node_modules/.bin/tsc --noEmit --incremental false: exit 0.

No DB, Docker, HTTP/browser, provider, notification, commit or publication operation executed. Unit tests use temporary private files and a mocked SQL subprocess only. Regenerate private fixtures before parent runtime (old fixtures intentionally fail the new mandatory B contract). Real browser/DB preservation remains unverified here.

changed: B credential/oracle fixture, private browser re-reads, isolated-container forwarding, regression tests.
matters: B-only data deletion can no longer hide behind A's filtered view.
checks: focused tests/lint/types pass; no runtime acceptance claimed.
risk: parent-owned browser and DB run outstanding.
verdict: accept source repair; runtime gate remains pending.
