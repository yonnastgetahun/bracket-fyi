# Slice 2C.3 Provider-Neutral Orchestration Evidence

**R1 remediation baseline:** `ea0d67ee5ca63277d702715e8116507d323c9845`

**R1 code commit:** `7cc2188c5d88a40faf80bee3b376b6a7cd1c7765` (`fix: harden slice 2c.3 orchestration boundaries`)

**Documentation commit:** `docs: record slice 2c.3 remediation evidence`

**Status:** Slice 2C.3 is implemented and accepted only for local, mocked, and synthetic TypeScript
evidence through R1. Slice 2C.4 was not started. Provider, hosted, deployment, beta, device, and production
acceptance remain unverified.

## Files changed by R1

Code/test commit:

- `lib/ingestion/orchestrator/orchestrator.ts`
- `tests/ingestion/orchestrator/orchestrator.test.ts`

Documentation commit:

- `docs/architecture/implementation/slice-2c-3-orchestration-evidence.md`
- `docs/architecture/implementation/slice-2c-orchestrator-and-run-ledger-execution-packet.md`
- `docs/architecture/tournament-ingestion-implementation-plan.md`

The previously delivered provider-neutral ports and evidence dispatcher remain unchanged in R1.
Historical Slice 2C.2 evidence and all database files remain unchanged.

## R1 findings closed

- Claimed and current binding modes are strict runtime enums. Unknown values fail closed before budget,
  credential, adapter, evidence, or projection activity.
- Injected budget responses are strict, semantically checked, cost-matched, and fail closed as
  `system:invalid_budget_decision` when malformed or contradictory.
- Failure classification still passes through `providerFailureSchema`, `sanitizeFailure`, `classifyFailure`,
  and `decideRetry`, but persisted messages are fixed and derived only from the validated code. Recursive
  sensitive keys are removed from persisted metadata.
- Provider failures use `provider:<Slice 2A code>`; malformed provider batches use
  `provider:invalid_response`; internal failures use `system:<specific_class>`.
- Lease renewal is checked before budget, again after credential resolution when needed, and before page
  commit. Confirmed lease loss propagates without an unauthorized finish; other renewal failures finish a
  namespaced system outcome when the lease remains valid.
- Validated thrown 429/rate-limit failures record only status, retry-after, and injected observed time before
  finishing. Raw errors, headers, causes, stacks, payloads, credentials, and adapter messages are excluded.
- Controlled terminal and fail-closed outcomes receive a deterministic 300-second terminal hold when no
  approved retry or regular schedule exists. The accepted complete-phase/null scheduling issue remains a
  cross-slice decision before scheduler deployment.
- Independent synthetic sports and ceremony adapters use different private raw shapes and normalization
  paths through the same provider-neutral registry/orchestrator path.
- Crash replay and mixed-disposition tests prove earlier evidence/projection effects replay idempotently,
  page commit is withheld after a later failure, and committed counts conserve normalized observations.

## Test-first evidence

Tests were added before the corresponding orchestration changes in red/green increments. R1 coverage
includes malformed claimed/current modes, strict budget contradictions and extra fields, controlled port
failures, renewal ordering, generic secret-free failure persistence, thrown 429 metadata, terminal holds,
distinct synthetic adapters, crash replay, and mixed-disposition count conservation.

## Verification

| Command | Result |
|---|---|
| `npm test -- tests/ingestion/orchestrator/orchestrator.test.ts tests/ingestion/orchestrator/observation-dispatch.test.ts` | 2 files, 62 passed |
| `npx tsc --noEmit` | passed |
| `npm test` | 28 files, 276 passed |
| `npm run lint` | passed; 0 errors, 10 pre-existing unrelated warnings |
| `npm run build` | passed; serial Next.js production build completed |
| `git diff --check` | passed |
| `git diff --check ea0d67ee5ca63277d702715e8116507d323c9845..HEAD` | passed after documentation commit |

No Supabase tests were run because R1 changes no database files and the approved prompt made database
verification conditional on an unexpected repository-contract problem. No dependency changes were made.

## Security and evidence ceiling

The run remains lease-gated and provider-neutral. Credential values remain in the non-serializable adapter
context and are not serialized or persisted. Only fixed generic failure messages and recursively filtered,
bounded details are sent to the run ledger. No provider-specific branch or provider HTTP/client code was
added. No credentials, providers, network, hosted database, deployment, notification, production data,
beta-device, or device action occurred.

Evidence is limited to static/local checks, deterministic injected clocks, mocked repositories, and
synthetic sports/ceremony adapters. It does not establish recorded-provider, live-provider, hosted,
deployment, beta, device, or production behavior. Independent reviewer evidence is not claimed.

## Residual and deferred work

The complete-phase `nextPollAt = null` versus SQL null-means-due behavior remains a cross-slice scheduling
decision and must be resolved before scheduler deployment. Pagination loops, repeated-cursor detection, the
25-page limit, and generalized checkpoint policy remain Slice 2C.4. Concrete rate-budget persistence remains
Slice 2C.5. This implementation processes one batch, does not sleep, and does not retry within a run.

Slice 2C.4 was not started.
