# Slice 2C.5A policy evidence

Status: implemented through R1 locally; pending independent acceptance review.

R1 baseline: `df7c7620807605713f9704f9adb9ae20455dbe32`

Implementation commit: `7276a9bc929ab1b8cc5afaf47c6609eb4cc30766` — `fix: harden slice 2c.5a policy acceptance`

## Files changed

- `lib/ingestion/orchestrator/accounting.ts`
- `lib/ingestion/orchestrator/health.ts`
- `lib/ingestion/orchestrator/policy.ts`
- `lib/ingestion/rate-limit/attempt-key.ts`
- `tests/ingestion/orchestrator/accounting.test.ts`
- `tests/ingestion/orchestrator/health.test.ts`
- `tests/ingestion/orchestrator/policy.test.ts`
- `tests/ingestion/rate-limit/attempt-key.test.ts`
- `docs/architecture/implementation/slice-2c-5a-policy-evidence.md`

## Delivered behavior

- Strict, immutable, BigInt-safe accounting conservation with independent `fetchedCount`.
- Canonical provider/system failure-code mapping and deterministic retry-time selection.
- Valid local budget exhaustion remains distinct from provider rate limiting.
- Strict health transitions with stale precedence, cancellation precedence, partial-state precedence, and
  committed-data freshness across later failures.
- NULL/undefined polling is unscheduled; disabled, complete, malformed, and invalid inputs fail closed.
- Deterministic UUID/retry-index/page-key attempt identities with fixed validation errors.
- Stale branches now calculate counters independently: successes and continuation-only partials reset,
  quarantines preserve, item failures and failed/rate-limited runs increment, and disabled/canceled runs
  preserve. Unsafe increments reject as `invalid_input`.
- Class instances, throwing getters, reflective traps, revoked proxies, malformed UUIDs, and date/interval
  overflow fail closed without exposing arbitrary exceptions.
- Coverage includes all eight partial-flag combinations, complete provider/system scheduling matrices,
  exact stale boundaries, maximum-safe counters, hostile runtime objects, and nullable optional timestamps.

## Verification

- Focused policy suite: 4 files, 117 tests passed.
- Full application suite: 33 files, 451 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with 0 errors and 10 pre-existing warnings.
- `npm run build`: passed.
- `git diff --check`: passed.
- `git diff --check df7c7620807605713f9704f9adb9ae20455dbe32...HEAD`: passed for the implementation
  commit before this evidence update.

No Supabase or database tests were run because no database files changed.

## Evidence ceiling and deferred work

Evidence is static/local pure-TypeScript and synthetic test evidence only. No provider calls, credentials,
network access, database or hosted activity, deployment, notifications, beta/device testing, or production
activity occurred. No dependencies changed.

Slice 2C.5B and Slice 2C.5C remain unstarted and separately gated. Independent acceptance review is pending;
no independent acceptance is claimed.
