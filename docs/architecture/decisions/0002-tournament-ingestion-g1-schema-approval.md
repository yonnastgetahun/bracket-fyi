# ADR 0002: Tournament ingestion G1 schema approval

**Date:** 2026-10-06
**Status:** Accepted
**Decision owner:** Product owner

## Context

G0 approved the provider-neutral architecture and security-first sequence. Slice 0 closed the organizer mutation-boundary finding locally and upgraded the framework baseline. The next gate in the approved plan was G1: authorization to implement and test the additive canonical tournament/event schema without touching production.

## Decision

The product owner approved G1 on 2026-10-06.

G1 authorizes local, bounded schema slices covering:

- canonical providers, competitions, event editions, organizations, competitors, aliases, entries, stages, rounds, contests, contest entries, brackets, and bracket edges;
- additive compatibility links from current templates and template matches;
- subsequent ingestion, observation, canonical result, audit, override, outbox, and completion-hold tables defined by the approved plan;
- forward migrations, preserved rollback procedures, generated database types, and disposable local database tests.

## Constraints retained

- Existing template, league, pick, scoring, and manually entered result behavior remains compatible during additive migration.
- Provider IDs never become canonical primary keys.
- Cross-edition stage, round, contest, entry, and bracket references must be rejected by database constraints.
- New internal tables default to RLS enabled with no anonymous policy until a later interface explicitly requires one.
- Applied migration files are not rewritten; historical rollback scripts are preserved outside the forward-migration directory.

## Not authorized by G1

G1 does not authorize remote migration, production or preview deployment, provider credentials or calls, paid purchases, scheduler activation, production data/backfill, notification delivery, beta testing, external communication, or GitHub issue #3 closure.

Those actions retain their G2–G4 gates.
