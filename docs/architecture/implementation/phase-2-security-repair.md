# Phase 2 security boundary repair — implementation packet

2026-10-27. Strong security owner; SEC-01/02/03 and narrowed GAP-01; P1/P3.
Approved parent scope and existing BRACKET-PHASE2-DELIVERY item read before coding.
No self-acceptance: independent review and integration remain parent-owned.

## Binary criteria (written before implementation)
- [x] Caller metadata, false/true flags and arbitrary normalization versions never manufacture authoritative automatic identity.
- [x] Both public SQL projectors quarantine unreviewed root/dependency/result identities before canonical mutation; reviewed controls still project.
- [x] Actual anon/authenticated roles cannot read bearer columns, insert cross-participant/cross-league picks, or read private effective results.
- [x] Service-role reads/writes and reviewed projection remain usable; browser/realtime consumers inspected and compatibility limitations reported.
- [x] New focused tests show red before repair and green after; additive migration and matching forward repair replay safely on local disposable DB.

## Contracts and ownership
Exclusive writes: identity repository/resolve and their tests; migration 20261027000004_security_boundary_repair.sql; matching forward repair; database/30_security_boundary_test.sql; this report. Do not edit historical migrations or window owner's 00003/DB29.
Policy: **reviewed-only** until an independently verified scoped deterministic-bootstrap mechanism exists. No caller Boolean/string is accepted as bootstrap authority. Existing automatic rows remain evidence/proposals, but require review before projection. The existing reviewed mapping workflow is retained; full scoped operator principal/grant design (P9) is a separate integration obligation.
Direct browser table/view access is revoked for credential-bearing/private surfaces; authorized Next server routes retain service-role access. No new browser RPC or token grants.
SQL admission must lock the exact referenced mapping rows for the transaction, validate provider/binding/edition/reviewer provenance, and quarantine without canonical writes. Existing mode/ordering/partial-snapshot checks remain.
Evidence commands: focused Vitest identity/security suites; pgTAP30 via local Docker psql; migration and forward-repair replay; scoped git diff checks. Original synthetic fixtures only, rollback after tests. No reset/history edits, hosted environment, provider request, real credential output, commit/push/deploy/spend.

## Implementation and disposition

Criteria above are builder-observed local results, **not independent acceptance**.
Used the TDD workflow from `~/.agents/skills/tdd/SKILL.md`; the approved packet supplied interfaces, authority and test priorities.

- SEC-01: repository no longer turns caller metadata into authoritative provenance; outgoing automatic proposals explicitly carry false, and reads never deserialize metadata into trusted provenance. Resolver quarantines **all** automatic associations, including supported-version/true-flag objects. Reviewed mappings remain authoritative. No fake alternative Boolean or unsupported-version authority path.
- SEC-02: additive `security_reviewed_observation_identity` gate runs inside both public SECURITY DEFINER projectors after the existing write-mode check. It locks subject/dependency mapping rows in deterministic kind/ID order; requires reviewed state, reviewer/time, canonical target, binding/provider/edition and target eligibility. Structural subject, top-level parents, nested entries and edges are covered; result identity is contest plus optional winner. Metadata is never traversed as authority. Existing automatic rows/proposals are retained, not silently promoted or deleted. Helper and unchecked projector execution remain denied to service_role/browser roles.
- Additional in-scope adversarial finding: the legacy non-root projector could accept a reviewed stage association then upsert a *different* stage through an observation's natural key. Added a successful-projection canonical-ID comparison inside a subtransaction. Mismatch rolls back canonical/provenance writes and records mapping quarantine. Two new tests failed before this guard and passed afterward.
- SEC-03 / narrowed GAP-01: revoke PUBLIC/anon/authenticated table **and independent column** privileges on leagues, participants, picks, effective_results and all three scoring views. This closes the demonstrated credential/cross-participant insert/effective-result paths. The three scoring views already resisted the original no-token query through function EXECUTE denial; their leak was not reproduced or reclassified. Explicit SELECT revocation prevents depending on that incidental function guard.
- Forward repair reasserts exactly the migration payload transactionally. It never restores insecure access, deletes evidence, auto-reviews mappings or rewrites migration history.

## Actual verification

All shell commands routed through `/Users/yonnasgetahun/clawd/bin/exec --`; absolute repository paths. Runtime cwd for npm/Vitest explicitly set to `/Users/yonnasgetahun/bracket-fyi`. SQL target: **local disposable** Docker `supabase_db_bracket-fyi`, database postgres, `psql -X -At -U postgres -d postgres -v ON_ERROR_STOP=1` through stdin. No hosted URLs/credentials, provider calls, app journeys, commit/push/deploy, reset or historical migration edits.

| Check | Actual result |
| --- | --- |
| Identity red, before source fix | 3 failed / 10 passed: repository provenance laundering, resolver acceptance and winner acceptance |
| First SQL direct-role red | 12 failed / 24 assertions; scoring-view function denials and authorized service controls passed |
| Full valid-envelope SQL red | 25 failed / 42 assertions, including actual canonical mutation by unreviewed root/parent/winner/contest |
| Natural-key identity-drift challenge | 2 failed / 48 before subtransaction guard; 48/48 after |
| Final pgTAP30 | **54/54** in rollback-only migration rehearsal, after committed migration, after first and second forward-repair replay |
| Independent column-grant repair challenge | Temporarily granted credential-column SELECT inside transaction; repair + pgTAP30 **54/54**, rolled back |
| Focused Vitest identity + security | **5 files / 54 tests passed** |
| Full `npm test` | **48 files / 801 tests passed** at this dirty-tree checkpoint |
| Scoped ESLint on four owned TS files | passed, no output |
| `tsc --noEmit --incremental false` | passed, no output |
| Owned tracked `git diff --check` | no diagnostics |
| Cleanup | synthetic league/provider fixture count **0** |
| Migration history | version 20261027000004 count **0**: SQL applied, history deliberately untouched |

An initial projection test envelope omitted competition rulesMetadata and failed a NOT NULL constraint; fixed the synthetic envelope before recording the complete red run. This setup error is not passing evidence.

### Downstream SQL compatibility — NOT a green full DB suite

Ran files 15,16,17,18,19,20,21,22,30 independently through local psql with rollback fixtures:

- **Passed:** DB15 5/5; DB16 26/26; DB18 39/39; DB19 21/21; DB21 66/66; DB22 27/27; DB30 54/54.
- **DB17: 12 failures / 21.** It assumes missing subject mappings may auto-create entries/stages/contests and authorize later children. Reviewed-only admission intentionally stops that path.
- **DB20: 7 failures / 51.** Entry auto-creation and scheduled/live/final progression fixtures lack reviewed subject associations.
- Those fixture files are outside this owner's exclusive write scope and were **not edited**. Integration owner must provision canonical structures and explicitly reviewed mappings in these scenarios (or implement a genuinely trusted scoped bootstrap, with separate adversarial proof). Do not change expectations to success for unreviewed associations.
- The small multi-file runner encountered a nonnumeric `DB...` filename after all nine listed files had completed; its final process exit was 1. Per-file psql exit/results above were captured. This was not a successful whole-suite command.

No full database suite, build, fresh/populated migration transition, PostgREST HTTP, browser/RSC or two-session mapping race is claimed by this packet.

## Browser / realtime compatibility

Source-inspected current consumers:

- `components/useLiveRefresh.ts` uses visibility events plus 30-second polling, **not Supabase Realtime**.
- `BracketLive`, `PickEmBracket`, `MatchesLive`, `CompareLive`, `LeaderboardLive` fetch the authorized `/l/[league_id]/data` server route; source has no `postgres_changes`/`.channel(` subscription.
- `lib/supabase/client.ts:getBrowserClient` is defined but has no current application consumer. Browser mutations use Next API routes; service-role admin client remains server-only.
- Service credential lookup, private effective-result read and pick insert controls pass under actual service_role. Existing page/route security tests pass.
- Thus current polling/page behavior retains its database grants. Any external/custom direct-DB or future Realtime browser client against the revoked tables will intentionally fail and must use an explicitly authorized safe server interface. No deployed/external client was inspected.

## Remaining integration / review gates

1. Independent security reviewer must inspect this migration/gate and challenge subject, parent, nested-edge/entry and result scope plus ACLs. Builder does not approve itself.
2. DB17/DB20 reviewed-fixture provisioning and wider ingestion/manual-manifest workflow integration are parent-owned. **Automatic bootstrap is disabled, not implemented.** Existing automatic rows require an explicit reviewed transition before their observations can project.
3. Full scoped operator credentials/grants (P9) are not supplied here. Existing service-only mapping review RPC and reviewer fields are retained; service-role possession remains the baseline internal mapping authority. This packet does not claim hostile service credentials cannot invoke that baseline review API.
4. Parent must reconcile migration tracking/order and run fresh/populated transition proof. The local additive SQL was committed and forward repair replayed; no migration-history rows were inserted and no resets occurred.
5. The identity-field enumeration must be updated with any new authoritative projector identity field. Current consumed top-level and entries/edges fields were inspected; future typed winner-set/projector additions need their own admission coverage.
6. Window worker's 00003/DB29, all historical migrations, and other existing work were untouched. Parent owns final combined window/security acceptance.

## Owned file inventory / hashes

- `lib/ingestion/identity/repository.ts`: 8c25f85e52fcac6a4b05f9863cc99b3ebe42d23aeba3cecdc2bf02a5d3e5fe84
- `lib/ingestion/identity/resolve.ts`: f59f466f59a29e03a347b639a998922c6e5603406f4d68a3282fba32e4b790db
- `tests/ingestion/identity/repository.test.ts`: e1abeb4fe59461d4daf61f53d8ff2aa246c29a950c55da9f1faba50f993a6fa6
- `tests/ingestion/identity/resolve.test.ts`: 8c43bbcac1e1c7c44ff46bd07e305eae67edd3d6b7cb618239eca9bdef5b488c
- `supabase/migrations/20261027000004_security_boundary_repair.sql`: 20c28f3bc2f3fc0b9ac2b99410c36e6a7c59c8c21035337ae84801dd2c4953b0
- `supabase/rollbacks/20261027000004_security_boundary_forward_repair.sql`: 7a592d70b48f2192d28eb6f8ce000e21d96b9543e66bf491b7714614d441383e
- `supabase/tests/database/30_security_boundary_test.sql`: a43ce381851a16aeae53b592abfe7d62a8c7c86b17b7b2364fdf6553f8ae1a8a
- This report (criteria written before implementation; results appended afterward).

changed: reviewed-only TS/SQL admission; closed direct browser credential/private-data surfaces; additive migration/forward repair and focused regressions.
matters: eliminates manufactured bootstrap authority and demonstrated local DB bypasses while retaining reviewed/service controls.
checks: 801 TypeScript passes; focused DB30 54 passes; red/green and forward repair above; DB17/20 integration failures explicitly retained.
risk: automatic ingest fixture/workflow integration, P9 authority, full transition/HTTP/concurrency and independent review remain.
verdict: **HOLD for independent review and parent integration; no self-acceptance.**
