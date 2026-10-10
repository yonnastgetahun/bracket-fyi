# Slice 2C.4B bounded pagination integration evidence

## Scope and status

Baseline: `d9a15e9d14af4c00e6fc795e44fa999d5fd7562f`.

Exact allowlist:

- `lib/ingestion/orchestrator/orchestrator.ts`
- `tests/ingestion/orchestrator/orchestrator.test.ts`
- `docs/architecture/implementation/slice-2c-4b-integration-evidence.md`

Implementation commit: `e2571564af87e22b7c2acd78abc2f24d9deea0a0`
(`feat: integrate bounded ingestion pagination`). The documentation commit is
`docs: record slice 2c.4b local evidence`; its hash is reported in the final handoff.

R1 remediation baseline: `e1003181e80512ac5b95798c8dc57e37b1e3193c`.
R1 implementation commit: `46608acb7a64c42c611006c6546697730fed3198`
(`fix: validate pagination commit outcomes`). Independent acceptance remains
pending.

R2 remediation baseline: `b380bc767c63c7d2f8ee648f06da24346ab9b18b`.
R2 implementation commit: `fc18d24e444d15dfeb0470c640532e742a4871b9`
(`fix: close slice 2c.4b acceptance gaps`). Independent acceptance remains
pending.

Slice 2C.4B integrates the accepted 2C.4A checkpoint and pagination policies into the provider-neutral
orchestrator. Slice 2C.5 was not started. Independent acceptance is not claimed.

## Runtime behavior delivered

- Maintains in-run authoritative checkpoint generation, cursor, ETag, page count, repetition history,
  lease expiry, and aggregate disposition counts.
- Builds and validates a fresh provider pull request per page, carrying only the committed cursor and
  ETag; credentials remain outside serialized requests.
- Reserves one budget unit and renews leases before each budget reservation, provider call, and page
  commit. Credentials are resolved once after the first approved reservation.
- Validates raw ETags before the batch schema can normalize them, then validates the complete strict
  provider batch.
- Dispatches observations before checkpoint commit, enforces per-page and aggregate count conservation,
  and preserves prior effects when a later page fails.
- Detects immediate and historical cursor repetition before dispatch, finishing with fixed
  `provider:invalid_response` metadata and a terminal hold.
- Uses returned `PageCommitOutcome` state for subsequent requests, including replayed outcomes.
- Runtime-validates every returned `PageCommitOutcome` before adopting it, including strict shape,
  run identity, exact generation increment, canonical cursor, normalized ETag, and committed/replayed
  semantics. Invalid repository outcomes finish through `system:page_commit_failed` while retaining
  aggregate counts and `dataChanged`.
- Rejects a current or genuinely previously committed cursor returned by a continuation commit before
  another provider pull, while allowing a final complete page to retain its current cursor.
- Continues within one run, completes normally without a next cursor, and yields after exactly 25
  committed pages with immediate continuation. It never attempts page 26.
- Converts throwing raw ETag getters/proxies into controlled `provider:invalid_response` outcomes before
  dispatch or checkpoint recording.

## Verification

- Focused: `npm test -- tests/ingestion/orchestrator/orchestrator.test.ts tests/ingestion/orchestrator/checkpoint.test.ts tests/ingestion/orchestrator/pagination.test.ts` — 3 files, 112 tests passed.
- TypeScript: `npx tsc --noEmit` — passed.
- Full application suite: `npm test` — 30 files, 342 tests passed.
- Lint: `npm run lint` — 0 errors, 10 existing warnings.
- Build: `npm run build` — passed.
- Formatting: `git diff --check` — passed before documentation commit.
- No database tests were run; no database files changed.

Coverage includes multi-page cursor/ETag/generation chaining, valid committed and replayed outcomes,
strict malformed outcome rejection for exact run identity (including whitespace-padded IDs), generation,
cursor, ETag, and unknown fields, current and genuinely historical authoritative-cursor rejection,
stateful exact-page replay without duplicate canonical or page effects, a separate later-page conflict,
throwing raw ETag getter and Proxy access, empty final pages, mixed dispositions, repeated and historical
provider cursors, exact 25-page yielding, page-25 completion, per-page budgets, later-page budget denial,
lease loss, provider failure, dispatch failure, checkpoint conflict, count conservation, credential reuse,
and existing synthetic sports/ceremony paths.

## Security and evidence ceiling

The implementation uses the existing service/repository ports, strict provider-neutral schemas, fixed
failure messages, sanitized metadata, and no provider-specific branches. No credential value is placed
in a pull request, observation, persisted metadata, or log assertion.

Evidence is local mocked/synthetic TypeScript only. No provider, credential, network, hosted database,
deployment, notification, beta, device, scheduler, or production activity occurred. Database behavior
is inherited from accepted Slice 2C.2 evidence and was not reverified in this no-database-change slice.

The complete-phase `nextPollAt = null` versus SQL `NULL`-means-due scheduling decision remains unresolved.
Pagination integration does not change that policy. Slice 2C.5 remains unstarted.
