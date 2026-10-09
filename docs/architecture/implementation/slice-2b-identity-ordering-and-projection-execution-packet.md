# Slice 2B Execution Packet: Identity, Ordering, and Canonical Projection

**Prepared:** 2026-10-08

**Status:** Planning packet drafted; awaiting architecture approval; implementation not started

**Starting commit:** `944e72df9075d0ce414768a21d256fd9aa12f132` (`test: close slice 2a acceptance coverage gaps`)

**Authorization:** Documentation and design work only. This packet does not authorize application code,
database migrations, schema changes, provider calls, credentials, deployment, hosted data changes,
notifications, or production action. Each implementation sub-slice requires explicit approval after
the decision register is resolved.

**Evidence ceiling for the planned work:** Pure TypeScript evidence and disposable-local database
integration with deterministic synthetic sports and ceremony fixtures. Recorded-provider and live-provider
evidence remain later gates.

## 1. Objective and operating rules

Slice 2B turns validated provider-neutral observations into reviewed identity mappings, deterministic
quarantine decisions, canonical structural entities, append-only canonical result versions, audit events,
and deduplicated notification intents. It does not fetch providers, schedule runs, reconcile lifecycle,
project into legacy scoring tables, deliver notifications, or close GitHub issue #3.

The packet is divided into six implementation sub-slices. A lower-consumption implementation model must
stop at the end of each sub-slice, produce its evidence, and wait for the next approval gate. No sub-slice
may rewrite an applied migration. Any database change is a new forward migration with a reviewed repair
path.

Cross-cutting rules:

- Reviewed provider mappings are authoritative and cannot be silently overwritten.
- Exact, unambiguous normalized aliases may create an automatic proposal only under the approved,
  versioned normalization policy.
- Fuzzy matching is advisory and can never auto-accept a mapping.
- Missing, ambiguous, rejected, or conflicting identity quarantines the observation; it never guesses.
- Provider IDs, canonical UUIDs, and existing human league participants remain different namespaces.
- Partial snapshots never delete or mark unseen canonical entities absent.
- Canonical result history is append-only. A correction is a new version with audit provenance.
- Projection and the result audit/outbox intent are one atomic database operation.
- No credential material or raw unsanitized provider payload may enter requests, evidence, logs, or client
  modules.

## 2. Current-state inventory

### 2.1 Slice 2A TypeScript contracts already present

The current public ingestion surface is limited to these files:

- `lib/ingestion/contracts.ts`: strict Zod schemas and inferred types for JSON values, canonical keys,
  external IDs, offset date-times, capabilities, entity kinds, organizations, competitions, event editions,
  competitors, event entries, stages, rounds, contests, brackets, results, discriminated observations, and
  provider batches. Result states are `provisional`, `unresolved`, `final`, `awarded`, `canceled`, and
  `void`; outcome states are `pending`, `winner`, `draw`, and `no_contest`.
- `lib/ingestion/config.ts`: strict event configuration parsing, unique capability/contest/stage lists,
  IANA timezone validation, polling minima, stale-window validation, attribution, and fallback mode.
- `lib/ingestion/errors.ts`: provider failure codes/retry strategies, strict sanitized failure schema,
  `ProviderAdapterError`, and its type guard.
- `lib/ingestion/providers/provider-adapter.ts`: strict `providerPullRequestSchema`, inferred readonly
  `ProviderPullRequest`, non-serializable `ProviderCredential`, `PullContext`, and `ProviderAdapter`.
- `tests/ingestion/contracts/**`: 4 files and the synthetic contract suite. It proves the sports and
  ceremony adapter seam, all 48 result-state combinations, strict objects, JSON safety, rate limits,
  credentials outside serialization, and configuration/error behavior.

No identity resolver, canonical repository, ordering policy, idempotency key module, projection service,
database transaction function, or replay harness exists yet. Slice 2B must consume the exported schemas;
it must not duplicate or weaken them.

### 2.2 Canonical event domain from `20261006000001_canonical_event_domain.sql`

The migration is applied locally and is additive; it has not been deployed. The exact tables, identity
constraints, useful indexes, and access boundary are:

| Table | Relevant contract, constraints, and indexes |
|---|---|
| `data_providers` | Unique `adapter_key`; canonical key format; nonblank display name; object metadata. RLS enabled; no public policy. |
| `organizations` | Unique `organization_key`; nonblank name; kinds `governing_body`, `league`, `conference`, `studio`, `academy`, `owner`, `other`; object metadata. |
| `competitions` | Unique `competition_key`; optional organization FK; domains `sport`, `awards`, `other`; nonblank name/sport code when present; object rules metadata. Index on `organization_id`. |
| `event_editions` | Competition FK; unique `(competition_id, edition_key)` and `(id, competition_id)`; canonical edition key; status `planned`, `scheduled`, `active`, `complete`, `canceled`; end not before start; object metadata. Index on `competition_id`. |
| `competitors` | Unique `competitor_key`; kinds `team`, `national_side`, `school`, `person`, `film`, `song`, `album`, `other_work`, `other`; nonblank canonical/short names; uppercase two-letter country code; object metadata. Index on `organization_id`. |
| `competitor_aliases` | Competitor/optional organization FKs; nonblank alias/context/locale; normalized alias equals `lower(btrim(normalized_alias))`; source `official`, `provider`, `manual`, `historical`; date order. Unique index `(domain, organization_id, normalized_alias, locale) NULLS NOT DISTINCT`; index on competitor. |
| `event_entries` | Edition and competitor FKs; unique `(event_edition_id, competitor_id)` and `(id, event_edition_id)`; positive seed; nonblank region/conference/role; status `invited`, `confirmed`, `withdrawn`, `disqualified`; object metadata. Indexes on edition and competitor. |
| `stages` | Edition FK; same-edition self-parent FK; unique `(event_edition_id, stage_key)` and `(id, event_edition_id)`; kinds `league`, `group`, `knockout`, `playoffs`, `nominations`, `ceremony`, `other`; positive ordinal; date order; self-parent rejection; object metadata. Indexes on edition and parent. |
| `rounds` | Same-edition stage FK; unique `(stage_id, round_key)`, `(stage_id, ordinal)`, `(id, stage_id, event_edition_id)`; canonical round key; positive ordinal; nonblank provider label; date order; object metadata. Indexes on edition and stage. |
| `contests` | Same-edition stage FK; optional same-stage/edition round and parent-contest FKs; unique `(event_edition_id, contest_key)`, `(id, event_edition_id)`, `(id, stage_id, event_edition_id)`; kinds `game`, `match`, `series`, `tie`, `award`, `category`; statuses `scheduled`, `pregame`, `live`, `suspended`, `postponed`, `final`, `canceled`, `void`; time order; positive best-of; self-parent rejection; object metadata. Indexes on edition, stage, round, parent. |
| `contest_entries` | Same-edition contest and event-entry FKs; unique `(contest_id, event_entry_id)` and `(contest_id, ordinal)`; nonblank role/optional side; positive ordinal; object metadata. Indexes on edition and event entry. |
| `brackets` | Edition and optional same-edition stage FK; unique `(event_edition_id, bracket_key)` and `(id, event_edition_id)`; kinds `single_elimination`, `double_elimination`, `reseeded`, `knockout`, `custom`; nonblank name/key; object metadata. Indexes on edition and stage. |
| `bracket_edges` | Same-edition bracket/from/to contest FKs; unique `(bracket_id, from_contest_id, to_contest_id, outcome, target_role)`; outcomes `winner`, `loser`, `qualifier`, `seed`, `placement`; nonblank target role; positive priority; direct self-edge rejection; object metadata. Indexes on edition/from/to. |

All 13 canonical tables have RLS enabled and no policies. Anonymous and authenticated clients therefore
have no default access. The schema rejects direct cross-edition references through composite foreign
keys. It rejects self-parent/self-edge relationships but does not detect longer graph cycles; that remains
a pure validation/projection responsibility.

Nullable compatibility links already exist:

- `templates.event_edition_id` with an index on that column;
- `template_matches.contest_id`, `counts_toward_completion`, a partial unique index on
  `(template_id, contest_id)`, and an index on `contest_id`.

The triggers `template_match_contest_edition_trigger` and `template_edition_change_trigger` call
`enforce_template_match_contest_edition()` and `enforce_template_edition_change()`. They require linked
templates and contests to share an edition and prevent changing a template edition away from linked
contests. Existing null links remain valid.

### 2.3 Ingestion evidence and delivery tables from `20261006000002_ingestion_evidence_and_delivery.sql`

| Table | Existing contract and projection implications |
|---|---|
| `provider_bindings` | Provider/edition FKs; unique `(provider_id, event_edition_id, binding_key)` and `(id, provider_id, event_edition_id)`; roles `primary`, `fallback`, `shadow`; modes `disabled`, `shadow`, `write`; health `disabled`, `healthy`, `degraded`, `stale`; credential reference only; object config/poll/cursor; stale minimum 60; nonnegative failures; positive config version; time order. Partial unique primary-per-edition index and due/provider indexes. Defaults disabled. |
| `provider_entity_refs` | Unique `(binding_id, entity_kind, external_id)`; entity kinds exclude `result`; statuses `unresolved`, `automatic`, `reviewed`, `rejected`; automatic/reviewed require canonical UUID, unresolved/rejected forbid it; reviewed/rejected require reviewer and timestamp; confidence 0–1; object metadata. Canonical and unresolved indexes. `validate_provider_entity_ref()` checks the target according to entity kind; edition-scoped branches enforce the binding edition, while organizations only require an existing canonical organization and competitions require an edition whose competition matches. The existing `competitor` branch verifies an edition entry whose `competitor_id` is the target. |
| `ingestion_runs` | Binding/provider/edition composite FK; global unique `claim_key`; lifecycle status and lease/finish checks; nonnegative counts; valid HTTP/rate-limit bounds; object cursors/metadata. Partial unique index permits one `claimed`/`running` row per binding; binding-time and status-time indexes. |
| `provider_observations` | Immutable evidence with run/binding/provider/edition composite FK; external kind/id; optional provider revision; provider timestamp; sanitized JSON object/array; generated SHA-256 `payload_hash` from `sanitized_payload::text`; unique revision identity when revision exists and unique `(binding, kind, external_id, payload_hash)` otherwise. Run and external-time indexes. `provider_observations_immutable_trigger` calls `reject_immutable_evidence_change()` for update/delete. |
| `ingestion_quarantine` | Unique `(observation_id, issue_code)`; issue codes include `mapping_missing`, `mapping_ambiguous`, `schema_invalid`, `partial_payload`, `illegal_regression`, `conflicting_terminal_result`, `stale_update`, `provider_error`, `unsupported_shape`, `other`; severity/status lifecycle and paired external identity; UUID candidate array; object details; explicit resolution fields and time order. Open/run indexes. |
| `contest_results` | Same-edition contest FK; optional winner FK constrained to the target contest entry; optional provider observation FK; append-only versions unique `(contest_id, version)` and immutable globally unique `idempotency_key`; statuses/outcomes mirror Slice 2A; provider source requires observation; object score/result data; correction reason nonblank. Contest/version and observation indexes. `contest_result_version_trigger` calls `validate_contest_result_version()` to require contiguous versions and immediate supersession; immutable trigger prevents update/delete. |
| `result_audit_events` | Edition FK; optional contest/league/result/observation/provider FKs with same-edition result relationships; append-only unique idempotency key; actor rules require provider ID for provider actors, league plus 64-char organizer fingerprint for organizer actors, and actor reference for operator/system actors; object previous/new/details. Contest/league/observation indexes; immutable trigger. |
| `league_completion_holds` | League/edition FKs; active/released/expired lifecycle; unique active `(league_id, hold_key)` and idempotency key; fingerprint/reason/time constraints. Edition trigger verifies the league template edition. This is lifecycle work and is not implemented by Slice 2B. |
| `notification_outbox` | Edition/audience/result/audit FKs; audit event required; intents `result_final`, `result_correction`, `league_complete`, `league_reopened`, `provider_stale`, `provider_recovered`, `broadcast`; audience shape rules; object payload; relative destination; globally unique idempotency key; processing lifecycle. Due/league/audit indexes. Audience trigger verifies league edition and participant ownership. |
| `notification_attempts` | Outbox FK; endpoint fingerprint only; unique `(outbox_id, endpoint_fingerprint, attempt_number)` and global idempotency key; positive attempt/status/http/lifecycle/retry rules; object metadata. Outbox/retry indexes. Participant trigger verifies participant belongs to the outbox league. |

All 10 Slice 1B tables have RLS enabled, no policies, and no `anon`/`authenticated` table grants.
`service_role` has select/insert on all 10 and update only on the seven mutable operational tables:
`provider_bindings`, `provider_entity_refs`, `ingestion_runs`, `ingestion_quarantine`,
`notification_outbox`, `notification_attempts`, and `league_completion_holds`. It has no update grant on
`provider_observations`, `contest_results`, or `result_audit_events`. No credential-material column exists;
bindings store `credential_ref` and delivery attempts store endpoint fingerprints.

### 2.4 Legacy and compatibility reads

The initial schema still contains:

- `templates`: public catalog rows with `team_registry`, schedule/scoring JSON, and nullable
  `results_provider`; RLS permits anonymous read.
- `leagues`: template FK, organizer/join UUID tokens, scoring config, lock/status fields; token-based
  anonymous read; server-side organizer mutation boundary is separate.
- `participants`: league FK, display name, magic token, push subscription; league/magic-token reads.
- `picks`: participant/league FKs, unique `(participant_id, slot_id)`, `slot_id`/`team_id` text; token
  access and pre-lock writes.
- `template_matches`: template FK, positive round/match number, slots, schedule, unique
  `(template_id, round, match_number)`, plus the Slice 1A nullable contest link.
- `template_results`: one shared result per template match, `winner_team_id` required, unique match,
  public result read.
- `league_result_overrides`: one override per league/match, organizer-read policy, and the Slice 1C
  active/released/expired provenance and fingerprint metadata.

The lock trigger `league_lock_trigger` calls `lock_picks_on_league_lock()` and sets picks locked and league
status to `locked` when `locked_at` transitions from null. No result-triggered completion reconciler exists.

Slice 1C provides these server-only/read compatibility contracts:

- `resolve_effective_results(p_league_id uuid)` returns one row per template match for exactly one league;
  active, unexpired override wins, otherwise shared `template_results` wins.
- `effective_results` is a corrected legacy view with the same override precedence and a row for leagues
  without overrides.
- `v_pick_results` and `v_champion_status` use the same parameterized resolver; `v_leaderboard` and
  `v_contention` derive from the scoring views.
- `backfill_legacy_template_results(p_template_id uuid)` is bounded, service-role-only, explicitly mapped,
  advisory-lock serialized, append-only, and idempotent. It is rehearsal tooling, not live canonical
  projection.

`resolve_effective_results` and `backfill_legacy_template_results` revoke execute from `public`, `anon`,
and `authenticated`, granting only `service_role`. The compatibility views and legacy public reads must
not be rewritten by Slice 2B. Canonical-to-legacy `template_results` projection is explicitly deferred.

### 2.5 Existing functions, triggers, and access boundary

The applied migrations also define `get_request_token()` for safe header UUID extraction, the VAPID key
RPC with service-role-only execution, legacy scoring views, and the following integrity functions/triggers:

- canonical edition/template links: `enforce_template_match_contest_edition()` and
  `enforce_template_edition_change()`;
- provider mapping target: `validate_provider_entity_ref()`;
- immutable evidence: `reject_immutable_evidence_change()`;
- result history: `validate_contest_result_version()`;
- completion-hold edition: `validate_completion_hold_edition()`;
- notification audience and attempt participant: `validate_notification_audience()` and
  `validate_notification_attempt_participant()`;
- override metadata: `maintain_league_result_override_metadata()`;
- legacy lock behavior: `lock_picks_on_league_lock()`.

Slice 2B must rely on these constraints and add only forward functions/triggers after review. It must
never accept a caller-provided canonical UUID without rechecking the provider mapping, entity kind, and
edition through the database constraints.

All paths cited in the current-state inventory and source links were validated before this packet was
written. Paths listed inside the six future implementation allowlists are intentionally planned deliverable
paths and are not present at planning time; creating them is prohibited until the corresponding sub-slice
is explicitly approved.

### 2.6 What exists versus what is missing

**Exists:** normalized runtime contracts; provider-neutral adapter seam; canonical structural tables;
same-edition foreign keys; provider binding/run/evidence/quarantine persistence; immutable result history;
audit/outbox persistence; service-role-only operational grants; compatibility resolver and bounded legacy
backfill rehearsal; deterministic JSONB observation hashes.

**Missing:** identity normalization and resolution policy; mapping repository behavior; candidate and
operator disposition workflow; observation-to-canonical structural projection; result ordering and
correction policy; deterministic application idempotency-key construction; atomic projection/audit/outbox
function; synthetic replay harness; canonical-to-template projection; lifecycle reconciliation; scheduler,
rate-budget, retry, provider adapters, outbox worker, UI, and provider evidence.

## 3. Bounded implementation sequence

The following sequence is the recommended Slice 2B decomposition. Each step is independently reviewable.
The exact paths below are future implementation allowlists, not authorization to change them now.

### 2B.1 — Identity policy and pure resolver

**Objective:** Establish a deterministic, provider-neutral decision function for reviewed mappings, exact
aliases, missing/ambiguous mappings, and advisory fuzzy candidates without touching the database.

**Allowlist:**

- `lib/ingestion/identity/types.ts`
- `lib/ingestion/identity/normalize.ts`
- `lib/ingestion/identity/resolve.ts`
- `tests/ingestion/identity/normalize.test.ts`
- `tests/ingestion/identity/resolve.test.ts`
- `docs/architecture/implementation/slice-2b-1-identity-policy-evidence.md`

**Public interfaces:**

```ts
export type IdentityResolutionStatus =
  | "reviewed"
  | "automatic"
  | "unresolved"
  | "rejected";

export type IdentityCandidate = Readonly<{
  canonicalId: string;
  source: "reviewed" | "exact_alias" | "fuzzy_advisory";
  score?: number;
  explanation: string;
}>;

export type IdentityResolutionInput = Readonly<{
  bindingId: string;
  eventEditionId: string;
  entityKind: ProviderEntityKind;
  externalId: string;
  canonicalRef?: Readonly<{
    canonicalId: string;
    status: "automatic" | "reviewed" | "rejected";
  }>;
  normalizedName?: string;
  aliasCandidates: readonly IdentityCandidate[];
  fuzzyCandidates: readonly IdentityCandidate[];
}>;

export type IdentityDecision = Readonly<{
  status: IdentityResolutionStatus;
  canonicalId?: string;
  candidates: readonly IdentityCandidate[];
  quarantineCode?: "mapping_missing" | "mapping_ambiguous";
  reason: string;
}>;

export function normalizeIdentityText(input: string, locale: string): string;
export function resolveIdentity(input: IdentityResolutionInput): IdentityDecision;
```

The exact normalization algorithm is an unresolved decision D2 below. The interface must expose its
version in the evidence and persist it in mapping metadata once persistence is approved.

**Invariants:** reviewed wins; a conflicting reviewed mapping returns a blocking decision; exactly one
exact candidate may become automatic; zero candidates returns `mapping_missing`; multiple exact or any
fuzzy-only candidate returns `mapping_ambiguous`; fuzzy candidates never return `automatic`; human league
participants are never valid canonical competitor candidates; result identities are resolved through
contest and event-entry mappings, never by matching names.

**TDD sequence and focused matrix:** one normalization tracer; reviewed mapping success; existing
automatic mapping reuse; exact one-candidate automatic mapping; missing alias; two exact candidates;
fuzzy-only candidate; rejected mapping; conflicting reviewed mapping; cross-provider same canonical ID;
cross-edition external-ID isolation; result contest/winner-entry resolution input. Every test is pure and
synthetic.

**Verification:** `npm test -- tests/ingestion/identity`; `npx tsc --noEmit`; `npm run lint`;
`git diff --check`.

**Evidence ceiling:** static/local deterministic TypeScript only. No database or provider claim.

**Rollback/repair:** revert the sub-slice commit. No data exists, so no migration or repair is needed.

**Stop conditions:** normalization ownership or first-seen policy is not approved; a test requires a
  provider-specific rule; fuzzy matching is proposed as automatic; a human participant can be selected;
or the resolver needs a canonical UUID not supplied by a reviewed/persisted mapping.

**Next gate:** architecture approval of D1/D2 and acceptance of the pure identity evidence.

### 2B.2 — Ordering policy and deterministic idempotency keys

**Objective:** Define pure, reproducible semantic identity, ordering, replay, and correction decisions
before any persistence code can write state.

**Allowlist:**

- `lib/ingestion/ordering/types.ts`
- `lib/ingestion/ordering/compare.ts`
- `lib/ingestion/idempotency/canonical-json.ts`
- `lib/ingestion/idempotency/keys.ts`
- `tests/ingestion/ordering/compare.test.ts`
- `tests/ingestion/idempotency/keys.test.ts`
- `docs/architecture/implementation/slice-2b-2-ordering-idempotency-evidence.md`

**Public interfaces:**

```ts
export type OrderingDecision =
  | "project"
  | "no_op_duplicate"
  | "ignore_older"
  | "quarantine_stale"
  | "quarantine_regression"
  | "quarantine_terminal_conflict";

export type OrderingInput = Readonly<{
  current?: NormalizedResult;
  incoming: NormalizedResult;
  observedAt: string;
  providerUpdatedAt?: string;
  receivedAt: string;
  explicitCorrection: boolean;
}>;

export type OrderingOutcome = Readonly<{
  decision: OrderingDecision;
  reason: string;
  correctionReasonRequired: boolean;
}>;

export function compareResultOrdering(input: OrderingInput): OrderingOutcome;
export function canonicalJson(value: JsonValue): string;

export type ObservationKeyInput = Readonly<{
  bindingId: string;
  entityKind: ProviderEntityKind;
  externalId: string;
  providerRevision?: string;
  sanitizedPayload: JsonObject;
}>;

export type ResultKeyInput = Readonly<{
  contestId: string;
  resultStatus: NormalizedResult["resultStatus"];
  outcomeType: NormalizedResult["outcomeType"];
  winnerEventEntryId?: string;
  score?: JsonObject;
  resultData: JsonObject;
  providerEffectiveAt?: string;
  correctionReason?: string;
  orderingPolicyVersion: string;
}>;

export function observationIdempotencyKey(input: ObservationKeyInput): string;
export function resultIdempotencyKey(input: ResultKeyInput): string;
export function auditIdempotencyKey(resultKey: string, eventType: string): string;
export function outboxIdempotencyKey(resultKey: string, eventType: string, audience: string): string;
```

The key builder owns all key construction. Key components use length-prefixed encoding, lower-case
hexadecimal SHA-256, sorted object keys, preserved array order, and a version prefix. Opaque provider
revisions are identity inputs, never lexical ordering values.

**Invariants:** exact semantic replay is a no-op; older updates never regress accepted state; valid
scheduled/pregame/live/final progression is monotonic; changed terminal results require the approved
correction policy; equal timestamps with changed semantics quarantine by default; partial snapshots never
delete unseen objects; a missing timestamp is explicitly lower-confidence and cannot silently replace a
newer accepted terminal state.

**TDD sequence and focused matrix:** canonical JSON key-order stability; observation revision and
revisionless payload keys; result semantic duplicate; duplicate audit/outbox keys; newer/older/equal
timestamps; missing timestamps; opaque revisions; scheduled → live → final; illegal final → live; partial
update; explicit correction; unresolved/canceled/void transitions; changed terminal result. Tests must
assert the decision and exact key string, not an implementation detail.

**Verification:** `npm test -- tests/ingestion/ordering tests/ingestion/idempotency`; `npx tsc --noEmit`;
`npm run lint`; `git diff --check`.

**Evidence ceiling:** static/local deterministic TypeScript only.

**Rollback/repair:** revert the sub-slice commit; no persisted keys exist yet.

**Stop conditions:** a key depends on insertion order, raw object-key order, UUID randomness, or opaque
revision lexical comparison; a correction policy is silently inferred; or the proposed key cannot map an
exact replay back to its prior database row.

**Next gate:** architecture approval of D3/D4/D5 and the exact key formulas.

### 2B.3 — Identity mapping and quarantine persistence

**Objective:** Persist reviewed/automatic/rejected mapping outcomes and deterministic quarantine records
using the already-applied tables, without creating canonical entities or projecting results.

**Allowlist:**

- `lib/ingestion/identity/repository.ts`
- `lib/ingestion/quarantine/repository.ts`
- `tests/ingestion/identity/repository.test.ts`
- `tests/ingestion/quarantine/repository.test.ts`
- `supabase/tests/database/16_slice_2b_identity_persistence_test.sql`
- `docs/architecture/implementation/slice-2b-3-identity-persistence-evidence.md`

No new migration is recommended for this sub-slice. If implementation proves a missing invariant cannot
be expressed by `provider_entity_refs` and `ingestion_quarantine`, stop and propose a new forward
migration rather than altering `20261006000002_ingestion_evidence_and_delivery.sql`.

**Public interfaces:**

```ts
export type RefLookup = Readonly<{
  bindingId: string;
  entityKind: ProviderEntityKind;
  externalId: string;
}>;

export type ProviderEntityRef = Readonly<{
  id: string;
  bindingId: string;
  providerId: string;
  eventEditionId: string;
  entityKind: ProviderEntityKind;
  externalId: string;
  canonicalId?: string;
  resolutionStatus: "unresolved" | "automatic" | "reviewed" | "rejected";
  confidence?: number;
  reviewedBy?: string;
  reviewedAt?: string;
  metadata: JsonObject;
}>;

export type AutomaticMapping = Readonly<{
  lookup: RefLookup;
  providerId: string;
  eventEditionId: string;
  canonicalId: string;
  confidence: number;
  normalizationVersion: string;
  metadata: JsonObject;
}>;

export type ReviewedMapping = Readonly<{
  lookup: RefLookup;
  providerId: string;
  eventEditionId: string;
  canonicalId: string;
  reviewedBy: string;
  reviewedAt: string;
  metadata: JsonObject;
}>;

export type RejectedMapping = Readonly<{
  lookup: RefLookup;
  providerId: string;
  eventEditionId: string;
  reviewedBy: string;
  reviewedAt: string;
  metadata: JsonObject;
}>;

export type MappingOutcome = Readonly<{
  outcome: "created" | "unchanged" | "conflict" | "quarantined";
  ref: ProviderEntityRef;
  quarantineId?: string;
}>;

export type QuarantineIssueCode =
  | "mapping_missing"
  | "mapping_ambiguous"
  | "schema_invalid"
  | "partial_payload"
  | "illegal_regression"
  | "conflicting_terminal_result"
  | "stale_update"
  | "provider_error"
  | "unsupported_shape"
  | "other";

export type QuarantineCommand = Readonly<{
  observationId: string;
  ingestionRunId: string;
  bindingId: string;
  issueCode: QuarantineIssueCode;
  severity: "info" | "warning" | "error" | "blocking";
  externalEntityKind?: ProviderEntityKind;
  externalEntityId?: string;
  candidateIds: readonly string[];
  details: JsonObject;
}>;

export type QuarantineRecord = Readonly<QuarantineCommand & {
  id: string;
  status: "open" | "resolved" | "ignored";
}>;

export type QuarantineOutcome = Readonly<{
  outcome: "created" | "unchanged" | "already_resolved";
  record: QuarantineRecord;
}>;

export interface IdentityRepository {
  getRef(input: RefLookup): Promise<ProviderEntityRef | null>;
  recordAutomatic(input: AutomaticMapping): Promise<MappingOutcome>;
  recordReviewed(input: ReviewedMapping): Promise<MappingOutcome>;
  recordRejected(input: RejectedMapping): Promise<MappingOutcome>;
}

export interface QuarantineRepository {
  open(input: QuarantineCommand): Promise<QuarantineOutcome>;
  getByObservationIssue(observationId: string, issueCode: QuarantineIssueCode): Promise<QuarantineRecord | null>;
}
```

All writes use service-role/server-only access. `provider_entity_refs` remains keyed by binding, entity
kind, and external ID. A reviewed or rejected row requires reviewer provenance. Candidate UUIDs are sorted
and validated against the binding edition before persistence. A quarantine replay returns the existing row
for `(observation_id, issue_code)`; it does not create a second issue.

**TDD/database matrix:** reviewed mapping success; automatic mapping success; conflicting reviewed mapping;
missing mapping quarantine; ambiguous candidate quarantine; fuzzy candidate quarantine; rejected mapping;
same external ID under two bindings; same provider ID across editions; invalid canonical UUID injection;
exact quarantine replay; resolved quarantine replay; RLS/grant denial for anon/authenticated; service-role
access; no credential or raw payload in mapping/quarantine details.

**Verification:** `npm test -- tests/ingestion/identity/repository.test.ts tests/ingestion/quarantine/repository.test.ts`;
`supabase db reset --local`; `supabase test db supabase/tests/database/16_slice_2b_identity_persistence_test.sql`;
`supabase db lint --local --level warning`; `npx tsc --noEmit`; `npm run lint`; `git diff --check`.

**Evidence ceiling:** local disposable Supabase with synthetic mappings and payloads plus static/local tests.
No provider or hosted evidence.

**Rollback/repair:** before persistent data, local down/revert is acceptable. After any hosted data exists,
disable mapping writes and quarantine disposition, preserve refs/quarantine, and use a reviewed forward
repair. Never delete evidence to undo a bad mapping.

**Stop conditions:** a mapping would overwrite a reviewed row; a canonical target is not proven same-edition;
candidate UUIDs are accepted from untrusted input; a new table is needed without a reviewed migration; or
RLS/grants expose mappings or quarantine to clients.

**Next gate:** security review of mapping/quarantine persistence and explicit approval of first-seen creation
policy D1.

### 2B.4 — Canonical structural-entity projection

**Objective:** Project resolved organizations, competitions, editions, competitors, entries, stages, rounds,
contests, brackets, and edges in dependency order, without result writes, legacy projection, or deletion.

**Allowlist:**

- `lib/ingestion/projection/structural-projector.ts`
- `lib/ingestion/projection/structural-repository.ts`
- `tests/ingestion/projection/structural-projector.test.ts`
- `supabase/tests/database/17_slice_2b_structural_projection_test.sql`
- `docs/architecture/implementation/slice-2b-4-structural-projection-evidence.md`

No applied migration may change. A new forward migration is permitted only if a missing transaction/helper
contract is demonstrated and separately approved.

**Public interfaces:**

```ts
export type StructuralProjectionOutcome =
  | { kind: "projected"; canonicalId: string }
  | { kind: "unchanged"; canonicalId: string }
  | { kind: "quarantined"; quarantineId: string };

export type ResolvedIdentityRef = Readonly<{
  entityKind: ProviderEntityKind;
  externalId: string;
  canonicalId: string;
}>;

export type StructuralProjectionCommand = Readonly<{
  observation: NormalizedObservation;
  resolvedIdentities: readonly ResolvedIdentityRef[];
}>;

export function projectStructuralObservation(
  command: StructuralProjectionCommand,
): Promise<StructuralProjectionOutcome>;
```

The repository must use the topological order in section 5. Existing canonical mappings are required for
entities without an approved creation key. Natural database identities are respected: edition/stage/round/
contest/bracket keys are scoped by edition or parent as their constraints require; event entries are
edition+competitor; contest entries are contest+event entry/ordinal; bracket edges use their existing
composite unique key.

**Invariants:** organization precedes competition; competition precedes edition; edition and competitor
precede entry; stage precedes round; stage/round/entries precede contest; contests precede bracket edges;
result is not handled here; absent optional dependencies remain absent; missing required dependencies
quarantine; partial snapshots never delete rows or mark unseen rows withdrawn; existing immutable identity
fields cannot silently change; same-edition constraints remain database-enforced; longer bracket cycles
quarantine rather than recurse indefinitely.

**TDD/database matrix:** synthetic sports hierarchy; synthetic ceremony hierarchy; same-batch parent-before-
child topological projection; child before parent quarantines; dependency arrives after child and replay
reprocesses; partial snapshot preserves unseen entities; cross-edition references reject; duplicate natural
key is unchanged; ambiguous/rejected dependency quarantines; no arbitrary canonical UUID injection; bracket
self-edge and longer cycle rejection; human participant never becomes an event competitor.

**Verification:** `npm test -- tests/ingestion/projection/structural-projector.test.ts`; `supabase db reset --local`;
`supabase test db supabase/tests/database/17_slice_2b_structural_projection_test.sql`; `supabase db lint --local --level warning`;
`npx tsc --noEmit`; `npm run lint`; `git diff --check`.

**Evidence ceiling:** local disposable database and deterministic synthetic sports/ceremony replay only.
No canonical-to-template projection, provider, beta, or production evidence.

**Rollback/repair:** before hosted data, revert or use the reviewed down migration. After hosted canonical
rows exist, stop structural writes, preserve observations and rows, and repair with a forward migration or
operator-reviewed mapping correction. No cascade deletion is a rollback strategy.

**Stop conditions:** D1 is unresolved; any projection invents canonical keys from display names without
approval; a partial snapshot deletes/withdraws unseen rows; structural writes bypass same-edition FKs; or
the implementation starts touching `templates`, `template_matches`, or scoring views.

**Next gate:** architecture approval of structural breadth D7 and a local database review of the dependency
and no-deletion invariants.

### 2B.5 — Atomic result, audit, and outbox-intent projection

**Objective:** Append one validated canonical result version and its audit event plus the approved outbox
intent in one transaction, with deterministic replay and concurrency behavior. This sub-slice does not
deliver notifications, reconcile lifecycle, or project to legacy scoring tables.

**Allowlist:**

- `lib/ingestion/projection/result-projector.ts`
- `lib/ingestion/projection/result-repository.ts`
- `tests/ingestion/projection/result-projector.test.ts`
- `supabase/migrations/20261009000001_slice_2b_atomic_result_projection.sql`
- `supabase/rollbacks/20261009000001_slice_2b_atomic_result_projection_down.sql`
- `supabase/tests/database/18_slice_2b_atomic_result_projection_test.sql`
- `docs/architecture/implementation/slice-2b-5-atomic-result-projection-evidence.md`

**Recommended SQL boundary:** one new `SECURITY DEFINER` function in the new forward migration, with fixed
`search_path = public, pg_temp`, revoked from `public`, `anon`, and `authenticated`, and executable only
by `service_role`:

```sql
create function project_provider_result(
  p_observation_id uuid,
  p_binding_id uuid,
  p_provider_id uuid,
  p_event_edition_id uuid,
  p_contest_id uuid,
  p_result_status text,
  p_outcome_type text,
  p_winner_event_entry_id uuid,
  p_score jsonb,
  p_result_data jsonb,
  p_provider_effective_at timestamptz,
  p_correction_reason text,
  p_result_idempotency_key text,
  p_audit_event_type text,
  p_outbox_intent_type text,
  p_outbox_audience_kind text
)
returns table (
  outcome text,
  contest_result_id uuid,
  result_version integer,
  audit_event_id uuid,
  outbox_id uuid,
  quarantine_id uuid
)
language plpgsql
security definer;
```

The corresponding server command is a strict value object:

```ts
export type ResultProjectionCommand = Readonly<{
  observationId: string;
  bindingId: string;
  providerId: string;
  eventEditionId: string;
  contestId: string;
  resultStatus: NormalizedResult["resultStatus"];
  outcomeType: NormalizedResult["outcomeType"];
  winnerEventEntryId?: string;
  score?: JsonObject;
  resultData: JsonObject;
  providerEffectiveAt?: string;
  correctionReason?: string;
  resultIdempotencyKey: string;
  auditEventType: string;
  outboxIntentType: string;
  outboxAudienceKind: "operator";
}>;

export type ResultProjectionOutcome = Readonly<{
  outcome: "projected" | "duplicate" | "quarantined" | "ignored_stale" | "no_op";
  contestResultId?: string;
  resultVersion?: number;
  auditEventId?: string;
  outboxId?: string;
  quarantineId?: string;
}>;
```

The function must revalidate the observation, binding/provider/edition, contest edition, winner contest
entry, result state, and source type. The TypeScript repository may prepare a validated command, but SQL
must reject arbitrary canonical UUID injection and recheck the locked mapping/edition relationship.

**Transaction and lock invariants:**

1. Insert or locate the immutable provider observation using its existing revision/hash uniqueness.
2. Lock relevant provider refs in deterministic entity-kind order, then lock the target contest projection
   key with `pg_advisory_xact_lock(hashtextextended('bracket-fyi:contest-projection:' || contest_id::text, 0))`.
3. Revalidate contest and winner-entry same-edition membership under the lock.
4. Read the latest result and apply the pure ordering decision.
5. For an exact semantic idempotency key, return the prior result/audit/outbox IDs without inserting a
   new version or intent.
6. For a projectable update, insert the next contiguous `contest_results` version, then its
   `result_audit_events` row, then the approved `notification_outbox` intent. Existing triggers and unique
   keys remain final defenses.
7. For missing/ambiguous/illegal/stale/correction-review cases, insert one deterministic quarantine row
   and return `quarantined`; do not insert a canonical result or notification.
8. Any unexpected failure rolls back the whole command. A deliberate quarantine commits the observation and
   quarantine together. The function returns the prior outcome on replay.

**Outbox scope recommendation:** until the separate notification slice is approved, create only one
operator-audience intent for accepted `result_final` and `result_correction` events. Do not fan out per
league or participant and do not deliver anything. This recommendation requires D6 approval.

**TDD/database matrix:** first final result; provisional/live progression; exact replay; semantic duplicate
from a different observation; concurrent duplicate; newer update; older update; equal timestamp identical;
equal timestamp changed; illegal regression; accepted explicit correction; conflicting terminal correction;
unresolved correction; canceled/void; result through contest and winner-entry identity; missing/ambiguous
identity quarantine; one result + one audit + one outbox; no duplicate outbox on replay; rollback after an
induced audit/outbox failure; service-role-only RPC; no legacy table write.

**Verification:** `npm test -- tests/ingestion/projection/result-projector.test.ts`; `supabase db reset --local`;
`supabase test db supabase/tests/database/18_slice_2b_atomic_result_projection_test.sql`; `supabase db lint --local --level warning`;
`npx tsc --noEmit`; `npm run lint`; `git diff --check`.

**Evidence ceiling:** local disposable Supabase and synthetic sports/ceremony replay. No provider, hosted,
beta, notification-delivery, lifecycle, or production claim.

**Rollback/repair:** before hosted data, the reviewed down migration may remove only the new function and
its grants. After any observations/results/audit/outbox exist, disable the binding/write path and use a
forward repair; never delete append-only result, audit, or observation evidence.

**Stop conditions:** D4/D6/D8 unresolved; SQL function can be invoked by browser roles; concurrent calls
can produce duplicate versions or outbox intents; a changed terminal result is accepted without approved
correction evidence; or a result writes `template_results`, lifecycle state, pushes, or UI state.

**Next gate:** architecture/security approval of the transaction function, changed-terminal policy, and
outbox scope before any migration is created.

### 2B.6 — Synthetic sports/ceremony replay acceptance

**Objective:** Prove the complete Slice 2B path with deterministic synthetic observations after sub-slices
2B.1–2B.5 are individually accepted.

**Allowlist:**

- `tests/ingestion/replay/slice-2b-sports-replay.test.ts`
- `tests/ingestion/replay/slice-2b-ceremony-replay.test.ts`
- `tests/ingestion/replay/fixtures/sports/*.json`
- `tests/ingestion/replay/fixtures/ceremony/*.json`
- `supabase/tests/database/19_slice_2b_replay_acceptance_test.sql`
- `docs/architecture/implementation/slice-2b-6-replay-evidence.md`

Fixtures must be synthetic and must not copy real provider payloads. No provider HTTP mock is required;
the existing in-test adapter pattern is sufficient.

**Public seam:** replay the exported Slice 2A `ProviderBatch` through the approved identity, ordering,
structural projection, and result projection interfaces. The replay harness must not branch on provider
names and must not call `templates`, `template_results`, scoring views, lifecycle reconciliation, or a
delivery worker.

**TDD/test matrix:** reviewed identity success; exact alias; missing/ambiguous/fuzzy quarantine; exact and
semantic replay; concurrent duplicate; out-of-order update; illegal regression; accepted correction;
conflicting terminal correction; partial snapshot; child before parent then replay; one atomic result/audit/
outbox; induced transaction rollback; no duplicate notification intent; sports match/final winner and
ceremony category/awarded winner.

**Verification:** `npm test -- tests/ingestion/replay`; `supabase db reset --local`;
`supabase test db supabase/tests/database/19_slice_2b_replay_acceptance_test.sql`; `supabase db lint --local --level warning`;
`npx tsc --noEmit`; `npm run lint`; `git diff --check`.

**Evidence ceiling:** static/local synthetic TypeScript and disposable-local database replay only. Recorded
fixtures require a later approved evidence gate; live provider evidence is prohibited.

**Rollback/repair:** delete only synthetic local fixtures through a revert before any hosted data. No hosted
or production rollback is implied.

**Stop conditions:** any provider name/URL/credential appears; replay changes legacy scoring or lifecycle;
any acceptance case is only mocked without a required local database assertion; or any earlier sub-slice
decision is bypassed.

**Next gate:** present the complete local Slice 2B evidence packet for architecture approval before any
recorded fixture, provider adapter, scheduler, or beta work.

## 4. Identity decision table

| Case | Decision and persistence behavior | Required invariant |
|---|---|---|
| Reviewed external-ID mapping | Use `provider_entity_refs.resolution_status = 'reviewed'` and its canonical UUID as authoritative. Do not replace it from an observation. | Reviewer, timestamp, binding, entity kind, and same-edition target remain intact. |
| Existing automatic mapping | Reuse only when the row is `automatic`, its target still validates, and no reviewed mapping conflicts. It is not equivalent to reviewed authority. | A changed candidate quarantines; it never silently rewrites the row. |
| One exact normalized alias | Return one automatic candidate only if context (entity kind/domain/organization/locale/validity) makes it unique and D2 is approved. | Exact matching cannot override reviewed state. |
| Missing alias/mapping | Return `unresolved`; open `mapping_missing` quarantine with no candidate UUID. | No name guess and no canonical projection. |
| Ambiguous aliases | Return `unresolved`; open `mapping_ambiguous` with sorted candidate UUIDs and sanitized explanation. | Multiple plausible identities never auto-accept. |
| Rejected mapping | Persist `rejected` with reviewer provenance and no canonical UUID; quarantine new observations until a new reviewed decision exists. | Rejection is not treated as “try fuzzy again.” |
| Fuzzy candidate | Store only as advisory candidate details in quarantine; never set `automatic` or `reviewed`. | Fuzzy matching can suggest, never accept. |
| Cross-provider scope | A provider external ID is scoped to `binding_id + entity_kind`; different providers may map to the same canonical UUID only through separate reviewed/approved refs. | Provider IDs never become canonical primary keys. |
| Cross-edition scope | The same external ID may recur in different editions; canonical structural references must pass existing same-edition checks. Competitor identity may be shared, but event entry/contest identity is edition-scoped. | Never reuse a mapping solely by external ID across editions. |
| First-seen canonical entity | **Unresolved decision D1.** Choices are no auto-creation; shadow-only operator-approved creation; or deterministic automatic creation. Recommended: no automatic creation in 2B; create canonical rows only after an operator-approved key/identity decision, then review the mapping. | `NormalizedOrganization`, `NormalizedCompetition`, and `NormalizedCompetitor` do not carry canonical keys. No implementation may invent slug rules from display names. |
| Conflicting reviewed mappings | Freeze the existing reviewed ref, quarantine the incoming observation as mapping conflict/ambiguity, and require operator disposition. | Reviewed authority is never overwritten by an automatic or fuzzy result. |
| Result contest identity | Resolve provider result external ID to a canonical contest ref, then resolve the winner external ID to an event-entry ref belonging to that contest. | Result writes use canonical contest/event-entry UUIDs only; winner FK must pass the database constraint. |
| Human league participants | Never enter the identity candidate set for event competitor/entry resolution. | `participants` and `competitors` remain separate domains. |

## 5. Dependency and projection ordering

The required topological order is:

1. **Organization** — standalone canonical owner; competition may reference it when available.
2. **Competition** — requires its organization only when the normalized observation supplies one; its
   canonical competition identity must be approved.
3. **Event edition** — requires a resolved competition; edition key is scoped by competition.
4. **Competitor** — may reference organization; it is not a league participant.
5. **Event entry** — requires edition and competitor; event-entry identity is edition-scoped.
6. **Stage** — requires edition and, when present, a resolved parent stage.
7. **Round** — requires edition and stage.
8. **Contest** — requires edition and stage; round, parent contest, and contest entries must resolve when
   supplied.
9. **Bracket** — requires edition; optional stage must resolve; every edge requires same-edition contests.
10. **Result** — requires contest; a winner result additionally requires a contest event entry. Result is
    projected only by 2B.5 after identity/order checks.

Batch processing sorts observations by this order, then by `externalId` using a deterministic encoded
comparison. It may project a parent and child from one batch only after the parent mapping/row is accepted.

Dependency outcomes:

- **Absent required dependency:** open `mapping_missing` or `partial_payload` quarantine with the exact
  dependency kind/external ID in sanitized details; create no placeholder UUID.
- **Partial dependency:** project only already-validated explicit fields if the target exists; never infer
  missing required relationships and never delete unseen children. A new entity lacking required fields is
  quarantined.
- **Ambiguous dependency:** open `mapping_ambiguous`; do not project the child.
- **Rejected dependency:** open a blocking quarantine; do not bypass a rejected mapping.
- **Out-of-order child:** persist the immutable observation, quarantine the child, and allow deterministic
  replay after the parent is resolved. Reprocessing must return the same prior quarantine or a new explicit
  resolution outcome, not duplicate canonical rows.
- **Same-batch dependency:** the parent must be processed first; if it remains unresolved, all dependent
  children quarantine in dependency order.
- **Partial snapshot:** absence from the snapshot is not a delete, withdraw, void, or cancellation. Only an
  explicit normalized observation may change an entity status.
- **Graph cycle:** direct self-edges are rejected by the database; longer cycles must be detected by the
  pure structural validator and quarantined before bracket-edge persistence.

## 6. Idempotency specification

### 6.1 Canonical serialization

The owner is `lib/ingestion/idempotency/canonical-json.ts`. It must accept only Slice 2A `JsonValue`, sort
object keys deterministically, preserve array order, preserve JSON scalar meaning, reject non-finite/non-
JSON values, and emit one documented UTF-8 string. Hashes are lower-case SHA-256 hex. Key components use
length-prefixed encoding so delimiters in provider IDs cannot collide. Provider revisions are opaque values;
they are never sorted lexically.

### 6.2 Key table

| Record | Deterministic key inputs | Owner and replay behavior |
|---|---|---|
| Provider observation | `v1`, binding UUID, external object kind, trimmed external ID, then either provider revision or SHA-256 of canonical sanitized payload | `provider_observations` unique revision/hash indexes are final authority. Exact replay returns the prior observation and downstream outcome; a revisionless semantic change is a new observation. Same revision with changed payload quarantines. |
| Provider entity mapping | `v1`, binding UUID, entity kind, external ID | `provider_entity_refs` unique natural key. Exact replay returns the existing ref. A different canonical target cannot replace a reviewed ref and quarantines. |
| Quarantine | `v1`, observation UUID, issue code | Existing `(observation_id, issue_code)` row is returned on replay. Candidate UUIDs/details are canonicalized before comparison. |
| Canonical structural entity | Existing canonical natural key under the target edition/parent, or reviewed canonical UUID; never provider ID alone | Existing unique constraints and same-edition FKs are used. Exact replay is unchanged. A conflicting immutable identity is quarantined. |
| Contest result version | `v1`, canonical contest UUID, semantic result tuple: status, outcome, winner entry UUID, score, result data, effective timestamp policy, and correction policy version | `contest_results.idempotency_key` is unique. Exact semantic replay returns the prior result version/audit/outbox IDs; changed semantics append the next version only after ordering approval. |
| Result audit event | `v1`, result idempotency key, event type | `result_audit_events.idempotency_key` is unique. Exact replay returns the prior audit event; no second audit row. |
| Notification outbox intent | `v1`, result idempotency key, intent type, approved audience scope | `notification_outbox.idempotency_key` is unique. Exact replay returns the prior intent; no delivery is attempted by 2B. |

The application key builder owns formulas; SQL constraints and locked lookups are independent defenses.
`provider_observations.payload_hash` is PostgreSQL-generated from JSONB text. The implementation must add a
local integration assertion that the TypeScript semantic duplicate decision agrees with that database
uniqueness behavior; it must not assume stringified JavaScript object order is equivalent.

### 6.3 Concurrency and replay return values

For a result projection, the transaction locks the contest projection advisory key and reads the latest
result under the lock. Two concurrent new semantics serialize; only one receives `projected` for the next
version and the other receives either `duplicate` or the current ordering decision. A duplicate returns
the existing canonical result ID/version and any already-created audit/outbox IDs. Unique constraints remain
the final race defense if advisory keys collide or a caller bypasses the repository.

## 7. Ordering and correction decision table

The pure ordering module must return an explicit decision before persistence:

| Incoming case | Default 2B action | Result/audit/outbox effect |
|---|---|---|
| Newer trusted provider timestamp, valid state transition | Project a new version | Append result, audit, and approved intent atomically. |
| Older provider timestamp, same semantics | No-op duplicate | Preserve current version; observation may remain evidence. |
| Older provider timestamp, changed semantics | Quarantine `stale_update` | No result or intent change. |
| Missing provider timestamp, no accepted state | Project only if the state is valid and policy permits low-confidence data | Record missing-timestamp provenance; no silent claim of freshness. |
| Missing timestamp replacing a newer accepted state | Quarantine `stale_update` | Preserve current result. |
| Equal timestamp and identical semantic payload | No-op duplicate | No new version, audit, or intent. |
| Equal timestamp and changed payload | Quarantine `illegal_regression` or `conflicting_terminal_result` according to state | No projection until correction policy resolves it. |
| Opaque provider revision | Use it for observation identity only | Never compare revisions lexically without a provider-specific approved comparator. |
| Partial update | Merge only explicitly supplied validated fields for an existing entity; never delete unseen state | Result partials lacking required state quarantine; structural partials do not imply deletion. |
| `scheduled → pregame → live → final` | Project valid monotonic progression | Each accepted result version is append-only; final may create `result_final` intent. |
| Terminal → nonterminal or terminal status regression | Quarantine `illegal_regression` | No projection absent approved correction. |
| Changed terminal winner/score | **Unresolved D4.** Recommended default is quarantine unless an explicit correction signal and approved policy are present. | If approved, append corrected version with nonblank reason and correction intent; never mutate history. |
| Explicit provider correction | Validate correction marker/reason and ordering policy | Append a correction version, audit prior/new state, and one correction intent. |
| Correction to `unresolved` | Allowed only under the same explicit correction policy | Append `unresolved/pending` version; lifecycle reopening remains outside 2B. |
| `canceled` or `void` | Terminal no-contest; later final is a correction conflict by default | No winner; correction requires explicit approval and audit. |
| Duplicate delivery | Resolve deterministic key and return prior outcome | No duplicate version, audit, or outbox. |
| Out-of-order delivery | Preserve immutable observation; apply table decision | No regression or deletion. |

The result-state rules are identical to Slice 2A and the `contest_results` database checks. Provider
timestamps, `provider_effective_at`, correction markers, and missing-timestamp trust are not allowed to
become silent policy choices during implementation.

## 8. Atomic transaction boundary

### 8.1 Recommended boundary

Use the new service-role-only `project_provider_result(...)` SQL function for the critical write boundary,
with TypeScript responsible for schema validation, pure identity/order decisions, and command preparation.
The function must revalidate all security-sensitive relationships under transaction locks. This is the
recommended resolution of D8, not an authorization to implement it.

One command transaction covers:

1. Validate the sanitized observation identity and insert/locate immutable provider evidence.
2. Lock provider refs in deterministic entity-kind order and lock the target contest projection advisory
   key. Do not lock by untrusted provider ID alone.
3. Recheck binding/provider/edition, contest, event entry, and result-source relationships.
4. Resolve the existing result idempotency key and return its prior outcome if present.
5. Evaluate ordering/correction policy.
6. If unresolved or unsafe, insert/locate the unique quarantine row and commit evidence plus quarantine;
   insert no result/audit/outbox row.
7. If projectable, insert the next contiguous canonical result version. The existing version trigger and
   unique constraints must pass.
8. Insert the provider audit event with actor/provenance and the deterministic audit key.
9. Insert the approved operator-scoped outbox intent with the audit FK and deterministic intent key.
10. Return the outcome and IDs. Commit only after all inserts succeed.

An unexpected exception rolls back the entire command. A deliberate quarantine is a successful, committed
outcome, not a partial failure. There is no notification delivery, lifecycle update, scoring write, or
legacy `template_results` write in this transaction.

### 8.2 Lock scope and deadlock avoidance

- Lock provider mapping rows by `(binding_id, entity_kind, external_id)` in the fixed entity-kind order from
  section 5.
- Lock the canonical contest projection advisory key before reading the latest result.
- Use `SELECT ... FOR UPDATE` on the relevant latest result/ref rows where available.
- Use the same lock order for structural and result paths; never lock a contest then an earlier dependency.
- Treat unique violations as a retryable duplicate only after querying the winning row and verifying semantic
  equality. Never blindly retry a conflicting mapping.

## 9. Security boundaries

- All Slice 2B writes run through server-only service-role access or the approved service-role-only SQL
  function. No browser role receives direct mapping, observation, quarantine, result-history, audit, or
  outbox grants.
- New `SECURITY DEFINER` functions must set a fixed `search_path`, qualify tables, revoke execution from
  `public`, `anon`, and `authenticated`, and grant only to `service_role`.
- Credentials remain only as `credentialRef`/`credential_ref`; no value, authorization header, or secret is
  accepted by identity/order/projection commands.
- Store only `sanitized_payload` and sanitized details. Raw provider pages, headers, personal data, and
  tokens are prohibited in observations, quarantine, audit, errors, fixtures, and logs.
- Audit provenance uses provider UUID/actor reference or organizer fingerprint according to existing checks;
  it never stores organizer or provider secret material.
- Canonical UUIDs supplied by a caller are untrusted. The transaction must validate mapping ownership,
  entity kind, edition, contest membership, winner-entry membership, and existing foreign keys.
- Provider IDs remain external identity fields scoped to bindings; they never become canonical primary keys
  or user-facing league participant IDs.
- Raw evidence and quarantine internals remain server/operator-only. Public compatibility reads continue to
  expose only the existing safe result surface.
- This packet does not alter RLS, public policies, organizer routes, credentials, scheduler secrets, or
  deployment configuration.

## 10. Test and evidence matrix

### 10.1 Required deterministic scenarios

The combined 2B acceptance suite must cover both a synthetic sports fixture and a synthetic ceremony
category, through the same provider-neutral interfaces:

1. reviewed identity success;
2. exact normalized alias candidate;
3. missing identity quarantines;
4. ambiguous identity quarantines with candidates;
5. fuzzy candidate quarantines and never auto-accepts;
6. exact observation replay;
7. semantic duplicate with a different provider payload ordering;
8. concurrent duplicate projection;
9. out-of-order update;
10. illegal status regression;
11. accepted explicit correction;
12. conflicting terminal correction;
13. partial snapshot with no deletion;
14. dependency arriving after a quarantined child and deterministic replay;
15. atomic result/audit/outbox creation;
16. induced failure rolls back the partial transaction;
17. exact replay creates no duplicate notification intent;
18. result winner resolution through contest and winner-entry identity;
19. cross-edition canonical UUID injection is rejected;
20. human league participant is never treated as an event competitor.

### 10.2 Evidence classifications

| Evidence type | Allowed in this packet | Required boundary |
|---|---|---|
| Pure TypeScript unit | Yes | 2B.1 and 2B.2 decisions and key formulas |
| Local database integration | Yes | 2B.3–2B.5 constraints, RLS, locks, transaction, and replay |
| Synthetic replay | Yes | 2B.6 sports/ceremony end-to-end local replay |
| Recorded provider fixture | No | Later approved provider-evidence gate; sanitize and license first |
| Live provider | No | G2/G3 provider and beta approvals |
| Deployment, beta, device, production | No | Later gates only |

Every sub-slice evidence file must record commit, migration version if any, exact commands, synthetic data
classification, pass/fail totals, security review, rollback/repair state, residual risks, and next gate.

## 11. Unresolved decision register

These decisions must be approved before the affected implementation sub-slice. The recommendations are
explicit proposals, not silent decisions.

| ID / owner | Options | Recommendation | Risks | Exact approval needed |
|---|---|---|---|---|
| **D1 — Product owner + architecture owner: first-seen canonical creation** | A. Never auto-create; operator creates canonical row and reviews mapping. B. Create in shadow as an untrusted proposal. C. Auto-create deterministic canonical rows. | A for 2B. Existing Slice 2A data lacks canonical keys for several entities, and display-name slugs are unsafe. | Slower onboarding and more quarantine; B/C risk identity pollution and unstable keys. | Approve whether 2B may create any first-seen organization, competition, competitor, edition, stage, round, contest, or bracket, and who supplies the canonical key. |
| **D2 — Architecture owner: normalized identity/alias algorithm ownership** | Provider-specific normalizers; shared TypeScript normalizer; database normalization; external library. | Shared versioned TypeScript normalizer with Unicode/locale tests; persist algorithm version in mapping metadata; DB remains an invariant store. | Algorithm changes can split/merge aliases; locale/punctuation behavior can create ambiguity. | Approve owner, normalization versioning, Unicode/locale rules, and whether an alias change requires re-review. |
| **D3 — Architecture owner + provider owner: provider-revision comparison** | Lexical revision order; provider-specific comparator; timestamp/hash only; operator-only revision disposition. | Treat revisions as opaque identity only. Use provider timestamps/effective times and approved adapter comparators later; never lexical-compare by default. | Some providers omit timestamps; stale or changed revisions may quarantine more often. | Approve the default for missing/opaque revisions and whether a provider-specific comparator may be added in a later adapter slice. |
| **D4 — Product owner + architecture owner: changed terminal trust** | Auto-accept newest; require explicit provider correction marker; operator review for every changed terminal; allow a provider-specific rule. | Quarantine changed terminal results by default; accept only an explicit, attributable correction with nonblank reason and approved policy. | Delayed real corrections versus wrong winner/scoring if trusted automatically. | Approve the correction signal, actor/provenance requirement, allowed terminal transitions, and whether unresolved corrections may reopen later lifecycle state. |
| **D5 — Architecture owner: canonical normalized snapshot persistence** | Observations only; copy full normalized data into result/audit JSON; dedicated normalized-snapshot table. | Keep immutable sanitized observations as replay source; store only the normalized result/audit state required by current tables and reference observation ID. | Re-normalization after algorithm changes may differ; duplication increases sensitive-data surface. | Approve whether a versioned normalized snapshot is required for deterministic replay and where it is retained. |
| **D6 — Product owner + notifications owner: Slice 2B outbox intents** | No outbox until M5; one operator intent per canonical result version; per-league/participant intents; all result events. | Create only one operator-scoped `result_final`/`result_correction` intent per accepted canonical result version; no delivery or fan-out in 2B. | Operator intents may be redundant; per-league fan-out risks lifecycle/compatibility coupling and duplicates. | Approve event types, audience, correction behavior, and whether outbox insertion is mandatory for every accepted result. |
| **D7 — Architecture owner: structural projection breadth** | Result-only; full canonical structure; full structure plus legacy/template projection. | Full canonical structural projection only, excluding legacy/template, scoring, lifecycle, and notifications. | Broad structure increases dependency/quarantine complexity; result-only cannot resolve future results safely. | Approve entity kinds included in 2B and explicitly keep template/scoring projection for a later slice. |
| **D8 — Architecture/security owner: transaction API location** | SQL `SECURITY DEFINER` function; server repository transaction; split TypeScript policy plus SQL write function. | Split boundary: pure TypeScript policy/command preparation plus a service-role-only SQL function for locked result/audit/outbox writes. | SQL function complexity; repository-only transactions may lack atomicity through the current client; split adds revalidation burden. | Approve function signature, lock scope, search path/grants, and which decisions are revalidated inside SQL. |
| **D9 — Product owner: correction/outbox semantics** | Correction emits one intent; correction emits final plus correction; no intent for quarantined corrections. | One correction intent only after a corrected version commits; quarantined corrections emit none. | Clients may miss a transition if later lifecycle owns reopening; duplicate user messaging if both events emit. | Approve the event taxonomy and whether 2B may reference lifecycle consequences without implementing them. |

## 12. Explicit exclusions and later gates

Slice 2B planning and any eventual implementation exclude:

- real provider adapters, provider calls, provider documentation, credentials, and current external payloads;
- scheduler/orchestrator work from Slice 2C, provider rate budgets, retries, cursors, ETags, and run claims;
- deployment, remote migrations, production backfill, hosted data changes, or production rollback;
- organizer UI, operator UI, browser exposure of evidence/quarantine, and push delivery;
- lifecycle completion/reopening implementation and GitHub issue #3 closure;
- UCL or NFL live configuration, paid provider terms, beta, physical-device, and production claims;
- canonical-to-legacy `template_results` projection, scoring changes, override mutation/release routes, and
  public compatibility read rewrites.

The next approval gate is architecture/security review of D1–D9, followed by explicit approval of 2B.1.
No lower-consumption model may begin 2B.1–2B.6 from this planning packet alone.
