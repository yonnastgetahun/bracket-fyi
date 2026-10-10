# Slice 2C.3 Provider-Neutral Orchestration Evidence

**R1 remediation baseline:** `ea0d67ee5ca63277d702715e8116507d323c9845`

**R1 code commit:** `7cc2188c5d88a40faf80bee3b376b6a7cd1c7765` (`fix: harden slice 2c.3 orchestration boundaries`)

**R2 remediation baseline:** `685cedadd80ca1a06d50aa698ef37015e0e77bfb`

**R2 code commit:** `16e7ab2cc6137cd148d40b7e7be14cc841534827` (`fix: close slice 2c.3 acceptance gaps`)

**Documentation commit:** `docs: record slice 2c.3 remediation evidence`

**Status:** Slice 2C.3 is implemented through R2 for local, mocked, and synthetic TypeScript evidence and is
pending independent acceptance review. Slice 2C.4 was not started. Provider, hosted, deployment, beta,
device, and production acceptance remain unverified.

## Files changed by R1/R2 remediation

Code/test commit:

- `lib/ingestion/orchestrator/orchestrator.ts`
- `tests/ingestion/orchestrator/orchestrator.test.ts`

Documentation commit:

- `docs/architecture/implementation/slice-2c-3-orchestration-evidence.md`
- `docs/architecture/implementation/slice-2c-orchestrator-and-run-ledger-execution-packet.md`
- `docs/architecture/tournament-ingestion-implementation-plan.md`

The previously delivered provider-neutral ports and evidence dispatcher remain unchanged in R1.
Historical Slice 2C.2 evidence and all database files remain unchanged.

R2 changed only the same two approved code/test files listed above. No ports, dispatcher, database,
dependency, or historical evidence file changed.

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

## R2 findings closed

- Every caught boundary checks for confirmed `lease_lost` before converting errors to a controlled system
  outcome. Lease loss rethrows without finish, page commit, provider, or evidence activity.
- `unknown_budget` and `invalid_budget` cannot carry `retryAt`; exhausted budgets may omit it or provide a
  valid ISO timestamp. Strict object validation and requested-cost equality remain enforced.
- Dispatcher results are runtime-validated with a strict provider-neutral schema. A failure or malformed
  disposition accounts for the current and all remaining unprocessed observations as failed, with page commit
  withheld and count conservation preserved.
- Sports and ceremony tests use genuinely different private raw payloads and adapter-local transformations
  into normalized observations before entering the shared orchestration/dispatch path.
- Crash replay uses stateful evidence and projector fakes keyed by deterministic observation identity. The
  second attempt naturally returns exact replay/unchanged outcomes and mutates each canonical identity once.

## Test-first evidence

Tests were added before the corresponding orchestration changes in red/green increments. R2 coverage
includes lease-loss propagation across mode, registry, budget, and credential ports; strict budget semantic
combinations; first- and second-observation dispatch failures; malformed dispositions; adapter-local sports
and ceremony normalization; and stateful crash replay.

## Verification

| Command | Result |
|---|---|
| `npm test -- tests/ingestion/orchestrator/orchestrator.test.ts tests/ingestion/orchestrator/observation-dispatch.test.ts` | 2 files, 71 passed |
| `npx tsc --noEmit` | passed |
| `npm test` | 28 files, 285 passed |
| `npm run lint` | passed; 0 errors, 10 pre-existing unrelated warnings |
| `npm run build` | passed; serial Next.js production build completed |
| `git diff --check` | passed |
| `git diff --check ea0d67ee5ca63277d702715e8116507d323c9845..HEAD` | passed after documentation commit |

No Supabase tests were run because R2 changes no database files and the approved prompt made database
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

The complete-phase `nextPollAt = null` versus SQL null-means-due behavior remains explicitly unresolved and
must be resolved before scheduler deployment. Pagination loops, repeated-cursor detection, the 25-page limit,
and generalized checkpoint policy remain Slice 2C.4. Concrete rate-budget persistence remains Slice 2C.5.
This implementation processes one batch, does not sleep, and does not retry within a run.

Slice 2C.4 was not started.
