# Slice 1A: Canonical Event Domain

**Date:** 2026-10-06
**Status:** Implemented and verified locally; not deployed
**Evidence ceiling:** Disposable local Supabase database and static/local application verification

## Approval and scope

The product owner explicitly approved G1 on 2026-10-06. The approval is recorded in [ADR 0002](../decisions/0002-tournament-ingestion-g1-schema-approval.md).

Included in this bounded slice:

- The provider-neutral competition, edition, organization, competitor, alias, entry, stage, round, contest, contest-entry, bracket, and bracket-edge domain.
- Provider registry metadata without credentials.
- Nullable compatibility links from `templates` to event editions and from `template_matches` to canonical contests.
- Database constraints for cross-edition integrity, identity uniqueness, contest hierarchy, and bracket advancement.
- RLS-on/no-anonymous-policy defaults for all new canonical tables.
- Disposable-database pgTAP integration tests.
- A tested operator rollback script and correction of the historical forward-migration directory layout.

Excluded: provider bindings, provider calls, observations, result projection, organizer override changes, outbox, scheduler, credentials, remote migration, backfill, deployment, production data, push delivery, beta testing, and GitHub issue #3 implementation or closure.

## Delivered schema

The forward migration adds 13 canonical tables:

1. `data_providers`
2. `organizations`
3. `competitions`
4. `event_editions`
5. `competitors`
6. `competitor_aliases`
7. `event_entries`
8. `stages`
9. `rounds`
10. `contests`
11. `contest_entries`
12. `brackets`
13. `bracket_edges`

Canonical UUIDs remain independent of provider identifiers. Composite foreign keys reject cross-edition stage, round, contest, entry, bracket, and advancement references. Contest kinds cover games, matches, series, ties, awards, and categories; competitor kinds cover sports teams, national sides, schools, people, and creative works.

The migration also adds these nullable compatibility contracts:

- `templates.event_edition_id`
- `template_matches.contest_id`
- `template_matches.counts_toward_completion`

Triggers require a linked template and contest to belong to the same event edition. Existing templates and matches remain valid with null links. No legacy data is backfilled in this slice.

## Migration-history correction

Five historical `*_down.sql` files used the same numeric versions as forward migrations inside `supabase/migrations`. A clean Supabase replay interpreted them as forward migrations and then failed on duplicate versions. The scripts were preserved unchanged under `supabase/rollbacks`, and that directory now documents that rollback scripts are operator-run artifacts rather than forward migrations.

After the relocation, a clean local reset replayed all six forward migrations successfully.

## Test-driven verification

Each domain boundary was exercised with a failing pgTAP tracer before its migration behavior was accepted:

| Boundary | Initial failure | Passing behavior |
|---|---|---|
| Provider registry | Table absent | Adapter key and metadata constraints |
| Competition/edition identity | Canonical tables absent | Edition uniqueness and date ordering |
| Competitor identity | Canonical tables absent | Entry uniqueness and alias ambiguity rejection |
| Contest structure | Canonical tables absent | Series/tie children and cross-edition rejection |
| Bracket graph | Canonical tables absent | Same-edition entries/edges and self-edge rejection |
| Template compatibility | Columns absent | Legacy null links and same-edition enforcement |
| Canonical security | New tables unavailable | RLS enabled, no public policies, anonymous insert denied |

## Verification results

| Check | Result | Evidence level |
|---|---|---|
| Fresh `supabase db reset --local` | Pass: all historical forward migrations plus Slice 1A replayed | Local database |
| Database pgTAP suite | Pass: 7 files, 27 assertions | Local database integration |
| `supabase db lint --local --level warning` | Pass: no schema errors | Local database static analysis |
| Rollback rehearsal | Pass: canonical objects and compatibility columns removed; legacy `templates` preserved | Disposable local database |
| Forward restore after rollback | Pass: full migration replay restored the schema | Disposable local database |
| `npm test` | Pass: 6 files, 22 tests | Static/local with mocked application database boundary |
| `npx tsc --noEmit` | Pass | Static/local |
| `npm run lint` | Pass: 0 errors; 10 pre-existing warnings | Static/local |
| `npm run build` | Pass: Next.js 16.3.8 webpack production build | Static/local |

[Supabase documents `supabase test db`](https://supabase.com/docs/reference/cli/supabase-test-db) as a pgTAP test runner and [local migration testing with `supabase db reset`](https://supabase.com/docs/guides/local-development/testing/overview) as a migration replay mechanism. These checks prove local schema behavior; they do not constitute a hosted migration or production acceptance.

## Security and access review

- All 13 new tables have RLS enabled.
- No policies were added, so browser clients have no direct access.
- An explicit anonymous insert test is denied.
- Provider credentials are not represented in this schema.
- Service-role/operator access remains a later server-only interface decision.

## Rollback and forward repair

Before any hosted deployment, normal rollback is a git revert. The operator rollback at `supabase/rollbacks/20261006000001_canonical_event_domain_down.sql` was executed successfully against a disposable local database.

Once canonical data exists in a hosted environment, destructive down migration is not the default recovery path. Prefer a corrective forward migration; use the rollback only after confirming there is no data to preserve and obtaining an explicit production-change approval.

## Evidence boundaries and residual risks

1. The schema has not been applied to preview or production and no legacy rows have been backfilled.
2. Direct client access is intentionally unavailable until a later interface defines narrow policies or server-only APIs.
3. Provider identity mappings, observations, result versions, audit history, override metadata, completion holds, and notification outbox remain Slice 1B or later work.
4. The database rejects self-referential advancement and parent links but does not detect longer multi-row cycles; graph validation belongs in the provider-neutral validation layer.
5. Query-plan evidence awaits representative binding, observation, result, and backfill volumes.
6. Generated database types are not currently part of this repository and were not introduced solely for this additive slice.
7. GitHub issue #3 remains open and unmodified. Its completion reconciler depends on later effective-result and audit contracts.
