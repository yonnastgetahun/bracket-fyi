# Slice 2C.3 Provider-Neutral Orchestration Evidence

**Baseline:** `cf090400fbc6d61abfd9dedd64950d09e727abdf` (`feat: expose claim checkpoint generation`)

**Commits:** `92a74c4` (`docs: correct slice 2c implementation status`); implementation commit
`feat: add provider-neutral ingestion orchestration`.

**Status:** Implemented for local, mocked, and synthetic TypeScript evidence only. Slice 2C.4 was not
started.

## Files changed

- `lib/ingestion/orchestrator/orchestrator.ts`
- `lib/ingestion/orchestrator/ports.ts`
- `lib/ingestion/orchestrator/observation-dispatch.ts`
- `tests/ingestion/orchestrator/orchestrator.test.ts`
- `tests/ingestion/orchestrator/observation-dispatch.test.ts`
- `docs/architecture/implementation/slice-2c-3-orchestration-evidence.md`

## Delivered behavior

- Added provider-neutral ports for pull-window resolution, current-mode reads, polling-phase resolution,
  credentials, adapter lookup, injected rate-budget reservation, and orchestration.
- Rejects unowned or tokenless runs before starting or causing execution side effects.
- Starts owned runs, rechecks binding mode, and applies disabled/shadow/write least privilege.
- Disabled runs finish canceled without budget, credential, adapter, evidence, or projection activity.
- Validates polling policy and complete provider pull requests before budget reservation or adapter calls.
- Reserves exactly one injected budget unit before credential resolution and provider invocation.
- Handles budget denial, missing credentials, adapter-key mismatch, malformed requests, and malformed
  batches as bounded terminal outcomes.
- Renews leases before provider and page operations when remaining time is within 60 seconds.
- Invokes one adapter pull per run, validates the returned batch, records response/rate-limit metadata,
  dispatches observations sequentially, and commits one page only after terminal observation dispositions.
- Records evidence before structural or result projection with the approved contract/config/normalization
  metadata and SHA-256 normalized semantic hash.
- Keeps shadow evidence while skipping all canonical/result projection.
- Maps structural and result outcomes to projected, unchanged, quarantined, and skipped accounting.
- Preserves omitted cursor/ETag values and schedules a next-cursor batch for immediate continuation without
  looping.
- Classifies adapter failures through the accepted failure/retry policies and removes sensitive metadata
  keys recursively before persistence.
- Propagates lease loss without attempting an unauthorized finish.

## Test-first evidence

The first vertical test proved evidence-before-structural-projection ordering and snapshot construction.
Subsequent red/green increments covered lease ownership, lifecycle start, mode least privilege, disabled and
shadow behavior, budget and credential gates, pull/batch validation, adapter-key matching, synthetic sports
and ceremony adapters, one-call execution, credential non-serialization, lease renewal/loss, response
metadata, cursor/ETag preservation, immediate continuation, empty batches, provider failure classes,
recursive sensitive-key removal, result/structural disposition mapping, exact evidence replay, revision
conflict quarantine, and page-commit withholding after a later observation failure.

## Verification

| Command | Result |
|---|---|
| `npm test -- tests/ingestion/orchestrator/orchestrator.test.ts tests/ingestion/orchestrator/observation-dispatch.test.ts` | 2 files, 42 passed |
| `npx tsc --noEmit` | passed |
| `npm test` | 28 files, 256 passed |
| `npm run lint` | passed; 0 errors, 10 pre-existing unrelated warnings |
| `npm run build` | passed; Next.js production build completed |
| `git diff --check` | passed |
| `git diff --check cf090400fbc6d61abfd9dedd64950d09e727abdf..HEAD` | pending final implementation commit |

Supabase tests were intentionally not run. No database files changed, and this slice uses the accepted
Slice 2C.2 repository boundary through mocks.

## Security and evidence ceiling

Credential values remain inside the non-serializable adapter context and are never logged or persisted.
Failure metadata is recursively filtered for authorization, cookie, credential, password, secret, token,
payload, raw, and body keys. No provider-specific branch, provider HTTP client, credential access, provider
call, network call, hosted database, deployment, notification, production data, beta, or device action
occurred.

Evidence is limited to static review, mocked repository behavior, deterministic injected clocks, and
synthetic sports/ceremony adapters. It does not establish recorded-provider, live-provider, hosted,
deployment, beta, device, or production behavior.

## Residual and deferred work

Pagination loops, repeated-cursor detection, the 25-page limit, and generalized checkpoint policy remain
Slice 2C.4. Concrete rate-budget persistence remains Slice 2C.5. This implementation processes one batch,
does not sleep, and does not retry within a run. Independent reviewer evidence was not claimed.

Slice 2C.4 was not started.
