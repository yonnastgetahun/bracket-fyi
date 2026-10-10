# Slice 2C.4A checkpoint and pagination evidence

## Scope and status

Baseline: `a9e3bde2083c20431a2ac0b417f0975f94d3d85d`.

The documentation split was committed as `72852007ccabf989c4f3dbf02e57b6e238c68046`
(`docs: split slice 2c.4 policy and integration gates`). The pure-policy implementation was
committed as `8b2d76d7028b21a94a8de18929a0637b58e5c923`
(`feat: add slice 2c.4a checkpoint policies`). The final documentation commit is
`docs: record slice 2c.4a local evidence`.

Slice 2C.4A is implemented pending independent acceptance review. Slice 2C.4B is separately
gated and unstarted. The runtime orchestrator remains one-batch; no pagination integration was
implemented.

## Delivered policies

- `decideCheckpoint` strictly validates provider-neutral cursor, ETag, transport, page-validity,
  terminal-disposition, partial-page, not-modified, and repetition inputs.
- Checkpoints advance only for valid terminal pages, preserve omitted cursor/ETag values, reject
  contradictory flags, and fail closed for unknown fields including Last-Modified.
- `cursorFingerprint` uses the existing canonical JSON serializer and SHA-256, so key ordering,
  nested objects, and arrays are deterministic without hashing provider or transport data.
- `isRepeatedCursor` detects current and historical cursor repetition without mutating inputs.
- `decidePagination` enforces `MAX_PAGES_PER_RUN = 25`, distinguishing complete, continue, yield,
  hold, and invalid outcomes without attempting runtime looping.

## Verification

- Focused: `npm test -- tests/ingestion/orchestrator/checkpoint.test.ts tests/ingestion/orchestrator/pagination.test.ts` — 2 files, 18 tests passed.
- TypeScript: `npx tsc --noEmit` — passed.
- Full application suite: `npm test` — 30 files, 303 tests passed.
- Lint: `npm run lint` — 0 errors, 10 pre-existing warnings.
- Build: `npm run build` — passed.
- Formatting: `git diff --check` — passed.
- No database verification was run or required; no database files changed.

## Evidence ceiling and residual risks

Evidence is local, pure TypeScript, and synthetic only. It does not establish provider or
recorded-provider behavior, hosted database behavior, deployment, beta, device, or production
acceptance. Slice 2C.4B must wire these decisions into the runtime only after separate approval.

The complete-phase `nextPollAt = null` behavior versus SQL's `NULL`-means-due interpretation remains
an unresolved cross-slice scheduling decision before scheduler deployment. Slice 2C.5 and Slice 2C.6
remain unstarted.

No provider, credential, network, hosted database, deployment, notification, beta-device, or
production action occurred.
