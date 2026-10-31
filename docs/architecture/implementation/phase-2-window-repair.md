# Phase 2 window integrity repair — implementation packet
Requirements: P2/P7/P12, F2/F3/F4; parent BRACKET-PHASE2-DELIVERY authority applies.
Owner/write scope: 00003 migration, matching forward repair, DB29, window repository validation, this report; F1/security excluded.
Done when:
- [x] Sealed configuration versions cannot mutate; validated revisions preserve historical bases and adoption records generation.
- [x] Membership INSERT/UPDATE/DELETE and identities obey semantic cutoff and sealed lifecycle; valid eligibility changes version and generate work.
- [x] NULL/nonpositive expected versions reject atomically under actual service role.
- [x] Regression red/green and deterministic lock evidence recorded; remaining integration gates explicit.
Evidence: DB29 against local synthetic PostgreSQL, current catalog inspection, focused repository tests; independent acceptance remains pending.

Method: diagnose skill; existing three independent reproductions establish causes (missing configuration guards, incomplete membership triggers, SQL NULL comparison). Re-run regression before repair. No historical migration edits, reset, hosted operations, secrets, publication or deployment.

## Implementation delivered (builder evidence, not acceptance)

- `20261027000003_window_integrity_repair.sql`: existing configuration rows retained under `(template_id, version)` primary key. Published snapshots reject UPDATE/DELETE/unseal and service TRUNCATE; publication validates nonempty markets, unique nonempty IDs, window assignments and unique nonempty string choices. Drafts are not usable bases. League/template association cannot reinterpret a saved version.
- Revisions are separate snapshots, **not automatic fan-out**. Each affected league explicitly calls `adopt_event_configuration(league, expectedConfigurationVersion, nextVersion)` before any prediction/first cutoff/seal. Adoption preserves configured membership, increments that league generation and every window version. Unadopted leagues remain pinned to their prior snapshot, so they are unaffected. Historical picks retain their saved configuration version; rebasing after predictions is intentionally held for a future audited disposition workflow.
- `configure_event_window(league,key,expectedVersion,state,cutoff,pairingsReviewed,marketIds,delete=false)` owns service INSERT/UPDATE/DELETE. Expected version 0 means create; existing rows require exact version. It locks league → evaluation → window, matching submission/freeze/advance. Direct service window DML and direct configuration-version/membership-seal evaluation UPDATE are revoked; worker evaluation columns remain granted.
- Membership guard covers INSERT/UPDATE/DELETE, physical lock, semantic deadline sampled after league-lock acquisition, any existing prediction, and explicit persisted membership seal. Window identity is immutable. Every window must exactly project its published manifest membership; complete future-window projection is required before submission/advancement. First successful prediction seals membership. Valid deadline/state/pairing changes increment window version; INSERT/UPDATE/DELETE and revision adoption generate durable work atomically; no-op changes do not.
- Submission explicitly rejects NULL/nonpositive/stale versions with `40001`, reads exactly the league's immutable configuration version and atomically seals membership. Repository rejects null/undefined/noninteger/nonpositive/out-of-PostgreSQL-range runtime versions before RPC.
- Matching forward repair is an idempotent **freeze hold**, not a destructive rollback: preserve snapshots, picks and windows, freeze unfrozen evaluations and generate once. Re-enable only reviewed leagues through existing freeze command.

## Executed evidence — 2026-10-27

All shell commands through `/Users/yonnasgetahun/clawd/bin/exec --`; Python subprocess arrays used because wrapper reparses arguments and resets cwd. SQL target only local `supabase_db_bracket-fyi`, `psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres`. Inspected installed `protect_event_window` and `submit_event_window` before changing them; they matched 00002.

| Check | Actual result |
| --- | --- |
| Initial six-assertion red regression before migration | F2 and all three F3 operations accepted incorrectly (4 red); F4 red initially encountered changed-choice validation from prior F2 mutation, so not counted as isolated F4 proof |
| Isolated historical-submit mutant in rollback-only transaction after repair | NULL-version rejection assertion **failed: no exception**; function restoration and fixtures rolled back; independent F4 red |
| Final `DB29_window_integrity_test.sql` | **47/47 pass**, rollback; actual service-role revision/publication/configuration/submission controls plus owner-level trigger defense, complete projection, semantic-cutoff-only fixture, generation atomicity and two-league isolation |
| Unchanged `28_prediction_windows_test.sql` | **25/25 pass**, rollback |
| Repository regression before validation | **8 failed / 2 passed**, invalid runtime versions reached RPC |
| `vitest run tests/events/repository.test.ts tests/events/windows.test.ts` | **13/13 pass** after fix |
| Focused ESLint repository + repository tests | exit 0 |
| Forward hold replay twice inside rollback-only fixture | **2/2 pass**, first hold increments generation, replay does not; no committed hold |
| `git diff --check` | exit 0 |

### Deterministic two-session barriers

Executed existing `scripts/verify-event-window-races.py` in memory with worker SQL prefixed `SET ROLE service_role`. Second execution replaced the waiting submit call with `configure_event_window(league,'extra',0,'unopened',NULL,false,ARRAY['extra'])` and expected `sealed market membership cannot change`. No new harness file outside ownership was written.

Both use explicit blocker `SELECT ... FROM leagues FOR UPDATE`, confirm the worker is waiting via `pg_stat_activity.wait_event_type='Lock'`, then tighten cutoff to database current time and commit blocker. No sleep-based race assumption. Actual outcomes:

- **PASS submission-after-cutoff barrier:** waiting submission rejected, zero picks. Retained synthetic league `7a833814-bb57-4cca-9e0f-1cc5178b66f6`.
- **PASS membership-insert-after-cutoff barrier:** waiting service configuration command rejected by semantic seal, zero picks. Retained synthetic league `b75e98ac-d3eb-467b-8e44-0a0f7cf06fc6`.

These are intentionally retained synthetic local fixtures, not user data. Token rotation/revocation and freeze races are **not** proven by these two barriers.

## Integration contracts and remaining gates

- 00003 was applied atomically to the running local DB, then its template-association trigger was refined to SECURITY DEFINER with fixed search_path. Source now contains that final definition. Existing migration-history registration is **not** changed here; parent must reconcile history and rehearse fresh/populated upgrades without reset. No claim of full transition acceptance.
- Configuration lookup now requires `(template_id, version)`; a one-row-per-template assumption/upsert conflict target must not survive in future app integration. Caller search found only the bounded migration/test/window SQL paths in current lib/supabase sources.
- Service callers must use the two new commands instead of direct window DML / direct evaluation configuration-version UPDATE. Existing freeze/advance/submit are SECURITY DEFINER and retain operation. Do not broaden grants to restore old bypasses.
- Manifest validator covers the **window persistence manifest** (market IDs/assignments/choices), not the separate complete tournament graph, feasible-world or scoring-manifest validator. Unknown future pairings remain an application/typed-graph integration responsibility; no graph/lifecycle completion claim.
- Post-prediction rebasing, changed logical membership and post-cutoff dispositions deliberately reject; future audited disposition commands must retain prediction/history and coherent required/scored basis, not disable these guards.
- F1 anon direct-picks bypass and identity/security migration 00004/DB30 belong to the security worker. No F1 acceptance asserted here. Re-run combined DB/TS suite after integration. No token-revocation barrier, HTTP/UI/browser, full worker reconciliation or full roadmap acceptance claimed.
- Owner maintenance DML still has trigger defenses but may acquire target row before league lock and receive a deadlock rollback under conflicting owner operations. Ordinary service commands use league-first lock order. No promise that arbitrary superuser DML is an ordered supported API.
- No historical migration file edited, no reset, no hosted/provider/app environment access, no secrets emitted, no commit/push/deploy/spending. Unrelated concurrent edits preserved.

changed: scoped migration/hold, DB29, window repository/runtime tests and this report.
matters: removes demonstrated F2/F3/F4 integrity holes while preserving immutable prior bases and fail-closed unsupported changes.
checks: results above are actual local execution, not independent acceptance.
risk: named integration/transition/security/graph/lifecycle gates remain.
verdict: **independent review required; no builder self-acceptance**.

SHA256 `supabase/migrations/20261027000003_window_integrity_repair.sql`: `93591a6c6aaf2fdb2c6a3f4380fd984935c0d442149f3ac90f3b4d6d34352346`.

SHA256 `supabase/rollbacks/20261027000003_window_integrity_forward_repair.sql`: `df170eac3c4cfdbce01ad4e03e1051a405d71e6b60eb75cd176ff04c76af579d`.

SHA256 `supabase/tests/database/DB29_window_integrity_test.sql`: `68a6bd10954765f3c4a2e28aad1caa880597059fcb5c974c9b0134e2557938ca`.
