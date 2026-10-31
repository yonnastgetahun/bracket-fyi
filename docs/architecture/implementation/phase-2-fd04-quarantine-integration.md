# FD04 rejected-row quarantine integration
project: BRACKET-FYI
done when:
- [x] A rejected FD row creates immutable, non-projectable evidence and an explicit blocking quarantine entry without inventing mapped entities.
- [x] Real adapter/orchestrator regression tests prove atomic no-prefix writes, bounded evidence, replay identity and persistence-failure handling.
- [x] Independent skeptical review adjudicates contract and implementation; DB execution limitations remain explicit.
evidence: focused Vitest commands and independent review recorded below.

## Contract adjudication (2026-10-30)

Approved spec v1.0 §6 P3 requires unknown/conflicting mappings to quarantine; P4 requires immutable evidence, replay idempotency and bounded allowlisted retention. Neither requires raw-body retention, invented canonical IDs, or normalization of every row after a batch has already failed. Existing FD whole-batch rejection and safe run metadata were real and remain intact. The missing seam was an explicit durable quarantine witness, not unsafe ingestion.

The bounded contract now is: one first-rejected-row witness (or envelope witness) holds the entire batch; evidence names its scope honestly. Unexamined later rows are not individually diagnosed. Valid prefixes never project. An operator must correct reviewed configuration/source scope and run a fresh pull; this rejection record is not a normalized result that may be replayed into scoring. This does NOT claim exhaustive per-row records for a rejected batch.

## Implementation

- New `quarantineAdapterRejection` consumes only the football-data invalid-response/review-required contract. Fixed reasons and bounded numeric IDs/index/count are revalidated; unknown fields are stripped, never retained as raw evidence.
- Existing immutable `record_provider_observation` stores `externalObjectKind=adapter_rejection`, `contractVersion=adapter-rejection-v1`, partial rejection diagnostics, no provider revision/update time, no canonical identity. This is a separately namespaced rejection witness, not an invented contest.
- Existing `open_ingestion_quarantine` links the observation/run/binding with blocking severity and `mapping_missing` / `mapping_ambiguous` / `unsupported_shape`. No candidate or external canonical entity is guessed.
- External evidence identity is run + checkpoint generation + first row index (or envelope). Same-run retries are idempotent; different runs cannot accidentally reuse an earlier observation and violate the quarantine RPC's run-ownership check.
- Run failure metadata links observation/quarantine IDs. Existing failed outcome, no retry/checkpoint advance, no projected prefix remain. Rejected witnesses do not masquerade as normalized page items; normalized/quarantined page counters remain zero.
- Evidence/quarantine persistence error, missing port, malformed diagnostic, or evidence revision conflict fails closed as `system:adapter_quarantine_failed`, retaining safe original reason with an explicit persistence-failure flag. No false quarantine receipt.
- Trusted runtime factory supplies the real quarantine RPC adapter, overriding a caller's permissive/test port. Shadow may record evidence/quarantine but never projects.

## Existing SQL compatibility — source inspection, NOT new DB execution

No migrations or DB edits needed:
- `20261006000002_ingestion_evidence_and_delivery.sql`: observation kind allows safe textual namespaces; immutable UPDATE/DELETE trigger protects stored evidence.
- `20261009000000_slice_2b_observation_evidence.sql`: snapshot envelope validator accepts the versioned rejection object; quarantine RPC checks the exact observation/run/binding relationship and idempotently opens the issue.
- `20261009000003_slice_2b_acceptance_remediation.sql`: current evidence RPC supports revisionless payload/snapshot replay. Run-scoped rejection object IDs deliberately avoid cross-run observation reuse.
- Quarantine entity kind is omitted (SQL NULL), with empty candidate IDs, so no unsupported entity enum or invented canonical candidate enters the existing RPC.
- Rejection namespace cannot become a provider entity reference through the allowed mapping kinds. No projection port is called by this seam.

The two existing RPCs are separate transactions: evidence can persist before quarantine failure. Same-run replay retries opening quarantine; a fresh operator pull creates a new run-scoped witness. This is an explicit recoverable failure, not a claim of atomic cross-RPC insertion.

## Owned changes (exact file list)

1. `lib/ingestion/quarantine/adapter-rejection.ts` (new)
2. `lib/ingestion/orchestrator/orchestrator.ts` (rejection persistence call/receipt/failure path only)
3. `lib/ingestion/orchestrator/ports.ts` (quarantine port only)
4. `lib/events/runtime.ts` (production quarantine composition only)
5. `tests/ingestion/quarantine/adapter-rejection.test.ts` (new)
6. `tests/ingestion/orchestrator/orchestrator.test.ts` (synthetic FD fixture and rejection integration describe/imports only)
7. This report.

Pre-existing control-admission changes in the same orchestrator/ports files are not this worker's work. No canonical ledger, findings, migration14/DB38, provider adapter, preserved baseline document or case study changed. Baseline SHA256 verification: all26 match.

## Verification

All commands through `/Users/yonnasgetahun/clawd/bin/exec`, cwd repository via `npm --prefix` or guarded `cd`:

- `npm test -- tests/ingestion/quarantine/adapter-rejection.test.ts tests/ingestion/orchestrator/orchestrator.test.ts tests/ingestion/providers/football-data.test.ts tests/events/runtime-provider.test.ts tests/ingestion/orchestrator/observation-dispatch.test.ts`: **5 files /190 tests passed**, including 10 new rejection-seam tests and7 new real-FD orchestration tests.
- `npx tsc --noEmit --incremental false`: **exit0**, final post-test edits included.
- Scoped ESLint across all six code/test files: **exit0**, no diagnostics.
- Scoped `git diff --check`: **exit0**, including final review documentation and test-title correction.
- SHA256 baseline verification: **26 checked /0 mismatches**.

The production-factory regression runs original synthetic JSON through actual FootballDataAdapter → orchestrator → actual observation/quarantine RPC adapters against a fake RPC endpoint. It proves calls/order/arguments and no projection, NOT SQL execution. Persistence failure, shadow, malformed diagnostics, source-field stripping, same-run replay, cross-run isolation, envelope witness and evidence-before-quarantine recovery are covered.

## Independent skeptical review and final adjudication

Reviewer `fd04-quarantine-skeptic`, run `1b7e7d66-ff11-4dbf-8e1d-624585755221`, session `767c28e0-8387-496b-a2d6-9d29eb2ce540`: **ACCEPT bounded FD04 source contract; no concrete blocking defect found**. Read-only source review, no executed SQL claim.

- Confirmed approved P3/P4 contract, current SQL envelope/kind compatibility, run-owned replay identity, fail-closed paths and absence of canonical mapping/settlement authority.
- First-rejected-row witness plus blocking quarantine holds the full fetched batch; exhaustive per-row quarantine remains explicitly unclaimed.
- Same-run replay preserves existing quarantine disposition; SQL may return `already_resolved` for resolved/ignored records. It does not reopen them. Corrected misleading test title; no behavior change.
- Separate evidence/quarantine transactions can leave evidence without quarantine on failure. Failure remains explicit, never reported as successful quarantine.
- Coverage is only football-data `invalid_response` with `reviewRequired`; other transport/envelope failures keep their existing failed-run behavior.
- Repository/RPC doubles establish source integration only. Actual SQL constraints, immutable triggers and end-to-end persistence are not executed by this worker.

This report supersedes earlier FD repair/reconciliation statements that the quarantine/review integration seam was unestablished, **only at source/unit acceptance level**. Historical reports remain unchanged; parent owns canonical ledger promotion and any DB-backed acceptance.

changed: durable rejection evidence/quarantine integration and bounded regression coverage.
matters: rejected mapping batches become reviewable without projecting a prefix or inventing identities.
checks: 190 focused tests, full TypeScript and scoped ESLint passed; independent source review accepted.
risk: actual SQL/end-to-end execution remains outside this worker's evidence.
verdict: accept — bounded FD04 source contract, not SQL/end-to-end acceptance.

No DB/runtime launched; no provider calls, credentials, spend, commit, push, deployment or live activation.
