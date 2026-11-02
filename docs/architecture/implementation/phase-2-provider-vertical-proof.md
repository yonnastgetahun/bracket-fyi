# Phase 2 provider vertical proof
project: BRACKET-FYI
done when (recorded before implementation):
- [x] Opt-in retained disposable DB lane implemented for synthetic HTTP adapter → real orchestrator/repositories → SQL → real lifecycle scorer.
- [x] Default stop, reviewed identities, sanitized provenance, replay and unauthenticated correction rejection asserted without real provider/network.
- [x] No-DB checks reported separately from parent-owned DB execution.
evidence: tests/events/provider-vertical-db.test.ts; parent invocation below.

## Missing seam

Spec v1.0 acceptance and Phase 2 Wave 3 require a vertical synthetic provider path. Existing runtime-provider tests mock ledger/evidence/projection; provider tests use synthetic HTTP but not SQL; ingestion replay tests cover checkpoint/identity pieces; lifecycle DB tests insert canonical results directly. None of those establishes that adapter observations persist and become real scores together.

This packet owns only this document and the new test. Parent alone executes Docker/DB. No production modules, shared files, migrations, commits or provider access changed.

## New bounded lane

Original synthetic football-data HTTP response → actual `FootballDataAdapter` → trusted `createEventIngestionRuntime` → actual dispatcher, run ledger, provider budget, attempt-control, evidence, structural and result repositories → PostgreSQL RPCs → actual lifecycle capture/evaluate/commit/read and scorer.

Only the provider HTTP transport is synthetic. Host-specific clock, reviewed pull window, phase and credential resolution are explicit local test composition. Binding mode is read from SQL; budget/lease/attempt admission are real SQL. RPC transport is local Docker/psql under `service_role`, not PostgREST. Fixture provisioning alone uses the disposable database owner.

The one-market synthetic UCL manifest reuses only DB33's original synthetic entity skeleton; the DB33 hand-written score function is excluded. Two real stored picks have the independent spec draw oracle: draw picker 1 earned/1 maximum/0 wrong/rank 1; home picker 0/0/1/rank 2.

Assertions:
- Fresh migrations retain global stop, notifications disabled, real sends disabled.
- A stopped run makes zero synthetic HTTP calls and writes zero observations.
- Scoped operator authority resumes only this disposable DB.
- Five reviewed canonical identity associations precede provider projection; match IDs are not canonical primary IDs.
- Initial ingestion creates one provider-origin canonical result linked to its stored source observation; real lifecycle reconciliation produces the exact oracle.
- Identical HTTP replay retains observation count and result identity/version; lifecycle replay is idempotent.
- Changed terminal score without trustworthy correction provenance is quarantined, never overwrites canonical result.
- Unmapped provider match ID fails before evidence insertion.
- Synthetic HTTP 401 persists no body/credential sentinel; neither raw unknown fields nor synthetic credential survive stored evidence/run diagnostics.
- Exactly five synthetic HTTP attempts (initial/replay/correction/unmapped/auth), zero notification attempts.
- Finally reassert global stop even when a later assertion fails; retain DB for diagnosis.

All synthetic numeric provider IDs, names and payloads are invented. `lastUpdated` remains provenance only; the test does not manufacture trusted provider revisions, effective timestamps or correction authority.

## Parent invocation — DB execution NOT performed by this builder

From `/Users/yonnasgetahun/bracket-fyi`, after the parent has verified local Docker/Postgres readiness and serialized DB ownership:

```sh
BRACKET_PROVIDER_VERTICAL_DB_TEST=1 npx vitest run tests/events/provider-vertical-db.test.ts
```

Workspace wrapper equivalent:

```sh
/Users/yonnasgetahun/clawd/bin/exec -- 'cd /Users/yonnasgetahun/bracket-fyi && BRACKET_PROVIDER_VERTICAL_DB_TEST=1 npx vitest run tests/events/provider-vertical-db.test.ts'
```

The opt-in lane creates a random `bracket_provider_vertical_<12 hex>` DB in the fixed local `supabase_db_bracket-fyi` container, applies every checked-in migration, prints its retained name before setup, and never drops it. It does not accept a hosted URL, load dotenv, use provider credentials or make provider network calls. It requires the local Supabase cluster roles/extensions. Test timeout: five minutes; per-subprocess timeout: two minutes.

Do not treat a skipped DB test or passing fixture checks as SQL integration success. Record the printed DB name, exact checkout/migration hashes and actual command outcome after the parent run. An assertion failure is evidence of the missing seam or a fixture defect to investigate, not permission to replace production repositories with mocks.

## Builder verification

- `env -u BRACKET_PROVIDER_VERTICAL_DB_TEST npx vitest run tests/events/provider-vertical-db.test.ts`: **2 passed, 1 DB test skipped**.
- `npx eslint tests/events/provider-vertical-db.test.ts`: pass.
- `npx tsc --noEmit --incremental false --pretty false`: pass.
- `git diff --check`: pass (new untracked file also checked by scoped lint).
- **No Docker command or DB test executed by builder.** Parent-run SQL outcome remains unverified.

## Scope and concrete remaining integration

This connects existing runtime ports without inventing a production ingestion host. A persistent scheduler/claim loop and deployed provider composition remain separate. This lane is UCL-shaped one-match synthetic proof, not nine-template coverage, NFL parity, full UCL tournament progression, real provider readiness or browser/UI verification. SQL transport is not HTTP endpoint proof.

A trustworthy changed-terminal correction cannot be synthesized merely from football-data `lastUpdated`: the adapter deliberately emits no trusted correction authority. Accordingly this lane proves rejection/quarantine, not provider-authorized correction acceptance. Reviewed operator correction/lifecycle paths have separate tests; live correction attribution remains an external provider gate.

changed: one opt-in vertical DB harness and this execution record.
matters: independently testable provider/persistence/scorer seam previously split across mocked and direct-SQL tests.
checks: network-free fixture checks, scoped lint, TypeScript, whitespace; DB lane explicitly unrun.
risk: SQL execution may expose integration/fixture mismatches; parent must run and retain exact failure evidence.
verdict: HOLD DB acceptance pending parent execution; ready for independent review.
