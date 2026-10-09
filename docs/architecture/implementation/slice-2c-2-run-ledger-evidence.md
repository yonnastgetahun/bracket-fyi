# Slice 2C.2-R Run-Ledger Acceptance-Remediation Evidence

**Scope:** Acceptance remediation for atomic claim, lease, retry-attempt, page-ledger, checkpoint, response
metadata, reclamation, and run-completion persistence. Slice 2C.3 was not started.

**Baseline:** `426352fa8ac629619ba9e98aa1ec0b3e6c487bf6` (`feat: add slice 2c.2 run ledger persistence`)

**Status:** Implemented and verified locally against the approved Slice 2C.2-R remediation contract. This
evidence is limited to disposable local PostgreSQL and synthetic TypeScript fixtures.

## Delivered

- Forward-only acceptance-remediation migration `20261010000001` with claim-request backfill already
  supplied by `20261010000000`; the remediation adds:
  - authoritative database-clock lease checks and claimed-to-running lifecycle gates;
  - ordinary/future-retry due suppression, binding-first locking, reclamation ordering, and advisory-lock
    request-key race serialization;
  - checkpoint-generation indexing, UTF-8 byte-framed page keys, and non-BMP cross-runtime conformance;
  - bounded run failure fields and recursively sensitive metadata rejection.
- The original run-ledger migration remains unchanged and retains its executable-order claim-key backfill:
  nullable column,
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
  and generic RPC failures. Page keys use the packet-defined SHA-256 framing, UTF-8 byte lengths, and
  existing canonical JSON.
- A rollback companion documenting local/disposable forward repair. It does not rewrite or delete immutable
  evidence and does not claim to restore unsafe direct table grants.

## Test-first evidence

The repository test includes a fixed SHA-256 page-key vector containing non-BMP cursor and ETag values. The
database test was expanded from the table-existence tracer into the complete claim/lease/page/retry/security
matrix. Migration resets and focused database runs exposed and corrected SQL binding-selection, lifecycle
ambiguity, stale-CAS, metadata-defense, and byte-framing issues before the final green run.

The required two-session local probes were run against disposable PostgreSQL with synthetic fixtures:

- Same automated claim key: session A returned one run with `lease_acquired=true` and a visible token;
  session B returned the same run with `lease_acquired=false` and no token. The binding generation advanced
  once.
- Same page commit: session A returned `committed|1`; session B returned `replayed|1`; the binding had one
  page-ledger row and one checkpoint/counter effect.
- Reclamation lock order: two sessions completed within the five-second statement timeout; one reclaimed two
  expired bindings and the other reclaimed zero because `SKIP LOCKED` observed the first session's binding
  locks. No deadlock or lock-order timeout occurred.

These are genuine concurrent local sessions, not sequential replay assertions. The probe fixtures were
disposable and were removed by the subsequent local reset.

Test 12 was updated under the explicitly authorized expanded allowlist: provider bindings and ingestion
runs retain SELECT but lose direct service-role INSERT/UPDATE; unrelated Slice 1B grants remain explicitly
asserted per table. Test 23 retains the dedicated direct privilege, SET ROLE, helper-denial, and wrapper
success coverage.

## Verification

Final totals from the complete verification sequence:

| Check | Result |
|---|---|
| Focused run-ledger repository suite | 1 file, 10 passed |
| TypeScript | passed |
| Full application suite | 26 files, 214 passed |
| Lint | passed; 0 errors, 10 pre-existing unrelated warnings |
| Build | passed; Next.js production build completed |
| Targeted database test 12 | 1 file, 35 passed |
| Targeted database test 23 | 1 file, 85 passed |
| Full database suite | 23 files, 469 passed |
| Database lint | passed; no schema errors; one expected unused compatibility `p_now` warning |
| Diff check | passed |

## Security and dependency status

No dependencies changed. No credentials, provider calls, raw provider payloads, notifications, hosted
databases, deployments, production data, or network services were accessed. Public mutation RPCs remain
behind SECURITY DEFINER boundaries; private ungranted helpers remain invoker-rights and are not directly
executable. The repository does not expose credential material.

## Evidence ceiling and residual risks

Evidence is static/local, synthetic TypeScript, and disposable local database evidence only. It does not
establish recorded-provider, live-provider, hosted, deployment, beta, device, or production behavior.
Sequential pgTAP replay assertions are not described as genuine concurrency. The acceptance remediation
requires and records separate two-session local probes for same-key claim, same-page commit, and lock-order
reclamation; no external worker fleet or provider was exercised. Orchestration remains Slice 2C.3 work;
provider-budget persistence remains Slice 2C.5 work. Neither was started.
