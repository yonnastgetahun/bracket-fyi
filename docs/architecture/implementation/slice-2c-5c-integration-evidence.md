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
| Full DB suite | 676 tests passed after forward repair of pre-existing service-role default grants |

The local Supabase stack became intermittently unavailable after a reset exited 137. It recovered without a Docker restart; migrations were restored, the rollback/forward pair applied successfully, and the complete database suite subsequently passed.

## Scope exclusions

No provider endpoint, credential, hosted scheduler, deployment, notification delivery, beta environment, or production resource was accessed or changed.

## Verdict

The 2C.5C behavior is implemented and local acceptance is green.
