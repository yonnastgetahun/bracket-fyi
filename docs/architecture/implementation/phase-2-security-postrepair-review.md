# Phase 2 independent security post-repair review

2026-10-27. Scope: SEC-01/02/03 and narrowed GAP-01; repair packet, actual source, existing local Docker PostgreSQL. **Scoped security verdict: ACCEPT reviewed-only boundary. Overall delivery: HOLD pending broader integration/transition proof.** No surviving bypass of these four repaired boundaries reproduced. This is one independent reviewer, not three-reviewer or deployment acceptance.

## Review criteria and authority

- [x] Inspect original findings and repair implementation, not builder conclusions.
- [x] Exercise actual anon/authenticated/service-role controls, canonical-write negative controls and reviewed positive controls.
- [x] Independently challenge nested bracket-edge identity.
- [x] Establish current DB17/20 compatibility, distinguishing concurrent fixture changes.
- [x] Write only this report; no provider/hosted access, commits, schema repair or migration application.

Read repository AGENTS.md. The explicitly supplied source-review scope supersedes a generic branch-diff workflow; no branch switch, publication or extra approval requested. Existing dirty work preserved. All SQL used the local container `supabase_db_bracket-fyi`, `psql -X -At -U postgres -d postgres -v ON_ERROR_STOP=1`. Synthetic fixture transactions ended in ROLLBACK. Temporary test helpers are transaction-local. No production records or credentials selected.

## Dispositions

| Finding | Independent disposition | Evidence |
| --- | --- | --- |
| SEC-01 | Repaired by disabling automatic authority, not by implementing trusted bootstrap | `lib/ingestion/identity/repository.ts:84` discards metadata provenance when constructing automatic canonical refs; `:143` writes false after caller metadata. `resolve.ts:85` unconditionally returns unresolved for automatic refs, including provenance-bearing objects. Reviewed branch remains explicit. |
| SEC-02 | Repaired at public SQL entrypoints | Migration 00004 `:25–101` enumerates subject, parents, entries and edges, locks matching rows, checks reviewed state, reviewer/time, provider/edition and target eligibility. Both wrappers call it after write-mode admission. DB30 actual service-role tests 25–48 pass, with canonical-state checks and reviewed replay controls. Independent edge test below also passes. |
| SEC-03 | Repaired for direct browser roles | Migration 00004 `:3–22` revokes table AND independent column privileges from PUBLIC/anon/authenticated. Actual ACL queries and DB30 tests 5–10/15–20 deny bearer-column reads and same-/cross-tenant unauthorized inserts. Service read/write positive controls 21–24 pass. |
| GAP-01 | Narrowed disclosure closed | Actual anon/authenticated SELECT on effective_results and all three scoring views denied; DB30 tests 1–4/11–14 pass. Prior scoring-view private-pick leak remains unproven, as the original skeptics reported function denial. Do not retroactively claim that leak was reproduced. |

### Why the SQL boundary is meaningful

The dispatcher still calls projection repositories directly; resolver-only enforcement would remain insufficient. Public wrappers now gate those actual calls. Actual function ACLs:

- anon/authenticated: EXECUTE false on both public projectors, both unchecked projectors, root projector and admission helper.
- service_role: EXECUTE true only on the two public projectors among those six functions.
- Internal SECURITY DEFINER calls can invoke the private helper; service callers cannot invoke unchecked projection directly.

Actual table/column ACL matrix: for each of leagues, participants, picks, effective_results, v_pick_results, v_champion_status, v_leaderboard, anon/authenticated SELECT, any-column SELECT, INSERT, any-column INSERT and UPDATE are all false. Corresponding service_role grants are true (grant presence does not imply every view is updatable).

Mapping locks remain held for the transaction. Source enumeration matches external identity lookups in historical structural migration 20261009000001 (entries at 249/272/285; bracket edges at 298–331), root migration 20261009000004 (304/333/356), and result migration 20261009000002 (187–188). Results consume contest plus optional winner, not a separate result mapping. Metadata is not authority. The natural-key mismatch subtransaction in security migration 00004:178–201 rolls back canonical/provenance writes before quarantine; DB30 tests 44–45 actually exercise it.

No two-session race performed; lock inspection is not race proof. Existing broad service authority remains trusted: the review RPC accepts supplied reviewer identity/time. The repair is not an operator-principal/grant system and does not protect against a hostile service-role credential.

## Independently executed evidence

| Run | Result |
| --- | --- |
| Unchanged DB30 security file | **54/54**, ROLLBACK |
| DB30 plus reviewer-authored nested-edge challenge, assembled only in memory | **58/58**, ROLLBACK; synthetic provider residual count 0 |
| DB17 before concurrent integration edit | **12 failures / 21** |
| DB20 before concurrent integration edit | **7 failures / 51** |
| DB17 after inspecting concurrent integration diff | **23/23**, ROLLBACK |
| DB20 after inspecting concurrent integration diff | **52/52**, ROLLBACK |
| Actual catalog ACL matrix | matches explicit wrapper-only service / no browser-table boundary |

TAP output, not psql exit alone, determined success; failed TAP assertions can leave psql exit zero. No TypeScript runtime, full database suite, build or HTTP test was run by this reviewer. Builder's 801 tests are not independent evidence here.

### Original additional challenge: nested bracket edge

Used DB30's synthetic provider/binding and helper, retaining its transaction but inserting this challenge before finish/rollback. Provisioned bracket UUID `b3020000-0000-4000-8000-000000000001`, key `postrepair`, edition `b3010000-0000-4000-8000-000000000004`, stage `...0005`; reviewed bracket mapping via service-role mapping RPC. Observation:

```json
{"stageExternalId":"stage","bracketKey":"postrepair","name":"Edge rewrite","bracketKind":"single_elimination","metadata":{},"edges":[{"fromContestExternalId":"contest","toContestExternalId":"unreviewed-contest","outcome":"winner","targetRole":"home","priority":1,"metadata":{}}]}
```

DB30 has reviewed `contest` and automatic `unreviewed-contest`. Public structural projector returned **quarantined**, bracket-edge count **0**. Promoted only the latter association through the existing reviewed mapping RPC, then replayed the same observation: **projected**, edge count **1**. This is an actual successful-path control, not merely a test that malformed input fails. Final rollback, synthetic provider count **0**.

## DB17/20 compatibility — updated during this review

The original packet's failure counts were independently reproduced first. Another integration owner then modified the fixture files during this review; this reviewer changed neither file. Inspected their diff and reran the new files.

DB17 now provisions canonical stage/round/contests/bracket and reviewed subject refs at `17_slice_2b_structural_projection_test.sql:28–48`. The stage mapping is deliberately withheld until after the child-first rejection (`:71–74`), so dependency replay is still exercised. Cycle tests additionally assert `unsupported_shape`, proving they reach graph validation rather than passing merely because identity admission rejected them. Current **23/23**.

DB20 provisions an invited entry plus reviewed subject mapping and changes the global competitor proposal to reviewed (`20_slice_2b_acceptance_remediation_test.sql:129–138`). It also supplies the missing `edition` dependency alias for lifecycle observations. **Correction to builder diagnosis:** lifecycle contest/stage/entry subject mappings were already reviewed; the absent edition alias, not an absent contest subject association, caused those lifecycle admission failures. The final assertion proves invited → confirmed mutation, avoiding a pre-provisioned no-op positive control. Current **52/52**.

These are legitimate fixture adaptations to the explicitly reviewed-only contract, not evidence that automatic bootstrap works. Neither file now claims unreviewed association creation should succeed. Existing DB30 missing-subject and forged-provenance negative controls remain green.

## Remaining limitations / surviving integration obligations

1. **Automatic bootstrap remains disabled.** Provisioning + reviewed mappings are prerequisites for new canonical structures. Current fixture compatibility is repaired; end-to-end ingestion/manual-manifest provisioning workflow is not established by this review.
2. **Scoped operator authority (P9) remains absent from this packet.** Service-role mapping writes/review are trusted; arbitrary service credentials can still exercise that baseline authority. This is an acknowledged scope boundary, not a newly reproduced anon bypass.
3. **Deployment/upgrade and concurrency unverified.** No migration application/history registration, fresh/populated transition, forward-repair replay, PostgREST HTTP, browser/RSC, or two-session mapping race was performed. Parent owns those gates.
4. Source confirms current `components/useLiveRefresh.ts` uses visibility events and 30-second polling; search of app/components/lib found no Realtime channel consumer and only the browser-client definition. Current service-based routes retain grants; external direct-DB clients were not inspected.

Security artifact hashes matched the implementation packet at inspection:

- migration 00004: `20c28f3bc2f3fc0b9ac2b99410c36e6a7c59c8c21035337ae84801dd2c4953b0`
- identity repository: `8c25f85e52fcac6a4b05f9863cc99b3ebe42d23aeba3cecdc2bf02a5d3e5fe84`
- identity resolver: `f59f466f59a29e03a347b639a998922c6e5603406f4d68a3282fba32e4b790db`

changed: this independent review report only.
matters: independently verifies repaired direct-role and projection authority controls; separates closed security defects from broader integration.
checks: DB30 54/54; extended challenge 58/58; updated DB17 23/23 and DB20 52/52; actual ACLs.
risk: reviewed-only provisioning, P9 principal model, deployment/transition/HTTP/concurrency proof remain.
verdict: **ACCEPT scoped SEC-01/02/03 + narrowed GAP-01 repair; HOLD overall delivery, no new surviving in-scope bypass found.**
