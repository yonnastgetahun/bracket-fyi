# Slice 2C.2 Run-Ledger Evidence

**Scope:** Atomic claim, lease, retry-attempt, page-ledger, checkpoint, response metadata, reclamation,
and run-completion persistence. Slice 2C.3 was not started.

**Baseline:** `80edf36d10d715f90edd89ef790474ddac00893d` (`fix: harden slice 2c.1 retry policy`)

**Status:** Implemented and verified locally against the approved Slice 2C.2 contract. This evidence is
limited to disposable local PostgreSQL and synthetic TypeScript fixtures.

## Delivered

- Forward-only run-ledger migration with claim-request backfill in executable order: nullable column,
  `legacy:<run_id>` backfill, nonblank check, `NOT NULL`, and global uniqueness.
- Disjoint automated and manual claim namespaces, monotonic binding claim generations, opaque lease
  tokens, one active run per binding, exact request replay, `FOR UPDATE SKIP LOCKED`, retry-child lineage,
  future-retry suppression, exact-boundary retry selection, and bounded four-attempt lineage.
- Claimed-to-running-to-terminal lifecycle with lease renewal, expiry reclamation, response metadata
  recording, bounded failure fields, and no sleeping or provider logic in the persistence boundary.
- Immutable page ledger with deterministic page-key framing, disposition fingerprint, exact response-loss
  replay before checkpoint CAS, same-key conflict rejection, cursor/ETag compare-and-set, count
  conservation, and atomic ledger/counter/checkpoint effects.
- SECURITY DEFINER RPCs with fixed `public, pg_temp` search paths, service-role-only execution, private
  helper denial, and direct service-role mutation denial for bindings, runs, and page ledger.
- Provider-neutral server-side TypeScript repository with explicit typed lease, checkpoint, page-conflict,
  and generic RPC failures. Page keys use the packet-defined SHA-256 framing and existing canonical JSON.
- A rollback companion documenting local/disposable forward repair and restoration of the pre-2C.2 grants.

## Test-first evidence

The repository test was added against the public RPC boundary and initially exposed a page-key vector
expectation error before the expected framing assertion was corrected. The database test was expanded from
the table-existence tracer into the complete claim/lease/page/retry/security matrix. Migration resets and
focused database runs then exposed and corrected SQL binding-selection, lifecycle ambiguity, and stale-CAS
test issues before the final green run.

Test 12 was updated under the explicitly authorized expanded allowlist: provider bindings and ingestion
runs retain SELECT but lose direct service-role INSERT/UPDATE; unrelated Slice 1B grants remain explicitly
asserted per table. Test 23 retains the dedicated direct privilege, SET ROLE, helper-denial, and wrapper
success coverage.

## Verification

Final totals from the complete verification sequence:

| Check | Result |
|---|---|
| Focused run-ledger repository suite | 1 file, 9 passed |
| TypeScript | passed |
| Full application suite | 26 files, 213 passed |
| Lint | passed; 0 errors, 10 pre-existing unrelated warnings |
| Build | passed; Next.js production build completed |
| Targeted database test 12 | 1 file, 35 passed |
| Targeted database test 23 | 1 file, 63 passed |
| Full database suite | 23 files, 447 passed |
| Database lint | passed; no schema errors |
| Diff check | passed |

## Security and dependency status

No dependencies changed. No credentials, provider calls, raw provider payloads, notifications, hosted
databases, deployments, production data, or network services were accessed. The migration keeps writes
behind SECURITY DEFINER RPCs and does not expose credential material through repository return types.

## Evidence ceiling and residual risks

Evidence is static/local, synthetic TypeScript, and disposable local database evidence only. It does not
establish recorded-provider, live-provider, hosted, deployment, beta, device, or production behavior.
Concurrent database behavior is covered by transaction-safe constraints and replay probes in the local
matrix, but no external worker fleet or provider was exercised. Budget persistence and orchestration remain
Slice 2C.3 work and were not started.
