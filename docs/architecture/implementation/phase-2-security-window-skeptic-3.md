# Independent skeptic 3 — security batch and windows

2026-10-27. **Verdict: iterate.** Independent source inspection and actual local PostgreSQL probes. No application/schema edits, provider calls, credentials, or real-data inspection. Only this report is written. All fixtures are synthetic and transaction-local. Successful probes ended `ROLLBACK`; the first exploratory probe encountered a permission exception and its uncommitted transaction rolled back on connection exit. It was rerun with caught exceptions and explicit `ROLLBACK`.

## Scope / acceptance criteria

- [x] Attempt to falsify SEC-01/02/03/GAP-01 and F1–F4 using actual guards.
- [x] Exercise direct anon privileges and distinguish service-only defects from browser paths.
- [x] Check rejected command writes, manifest sealing, cutoff-before-sweep behavior, and NULL version.
- [x] Identify baseline gaps separately from changed-code regressions.

Repository root: `/Users/yonnasgetahun/bracket-fyi`. All shell invocations used `/Users/yonnasgetahun/clawd/bin/exec --`; source and output paths were absolute because the wrapper resets cwd. SQL was sent through Python subprocess stdin to `docker exec -i supabase_db_bracket-fyi psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres`. No shell credential loading. Fixtures were taken only from the INSERT setup of `/Users/yonnasgetahun/bracket-fyi/supabase/tests/database/28_prediction_windows_test.sql`, replacing UUID prefix `b2800000` with `b2830000`; identity fixture used the INSERT setup of test 17 with prefix `97300000` and unique `skeptic3-` keys. No global application-row reads: fixture queries were scoped to synthetic IDs. Catalog queries inspected object definitions/grants only.

## Disposition summary

| Finding | Skeptical disposition | Evidence strength / classification |
|---|---|---|
| SEC-01 | Retain | Source-level unconditional provenance laundering; service boundary, changed code |
| SEC-02 | Retain | Actual automatic mapping with `{}` metadata projected a canonical name change; baseline |
| SEC-03 | Retain | Actual anon join-token reads organizer and both participant magic tokens; baseline |
| GAP-01 | **Narrow** | Three scoring views blocked by function EXECUTE revocation; `effective_results` still bypasses league RLS; baseline |
| F1 | Retain | Actual anon organizer reads open picks; magic-token direct update after deadline; retained baseline policy newly applicable to windows |
| F2 | Retain | Actual service-role sealed manifest mutation, unchanged generation/version, new choice accepted |
| F3 | Retain | Actual after-cutoff membership rewrite, orphan unlocked pick, post-lock INSERT, DELETE without generation |
| F4 | Retain | Actual NULL version submission inserts two picks and bumps generation |

## SEC-01 — attempts to disprove fail, but authority is limited

Inspected `/Users/yonnasgetahun/bracket-fyi/lib/ingestion/identity/repository.ts:84` and `:150`: `recordAutomatic` spreads caller metadata then overwrites `normalizationPolicyVersion` and `verifiedDeterministicBootstrap: true`. Thus caller false does not protect the boundary. `toCanonicalRef` only requires true plus a nonblank policy string. The standalone resolver requires that provenance, but the repository itself manufactures it. The existing `/Users/yonnasgetahun/bracket-fyi/tests/ingestion/identity/repository.test.ts` explicitly supplies `metadata: {}` and expects the verified flag. A normalization version is not proof that the proposed external-ID/canonical-ID association was derived by a trusted bootstrap.

Counterguards: DB mapping logic checks target/binding eligibility and disallows conflicting replacement; neither proves the first association correct. Actual catalog `has_function_privilege('anon', oid, 'execute')` was false for `upsert_provider_entity_mapping`. This is **not an anonymous RPC exploit**. I did not execute TypeScript or claim a live provider path; source reachability plus SEC-02's actual permissive initial-mapping probe establish the boundary concern.

## SEC-02 — actual SQL acceptance of unverified automatic mapping

Inspected `/Users/yonnasgetahun/bracket-fyi/lib/ingestion/orchestrator/observation-dispatch.ts`: normalized contract validation and evidence recording precede structural/result repository dispatch, but no `resolveIdentity` call intervenes. Shadow mode skips projection, a real guard; write mode is reachable. `/Users/yonnasgetahun/bracket-fyi/supabase/migrations/20261009000004_slice_2b_r2_acceptance.sql:232` accepts automatic/reviewed root status, and `:304`, `:333`, `:356` use the same status rule for parents.

Independent rollback probe, using test 17's synthetic provider/binding/run/competitor prerequisites:

```sql
select outcome from upsert_provider_entity_mapping(
 '97300000-0000-4000-8000-000000000009','competitor','wrong-team',
 '97300000-0000-4000-8000-000000000005','automatic',0.99,null,null,'{}');
-- created; stored resolution_status=automatic, metadata={}
```

Recorded a valid partial `competitor` observation for `wrong-team`, with standard contract envelope, synthetic payload, `canonicalName: SYNTHETIC unverified projection`, and a 64-character semantic hash. Passed its observation ID directly to `project_structural_observation`: **outcome projected**. Scoped canonical read returned **SYNTHETIC unverified projection**. Entire transaction rolled back. This defeats the proposed counterargument that a later SQL gate rejects the missing provenance. Both mapping and projection RPCs deny anon EXECUTE: service ingestion defect, not browser authority. Baseline implementation gap, not introduced by the new TS gate.

## SEC-03 — actual grants make baseline exposure reachable

Catalog results: anon has SELECT/INSERT/UPDATE table privileges on `leagues`, `participants`, and `picks`. RLS still constrains rows, but not columns. Under `SET LOCAL ROLE anon` and synthetic `x-league-token`:

- Scoped league query comparing `organizer_token` to known synthetic value returned **true**.
- Scoped participants query `count(magic_token)` returned **2**, exposing both fixture credentials to invitation authority. `push_subscription` is selectable; these fixtures have NULL values, so no nonnull push payload leak was claimed.
- Invitation-only INSERT into Q's participant pick succeeded for slot `injected`, choice `not-a-choice`, despite no participant magic token. Scoped pick count **1**, evaluation generation remained **2**. This independently establishes missing participant ownership and window complete-set validation. Cross-league insertion was not tested.

The route DTOs cannot constrain this direct table surface. Policies are in `/Users/yonnasgetahun/bracket-fyi/supabase/migrations/20260724000002_rls_policies.sql:60–146`. Actual local reachability is proven; hosted/deployed grants were not inspected.

## GAP-01 — materially narrower than an unrestricted scoring-view leak

Catalog: all four views owned by postgres, empty `reloptions` (no security_invoker), anon SELECT true. However, actual tokenless SELECT on each of `v_pick_results`, `v_leaderboard`, `v_champion_status` failed with **permission denied for function resolve_effective_results**. Catalog independently confirms anon lacks EXECUTE on that function. These are real counterguards: broad SELECT alone does **not** prove those three views disclose picks in this local DB. A future function-grant change could reopen exposure, but it is not today's demonstrated exploit.

`effective_results` is a separate plain join over leagues/template matches/results/overrides. Created one synthetic template match; with anon and empty request headers, scoped base `leagues` count was **0**, while scoped `effective_results` count was **1**. Thus owner-rights league/result-association disclosure remains reachable. No synthetic winner/override was inserted, so the result demonstrates row/association bypass, not a claim that private picks or actual result values were leaked. Retain GAP-01 only with these per-view distinctions.

## Window probes — F1/F2/F3/F4

Fixture: sealed version 1, w1 open tomorrow, markets m1/m2, valid P/Q participant credentials. Initial generation **2**.

### Negative controls / no writes on rejection

Caught SQL exceptions inside PL/pgSQL subtransactions (not client-side mocks): stale nonnull version 2 and partial submission each rejected; afterward **picks=0, generation=2**. NULL expected version then accepted a full submission: **picks=2, generation=3**. This isolates F4 from incomplete-set/auth failures. The existing comparison `window_row.version <> p_expected_version` is NULL, which does not enter IF; use explicit nonnull validation / `IS DISTINCT FROM`.

A second transaction submitted valid picks, then changed configuration and resubmitted as below. After cutoff was tightened to `clock_timestamp()-interval '1 second'`, generation was **5**, m1 was **c**. Valid RPC attempt to change m1 to d threw `40001 window unavailable or stale`; afterward generation **5**, choice still **c**. Thus rejection did not modify the prior pick or generation. Cutoff enforcement does not require the sweep.

### F1 direct-role counterpath

With organizer header while open, anon SELECT returned **2 picks**, whereas the RPC privacy controls in test 28 deny other participants/no-token open reads. After elapsed cutoff and **before** advancement, anon with P magic token executed `UPDATE picks SET team_id='d' WHERE ... slot_id='m1'`: **UPDATE 1**, readback d, generation still **5**. The new event-table/RPC grants do not protect the older picks table. Baseline RLS now bypasses new-format embargo, clock cutoff, and durable generation accounting.

### F2 sealed version is not immutable

After first valid submit (generation 3), `SET LOCAL ROLE service_role`, then:

```sql
update event_template_configs
set manifest=jsonb_set(manifest,'{markets,0,choices}','["c","d"]')
where template_id='b2830000-0000-4000-8000-000000000001';
```

**UPDATE 1**. Readback: version **1**, sealed **true**, generation **3**. Submission of m1=c/m2=home at expected window version 1 succeeded; stored m1 choice **c**, `event_configuration_version=1`. This disproves an implicit immutable-seal guard, without requiring postgres superuser mutation: actual service-role DML sufficed. An untrusted anon cannot mutate this table (catalog privileges false); the issue is integrity of authorized configuration workflows.

### F3 logical membership vs delayed materialization

After deadline elapsed, league not yet advanced, changed w1 market_ids to `[renamed,m2]`: **UPDATE 1**, version remained **1**. `advance_event_windows` returned **1**; scoped read showed **m1 locked=false, m2 locked=true**. The old slot has left the mapping and escaped that sweep. Membership UPDATE protection checks persisted league locked_at, not semantic deadline.

After advancement, service role inserted `extra` with `[new-market]`: **INSERT 0 1**. Generation reached **8**. Service-role DELETE of extra: **DELETE 1**, generation stayed **8**. INSERT duplicate/overlap protection is real but irrelevant for unique new markets; DELETE has neither corresponding guard nor generation trigger. No claim that a browser can directly mutate window tables.

### Cutoff versus sweep / concurrency limitation

The rollback probes explicitly exercise the hazardous interval **deadline elapsed, sweep not yet run**: protected RPC rejects without writes, direct picks UPDATE and membership mutation succeed; sweep then locks only the renamed membership. Source inspection shows RPC locks league → evaluation → window before `clock_timestamp()`, and advance/freeze serialize on league lock. This supports the intended RPC ordering, not a claim that all writer paths share it.

**No two-session barrier race was executed.** The existing `/Users/yonnasgetahun/bracket-fyi/scripts/verify-event-window-races.py` commits and retains its fixtures, so it was deliberately not run under this assignment's rollback-only rule. New transaction-local fixtures cannot be seen by another independent session before commit. Token rotation across a wait and true overlapping admin mutation remain unverified; do not count this report as barrier-race acceptance.

## Additional verification and boundaries

Executed the unchanged absolute `/Users/yonnasgetahun/bracket-fyi/supabase/tests/database/28_prediction_windows_test.sql` through the local psql invocation: **25/25 pass, ROLLBACK**. Includes invalid credential, stale version, partial submission, own/other/no-token reads, freeze, deadline, no postponed cutoff, join closure, replay-idempotent advancement and no reopening. Its passing result does not cover the exploit probes above.

SEC-02/03 and narrowed GAP-01 are baseline gaps. SEC-01 is new provenance behavior. F2–F4 are new window-boundary defects; F1 is retained old policy newly reachable for new-format data. No deployment, migration-history registration, fresh upgrade rehearsal, HTTP PostgREST, browser/RSC, worker or lifecycle acceptance claimed.

changed: only this independent evidence report.
matters: confirms seven boundary findings while correcting overbroad scoring-view exploitability.
checks: scoped actual-role rollback probes; SQL projection counterexample; pgTAP28 25/25.
risk: no hosted verification or two-session barrier; SEC-01 TS behavior source-inspected, not separately executed.
verdict: **iterate**.
