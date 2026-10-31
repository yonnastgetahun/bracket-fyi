# WPR1 durable window incarnation repair

Date: 2026-10-27. **Builder delivery: implemented; independent review pending.** No self-acceptance.

## Work item (written before coding): BRACKET-WPR1

project: BRACKET-FYI
done when:

- [x] DB31 fails against installed prior schema and passes after additive migration, using actual service_role.
- [x] Recreation never reuses exposed versions; earliest cutoff survives deletion, adoption and advancement; supported draft rebuild remains.
- [ ] Stale configure/submit, history DML, first-prediction and elapsed-cutoff controls reject atomically; existing window suites pass.

Evidence: DB31 and race results below. The last criterion remains open **only for DB29's three obsolete literal version assumptions**; behavior controls pass in a temporary, corrected copy. DB29 is outside this builder's exclusive write scope.

Read approved spec/plan, project AGENTS, postrepair review and both independent WPR1 skeptic reports. Applied diagnose skill's real-seam red/green procedure; cause/hypothesis work was already adjudicated by the two independent reproductions. No new permission gate.

## Changed / mechanism

Exclusive repository writes:

1. `supabase/migrations/20261027000005_window_incarnation_history.sql`
2. `supabase/rollbacks/20261027000005_window_incarnation_history_forward_repair.sql`
3. `supabase/tests/database/DB31_window_incarnation_history_test.sql`
4. `scripts/verify-window-incarnation-races.py`
5. This report.

No historical migration, shared `lib/events`, other source/docs, configuration, commit or push changes.

Additive ledger `event_window_incarnation_history(league_id,window_key,last_version,earliest_cutoff)`:

- Seeded from all **3 extant local windows**, under a table lock, in one transaction.
- Retained across physical window deletion; league lifecycle owns ledger lifetime through its FK.
- INSERT allocates previous last version + 1, ignoring a caller-supplied/default window version.
- Existing guard retains normal UPDATE/adoption/advancement version rules. Its transactional upsert records **every** version/cutoff-changing path, not only configure.
- Retained non-null deadline rejects later **or null** recreation, including an unopened/null detour. Equal/earlier recreation succeeds before membership closes.
- Membership helper also considers elapsed retained deadlines while the window is absent. Deleting before cutoff and waiting cannot erase semantic closure or allow subsequent configuration adoption.
- League-first/evaluation-first serialization is unchanged. Failed validation, SQL rollback and no-op operations preserve expected history/generation semantics.
- RLS enabled; PUBLIC/anon/authenticated/service DML revoked; service gets SELECT only. Internal allocator trigger is security-definer with fixed search_path, with direct EXECUTE revoked, including service.
- Forward repair freezes evaluations with one generation increment only for newly frozen rows. It preserves all history and never reintroduces the old allocator.

## API / compatibility

**No RPC signature changes.** Configure still requires expected version **0 only when absent**, and the exact current positive version when present. Submission still takes the same integer expected version.

Behavioral contract correction: a recreation no longer implies version 1. Consumers must read the returned/current row version rather than assume a reset. The configure RPC still returns void; read the window through the existing reader. Stale configure and submit calls return 40001. Historical later/null deadlines reject 23514; elapsed historical membership can reject first with the existing sealed-membership message.

Unscheduled draft delete/rebuild remains supported; a never-scheduled draft can still have null cutoff. Once a logical key has stored a deadline, an unopened recreation must retain that deadline or tighten it. No reviewed rescheduling override was introduced.

## Actual verification

All shell operations used absolute `/Users/yonnasgetahun/clawd/bin/exec`. Python helpers wrote/read SQL and used subprocess argument arrays and stdin, avoiding shell SQL quoting. Only `docker exec -i supabase_db_bracket-fyi psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -At` accessed DB. No reset, migration-history registration, hosted operation, network/provider call or activation.

| Check | Actual result |
| --- | --- |
| Initial DB31 before repair, actual service_role | **11 failed / 32 assertions**, explicit ROLLBACK. Captured reset-to-1, successful later recreation, stale configure v1 accepted, stale submit v1 accepted and one persisted pick inside the rolled-back fixture. |
| Same initial DB31 after migration | **32/32 pass**, ROLLBACK. |
| Expanded final DB31 | **68/68 pass**, ROLLBACK; synthetic template residue 0. |
| Deterministic actual-service race | **PASS**: submit and configure both observed waiting on DB locks while deletion transaction held the league; recreation committed; both queued old-v1 requests rejected 40001. Version/history/generation/pick-count = **2/2/4/0**. |
| Unchanged test 28 | **25/25 pass**, ROLLBACK. |
| Unchanged DB29 | **44/47 pass**, three stale fixture expectations detailed below. Not claimed green. |
| Temporary DB29 copy with three literal corrections | **47/47 pass**, ROLLBACK. Repository DB29 untouched. |
| Unchanged test 30 | **54/54 pass**, ROLLBACK. |
| Seed/current ledger and forward hold/replay probe | **4/4 pass**, ROLLBACK. All extant rows match history; hold adds exactly one obligation; replay adds zero. |
| Final catalog check | 4 retained ledger rows, **0 missing/mismatched** live histories; trigger security-definer and fixed search_path confirmed. |
| Python race-script AST / scoped trailing whitespace / git diff --check | Pass. |

Final DB31 covers v1 and higher-v2 stale replay, repeated rebuilds, adoption before deletion and while absent, equal/earlier deadlines, direct history INSERT/UPDATE/DELETE/TRUNCATE denial, anonymous/authenticated visibility/configure denial, bad credential/choice, legitimate fresh submissions, first-prediction seal, advancement version/deadline tracking, SQL rollback, no-op generation, post-trigger row-CHECK rollback, elapsed-cutoff no-picks and deleted-history expiry.

Clock-only expiry control waits at most approximately 2 seconds against the actual stored deadline; it is not used for concurrency ordering. Race ordering uses observed `pg_stat_activity.wait_event_type='Lock'`, not sleeps.

Reproduce final regression:

```text
/Users/yonnasgetahun/clawd/bin/exec -- python3 /tmp/bracket-wpr1-run.py /Users/yonnasgetahun/bracket-fyi/supabase/tests/database/DB31_window_incarnation_history_test.sql green
/Users/yonnasgetahun/clawd/bin/exec -- python3 /Users/yonnasgetahun/bracket-fyi/scripts/verify-window-incarnation-races.py
```

The temporary runner pipes the named SQL file to the exact local psql argv above and exits nonzero for SQL errors **or** TAP `not ok`. Repository DB31 is self-contained and can also run through the normal Supabase DB test harness.

Local evidence logs: `/tmp/DB31_window_incarnation_history_test-red.log`, `/tmp/DB31_window_incarnation_history_test-green.log`, `/tmp/DB29_window_integrity_test-regression.log`, `/tmp/DB29_wpr1_compatible-verify.log`, `/tmp/WPR1_upgrade_hold-verify.log`.

Race fixture retained for inspection, as documented by harness: league `2f01cabc-527d-4e64-97ef-6d8fcc9d5400`, name `SYNTHETIC DB31 ABA race`. It has no picks. No destructive cleanup performed.

## Required parent integration: DB29 literals

Do **not** weaken allocation to preserve old test literals. Three edits needed in `supabase/tests/database/DB29_window_integrity_test.sql`, outside assigned write scope:

- Assertion “basis adoption invalidates prior window version”: expected **2 → 3**. Draft creates v1, rebuild creates v2, adoption creates v3.
- “semantic cutoff alone blocks service deletion”: expected configure token **3 → 4** for league ending `000005`.
- “semantic cutoff alone blocks service membership change”: same token **3 → 4**. The explicit cutoff UPDATE increments adopted v3 to v4.

Without these corrections the last two probes stop at stale-version 40001 instead of reaching their intended membership 23514 barrier. A temporary copy with exactly these corrections passes all 47 assertions. Full DB suite is **not** claimed green until the parent reconciles this fixture and reruns it.

## Upgrade limitation / safety hold

The additive migration captures only extant rows' current versions/cutoffs. **Already-deleted pre-upgrade histories cannot be reconstructed from these rows.** Nor can it infer an earlier incarnation's tighter deadline if that was already bypassed before upgrade. Therefore this repair prevents future loss; it does not retroactively authenticate missing history.

Before any existing affected league is activated, inventory configuration/audit evidence for prior deletion/recreation. Keep uncertain leagues held using the forward-repair freeze, or use a newly provisioned/disposed test league according to reviewed ownership policy. Do not synthesize guessed historic maxima/deadlines or describe the upgrade as a complete historical repair. The local existing rows were seeded, not certified against unrecorded history.

No hosted upgrade, fresh full-install rehearsal, application caller/UI acceptance or full-roadmap acceptance is claimed. Integer exhaustion fails closed rather than wrapping/reusing a token. Owner-level destructive maintenance remains outside service-role protections.

## Fingerprints (SHA256)

```text
a3be839db1aaed9f7a7efb9b641b8f023a627eb4a98ece4a178dd3de26e05429  20261027000005_window_incarnation_history.sql
0b95f4a016dd57dd821fa28617b5bd5433d262f2ea903a3ec40f6097aee53434  20261027000005_window_incarnation_history_forward_repair.sql
f3df0a6833c35668b07c04254bb271ce92259fb51cdbceea2082a6bcdf1de0b2  DB31_window_incarnation_history_test.sql
01d57a8bb6f465c2f78571d2ff3946835f20ff0989773982415a09d6e0dc0d8a  verify-window-incarnation-races.py
```

changed: durable logical-window history, additive migration/hold, real service-role regression and race harness.
matters: stale tokens cannot resurrect and deadline history cannot disappear through supported draft rebuild.
checks: final DB31 68/68, race PASS, test28 25/25, test30 54/54, hold 4/4; DB29 raw 44/47 / compatible temporary copy 47/47.
risk: DB29 integration edits, independent review and unrecoverable pre-upgrade history remain explicit.
verdict: **HOLD for independent review and DB29 fixture reconciliation; builder does not self-accept.**
