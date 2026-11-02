# Slice 2B.2 ordering and idempotency evidence

**Evidence classification:** static/local deterministic TypeScript with synthetic values only. No provider,
credential, database, hosted, deployment, or production evidence.

## Delivered

- Canonical JSON sorts object keys recursively and preserves array order.
- Observation, result, audit, and outbox keys use versioned SHA-256 formulas.
- Semantic result keys exclude observation identity, so a different observation with the same normalized
  result is a duplicate.
- Provider revisions are identity inputs only and are never lexically ordered.
- Contest lifecycle ordering is separate from result ordering; result states do not contain `live`.
- Missing timestamps cannot replace an accepted terminal result; changed terminals require explicit newer
  corrections; illegal regressions quarantine.

## Verification

| Command | Result |
|---|---|
| `npm test -- tests/ingestion/ordering tests/ingestion/idempotency` | 2 files, 10 tests passed |
| `npx tsc --noEmit` | passed |
| `npm run lint` | passed; 0 errors, 10 pre-existing unrelated warnings |
| `git diff --check` | passed |

All values were synthetic. The evidence ceiling is local TypeScript policy and deterministic key testing.

## Rollback and next step

No persisted data or migration exists in this sub-slice; revert the implementation commit to roll back.
The next sub-slice adds observation evidence, atomic mapping transitions, and quarantine persistence.
