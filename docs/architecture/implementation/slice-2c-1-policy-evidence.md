# Slice 2C.1 Policy Evidence

**Scope:** Pure due-binding, rate-budget, retry, backoff, deterministic-jitter, and failure policies.

**Baseline:** `f853e00d6666b95e8ce0fcfdf771f3795ec7131c` (`docs: correct slice 2c replay and retry plan`)

**Status:** Acceptance remediation implemented and verified locally; Slice 2C.2 remains gated and was not
started.

## Delivered

- Phase-based polling for distant, pregame, live, postgame, and complete states.
- Disabled bindings never become due; shadow and write bindings share the same schedule.
- Inclusive exact due-time comparison and timezone-independent ISO output.
- Fail-closed provider budget decisions with separate configured ceiling and current availability.
- Validation for missing, invalid, exhausted, reset, available, cost, and timestamp inputs.
- Three retries after the initial attempt, with timeout, network, provider-server, and rate-limited
  classifications only.
- Exponential backoff capped at 900 seconds, later-safe-time selection for provider reset and Retry-After,
  and deterministic SHA-256 full jitter using the packet-defined seed.
- Runtime validation of `ProviderFailure` through the authoritative Slice 2A schema before retry decisions,
  including rejection of unknown codes, retry-strategy mismatches, malformed details, and malformed provider
  retry timestamps.
- A fixed, process-independent SHA-256 jitter golden vector in addition to repeatability and bounds tests.
- Injected timestamp inputs only; no wall-clock globals, random state, sleeps, provider branches, or adapter
  logic.
- Strict failure validation plus bounded, whitespace-normalized, recursively redacted failure details.

## Test-first evidence

Each policy began with a focused test import that failed because the public module did not exist. The minimal
implementation was then added and the focused suite was rerun green. The remediation added failing adversarial
runtime-validation and golden-vector assertions before the parsed-failure correction. Final focused totals:

| Suite | Files | Tests |
|---|---:|---:|
| Slice 2C.1 policy suites | 4 | 55 passed |
| Phase/orchestrator policy | 1 | 8 passed |
| Rate-budget policy | 1 | 11 passed |
| Retry policy | 1 | 23 passed |
| Failure policy | 1 | 13 passed |

Coverage includes every polling phase and exact due boundary; disabled/shadow/write modes; missing,
invalid, exhausted, reset, and available budgets; invalid costs and timestamps; every Slice 2A failure code;
retry indexes 0–3; 429 with and without Retry-After; later-safe-time selection; repeatable bounded jitter;
the fixed golden vector; timezone-independent output; strict sanitized failure handling; and runtime rejection
of malformed provider failures.

## Verification

- `npm test -- tests/ingestion/retry/policy.test.ts`: **1 file, 23 tests passed**.
- `npm test -- tests/ingestion/orchestrator/policy.test.ts tests/ingestion/rate-limit/policy.test.ts tests/ingestion/retry/policy.test.ts tests/ingestion/orchestrator/failure-policy.test.ts`: **4 files, 55 tests passed**.
- `npx tsc --noEmit`: **pass**.
- `npm test`: **25 files, 204 tests passed**.
- `npm run lint`: **pass, 0 errors; 10 pre-existing unrelated warnings**.
- `npm run build`: **pass**; Next.js production build completed successfully.
- `git diff --check`: **pass**.

No Supabase commands, provider calls, credentials, network access, deployments, hosted data, notifications,
or production data were used.

## Dependency and security status

No dependencies changed. The implementation uses the existing Node `crypto` SHA-256 capability. Failure
messages and details are bounded and sensitive keys are redacted; credentials, headers, raw payloads, and
provider data are not introduced. All logic is provider-neutral and pure.

## Evidence ceiling and residual risks

Evidence is limited to static/local TypeScript behavior and synthetic failure inputs. There is no database,
provider, recorded-fixture, hosted, deployment, beta, device, or production evidence. Durable claim/lease,
retry discovery, page-ledger, budget persistence, and concurrency behavior remain deferred to the gated
Slice 2C.2 implementation. The prerequisite retry-suppression and claim-key invariant corrections were
documented in the Slice 2C packet; no database verification is claimed for them.
