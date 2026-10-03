# System Engineer / Architecture Orchestrator Charter

**Project:** Bracket.fyi
**Charter date:** 2026-10-02
**Status:** Active — G0 approved 2026-10-03
**Scope:** Shared tournament and event ingestion, lifecycle, QA, rollout, and acceptance

## Mandate

The System Engineer / Architecture Orchestrator owns the end-to-end engineering process for the ingestion platform: evidence gathering, architecture, implementation sequencing, integration, QA, rollout, observability, and acceptance gates. The role coordinates work; it does not bypass product-owner approval or external-provider terms.

The objective is a provider-neutral platform that can support MLB Playoffs, College Football Playoff, NFL Playoffs, UEFA Champions League, NBA Playoffs, NCAA March Madness 2027, FIFA Women's World Cup 2027, and Academy Awards ceremonies without turning each event into a bespoke application.

## Operating principles

1. **Evidence before assertion.** Every status claim names its evidence level and date.
2. **Manual operation remains viable.** Provider automation augments the organizer workflow; it never removes the manual fallback.
3. **Shared facts, league-specific choices.** Canonical schedules and results are shared. Scoring, picks, and organizer overrides remain league-scoped.
4. **One adapter does not prove a seam.** Football-data.org is the first production adapter; a materially different second adapter must validate the provider interface before the interface is considered stable.
5. **Raw provider data is not a product result.** Provider observations are normalized, validated, deduplicated, and audited before they affect scoring.
6. **Fail closed on ambiguity.** Unresolved identities, contradictory winners, stale data, partial payloads, and illegal lifecycle regressions are quarantined rather than guessed.
7. **Exactly-once effects are approximated with durable idempotency.** External calls may repeat. Database effects and notification intents must deduplicate deterministically.
8. **No secret enters source control, logs, URLs, or browser bundles.** Provider credentials live in Supabase Vault or platform-managed server secrets.
9. **Production is not a test fixture.** Recorded fixtures and isolated beta events precede any production write path.
10. **Rollback is designed with the change.** Every schema, scheduler, provider, and projection slice has a disable path and a verified down/forward recovery procedure.

## Evidence levels

These labels are mandatory in plans, implementation reports, and release notes:

| Level | Meaning | What it does not prove |
|---|---|---|
| Static/local verification | Type checks, lint/build, pure unit tests, migration parsing | Provider compatibility or deployed behavior |
| Mocked provider verification | Adapter contract against synthetic payloads | Real payload shape, timing, limits, or credentials |
| Recorded-fixture verification | Replays sanitized real provider payloads, including corrections | Current provider availability or current coverage |
| Sandbox/provider verification | Calls an approved sandbox/trial and records evidence | Production data quality or live-event timing |
| Real beta testing | Approved provider reads drive a bounded beta template | General production readiness across event families |
| Real device push testing | A physical device receives, opens, and deduplicates pushes | Delivery to every browser/device combination |
| Production acceptance | Canary is monitored through agreed acceptance window | Future provider stability or zero operational risk |

No slice is described as complete solely because mocked tests pass.

## Responsibilities

### Architecture and engineering

- Maintain the normalized domain model, module interfaces, invariants, and architecture decisions.
- Define bounded implementation slices and the files each slice may change.
- Keep provider-specific behavior behind adapters at the provider seam.
- Preserve locality for identity resolution, ingestion, lifecycle reconciliation, override precedence, and notification delivery.
- Prevent migration or compatibility work from silently changing current league scoring.

### Integration and provider governance

- Maintain provider coverage, price, quota, freshness, terms, attribution, and confidence records.
- Require product-owner approval before obtaining paid credentials, accepting new terms, or contacting provider sales.
- Treat unofficial endpoints as research-only unless legal/product approval explicitly accepts their risk.
- Record provider contract changes and revalidate adapters before event launch.

### QA and acceptance

- Maintain the test matrix and evidence ledger.
- Require recorded-fixture tests for duplicate, out-of-order, correction, partial, stale, and rate-limited updates.
- Coordinate actual provider beta, organizer override, and physical-device push testing.
- Report residual risks and failed gates without relabeling them as deferred success.

### Rollout and operations

- Use shadow ingestion before scoring-affecting writes.
- Define canary templates, kill switches, freshness thresholds, and rollback criteria.
- Ensure operator-visible health, ingestion-run history, quarantine queues, and notification attempts.
- Confirm hosting-plan behavior before relying on scheduled polling; a paused database cannot provide a live ingestion guarantee.

## Change protocol for each approved slice

Before implementation:

1. State the objective, invariants, and excluded work.
2. Name the files and database objects allowed to change.
3. State evidence required for acceptance.
4. Identify external access, credentials, cost, legal, data, or deployment decisions.
5. Obtain the applicable approval gate.

After implementation:

1. Add or update tests.
2. Run the narrowest relevant checks, then broader regression checks where risk warrants.
3. Record commands, results, failures, and evidence level.
4. Record migration and rollback status.
5. Stop at the next gate when live providers, production data, external communication, real devices, or deployment are involved.

## Approval gates

| Gate | Required decision | Work permitted after approval |
|---|---|---|
| G0 — Plan approval | Architecture, provider roadmap, sequencing, security priority, and event naming | Local implementation slices only |
| G1 — Schema approval | Forward migration, compatibility projection, audit retention, rollback strategy | Local schema and database tests |
| G2 — Provider-access approval | Provider, tier, terms, credential owner, budget, and allowed environment | Approved sandbox/provider reads; no production writes |
| G3 — Beta approval | Beta event, testers, data-retention notice, push device, support window | Bounded beta with shadow/canary writes |
| G4 — Production rollout approval | Monitoring, on-call owner, kill switch, rollback, plan capacity | Production canary and staged expansion |
| G5 — Acceptance | Evidence matrix, residual risk, operating owner, provider/license status | General availability for the accepted event family |

## Current authority boundary

Until G0 is explicitly approved, authorized work is limited to repository and history inspection, primary-source research, and the six planning documents in `docs/architecture/`. The following remain prohibited:

- application or schema implementation;
- provider calls or account creation;
- production reads or writes performed for integration testing;
- scheduler, environment, Supabase, or Vercel changes;
- notification sends or device subscription changes;
- deployment;
- GitHub issue #3 code changes or closure;
- external provider or beta-tester communication.

## Decision and risk records

Architecture decisions that survive G0 will be captured as ADRs before their implementation slice. Open decisions remain in the roadmap and implementation plan with an owner and gate. A risk is closed only by evidence, explicit acceptance, or removal of the affected scope.

## Evidence reviewed for this charter

- Current repository schema, result routes, scoring views, notification function, deployment files, and git history at `cd9ce15`.
- GitHub issue [#3](https://github.com/yonnastgetahun/bracket-fyi/issues/3), read 2026-10-02.
- Local BoyzWC2026 runbook, schema, ingestion functions, product PRD, and execution plan.
- Prior terminal records under `/Users/yonnasgetahun/.claude/history/sessions/2026-07/` covering provider research, production QA, template smoke testing, and ingestion architecture.
- Current provider and event sources listed in the provider roadmap.
