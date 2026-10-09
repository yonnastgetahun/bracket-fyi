# Slice 2A Provider Contracts Evidence

**Date:** 2026-10-08

**Scope and approval:** Explicit implementation approval covered only Slice 2A: provider-neutral ingestion contracts and runtime validation. This evidence is limited to the allowlisted files and synthetic fixtures. No provider, credential, production, database, deployment, UI, schedule, API, or notification work was performed.

## Contracts delivered

- `lib/ingestion/contracts.ts` provides strict Zod schemas and inferred types for JSON values, canonical/external identifiers, offset date-times, capabilities, entity kinds, all normalized entity shapes, discriminated observations, and provider batches.
- Runtime invariants cover plain JSON values, strict envelopes, normalized entity-kind/data pairing, result state/outcome/winner compatibility, contest-entry uniqueness, date ordering, bracket self-edges, and rate-limit bounds.
- `lib/ingestion/config.ts` provides strict event configuration parsing with IANA timezone validation, unique required capabilities/contest kinds/stage keys, polling minima, stale-window ordering, and typed-copy parsing.
- `lib/ingestion/errors.ts` provides the failure taxonomy, retry-strategy validation, sanitized `ProviderAdapterError`, and type guard.
- `lib/ingestion/providers/provider-adapter.ts` provides the strict pull-request schema and the common credential/context/adapter seam. Credentials are intentionally absent from serializable pull requests.
- Synthetic sports-fixture and ceremony-category adapters consume the same `ProviderAdapter` interface and return schema-validated normalized batches. Their source-page types remain private to the test adapters.

## Test-first evidence

The targeted contract command initially failed with “No test files found” before Slice 2A tests existed. Vertical red/green cycles then added one behavior at a time: organization/JSON primitives; sports results; ceremony results; remaining entity invariants; batches; sports and ceremony configuration; failure taxonomy; pull request/context; and the second adapter seam. The final targeted suite is 4 files and 31 tests, all passing.

## Verification

All commands were run locally in the required order:

| Command | Result |
|---|---|
| `npm test -- tests/ingestion/contracts` | PASS — 4 files, 31 tests |
| `npx tsc --noEmit` | PASS |
| `npm test` | PASS — 10 files, 53 tests |
| `npm run lint` | PASS — 0 errors, 10 pre-existing warnings |
| `npm run build` | PASS — Next.js 16.3.8 webpack production build |
| `git diff --check` | PASS |

## Dependency and security review

- Added the exact production dependency `zod@4.6.5`; the lockfile only promotes the existing Zod 4.6.5 entry from transitive development use to direct production use. No unrelated dependency versions changed.
- Credentials are represented only by the non-serializable `ProviderCredential` interface. Pull requests, observations, batches, failures, and synthetic fixtures contain no credential material. Tests verify pull-request JSON and error serialization do not contain a credential sentinel or authorization header.
- No provider documentation, provider endpoint, credential store, environment secret, production payload, or live data was accessed.

## Evidence ceiling, exclusions, and residual risk

This is static/local and deterministic synthetic mocked-adapter verification only. It is not recorded-fixture, live-provider, database-integration, beta, device, deployment, or production evidence.

Identity resolution, ordering, idempotency, quarantine persistence, canonical projection, orchestration, rate-budget enforcement, retry execution, provider classifiers, recorded fixtures, and provider-backed verification remain deferred to later approved slices. Slice 2B was not started.
