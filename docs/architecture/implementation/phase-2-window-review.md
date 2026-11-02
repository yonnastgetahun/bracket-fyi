# W2-A independent window review

Date: 2026-10-27. Verdict: **iterate** — four concrete findings; O1 forfeit fix accepted within its tested scope.

## Scope and evidence

Reviewed `lib/events/{windows,repository,derivation,outcomes}.ts`, migration `20261027000002_prediction_windows.sql`, pgTAP28, Spec v1.0 §4, engineering execution contract §D (prediction/configuration and durable reconciliation), and W2-A packet. No application/schema changes, migration replay, provider calls, or full-roadmap acceptance. Only this report is written.

Executed through the absolute guarded wrapper (explicit repository cwd for Vitest):

- `./node_modules/.bin/vitest run tests/events/outcomes.test.ts tests/events/windows.test.ts`: **8/8**, including all five outcome tests.
- Existing pgTAP28 via `docker exec -i supabase_db_bracket-fyi psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres`: **25/25**, transaction rolled back.
- Two independent synthetic-fixture SQL probes using that same local DB connection: all commands completed and **ROLLBACK** confirmed. Observations below are actual results, not inferred solely from source.

Migration-history registration remains an owner-reported release gate; not checked/repaired here. No UI wiring or complete lifecycle claim is expected from this packet.

## F1 — High: legacy anon RLS bypasses the new window boundary

**Location:** new migration lines 31–36, 102–114 leave existing `picks` permissions/policies intact; `20260724000002_rls_policies.sql` lines 100–146.

Revoking access to the three new tables and the new RPCs does not prevent direct access to `picks`. Existing organizer-select permits every open pick. Existing participant-update checks only `picks.locked=false`, not the window deadline/freeze or new-format discriminator.

**Independent repro:** create one open W2 window and submit `m1=a`. As `anon`, set `request.headers` to its synthetic organizer token and SELECT `picks`: returned `m1=a` while window was open. Reset role, tighten cutoff to `clock_timestamp()-interval '1 second'` without calling advance; as `anon` with the participant magic token, UPDATE `picks SET team_id='b'`: **UPDATE 1**, readback **m1=b** after cutoff. This path also bypasses generation recording and complete-window validation.

**Impact:** real database/API surface permits embargo violation and retrospective edits even though the new RPC rejects both. This is not a missing UI-integration complaint. It is a reachable retained policy affecting the newly persisted format.

**Guard:** preserve old policies only for leagues without an event evaluation; deny direct new-format pick writes and organizer open-window reads, or explicitly enforce equivalent window authorization/cutoff/ownership in RLS. Use a protected scope helper if anonymous roles cannot read the discriminator table. Test actual `SET ROLE anon` queries, including freeze, cutoff-before-advance, locked league with later open window, and generation unchanged on rejection. Coordinate with the read-security owner.

## F2 — High: sealed configuration is mutable without a new basis or generation

**Location:** migration lines 2–8, 35–36, 82–90; generation trigger covers only windows at 52–57.

`sealed=true` is only a submission precondition. Nothing makes that manifest/version immutable or validates its graph/market shape when sealing; service-role DML is explicitly granted. The only configuration row is overwritten in place.

**Independent repro:** seal version 1 with market choices [a,b], submit a, then UPDATE the sealed manifest to [c,d] without changing version. UPDATE succeeds. League generation was **3 before and 3 after** the configuration change. Submit c using window version 1: succeeds, pick records `event_configuration_version=1`. The same persisted version now denotes different choices and no durable reconciliation obligation accompanied the change.

**Guard:** immutable versioned snapshots once sealed; validated publication/configuration command with ordered scope locks; coherent graph/required/scoring versions; atomically bump affected league generations for permitted basis changes. Reject in-place mutation/unsealing of published versions. Required regression: same-version mutation fails and allowed revision generates durable obligations for every affected league. A sealed boolean alone is not a graph-validation boundary.

## F3 — High: logical market sealing has cutoff and INSERT/DELETE holes

**Location:** migration lines 38–57.

Membership protection applies only to UPDATE and only after `leagues.locked_at` has been physically set. Semantic cutoff and persisted locked state can diverge until advancement. Inserts remain possible even after first lock; deletes have neither a membership guard nor a generation trigger.

**Independent repro:** set w1 cutoff in the past while league `locked_at` remains null; UPDATE `market_ids` from [m1] to [renamed] succeeds and **window version remains 1**. Call advance; it locks the renamed set, leaving the original pick outside that window mapping. INSERT another window containing [new-market] after advancement: **INSERT 0 1**, accepted after first lock.

**Impact:** formerly submitted identities can vanish from `read_event_picks` joins; the full required/scored set can silently expand after sealing. A cutoff/membership update also need not invalidate an expected window version.

**Guard:** seal the complete logical membership before first cutoff, independent of delayed advancement; protect insert/update/delete and immutable window identity/league association; forbid unreviewed additions/removals after seal; version every eligibility-relevant change and record its generation atomically. Serialize window mutation under the same league-first lock order as submissions. Explicit audited dispositions should preserve picks/history rather than deleting/relabeling slots.

## F4 — Medium: NULL expected version bypasses optimistic concurrency

**Location:** migration lines 80–81.

`window_row.version <> p_expected_version` evaluates NULL when the supplied version is NULL; PL/pgSQL IF does not reject NULL. Repository TypeScript types do not validate runtime RPC input.

**Independent repro:** call `submit_event_window(league, valid_participant_token, 'w1', NULL, '{"m1":"a"}')` on a valid open sealed window: succeeds and **one pick inserted**.

**Guard:** explicitly require non-null positive expected version and use `IS DISTINCT FROM`; validate runtime command shape at the repository boundary. Assert NULL returns a conflict/invalid error with zero picks/generation changes.

## Confirmed strengths and limits

- Exact participant+league token selection precedes private submission reads. SQL output and repository pick DTOs contain only participant ID, logical market ID and choice; no token spreading.
- New RPC submission orders league → evaluation → window row locks and samples `clock_timestamp()` after acquisition. Thus its cutoff check is not based on a timestamp captured before a lock wait. Freeze and advancement serialize on league locks. These are source-inspected properties; a two-session barrier race was not executed here.
- Complete pick-set/choice checks precede writes; exceptions roll back partial conflicts. New RPC rejects locked existing picks. Advancement is replay-idempotent in pgTAP28; due windows close without reopening prior picks. Overall event unlock rejection passed.
- Legacy `lock_picks_on_league_lock` behavior for leagues without event evaluations matches the original trigger: lock all picks and set league status locked. No whole-app legacy preservation claim follows from that source comparison.
- Existing pgTAP28 checks own/other/anonymous RPC visibility, bad credential, stale non-null version, freeze, cutoff, join closure and no-reopen. It does not exercise the direct legacy RLS bypass or the sealing holes above. It also is not a two-league concurrency test.
- Token rotation during a wait is not barrier-tested: participant authentication is read before the league lock and never revalidated afterward. Include revocation/rotation ordering in the next race harness; no separate proven finding asserted here.
- Window insert/update and successful submission/freeze record same-transaction generation changes. Config mutation and window DELETE do not have equivalent obligations (F2/F3). Worker/evaluated-basis integration is explicitly outside this packet.

## O1 forfeit disposition

**Accepted:** all five outcome tests passed independently. Missing locked picks are counted wrong before unresolved-result handling, contribute zero maximum, and no longer count pending. Fully forfeited components with unknown worlds contribute known zero. The mixed regression earns 1, maximum 2, wrong 1, pending 1: only the unlocked future window remains pending/optimally selectable. Unknown feasibility for genuinely non-forfeited markets still returns null maximum, correctly avoiding fabricated domains.

This accepts the local scoring fix, not durable lifecycle completion or scoring integration.

## Required next evidence

Repair F1–F4 with forward-safe migration handling, then rerun direct-role negative tests, sealed-manifest/membership/version tests, two-session cutoff/freeze and token-revocation barriers, and two-league isolation. Keep migration history registration, fresh/upgrade rehearsal, UI wiring and lifecycle worker acceptance separately tracked.
