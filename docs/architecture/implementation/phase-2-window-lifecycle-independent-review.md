# Independent window/lifecycle acceptance review

Date: 2026-10-27. **Verdict: HOLD — three reproducible findings.** No production files changed or commits made.

## Scoped work item and authority

project: BRACKET-FYI

done when:

- [x] Inspect migrations 00005/00006 and lifecycle TypeScript against approved window/P5/P7 contracts.
- [x] Run independent synthetic security/state probes in a uniquely named disposable database.
- [x] Record actionable counterexamples, supporting race evidence, and explicit limitations.

Evidence: this report and `scripts/verify-window-lifecycle-independent-review.py`.

Assigned read-only production review; wrote only these two files. Used the review skill's standards/spec distinction, with the explicit file/spec scope supplied by the requester instead of a branch-diff review. Relevant rules: repository AGENTS/CLAUDE, workspace instructions, approved `docs/architecture/bracket-fyi-spec-v1.0.md`, master spec, and both builder reports. No hosted database, .env.local, provider/network request, transport, production edit or publication.

## Findings — specification/behavior

### WL-01 — P1: deleting the first window preserves its deadline but not its enrollment barrier

**Locations:** `supabase/migrations/20261027000005_window_incarnation_history.sql:71`; surviving `join_event_league` in `20261027000002_prediction_windows.sql:116`.

Approved spec line 79: “No new participants after the first group-window cutoff.” The durable-history repair correctly makes `event_membership_closed` true when a deleted window's earliest deadline elapses. Enrollment does not consult that history: it checks only `locked_at`, status, presence of a live window, and live-window cutoff/state.

Independent reproduction, entirely through service RPCs after fixture creation:

1. Configure first and second windows; first cutoff is one second away, second one day away.
2. Delete first window before its cutoff, using its current version.
3. Cross the stored first cutoff. No owner rewrite of history or locks.
4. Call `join_event_league` with the exact valid invitation.

Observed:

```json
{"probe":"elapsed_history","closed":true,"elapsed":true}
{"probe":"late_enrollment","participants":1}
```

The participant is accepted despite the durable first deadline. This is an integration omission in 00005, not a demonstrated ABA token reuse: token allocation itself passed. It also means the now-incomplete draft cannot simply be rebuilt after expiry, yet continues admitting people.

**Repair:** make enrollment consume the durable first-cutoff closure condition under its existing league lock. Preserve legitimate joins before the first cutoff; do not blindly use the broader prediction/membership-sealed predicate if that would close enrollment immediately after somebody's first pick. Add the deleted-first/live-second regression.

### WL-02 — P2: one invalid pick basis aborts the entire restart-sweep page

**Locations:** `20261027000006_event_lifecycle.sql:139,354-365`; `lib/events/lifecycle.ts:128`.

The builder report says sweep “reports ... per-league invalid-basis failures, continues independent leagues; never clears failed work.” The TypeScript per-item catch cannot provide this when SQL scan itself fails.

Independent reproduction provisions three otherwise valid lifecycle fixtures, adds a synthetic pre-version/legacy pick with `event_configuration_version = NULL` to the first, and calls scan starting just before it. The schema permits that legacy value; no trigger/security function is disabled. Scan eagerly calls `event_lifecycle_basis`, which raises 40001. The whole RPC aborts without rows or a continuation cursor. Capturing the next league independently succeeds.

Observed:

```text
FINDING WL-02: scan aborts entire page on invalid pick basis
healthy_later_league_capture = e5a20000-0000-4000-8000-000000000012
```

`repository.scan` is outside the per-league catch. Restarting from the same cursor repeatedly hits the same poison league, suppressing healthy league reconciliation behind it. This is a recovery/transition robustness defect, **not** evidence that normal `submit_event_window` creates mismatched picks.

**Repair:** isolate basis failures per visited ID in the scanning protocol, preserving cursor progress and marking failed work pending; surface the error per league in the sweep. Add a batch containing invalid and healthy leagues, including expiry-driven work.

### WL-03 — P2: hold expiry recompletes the league without its evaluated-transition audit

**Locations:** `20261027000006_event_lifecycle.sql:39,328-330`.

The approved P7 contract requires auditable completion/reopening and expiry recovery. The builder report also makes `evaluated` audit insertion the future P8 atomic transition-intent seam.

The unique index is permanent on `(league_id,basis_token)` for evaluated rows. A whole basis can legitimately recur; it is not a unique evaluation occurrence.

Independent reproduction:

1. Canonical draw settles a locked league; capture/commit => complete.
2. Insert an active expiring `league_completion_holds` row, which lifecycle explicitly supports.
3. Capture/commit => held.
4. Cross its real DB expiry; capture/commit => complete, `replayed:false`, `coronation:false`.

All three acknowledgments succeed; the reader correctly returns complete and coronation remains one. But the audit contains only:

```json
[
  {"from":"locked","to":"complete"},
  {"from":"complete","to":"held"}
]
```

The held→complete event is absent: the recurring original basis conflicts with the first evaluation and `ON CONFLICT DO NOTHING` silently suppresses it. An AFTER INSERT notification-intent hook would also miss that transition. Merely adding the current generation to the unique key does not address this probe: hold expiry is intentionally detected without incrementing generation.

**Repair:** deduplicate retries of an evaluation occurrence, not every future recurrence of its basis. Preserve the existing locked compare-basis/no-op replay behavior and one-coronation invariant; explicitly regression-test complete→held→expiry→complete audit history.

## Standards/security assessment

No separate documented style violation claimed. These findings concern observable behavior, not test counts.

Checked the installed disposable database ACLs as well as migration source:

- All ten lifecycle internal/public entry functions: zero unexpected anon/authenticated EXECUTE grants.
- Service direct UPDATE of `evaluated_generation`: denied.
- Service history INSERT/UPDATE/DELETE/TRUNCATE: denied.
- New evidence tables use RLS, immutable evidence triggers, and service SELECT-only grants.
- Lifecycle privileged functions use fixed `public,pg_temp` search paths.
- Scoped mutation locks/checks exact organizer credential before private effective reads; release compares canonical as well as effective token. Unchanged retry identity includes actor/request.
- Capture/commit/scan remain trusted service-worker interfaces, **not organizer/browser APIs**. The SQL commit trusts the scorer for score values; this packet does not establish hostile-service isolation. No new finding asserted merely because the trusted service can call commit.

## Positive proof and concurrency scope

Actual local target throughout: Docker `supabase_db_bracket-fyi`, disposable database **`bracket_lifecycle_c47196e972d6`**. No writes to its `postgres` application database.

- Fresh builder harness created this database, applied migrations through 00005, checked missing lifecycle API, then installed 00006. Its first full run timed out on a Docker/psql subprocess before race completion; that failed run is not counted as race acceptance.
- Reused that disposable DB for the independent probe file. DB31 and DB32 supporting regression SQL both passed repeatedly and rolled back.
- Successfully reran both existing barrier harnesses with their connection argv explicitly redirected to this disposable DB:
  - ABA: both stale submit/configure workers observed waiting on database locks; after delete/recreate each rejected 40001. Final version/history/generation/picks = **2/2/4/0**.
  - Lifecycle: precommit rollback, competing override/stale ack, canonical-vs-stale-ack three-league fanout, expiry while waiting for league lock, restart scan, lost-ack replay, one coronation and forward-hold replay all passed.
- Canonical masked correction preserves the effective token while changing provenance/generation; release's separate canonical compare prevents silently releasing an unseen correction.
- Source and tests establish locked→complete→locked invalidation without reopening pick windows. Expired override basis is recomputed after lock acquisition; stale commits reject and safe reads hide stale leaderboard/completion.
- League-first locking in window/mutation/capture/ack paths and sorted fanout avoids an inversion in the tested operations. **No universal deadlock-freedom claim:** multi-contest/multi-league transactions, external owner maintenance, global-control/binding integration and production scale were not exhaustively exercised.
- TypeScript capture/scoring/DTO/sweep code was read; no additional TypeScript runtime or UI acceptance claimed here.

The imported lifecycle harness prints `"database":"postgres"` because its local report label defaults to that string when `--fresh` is omitted. The wrapper announces the actual DB and overwrites `BASE[-d]` before invocation; all its connections used `bracket_lifecycle_c47196e972d6`. This is a harness label limitation, not a connection to the application DB.

Retained supporting-race synthetic leagues: ABA `329e9c65-8f7e-489b-8f63-d9479c95b3be`; lifecycle `f246ed81-0000-4000-8000-000000000011`, `...012`, `...013`. Independent finding fixtures use transactions with explicit ROLLBACK; none retained.

## Reproduction

```text
/Users/yonnasgetahun/clawd/bin/exec -- python3 /Users/yonnasgetahun/bracket-fyi/scripts/verify-window-lifecycle-independent-review.py bracket_lifecycle_c47196e972d6
/Users/yonnasgetahun/clawd/bin/exec -- python3 /Users/yonnasgetahun/bracket-fyi/scripts/verify-window-lifecycle-independent-review.py bracket_lifecycle_c47196e972d6 --barriers
```

The probe is diagnostic: its printed counterexamples are **findings, not passing acceptance tests**. It rejects non-disposable database names. The optional barriers import the existing builder harnesses; the three finding scenarios and their oracles are independently authored. If a new disposable DB is needed, the existing lifecycle `--fresh` harness creates one; use its actual generated name.

## Reviewed fingerprints (SHA-256)

```text
a3be839db1aaed9f7a7efb9b641b8f023a627eb4a98ece4a178dd3de26e05429  20261027000005_window_incarnation_history.sql
55bbb1f26e926041c71ed869ad290d91b5757a5cc11865ba9c1daea67f2362d2  20261027000006_event_lifecycle.sql
e4e0505a9050af0107ff9548d183a962352d39dac6121d897ef64cf68eaa2f6a  lib/events/lifecycle.ts
9d1d98426b153c602b74287b20f1ff0abc29af861074336490e851ca1096fdf4  lib/events/lifecycle-repository.ts
```

The 00005 upgrade limitation remains: previously deleted pre-upgrade cutoff/version history cannot be reconstructed from extant rows; uncertain leagues need the documented hold. Hosted upgrade, older DB29 integration, complete transition matrix, parent UI/job wiring and P8 transport remain outside this acceptance. They are not implicitly certified by successful local probes.

changed: independent review report and diagnostic probe only.
matters: durable history is not yet consumed by every cutoff-sensitive API; recovery and transition evidence have reproducible gaps.
checks: three independent counterexamples, installed ACL checks, supporting DB31/DB32 regressions and deterministic service-role barriers.
risk: findings unresolved; declared integration/upgrade boundaries remain.
verdict: **HOLD for WL-01/WL-02/WL-03 remediation and focused independent recheck.**
