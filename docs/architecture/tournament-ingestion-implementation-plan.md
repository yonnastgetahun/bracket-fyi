# Tournament and Event Ingestion Implementation Plan

**Date:** 2026-10-02
**Status:** Approved at G0 on 2026-10-03 — each implementation slice requires its stated scope and evidence
**Planning basis:** Current repository at `cd9ce15`; no application changes are authorized by this document

## Delivery approach

Work is divided into bounded, reversible slices. Each slice begins with an approved scope and file allowlist, ends with recorded evidence and residual risk, and stops before any higher approval gate. Provider reads, production writes, device tests, external communication, and deployment are never implied by approval for local code.

The first implementation work should secure the existing privileged mutation surface. The first ingestion work should then establish the normalized model and pure provider-neutral pipeline before introducing a live adapter.

## Sequencing overview

| Milestone | Outcome | Estimate for one engineer | Gate/evidence ceiling |
|---|---|---:|---|
| M0 | Organizer authorization and test harness | 2–3 engineering days | G0; static/local |
| M1 | Additive canonical schema and compatibility contracts | 4–6 days | G1; local database |
| M2 | Provider-neutral ingestion core with recorded fixtures | 4–6 days | G1; recorded fixture |
| M3 | Football-data.org adapter and UCL shadow binding | 3–5 days | G2; sandbox/provider |
| M4 | Scheduler, rate budgets, health, lifecycle reconciler | 4–6 days | G2/G3; isolated beta |
| M5 | Override audit, result projection, outbox, push integration | 4–6 days | G3; real device |
| M6 | UCL provider-backed beta and production canary | 1–2 calendar weeks | G3/G4; real beta |
| M7 | Second adapter and first calendar expansion | 4–8 days | G3/G4 by event |
| M8 | Remaining event families | 2–6 days per family after shared work | Event-specific gates |

These are planning estimates, not delivery commitments. Provider access, licensing, event timing, mobile-device availability, and beta feedback can extend calendar time. A reasonable end-to-end range for the platform plus two proven adapters is six to ten engineering weeks.

## Slice protocol

Every slice report must include:

1. Objective, invariants, exclusions, owner, and approval reference.
2. Exact files and database objects permitted to change.
3. Tests added or changed.
4. Narrow checks and broader regressions run, with command and result.
5. Evidence classification: static/local, mocked, recorded fixture, sandbox/provider, beta, device, or production.
6. Migration and rollback state.
7. Failures, quarantined cases, deferred work, and residual risk.
8. The next gate and actions that remain prohibited.

File names below are proposed boundaries, not preapproved implementation.

## M0 — Secure the existing mutation boundary and establish tests

### Slice 0A: authenticated organizer mutations

**Why first:** Existing `/api/admin/*` routes create a service-role client without authenticating organizer ownership. Adding ingestion or operator controls before closing this boundary would deepen a release-blocking weakness.

**Allowed files after G0:**

- `lib/auth/**` or a similarly named server-only authorization module;
- `app/api/admin/**/route.ts`;
- `middleware.ts` only if route-level protection cannot provide the required ownership checks;
- test configuration and focused tests under `tests/auth/**`;
- an ADR documenting the organizer-token boundary.

**Required behavior:**

- Authenticate the organizer secret supplied through the current link/cookie mechanism.
- Verify that every league, participant, match, subscription, and result mutation belongs to that organizer's league.
- Reject missing, malformed, expired, and cross-league credentials before creating or using a privileged client.
- Validate request schemas and result-winner membership.
- Never log organizer tokens; use a non-reversible fingerprint only where audit correlation is needed.
- Preserve current valid organizer workflows.

**Acceptance evidence:** Unauthorized, wrong-league, replayed-invalid, and malformed requests fail; valid lock, unlock, result, participant, competitor, and broadcast paths pass. Tests must prove route authorization, not just helper behavior.

### Slice 0B: test harness and CI baseline

**Allowed files:** package scripts/lockfile, test configuration, `tests/**`, and CI configuration only.

Add unit, database integration, route-contract, and browser-test lanes. Pin Node/runtime assumptions. Capture the baseline build and current supported user journeys. Do not change product behavior in this slice.

### Slice 0C: framework security upgrade

**Status:** Implemented and verified locally on 2026-10-03; not deployed.

Upgrade the repository from Next.js 14/React 18 to Next.js 16/React 19, migrate asynchronous request APIs and `middleware` to `proxy`, establish the supported ESLint CLI, and remove production dependency advisories without changing schemas, provider behavior, or production state.

Evidence: [`implementation/slice-0c-nextjs-16-security-upgrade-evidence.md`](implementation/slice-0c-nextjs-16-security-upgrade-evidence.md).

## M1 — Additive canonical data model

### Slice 1A: domain and provider metadata

**Status:** Implemented and verified locally on 2026-10-06; not deployed. The minimum nullable template/contest compatibility links from Slice 1C were included so their cross-edition invariants could be tested with the canonical domain. No backfill or override metadata was included.

Evidence: [`implementation/slice-1a-canonical-event-domain-evidence.md`](implementation/slice-1a-canonical-event-domain-evidence.md).

**Allowed objects:** New migrations creating `data_providers`, `competitions`, `event_editions`, `organizations`, `competitors`, `competitor_aliases`, `event_entries`, `stages`, `rounds`, `contests`, `contest_entries`, `brackets`, and `bracket_edges`; generated database types; database tests; ADRs.

Key constraints:

- Internal UUIDs are stable and provider-independent.
- Provider IDs never become primary keys.
- Competitor kind distinguishes team, national side, person, film, song, and other work.
- Contest kind distinguishes game, match, series, tie, award, and category.
- Parent/child constraints support MLB/NBA series and UCL ties without requiring them for single-elimination events.
- Advancement edges cannot refer across event editions.
- Ceremony categories use the same scored-contest contract without pretending to be sports fixtures.

### Slice 1B: ingestion, results, audit, and outbox tables

**Status:** Implemented and verified locally on 2026-10-08; not deployed. This slice establishes persistence and invariants only; adapters, projection transactions, scheduling, delivery workers, and compatibility projection remain later milestones.

Evidence: [`implementation/slice-1b-ingestion-evidence-and-delivery-evidence.md`](implementation/slice-1b-ingestion-evidence-and-delivery-evidence.md).

**Allowed objects:** `provider_bindings`, `provider_entity_refs`, `ingestion_runs`, `provider_observations`, `ingestion_quarantine`, `contest_results`, `result_audit_events`, `notification_outbox`, `notification_attempts`, and `league_completion_holds`.

Required database behavior:

- Immutable observation identity and payload hashes.
- Unique idempotency keys for run claims, result versions, and notification intents.
- Result history cannot be erased by a later provider update.
- Row-level access keeps operator data and sanitized provider payloads off public clients.
- Provider credentials are referenced, never stored in ordinary configuration rows.
- Audit actor fields support provider, organizer fingerprint, operator, and system reconciler.

### Slice 1C: compatibility links and backfill rehearsal

**Status:** Implemented and verified locally on 2026-10-08; not deployed. Slice 1A supplied the nullable compatibility links. Slice 1C adds override lifecycle/provenance metadata, a league-parameterized effective-result resolver, aligned legacy result/scoring views, and bounded idempotent backfill tooling with a disposable-database rehearsal.

Evidence: [`implementation/slice-1c-result-compatibility-and-backfill-evidence.md`](implementation/slice-1c-result-compatibility-and-backfill-evidence.md).

**Allowed changes:** Nullable `event_edition_id` on `templates`; nullable `contest_id` and `counts_toward_completion` on `template_matches`; additive override metadata; compatibility functions/views; seed/backfill scripts and tests.

Rehearse against a disposable local database. Current template IDs, picks, shared results, overrides, and scoring must remain stable. Backfills must be restartable and report counts rather than assume completeness.

**G1 stop:** Present schema diff, RLS/grant review, backfill output, query plan considerations, and rollback/forward-repair procedure before any deployed migration.

## M2 — Provider-neutral ingestion core

### Slice 2A: contracts and validation

**Status:** Implemented and verified locally on 2026-10-08; not deployed. Slice 2A delivers provider-neutral contracts, runtime validation, strict event configuration parsing, failure taxonomy, and a common pull seam proven with synthetic sports and ceremony adapters. The evidence ceiling remains static/local and deterministic mocked-adapter verification.

Execution packet: [`implementation/slice-2a-provider-contracts-execution-packet.md`](implementation/slice-2a-provider-contracts-execution-packet.md).

Evidence: [`implementation/slice-2a-provider-contracts-evidence.md`](implementation/slice-2a-provider-contracts-evidence.md).

**Proposed files:**

- `lib/ingestion/contracts.ts`;
- `lib/ingestion/config.ts`;
- `lib/ingestion/providers/provider-adapter.ts`;
- `lib/ingestion/errors.ts`;
- `tests/ingestion/contracts/**`.

Implement schema-validated provider capabilities, pull context, normalized observations, failure classes, and event configuration. Provider payload types must terminate inside adapters.

### Slice 2B: identity, ordering, and canonical projection

**Status:** Slice 2B accepted for local/synthetic evidence on 2026-10-08; provider, hosted, deployment, beta, device, and production acceptance remain unverified. The provider-neutral Slice 2C implementation completed local synthetic replay and disposable-local database acceptance on 2026-10-26. Recorded-provider and live-provider evidence remain behind G2.

Execution packet: [`implementation/slice-2b-identity-ordering-and-projection-execution-packet.md`](implementation/slice-2b-identity-ordering-and-projection-execution-packet.md).

R3 evidence: [`implementation/slice-2b-r3-acceptance-evidence.md`](implementation/slice-2b-r3-acceptance-evidence.md).

**Proposed files:**

- `lib/ingestion/identity/**`;
- `lib/ingestion/projection/**`;
- `lib/ingestion/idempotency/**`;
- database functions limited to atomic projection/audit/outbox behavior;
- recorded fixtures and focused tests.

Implement reviewed external-ID mappings, exact alias candidates, quarantine for ambiguity, monotonic result versions, duplicate suppression, out-of-order rejection, correction handling, and transactional audit/outbox intent creation. Fuzzy matching may suggest but must never auto-accept an identity.

### Slice 2C: orchestrator and run ledger

**Status:** Local provider-neutral implementation is complete through Slice 2C.6 as of 2026-10-26. Synthetic
sports and ceremony replay, run-ledger, checkpoint, rate-budget, scheduling, health, rollback, and full database
acceptance are green. Provider, recorded-provider, hosted, deployment, beta, device, production, and external
scheduler validation remain unverified behind their stated gates.

Execution packet: [`implementation/slice-2c-orchestrator-and-run-ledger-execution-packet.md`](implementation/slice-2c-orchestrator-and-run-ledger-execution-packet.md).

**Proposed files:**

- `lib/ingestion/orchestrator/**`;
- `lib/ingestion/rate-limit/**`;
- `lib/ingestion/retry/**`;
- focused run-ledger tests.

Slice 2C.4A is independently accepted through R2 at the local pure-TypeScript/synthetic evidence ceiling. It is the
implemented pure cursor, ETag, checkpoint, cursor-repetition, and bounded-pagination policy layer.
Its exact local TypeScript allowlist is `lib/ingestion/orchestrator/checkpoint.ts`,
`lib/ingestion/orchestrator/pagination.ts`, their focused tests, and
`docs/architecture/implementation/slice-2c-4-checkpoint-evidence.md`. It does not wire pagination into the
runtime orchestrator. The approved scheduling rule is that complete-phase `nextPollAt = null` maps to SQL
`next_poll_at IS NULL`, which is unscheduled/not due for ordinary claims. Slice 2C.4B is accepted through R2 at
the local mocked/synthetic TypeScript evidence ceiling; Slice 2C.5 is the next separately gated slice.

The Slice 2C.5 planning packet separates 2C.5A pure accounting, health, scheduling, and attempt-key
contracts; 2C.5B budget persistence and security; and 2C.5C runtime scheduling and health integration.
2C.5A is accepted through R2 at the local pure-TypeScript/synthetic evidence ceiling; 2C.5B-R7 is implemented as of 2026-10-20
with disposable-local database verification complete and independent acceptance review pending; R6 was implemented and recorded
on 2026-10-20, R5 was implemented and recorded on 2026-10-20, and R4 was implemented and recorded on 2026-10-17.
2C.5C remains unimplemented and unapproved.

Implement due-binding claims, one active run per binding, provider budgets, retry classification, cursors, ETags where supported, shadow/write modes, and complete run accounting. Use fake clocks and deterministic jitter in tests.

**Acceptance:** Two fake adapters with substantially different shapes—sports fixture and ceremony category—must use the same orchestration and projection modules. This validates the abstraction locally without claiming a real provider integration.

## M3 — First production adapter: football-data.org

### Slice 3A: adapter against recorded evidence

**Proposed files:** `lib/ingestion/providers/football-data/**`, sanitized fixtures, contract tests, provider attribution metadata, and an ADR.

Port only reusable behavior proven in BoyzWC2026:

- competition and date-window queries;
- external team and match IDs;
- provider status and winner normalization;
- extra-time and penalty resolution through authoritative winner fields;
- quota-header/error classification;
- alias/reference seed suggestions.

Do not carry over single-tournament assumptions, pick-derived slot matching, inline notification calls, or secret handling.

### Slice 3B: approved sandbox/provider verification

Requires G2 approval naming the credential owner, account/tier, accepted terms, allowed environment, rate budget, and target competition. Read-only calls must be captured as sanitized evidence. No scoring-affecting write is permitted.

### Slice 3C: UCL shadow configuration

Create the UEFA Champions League 2026/27 event configuration and template linkage in shadow mode. Validate stage mapping, two-leg tie aggregation, abandoned/postponed behavior, and final-match semantics against recorded plus approved current data.

**Stop before:** scheduler deployment, production writes, paid plan change, or public template publication.

## M4 — Scheduling, status, and issue #3

### Slice 4A: dispatcher and operational controls

**Proposed files:** one server-only dispatcher/Edge Function, Supabase Cron migration or job definition, operator-only status routes/UI, tests, and runbook.

The dispatcher runs frequently enough to claim due bindings but each binding chooses its own interval. Add disable, shadow, and write modes; missed-run detection; provider rate budgets; and safe manual replay by observation/run ID.

Deployment of the scheduler requires an explicit environment and plan-capacity decision. Scheduling must not rely on unverified assumptions that activity will prevent a free Supabase project from pausing.

### Slice 4B: effective-result resolver and override model

Replace the ambiguous `effective_results` read contract with a league-parameterized database function or equivalent server API. Add active/released/expired override state, reason, actor fingerprint, canonical version replaced, and audit events. Existing overrides are backfilled as active until explicitly released.

### Slice 4C: automatic lifecycle reconciler — GitHub issue #3

Implement one reconciler invoked after canonical projection, organizer override mutation/release/expiry, required-contest changes, and explicit hold changes.

Required rules:

- Only `locked` leagues auto-transition to `complete`.
- Every required contest must have a result-bearing terminal effective result.
- Blocking quarantine and active completion holds prevent completion.
- The transition records `completed_at`, basis/version, and an audit event.
- A correction that makes a required result unresolved transitions `complete -> locked`, records why, and emits a correction intent.
- Replaying the same event does not repeat transitions or coronation notifications.

Issue #3 may be closed only after local database tests, route/integration tests, and a deployed beta prove both completion and correction reopening. The issue comment must distinguish those evidence levels.

## M5 — Notifications and organizer experience

### Slice 5A: durable outbox

Move result, lifecycle, stale-provider, and existing broadcast intents into the outbox. A worker fans out to subscriptions, records attempts, retries transient failures, and prunes 404/410 endpoints. Delivery is at least once at the worker boundary and best effort at browser endpoints.

### Slice 5B: organizer provenance and controls

Add canonical source, freshness, result version, active override, reason, release, completion hold, and audit views to the organizer result interface. Add an operator-only health/quarantine surface. Provider raw payload and credentials remain server-only.

### Slice 5C: physical-device validation

Requires G3 approval and the QA procedure. No production acceptance can rely on subscription creation alone; a physical device must receive, open, and deduplicate representative notifications.

## M6 — UCL beta and production canary

1. Select an isolated beta template and named testers.
2. Run shadow ingestion through representative pregame, live, final, correction, stale, and recovery windows.
3. Reconcile all projected results against an official source and record discrepancies.
4. Enable canary projection for the beta template only.
5. Test organizer override before and after provider corrections.
6. Verify automatic completion and correction reopening.
7. Complete physical-device push evidence and feedback triage.
8. Present the G4 production-readiness checklist and residual risks.

No public catalog rollout occurs automatically at the end of beta.

## M7 — Second adapter and calendar expansion

Implement BALLDONTLIE NFL as the recommended second adapter, subject to G2 provider/terms approval. Its league/game/status conventions and account-wide quota differ enough from football-data.org to test the provider seam while retaining a relatively simple single-elimination postseason structure.

Candidate order after the shared platform:

1. UEFA Champions League 2026/27 — first football-data.org beta.
2. NFL Playoffs 2026/27 — second adapter and first non-soccer proof.
3. NCAA March Madness 2027 — high product value; paid bracket/data decision required.
4. NBA Playoffs 2027 — validates best-of-seven series.
5. FIFA Women's World Cup 2027 — reuses soccer adapter after exact coverage/tier validation.
6. MLB Playoffs 2027 — validates baseball series without rushing the already-started 2026 postseason.
7. College Football Playoff 2026/27 — provider budget and college-data quality gate.
8. Academy Awards — historical 2026 replay or live 2027 target, as the owner decides.

Calendar timing may reorder implementation, but no event bypasses provider, licensing, and beta gates.

## Calendar template implementation contract

A template is publishable only when it has:

- official edition identity and dates;
- explicit scoreable contests and completion requirements;
- lock policy and timezone behavior;
- provider binding and manual fallback;
- reviewed competitor mappings and attribution;
- seed/backfill idempotency;
- lifecycle, override, scoring, and mobile-layout tests;
- operator owner and freshness threshold;
- no unresolved legal/licensing blocker.

Historical templates must be labeled historical/replay and must not imply a live upcoming event.

## Required decisions at G0

1. Approve the module boundaries, normalized terminology, and additive migration direction.
2. Approve security remediation as Slice 0 before feature work.
3. Confirm UCL as the first live adapter/template and BALLDONTLIE NFL as the second seam proof.
4. Choose whether “Oscars 2026” means a historical replay/case-study template or whether the live roadmap should target the 99th Oscars in 2027.
5. Approve the organizer completion-hold behavior and `complete -> locked` correction rule.
6. Approve the test/tooling baseline and database integration-test requirement.
7. Identify acceptable monthly provider budget and who can accept provider terms.
8. Confirm whether a non-pausing Supabase environment may be used for beta/live scheduling.

G0 does not authorize schema changes, provider calls, credentials, notification sends, deployment, production data changes, or issue #3 closure.
