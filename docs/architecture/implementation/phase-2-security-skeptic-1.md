# Phase 2 security skeptic 1 — direct SQL boundary review

2026-10-27. Independent skeptic **1 of 3**, not three-review acceptance. Scope: SEC-01/02/03, GAP-01. Verdict: **ITERATE**.

## Work item / done criteria

- [x] Challenge identity laundering and authoritative SQL projection independently.
- [x] Inspect actual local privileges, roles and views; challenge credentials/private data with original synthetic tenants.
- [x] Roll back fixtures; write only this report. No schema/code repairs, provider/network calls or deployment claims.

## Results

| Finding | Skeptic disposition | Actual evidence |
|---|---|---|
| SEC-01 HIGH | Not disproved; reproduced in current TS | In-memory transpilation of actual repository and resolver; echo RPC stub. False bootstrap flag became true; unsupported policy sentinel and unrelated external ID resolved automatically to synthetic wrong target. This proves repository/resolver behavior, not actual persistence of that particular TS call. |
| SEC-02 HIGH | Not disproved; reproduced through local service RPCs | `SET LOCAL ROLE service_role`; mapping RPC created automatic organization reference with **empty metadata**. Valid observation envelope recorded, public structural wrapper returned **projected**, canonical organization name became synthetic sentinel. Rollback and zero residual provider fixture. |
| SEC-03 HIGH | Not disproved; direct local anon exposure and writes reproduced | Join-only header yielded organizer token, participant magic token and push subscription sentinel. Anon inserted a pick for another participant with no magic credential, then a mismatched participant from tenant B into tenant A. Both inserts succeeded; privileged count confirmed two rows before rollback. |
| GAP-01 | **Narrow the claim: mixed evidence** | Actual owner-rights/grants confirmed. All three tested pick/champion/leaderboard queries failed on execute privilege for `resolve_effective_results`, so private-pick view exposure was **not reproduced**. `effective_results` did expose the synthetic league's match row without any token, to both anon and authenticated. |

## Actual local permissions and controls

Target: existing Docker container `supabase_db_bracket-fyi`, database `postgres`, through guarded Python subprocess piping SQL to `docker exec -i … psql -X -U postgres -d postgres -v ON_ERROR_STOP=1`. No deployed endpoint inspected.

Catalog inspection:
- `leagues`, `participants`, `picks`: RLS enabled; SELECT granted to anon and authenticated.
- `effective_results`, `v_pick_results`, `v_champion_status`, `v_leaderboard`: owner postgres, null reloptions (no security_invoker), SELECT granted to anon and authenticated.
- anon/authenticated: neither superuser nor BYPASSRLS. postgres: BYPASSRLS true.
- Actual policy text matches legacy token policy, including join-token-only pick INSERT and unrestricted credential columns.
- `upsert_provider_entity_mapping`: EXECUTE false for anon/authenticated, true for service_role. SEC-01/02 remain service/internal integrity findings, **not anonymous RPC attacks**.

Protections that resisted the challenge:
- With no headers, anon read zero synthetic league rows and zero synthetic picks from base tables.
- With join-only header, anon still read zero unlocked synthetic picks from the base table.
- Unsupported observation normalization version `anything` was rejected by `validate_slice_2b_normalized_snapshot` (“normalized snapshot envelope is invalid”). SEC-02 reproduced using the supported envelope version, while mapping metadata stayed empty. Therefore the finding is absent *mapping provenance* enforcement, not absence of all observation validation.
- The three score/pick views' function-execution denial is a real current boundary; do not claim that granting SELECT alone establishes exploitable private-pick disclosure in this database. No function grants were altered to make the attack work.

## Source trace / disproof analysis

All source paths under `/Users/yonnasgetahun/bracket-fyi/`:
- `lib/ingestion/identity/repository.ts:150–164` overwrites false provenance; `:84–98` turns stored booleans/nonempty versions into provenance.
- `lib/ingestion/identity/resolve.ts:85–104` accepts that provenance, including unsupported version text in direct repository echo challenge.
- `lib/ingestion/orchestrator/observation-dispatch.ts` invokes structural/result repository paths directly, with no resolveIdentity gate.
- `supabase/migrations/20261009000004_slice_2b_r2_acceptance.sql:232–241` checks automatic/reviewed status; parent lookups at 304/333/356 use the same status criterion. Executed local structural RPC confirms the root path, rather than merely trusting migration text. Parent branches were inspected, not separately exercised.
- `supabase/migrations/20260724000002_rls_policies.sql:60–86` exposes complete admitted league/participant rows; row-level predicates do not remove bearer columns. Pick INSERT predicate checks the destination league join token, not participant ownership or participant/league consistency.

SEC-03 escalation to organizer/other participant is strongly supported by exposed bearer values but no downstream application mutation using stolen credentials was attempted. GAP-01 effective-results disclosure here is match/league linkage, not proof of a secret winner override or private-pick leak.

## Observed result summary

```text
no_token_base: leagues=0 picks=0
effective_results_no_token: count=1
v_pick_results: permission denied for function resolve_effective_results
v_champion_status: permission denied for function resolve_effective_results
v_leaderboard: permission denied for function resolve_effective_results
join_credential_exposure: organizer_exposed=t
join_participant_exposure: magic_exposed=t push_exposed=t
join_private_base_guard: count=0
anon same-tenant non-owner INSERT: INSERT 0 1
anon cross-tenant participant INSERT: INSERT 0 1
authenticated_effective_results: count=1
forged_persisted_within_transaction: count=2
ROLLBACK; fixture_cleanup: count=0

service mapping: created | automatic | {}
service structural projection: projected
unverified_canonical_write: t
ROLLBACK; fixture_remaining: 0
TS echo: flag=true; status=automatic; canonicalId=synthetic-wrong-target
```

First view batch aborted on denied function execution; connection close rolled back. Re-run isolated each denial using savepoints and explicit final rollback. Projection setup's first attempt lacked required season_label; next rejected unsupported observation version; both disconnected with uncommitted transactions. Final valid fixture completed and rolled back. No real tenant rows or credentials were selected/output; all row probes restrict original synthetic UUIDs.

## Reproduction SQL: tenant policies

Original fixtures and probes (executed via stdin; expected view errors contained by savepoints):

```sql
begin;
insert into templates(id,name,type) values('bc010000-0000-4000-8000-000000000001','skeptic1 synthetic','bracket');
insert into template_matches(id,template_id,round,match_number,home_slot,away_slot) values('bc010000-0000-4000-8000-000000000002','bc010000-0000-4000-8000-000000000001',1,1,'a','b');
insert into leagues(id,name,template_id,join_token,organizer_token) values
('bc010000-0000-4000-8000-000000000010','skeptic1 A','bc010000-0000-4000-8000-000000000001','bc010000-0000-4000-8000-000000000011','bc010000-0000-4000-8000-000000000012'),
('bc010000-0000-4000-8000-000000000020','skeptic1 B','bc010000-0000-4000-8000-000000000001','bc010000-0000-4000-8000-000000000021','bc010000-0000-4000-8000-000000000022');
insert into participants(id,league_id,display_name,magic_token,push_subscription) values
('bc010000-0000-4000-8000-000000000030','bc010000-0000-4000-8000-000000000010','synthetic A','bc010000-0000-4000-8000-000000000031','{"endpoint":"SYNTHETIC_PUSH"}'),
('bc010000-0000-4000-8000-000000000040','bc010000-0000-4000-8000-000000000020','synthetic B','bc010000-0000-4000-8000-000000000041',null);
insert into picks(league_id,participant_id,slot_id,team_id) values
('bc010000-0000-4000-8000-000000000010','bc010000-0000-4000-8000-000000000030','bc010000-0000-4000-8000-000000000002','SYNTHETIC_PRIVATE'),
('bc010000-0000-4000-8000-000000000010','bc010000-0000-4000-8000-000000000030','champion','SYNTHETIC_CHAMPION');
set local role anon;
set local request.headers='{}';
select 'no_token_base' test,(select count(*) from leagues where id='bc010000-0000-4000-8000-000000000010') leagues,(select count(*) from picks where league_id='bc010000-0000-4000-8000-000000000010') picks;
select 'effective_results_no_token' test,count(*) from effective_results where league_id='bc010000-0000-4000-8000-000000000010';
savepoint view_check;
\set ON_ERROR_STOP off
select picked_team_id from v_pick_results where league_id='bc010000-0000-4000-8000-000000000010';
rollback to view_check;
select champion_team_id from v_champion_status where league_id='bc010000-0000-4000-8000-000000000010';
rollback to view_check;
select champion_team_id from v_leaderboard where league_id='bc010000-0000-4000-8000-000000000010';
rollback to view_check;
\set ON_ERROR_STOP on
set local request.headers='{"x-league-token":"bc010000-0000-4000-8000-000000000011"}';
select 'join_credential_exposure' test,organizer_token='bc010000-0000-4000-8000-000000000012' organizer_exposed from leagues where id='bc010000-0000-4000-8000-000000000010';
select 'join_participant_exposure' test,magic_token='bc010000-0000-4000-8000-000000000031' magic_exposed,push_subscription->>'endpoint'='SYNTHETIC_PUSH' push_exposed from participants where id='bc010000-0000-4000-8000-000000000030';
select 'join_private_base_guard' test,count(*) from picks where league_id='bc010000-0000-4000-8000-000000000010';
insert into picks(league_id,participant_id,slot_id,team_id) values('bc010000-0000-4000-8000-000000000010','bc010000-0000-4000-8000-000000000030','SYNTHETIC_FORGED_SLOT','SYNTHETIC_FORGED');
insert into picks(league_id,participant_id,slot_id,team_id) values('bc010000-0000-4000-8000-000000000010','bc010000-0000-4000-8000-000000000040','SYNTHETIC_CROSS_TENANT_SLOT','SYNTHETIC_FORGED');
set local role authenticated;
set local request.headers='{}';
select 'authenticated_effective_results' test,count(*) from effective_results where league_id='bc010000-0000-4000-8000-000000000010';
reset role;
select 'forged_persisted_within_transaction' test,count(*) from picks where league_id='bc010000-0000-4000-8000-000000000010' and team_id='SYNTHETIC_FORGED';
rollback;
select 'fixture_cleanup' test,count(*) from leagues where id in ('bc010000-0000-4000-8000-000000000010','bc010000-0000-4000-8000-000000000020');
```

## Reproduction SQL: empty mapping provenance

```sql
begin;
insert into data_providers(id,adapter_key,display_name) values('bc020000-0000-4000-8000-000000000001','skeptic1','Synthetic');
insert into organizations(id,organization_key,name,kind) values('bc020000-0000-4000-8000-000000000002','skeptic1','Before','league');
insert into competitions(id,organization_id,competition_key,name,domain,sport_code) values('bc020000-0000-4000-8000-000000000003','bc020000-0000-4000-8000-000000000002','skeptic1','Synthetic','sport','synthetic');
insert into event_editions(id,competition_id,edition_key,name,season_label) values('bc020000-0000-4000-8000-000000000004','bc020000-0000-4000-8000-000000000003','skeptic1','Synthetic','2026');
insert into provider_bindings(id,provider_id,event_edition_id,binding_key,role,mode,health_status) values('bc020000-0000-4000-8000-000000000005','bc020000-0000-4000-8000-000000000001','bc020000-0000-4000-8000-000000000004','skeptic1','primary','write','healthy');
insert into ingestion_runs(id,binding_id,provider_id,event_edition_id,claim_key,trigger_kind,claimed_by,lease_expires_at) values('bc020000-0000-4000-8000-000000000006','bc020000-0000-4000-8000-000000000005','bc020000-0000-4000-8000-000000000001','bc020000-0000-4000-8000-000000000004','skeptic1','replay','skeptic1',now()+interval '10 minutes');
set local role service_role;
select outcome,resolution_status,metadata from upsert_provider_entity_mapping('bc020000-0000-4000-8000-000000000005','organization','arbitrary-unverified','bc020000-0000-4000-8000-000000000002','automatic',0.99,null,null,'{}');
select observation_id from record_provider_observation('bc020000-0000-4000-8000-000000000006','bc020000-0000-4000-8000-000000000005','organization','arbitrary-unverified','skeptic1',now(),now(),1,'{"synthetic":true}',jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','skeptic1','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','partial','normalizedEntity',jsonb_build_object('organizationKind','league','name','SYNTHETIC_UNVERIFIED_PROJECTED','metadata',jsonb_build_object()),'semanticHash',repeat('b',64))) \gset
select outcome from project_structural_observation(:'observation_id');
select name='SYNTHETIC_UNVERIFIED_PROJECTED' unverified_canonical_write from organizations where id='bc020000-0000-4000-8000-000000000002';
reset role;
rollback;
select count(*) fixture_remaining from data_providers where id='bc020000-0000-4000-8000-000000000001';
```

changed: only this report.
matters: confirms two SQL boundary counterexamples and the TS laundering path, while correcting overbroad private-view claims.
checks: actual local catalog plus direct anon/authenticated/service_role queries and rollback checks; TS source executed in memory with echo RPC.
risk: no deployed/PostgREST verification; no full dispatch transport test; parent mappings not separately exercised; other two high-finding skeptics still required.
verdict: **iterate**.
