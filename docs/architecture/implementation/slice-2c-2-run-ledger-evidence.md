# Slice 2C.2-R2 Run-Ledger Clock Acceptance-Remediation Evidence

**Scope:** Acceptance remediation for atomic claim, lease, retry-attempt, page-ledger, checkpoint, response
metadata, reclamation, and run-completion persistence. Slice 2C.3 was not started.

**Baseline:** `f51ac6d06fc8548c111c4aabfd3b9acc3f9bccff` (`fix: remediate slice 2c.2 acceptance defects`)

**Status:** Implemented and verified locally against the approved Slice 2C.2-R2 remediation contract. This
evidence is limited to disposable local PostgreSQL and synthetic TypeScript fixtures.

## Delivered

- Forward-only clock-remediation migration `20261010000002`; the prior `20261010000001` remains unchanged.
  The new migration adds fresh post-lock database-clock timestamps for replay authorization, claim expiry,
  renewal, lifecycle transitions, and reclamation; schema-qualified public RPC bodies; and safe no-op rollback
  companions that preserve helper dependencies and immutable evidence. Planned Slice 2C.5 budget persistence
  is now reserved as migration `20261010000003` in the packet.
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
matrix. It now characterizes expired exact request replay as a no-token response. Migration resets and focused
database runs exposed and corrected SQL binding-selection, lifecycle ambiguity, stale-CAS, metadata-defense,
byte-framing, and fresh-clock issues before the final green run.

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

R2 clock probes used the disposable-local command `zsh /private/tmp/slice-2c-2-r2-clock-probes.sh`, with
three two-session cases:

- A same-key replay was held behind the advisory lock while its stored lease was changed to expire during
  the wait. The blocked replay returned `f|f` (`lease_acquired=false`, no token).
- A manual claim blocked for approximately two seconds on its binding lock, then returned `59.998124`
  seconds remaining on a 60-second lease, demonstrating a fresh post-lock lease start.
- Renewal blocked for approximately two seconds on binding and run locks, then returned `59.999215`
  seconds remaining on a 60-second extension, demonstrating post-lock renewal timing.

Rollback rehearsal used a transactional `psql` session with `\i` of both
`supabase/rollbacks/20261010000001_slice_2c_2_acceptance_remediation_down.sql` and
`supabase/rollbacks/20261010000002_slice_2c_2_clock_remediation_down.sql`, invoking the public claim wrapper
before and after both files. It returned one row before and one exact replay row afterward, then rolled back.
No helper or public RPC dependency was removed, and a final local reset removed all probe fixtures.

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
| Targeted database test 23 | 1 file, 89 passed |
| Full database suite | 23 files, 473 passed |
| Database lint | passed; no schema errors; three expected unused caller `p_now` warnings |
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
