# Slice 2C.5C Integration Evidence

**Date:** 2026-10-26  
**Evidence ceiling:** local TypeScript and disposable-local Supabase only

## Implemented

- Every adapter pull reserves budget with a canonical attempt key derived from run, retry, and page identity.
- Ordinary claims require a non-NULL due `next_poll_at`; retries remain independently claimable.
- Successful completion and terminal failures explicitly unschedule the binding.
- Retryable failures and 429 responses retain the authoritative retry schedule.
- Authentication/authorization failures disable and unschedule the binding.
- Finish-time health is authoritative: changed success is healthy, stale empty success is stale, and terminal/retryable failures are degraded or stale according to data age.
- Cancellation preserves prior health and failure accounting.
- The rollback restores the previous claim and finish behavior without deleting run, observation, or reservation history.

## Verification

| Check | Result |
|---|---|
| Orchestrator unit suite | 34 files, 628 tests passed |
| DB tests 23 + 25 | 105 tests passed |
| Expanded scheduling/health test 25 | 24 tests passed |
| Rollback SQL application | Passed |
| Forward migration reapplication | Passed |
| Full DB suite | 643/646; three pre-existing service-role immutability grant assertions in test 12 fail independently of migration 00007 |

The local Supabase stack became intermittently unavailable after a reset exited 137. Migrations were restored and the rollback/forward pair applied successfully; a clean full-suite rerun remains part of Slice 2C.6 closeout.

## Scope exclusions

No provider endpoint, credential, hosted scheduler, deployment, notification delivery, beta environment, or production resource was accessed or changed.

## Verdict

The 2C.5C behavior is implemented and focused acceptance is green. Final packet acceptance is deferred to the 2C.6 replay/full-suite gate.
