# Slice 1C: Result Compatibility and Backfill Evidence

**Date:** 2026-10-08

**Status:** Implemented and verified locally; not deployed

**Evidence ceiling:** Disposable local Supabase database and static/local application verification

## Approval and scope

The product owner approved Slice 1C on 2026-10-08: override metadata, effective-result compatibility contracts, and an idempotent backfill rehearsal.

Included:

- Additive lifecycle, provenance, expiry, release, canonical-result, and audit-link metadata on `league_result_overrides`.
- Automatic organizer-token fingerprinting without retaining another copy of the token.
- A server-only, league-parameterized effective-result resolver.
- A corrected legacy `effective_results` view returning shared results for leagues without overrides.
- One precedence contract across regular-pick and champion scoring.
- Bounded legacy-result backfill tooling, explicit mapping rules, result audit evidence, report counts, a local fixture, and first-run/rerun rehearsal.
- A reviewed down migration and forward-restore rehearsal.

Excluded: provider adapters/calls, credentials, canonical-to-legacy live projection, scheduler activation, lifecycle reconciliation, notification delivery, organizer release UI/routes, deployment, hosted data changes, beta/device testing, and GitHub issue #3 implementation or closure.

## Schema and contract diff

`league_result_overrides` gains 12 additive columns:

1. `status`
2. `reason`
3. `created_by_fingerprint`
4. `result_payload`
5. `replaced_contest_result_id`
6. `created_audit_event_id`
7. `expires_at`
8. `released_at`
9. `released_by_fingerprint`
10. `release_reason`
11. `release_audit_event_id`
12. `updated_at`

Existing overrides migrate to `active`, receive the compatibility reason, copy their winner into `result_payload`, and receive a SHA-256 fingerprint derived from the owning organizer token. Checks enforce lifecycle shape, nonblank reasons, JSON object payloads, fingerprint format, and timestamp ordering. The existing override primary data and unique identity remain unchanged.

New database contracts:

- `resolve_effective_results(league_id)` returns every match for exactly one league. A currently active, unexpired organizer override wins; otherwise the current shared `template_results` row wins.
- `effective_results` keeps the legacy column contract while correcting the prior left-join ambiguity.
- `v_pick_results` and `v_champion_status` now use the same resolver semantics, so released or expired overrides cannot continue affecting scores.
- `backfill_legacy_template_results(template_id)` is a bounded operator function. It creates version-one canonical results plus append-only audit events only for explicitly linked and unambiguously mapped rows.

No table, ID, pick, shared result, override, or score is renamed or deleted.

## Backfill safety and rehearsal

The operator script requires one reviewed template UUID. There is no unbounded default. Eligibility requires:

1. `template_matches.contest_id` links the legacy match to a canonical contest.
2. Exactly one contest entry maps the legacy winner through `contest_entries.metadata.legacy_team_id`.
3. Other linked legacy sources do not disagree about the canonical winner.
4. No unrelated canonical result history already exists for the contest.

The pgTAP rehearsal deliberately included one eligible and one unlinked result:

| Run | Scanned | Eligible | Inserted | Already backfilled | Skipped unlinked |
|---|---:|---:|---:|---:|---:|
| First | 2 | 1 | 1 | 0 | 1 |
| Replay | 2 | 1 | 0 | 1 | 1 |

It also proved that the original template, match, pick, shared-result, and override UUIDs remained unchanged; the active override still determined scoring; and the canonical result had one matching audit event.

The standalone operator-script rehearsal used a separate synthetic fixture:

| Run | Scanned | Eligible | Inserted | Already backfilled |
|---|---:|---:|---:|---:|
| First | 1 | 1 | 1 | 0 |
| Replay | 1 | 1 | 0 | 1 |

## Query-plan review

The first view implementation used a lateral function scan and showed an avoidable all-league outer scan. Before acceptance, the view was changed to direct joins so `league_id` and `template_id` predicates push into indexed relations.

The final one-row synthetic plan used:

- `leagues_pkey` for the league;
- `template_matches_template_id_idx` for matches;
- `league_result_overrides_effective_idx` for active overrides.

Observed local execution was 0.145 ms with six shared-buffer hits. PostgreSQL chose a sequential scan for the one-row `template_results` fixture; the existing unique `template_match_id` index remains available at representative volume. Production-volume plan evidence remains a pre-deployment requirement.

## Security and grants

- `league_result_overrides` retains its existing RLS posture and organizer-read policy; no new policy or browser write grant was added.
- `resolve_effective_results` and the `SECURITY DEFINER` backfill function revoke execution from `public`, `anon`, and `authenticated` and grant it only to `service_role`.
- The backfill function has a fixed search path, requires a non-null template ID, performs no name guessing, and writes canonical result plus audit event in one transaction.
- Organizer tokens are neither copied nor returned. Only lowercase 64-character SHA-256 fingerprints are stored.
- No provider secret, participant token, push endpoint, or raw provider payload was introduced.

## Verification results

| Check | Result | Evidence level |
|---|---|---|
| Fresh `supabase db reset --local` | Pass: all eight migrations replayed | Local database |
| Database pgTAP suite | Pass: 15 files, 106 assertions | Local database integration |
| `supabase db lint --local --level warning` | Pass: no schema errors | Local database static analysis |
| Backfill operator script, first run | Pass: inserted one of one eligible result | Disposable local database |
| Backfill operator script, identical replay | Pass: inserted zero; reported one already backfilled | Disposable local database |
| Rollback rehearsal | Pass: 12 columns and both Slice 1C functions removed; legacy template and canonical contest retained | Disposable local database |
| Forward restore after rollback | Pass: reset and all 106 database assertions passed | Disposable local database |
| `npm test` | Pass: 6 files, 22 tests | Static/local with mocked application database boundary |
| `npx tsc --noEmit` | Pass | Static/local |
| `npm run lint` | Pass: 0 errors; 10 pre-existing warnings | Static/local |
| `npm run build` | Pass: Next.js 16.3.8 webpack production build | Static/local |

## Rollback and forward repair

Before deployment, apply `supabase/rollbacks/20261008000001_effective_result_compatibility_down.sql` or revert the commit. The down migration restores the prior result/scoring views, drops the two Slice 1C functions, trigger, partial index, and 12 override columns.

The rollback intentionally does not delete canonical result or audit rows produced by a separately authorized backfill. Once such rows exist outside a disposable environment, disable further backfill and use a reviewed forward repair rather than erasing append-only evidence.

## Evidence boundaries and residual risks

1. No hosted migration or production-data rehearsal occurred.
2. Override release/expiry mutation routes and required audit-event creation remain Slice 4B work; Slice 1C establishes metadata and read precedence only.
3. The compatibility path still reads shared outcomes from `template_results`; live canonical-to-legacy projection remains a later slice.
4. Backfill requires reviewed template/contest and `legacy_team_id` mappings. Current catalog templates are intentionally not auto-linked or guessed.
5. Query-plan evidence is synthetic, not representative production volume.
6. GitHub issue #3 remains open and unmodified; lifecycle reconciliation is not part of this slice.
7. No provider call, scheduler, notification, beta, physical-device test, deployment, or production acceptance occurred.
