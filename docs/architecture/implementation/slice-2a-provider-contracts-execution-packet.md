# Slice 2A Execution Packet: Provider-Neutral Contracts and Validation

**Prepared:** 2026-10-08

**Status:** Ready for explicit implementation approval; no Slice 2A application code has been written

**Starting commit:** `e092d76` (`feat: add result compatibility and backfill rehearsal`)

**Evidence ceiling:** Static/local and deterministic mocked-adapter verification only

## Purpose

This packet removes the remaining design decisions from Slice 2A so a lower-consumption implementation model can execute a narrow, test-driven slice without redesigning the ingestion architecture.

The slice establishes provider-neutral TypeScript and runtime-validation contracts. It does not fetch provider data, resolve identities, write to the database, schedule work, project results, or change product behavior.

## Required operating instructions

1. Read this file completely before changing anything.
2. Confirm `HEAD` is `e092d76` or a descendant containing it.
3. Preserve the untracked `docs/case-studies/` directory. It is user-owned and outside this slice.
4. Use the TDD skill if available. Implement one behavior at a time: failing test, minimal implementation, passing test.
5. Do not use subagents. The slice is small and tightly coupled; duplicating context increases cost and merge risk.
6. Do not browse provider documentation or call any provider. All fixtures in this slice are synthetic.
7. Stop if a requirement below cannot be satisfied without changing a file outside the allowlist.
8. Do not claim provider, database, beta, device, deployment, or production verification.

## Exact file allowlist

Only these files may change during implementation:

- `package.json`
- `package-lock.json`
- `lib/ingestion/contracts.ts`
- `lib/ingestion/config.ts`
- `lib/ingestion/errors.ts`
- `lib/ingestion/providers/provider-adapter.ts`
- `tests/ingestion/contracts/contracts.test.ts`
- `tests/ingestion/contracts/config.test.ts`
- `tests/ingestion/contracts/errors.test.ts`
- `tests/ingestion/contracts/provider-adapter.test.ts`
- `docs/architecture/implementation/slice-2a-provider-contracts-evidence.md`
- `docs/architecture/tournament-ingestion-implementation-plan.md`

Creating the listed directories is allowed. No other file may be edited, formatted, generated, staged, or committed.

## Explicit exclusions

Do not change:

- `supabase/**`, database schemas, migrations, policies, grants, generated database types, or seed data;
- API routes, UI components, current league/result/scoring behavior, or deployment configuration;
- provider accounts, credentials, environment variables, Vault, schedules, or cron jobs;
- identity matching, aliases, quarantine persistence, projection, result ordering, idempotency implementation, retry loops, or rate-budget enforcement;
- football-data.org, BALLDONTLIE, ESPN, Oscar APIs, or any recorded real payload;
- GitHub issues, hosted environments, notifications, or external communications.

## Dependency decision

Add Zod as an exact production dependency:

```sh
npm install --save-exact zod@4.6.5
```

Version `4.6.5` is already present in the current lockfile as a transitive development dependency. Slice 2A must make it direct because ingestion validation is production code. Do not upgrade any unrelated dependency. If the install rewrites unrelated dependency versions, stop and report the diff instead of accepting it.

All externally sourced or configuration-derived values cross a Zod schema before becoming trusted contract types. Type assertions such as `as EventIngestionConfig` are not substitutes for parsing.

## Naming and vocabulary

Use these names exactly unless TypeScript requires a narrowly mechanical variation:

### Provider capabilities

```ts
export const providerCapabilities = [
  "schedule",
  "live_status",
  "final_results",
  "bracket_structure",
  "series",
  "aggregate_ties",
  "nominations",
  "ceremony_results",
] as const;
```

Export `providerCapabilitySchema` and `ProviderCapability`.

### Entity kinds

```ts
export const providerEntityKinds = [
  "organization",
  "competition",
  "event_edition",
  "competitor",
  "event_entry",
  "stage",
  "round",
  "contest",
  "bracket",
  "result",
] as const;
```

Export `providerEntityKindSchema` and `ProviderEntityKind`.

These terms match the canonical schema. Existing Bracket.fyi human `participants` are never modeled as event competitors.

## `contracts.ts` public contract

### Shared primitives

Export:

- `JsonPrimitive`, `JsonValue`, and `JsonObject` types;
- recursive `jsonValueSchema` and `jsonObjectSchema` that reject `undefined`, functions, symbols, non-finite numbers, class instances, and other non-JSON values; object validation must explicitly require a plain object (an `Object.prototype` or `null` prototype) so a class instance cannot silently normalize to `{}`;
- `canonicalKeySchema` using `^[a-z0-9]+([._-][a-z0-9]+)*$`;
- `externalIdSchema`: trimmed, nonempty, maximum 512 characters;
- `isoDateTimeSchema`: ISO-8601 date-time with an explicit offset;
- `nonBlankTextSchema`: trimmed, nonempty text;
- the capability and entity-kind schemas above.

All object schemas in this slice must be strict: unexpected fields fail validation.

### Normalized entity data

Export a schema and inferred type for each entity below. Every `metadata`, `rulesMetadata`, `resultData`, or `score` field is a `JsonObject` when present. Optional values stay absent; adapters must never invent placeholders.

| Schema/type | Required fields | Optional fields and rules |
|---|---|---|
| `normalizedOrganizationSchema` / `NormalizedOrganization` | `organizationKind`, `name`, `metadata` | `officialUrl`; organization kind uses the database values `governing_body`, `league`, `conference`, `studio`, `academy`, `owner`, `other` |
| `normalizedCompetitionSchema` / `NormalizedCompetition` | `name`, `domain`, `rulesMetadata` | `organizationExternalId`, `sportCode`, `officialUrl`; domain is `sport`, `awards`, or `other` |
| `normalizedEventEditionSchema` / `NormalizedEventEdition` | `competitionExternalId`, `editionKey`, `name`, `seasonLabel`, `timezone`, `status`, `metadata` | `startsAt`, `endsAt`, `officialUrl`; status matches the database; reject `endsAt < startsAt` |
| `normalizedCompetitorSchema` / `NormalizedCompetitor` | `competitorKind`, `canonicalName`, `metadata` | `organizationExternalId`, `shortName`, two-letter uppercase `countryCode`; kind matches the canonical database values |
| `normalizedEventEntrySchema` / `NormalizedEventEntry` | `eventEditionExternalId`, `competitorExternalId`, `role`, `status`, `metadata` | positive `seed`, `region`, `conference`; status is `invited`, `confirmed`, `withdrawn`, or `disqualified` |
| `normalizedStageSchema` / `NormalizedStage` | `eventEditionExternalId`, `stageKey`, `name`, `stageKind`, positive `ordinal`, `metadata` | `parentStageExternalId`, `startsAt`, `endsAt`; reject reversed dates |
| `normalizedRoundSchema` / `NormalizedRound` | `eventEditionExternalId`, `stageExternalId`, `roundKey`, `name`, positive `ordinal`, `metadata` | `providerLabel`, `startsAt`, `endsAt`; reject reversed dates |
| `normalizedContestSchema` / `NormalizedContest` | `eventEditionExternalId`, `stageExternalId`, `contestKey`, `name`, `contestKind`, `status`, `requiredForCompletion`, `entries`, `metadata` | `roundExternalId`, `parentContestExternalId`, schedule/start/end times, positive `bestOf`; reject reversed dates |
| `normalizedBracketSchema` / `NormalizedBracket` | `eventEditionExternalId`, `bracketKey`, `name`, `bracketKind`, `edges`, `metadata` | `stageExternalId`; reject self-referential edges |
| `normalizedResultSchema` / `NormalizedResult` | `eventEditionExternalId`, `contestExternalId`, `resultStatus`, `outcomeType`, `resultData` | `winnerEventEntryExternalId`, `score`, `providerEffectiveAt`, `correctionReason`; enforce the result-state rules below |

Contest entries use this exact strict shape:

```ts
{
  eventEntryExternalId: string;
  role: string;
  side?: string;
  ordinal: number; // positive integer
  metadata: JsonObject;
}
```

Within one contest, `eventEntryExternalId` and `ordinal` must each be unique.

Bracket edges use this exact strict shape:

```ts
{
  fromContestExternalId: string;
  toContestExternalId: string;
  outcome: "winner" | "loser" | "qualifier" | "seed" | "placement";
  targetRole: string;
  priority: number; // positive integer
  metadata: JsonObject;
}
```

Result-state rules must mirror the database:

- `provisional` and `unresolved` require `pending` with no winner;
- `final` allows `winner` or `draw`; `winner` requires a winner and `draw` forbids one;
- `awarded` requires `winner` and a winner;
- `canceled` and `void` require `no_contest` with no winner.

### Normalized observations

Export `normalizedObservationSchema` as a discriminated union and `NormalizedObservation` as its inferred type.

Every variant has:

```ts
{
  entityKind: ProviderEntityKind;
  externalId: string;
  providerRevision?: string;
  providerUpdatedAt?: string;
  observedAt: string;
  completeness: "full" | "partial";
  sanitizedPayload: JsonObject;
  data: NormalizedEntityForThatKind;
}
```

The union must reject an `entityKind` paired with another entity's data shape. Do not include `payloadHash`: PostgreSQL already computes the semantic hash from sanitized JSON. Do not include provider IDs, binding IDs, database IDs, credentials, scoring, league IDs, or notification behavior in the observation.

Export `normalizedEntitySchema` and `NormalizedEntity` as the union of all normalized entity data schemas for callers that do not need the enclosing observation.

### Provider batch

Export `providerBatchSchema` and `ProviderBatch` with this strict shape:

```ts
{
  observations: NormalizedObservation[];
  fetchedCount: number; // nonnegative integer; provider objects fetched, not entity count
  receivedAt: string;
  nextCursor?: JsonObject;
  etag?: string;
  providerRequestId?: string;
  rateLimit?: {
    limit?: number; // nonnegative integer
    remaining?: number; // nonnegative integer and <= limit when both exist
    resetAt?: string;
    retryAfterAt?: string;
  };
}
```

An empty observation array is valid for a successful unchanged page.

## `config.ts` public contract

Export `eventIngestionConfigSchema`, inferred `EventIngestionConfig`, and:

```ts
export function parseEventIngestionConfig(input: unknown): EventIngestionConfig;
```

Use this exact strict top-level shape:

```ts
{
  configVersion: number; // positive integer
  eventEditionKey: string; // canonical key
  timezone: string; // valid IANA timezone
  requiredCapabilities: ProviderCapability[]; // nonempty and unique
  providerBinding: {
    providerKey: string; // canonical key
    competitionExternalId: string;
    adapterConfigVersion: number; // positive integer
    credentialRef: string; // trimmed, nonempty; never credential material
    adapterConfig: JsonObject;
  };
  structure: {
    scoringContestKinds: Array<"game" | "match" | "series" | "tie" | "award" | "category">; // nonempty and unique
    includeStageKeys: string[]; // nonempty unique canonical keys
    completionPolicy:
      | "all_required_contests_terminal"
      | "all_required_categories_awarded"
      | "manual";
  };
  pollingPolicy: {
    idleSeconds: number; // integer >= 300
    pregameSeconds: number; // integer >= 60
    liveSeconds: number; // integer >= 30
    postgameSeconds: number; // integer >= 60
    staleAfterSeconds: number; // integer >= 60 and >= liveSeconds
  };
  attribution: {
    displayName: string;
    termsUrl?: string;
    attributionText?: string;
  };
  fallbackMode: "manual_only" | "manual_and_shadow_provider";
}
```

IANA timezone validation may use `Intl.DateTimeFormat` inside a deterministic refinement. An unknown field such as `apiKey`, `token`, or `secret` must be rejected by strict schemas. Do not recursively scan arbitrary adapter configuration for secret-like key names in this slice; provider-specific configuration schemas will own that later.

## `errors.ts` public contract

Export these exact failure codes:

```ts
export const providerFailureCodes = [
  "authentication",
  "authorization",
  "not_found",
  "rate_limited",
  "timeout",
  "network",
  "provider_server",
  "invalid_response",
  "unsupported_shape",
  "permanent",
] as const;
```

Export:

- `ProviderFailureCode`;
- retry strategy `"never" | "backoff" | "provider_reset"`;
- strict `providerFailureSchema` and inferred `ProviderFailure`;
- `ProviderAdapterError extends Error`, whose constructor accepts a validated `ProviderFailure` and optional `cause`;
- `isProviderAdapterError(error: unknown): error is ProviderAdapterError`.

`ProviderFailure` fields:

```ts
{
  code: ProviderFailureCode;
  retry: "never" | "backoff" | "provider_reset";
  message: string; // sanitized, nonblank
  httpStatus?: number; // integer 100–599
  retryAt?: string;
  details: JsonObject;
}
```

Enforce:

- `rate_limited` uses `provider_reset`; `retryAt` is optional because some providers omit it;
- `timeout`, `network`, and `provider_server` use `backoff`;
- all other codes use `never`;
- `retryAt`, when present, is an offset ISO date-time;
- error serialization and tests contain no credential value, authorization header, or raw provider payload.

Do not implement HTTP-library-specific classifiers in this slice.

## `provider-adapter.ts` public contract

The architecture document's earlier `pull` plus public `normalize` interface was illustrative. Slice 2A resolves that seam in favor of one public `pull` method returning a normalized batch. Raw provider page types and normalization helpers remain private to each adapter.

Export `providerPullRequestSchema` as the runtime source of truth and `ProviderPullRequest` as its inferred readonly type. Export the following common interface and context type:

```ts
export interface ProviderCredential {
  readonly reference: string;
  readonly getValue: () => string;
}

export type ProviderPullRequest = Readonly<{
  readonly bindingId: string; // UUID
  readonly providerKey: string;
  readonly eventEditionId: string; // UUID
  readonly bindingKey: string;
  readonly adapterConfigVersion: number; // positive integer
  readonly adapterConfig: JsonObject;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly requestedAt: string;
  readonly cursor?: JsonObject;
  readonly etag?: string;
}>;

export type PullContext = ProviderPullRequest & {
  readonly credential: ProviderCredential;
};

export interface ProviderAdapter {
  readonly key: string;
  readonly capabilities: ReadonlySet<ProviderCapability>;
  pull(context: PullContext): Promise<ProviderBatch>;
  classifyError(error: unknown): ProviderFailure;
}
```

The `ProviderPullRequest` block above specifies the required field shape; do not separately declare that manual object type in implementation. Define it as `Readonly<z.infer<typeof providerPullRequestSchema>>` so runtime validation and the TypeScript contract cannot drift. The schema must be strict and validate UUIDs, canonical keys, positive config version, offset timestamps, and `windowEnd >= windowStart`.

Do not create a runtime schema for `ProviderCredential`; it is intentionally non-serializable. Tests must prove `JSON.stringify` of the pull request cannot contain credential material because the credential is not part of `ProviderPullRequest`.

Adapter rules:

- no database, scoring, league, override, notification, or UI imports;
- no global environment reads in the common interface;
- no raw provider response/page type in any common exported type;
- `pull` may throw; the orchestrator will later call `classifyError`;
- `classifyError` always returns a schema-valid, sanitized failure;
- capability sets are immutable by convention; tests construct them from readonly arrays or new sets without later mutation.

## Mandatory test matrix

Use synthetic data only.

### `contracts.test.ts`

1. Accept one sports contest with two entries and one final winner result.
2. Accept one award category with nominee entries and an awarded winner result.
3. Reject mismatched observation `entityKind` and data.
4. Reject each illegal result status/outcome/winner combination.
5. Reject duplicate contest entry IDs and ordinals.
6. Reject a self-referential bracket edge.
7. Reject reversed edition, stage, round, and contest timestamps.
8. Reject non-JSON values in `sanitizedPayload`; allow arbitrary provider-defined JSON keys there, while rejecting unexpected fields in normalized data and observation envelopes.
9. Accept a partial observation without manufacturing optional values.
10. Validate provider batch rate-limit bounds and allow an empty unchanged batch.

### `config.test.ts`

1. Accept a UCL-style sports configuration.
2. Accept an Oscars-style ceremony configuration using the same schema.
3. Reject duplicate or empty capabilities, contest kinds, and stage keys.
4. Reject invalid timezone and polling minima.
5. Reject `staleAfterSeconds < liveSeconds`.
6. Reject secret-like unknown top-level/provider-binding fields through strict-object validation.
7. Confirm parsing returns a typed copy and does not mutate the input.

### `errors.test.ts`

1. Accept every legal code/retry combination.
2. Reject every illegal code/retry combination.
3. Validate rate-limited failures with and without `retryAt`.
4. Confirm the error type guard distinguishes `ProviderAdapterError` from arbitrary errors.
5. Construct a synthetic raw cause containing a secret sentinel, then confirm the adapter's classified, JSON-safe failure fields do not copy that sentinel. This proves the classifier fixture sanitizes output; generic automatic secret scrubbing is deferred with real provider classifiers.

### `provider-adapter.test.ts`

Define two in-test fake adapters with private, structurally different source-page types:

- sports fixtures: teams, match, score, final status;
- ceremony categories: nominees, category, awarded winner.

Both must implement `ProviderAdapter`, return batches accepted by `providerBatchSchema`, and classify one synthetic error. The common test must consume both through the `ProviderAdapter` interface without provider-name conditionals.

No network mock is needed because no network client is introduced.

## TDD execution order

Follow these vertical cycles; do not write all tests first:

1. JSON primitives and one organization observation.
2. Sports contest/result invariants.
3. Ceremony category/result invariants.
4. Remaining entity schemas and time/uniqueness checks.
5. Provider batch and rate-limit validation.
6. Event configuration: sports, then ceremony, then rejection cases.
7. Failure taxonomy and `ProviderAdapterError`.
8. Pull request/context and one fake sports adapter.
9. Add the ceremony adapter to prove the same public seam.
10. Refactor duplication only after all tests are green.

Each test must exercise exported schemas/functions/interfaces, not private helpers.

## Verification commands

Run in this order:

```sh
npm test -- tests/ingestion/contracts
npx tsc --noEmit
npm test
npm run lint
npm run build
git diff --check
```

Expected baseline outside this slice:

- application tests: 6 files, 22 tests before adding Slice 2A tests;
- lint: 0 errors and 10 pre-existing warnings;
- production build: Next.js 16.3.8 webpack build;
- database tests are not required because this slice cannot change database files.

Do not suppress new warnings. Do not fix the 10 unrelated existing warnings.

## Acceptance criteria

Slice 2A is complete only when:

- every exported runtime schema and inferred type above exists;
- sports and ceremony examples pass through the same provider adapter interface;
- provider-specific source types remain private to fake adapters;
- invalid states fail at runtime validation, not only TypeScript compilation;
- credentials cannot enter serializable pull requests, observations, batches, failures, or fixtures;
- no common ingestion module imports Supabase, Next.js, UI, scoring, notifications, or a real provider SDK;
- all verification commands pass;
- the evidence document clearly labels verification as static/local with synthetic mocked adapters;
- `docs/architecture/tournament-ingestion-implementation-plan.md` marks only Slice 2A as locally implemented and links the evidence;
- the final diff contains only allowlisted files.

The suggested commit message after all checks pass is:

```text
feat: add provider-neutral ingestion contracts
```

Do not commit if any acceptance check fails.

## Evidence document requirements

Create `docs/architecture/implementation/slice-2a-provider-contracts-evidence.md` only after implementation checks pass. Record:

- approval and exact scope;
- public contracts delivered;
- the sports/ceremony seam proof;
- red/green test summary;
- dependency diff;
- every verification command and result;
- security review for credentials/provider payloads;
- exclusions and evidence ceiling;
- residual risks deferred to Slices 2B and 2C.

Do not claim recorded-fixture, live-provider, database-integration, beta, device, deployment, or production evidence.

## Stop conditions

Stop and report rather than improvise if:

- `HEAD` lacks `e092d76` or tracked worktree changes overlap the allowlist;
- adding Zod changes unrelated dependency versions;
- a required behavior appears to need a database/API/UI/deployment change;
- a provider call, credential, current external schema, or licensing decision seems necessary;
- exact terminology conflicts with an already committed canonical schema;
- tests expose a design contradiction not resolved by this packet;
- an existing unrelated check fails and cannot be attributed without editing outside the allowlist.

## Next gate after Slice 2A

Stop after the local commit and evidence report. Slice 2A does not authorize Slice 2B.

Slice 2B will separately define identity resolution, ordering, idempotency-key construction, quarantine behavior, and canonical projection. No provider access is authorized until G2.
