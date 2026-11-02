# Phase 2 acceptance reconciliation
2026-10-30. Documentation-only inspection; no runtime, staging, commits or publication.

## Work item
project: BRACKET-FYI
done when:
- [x] Requirement/finding statuses distinguish current evidence from superseded checkpoints.
- [x] Retained full-window/through-13/provider artifacts and source hashes are inspected.
- [x] Exact proposed publication allowlist excludes every preservation-baseline path and case studies.
evidence: this report, canonical ledgers, ignored tmp/final-ledger-reconciliation/proposed-commit-allowlist.json.

## Inspected evidence and supersession

- Approved execution plan retains E1–E8/P1–P12 full local/manual/synthetic scope, explicit-path publication authority and owner-document/case-study preservation. This child has no publication/runtime ownership.
- Current committed HEAD at inspection: `3ca08fbd7d3cfa5266a2114ab3bb3f9f391d83e8`; all acceptance below refers to a dirty working tree, not a new tested commit.
- Full-window original `tmp/browser-acceptance/full-window-2026-10-30T22-37-40.801Z/results.json`: `allScoredMarketsAndWindowsCovered=true`; UCL211 distinct covered markets/13 expected windows and WWC64/7, both passed. Independent final integration review already corroborates these. No claim that its older runtime snapshot equals the final source candidate.
- Transition original `supabase/tests/transitions/evidence-20261030T212044Z_e8fa81.json`: passed through00013; 2,093 assertion objects, zero false; all fresh/legacy/current lanes; TAP plans total750. SHA256 comparison:36 migrations +12 fixture inputs +5 SQL tests +1 harness =54/54 current matches. This expands the prior review's48 path checks, not contradicts it. Earlier transition timeout HOLD is superseded; runtime reports remain unchanged as historical evidence.
- Provider `final-numeric-runtime-evidence.json.providerSql` exactly equals `tmp/family-runtime/1793405247606200000-sql.json`: exit0,15 passed/0 failed/0 pending, all15 test records passed, five SQL scenarios. All11 recorded before/after hashes are identical and match current bytes. This closes FI-2's downstream execution gap, not live-provider coverage or automatic series derivation.
- Numeric durable artifact remains failed:9 persisted +9 rendered checkpoints observed; reviewed WWC48/64, reviewed WWC64/64 and unknown-placement WWC not verified. OOM/recovery means do not promote failed-run DB contents to a durable successful final packet.
- Series/structural29 focused tests +95 SQL assertions and populated13→14/15 preservation remain credited by the prior independent review. This inspection did not rerun them.
- All26 preservation-baseline path SHA256s match actual bytes, including approved plan/spec, five tracked dirty owner documents and case study. None may enter the proposed commit.
- Artifact inspection details saved privately in `tmp/final-ledger-reconciliation/inspection.json`; no runtime commands executed.

## Proposed publication file allowlist and provenance

Exact JSON: `tmp/final-ledger-reconciliation/proposed-commit-allowlist.json` (ignored).
This is a **proposal only**, never a staging command or test certificate. It contains individual file paths, current SHA256 per entry, requirement/scope classification, baseline exclusions, held generated/log artifacts and HEAD. Parent must refresh hashes after concurrent work and inspect every eventual diff before staging explicit paths.

Provenance: inspected approved plan, preservation JSON, current `git diff --stat` and tracked implementation diff, then enumerated `git diff --name-only` plus `git ls-files --others --exclude-standard`. Classified application/security/legacy, events/ingestion, synthetic harnesses, additive migrations/repair/tests, and implementation review/evidence docs against the approved waves. Excluded every preservation path (not merely the case-study directory), all case studies, bytecode and raw log files. Unknown paths are held, not silently admitted. The manifest is an enumerated snapshot, not a directory-wide future inclusion rule. No ignored tmp/runtime/credential state enters it. Prior P1 commit is already in HEAD and is not restaged.

This child changed only:
- `docs/architecture/implementation/phase-2-evidence-ledger.md`
- `docs/architecture/implementation/phase-2-findings.md`
- `docs/architecture/implementation/phase-2-acceptance-reconciliation.md`

Original two-ledger bytes are retained in ignored tmp for diff review. Runtime reports and all product files were untouched by this child.

## Earlier remaining actions — historical snapshot, superseded below

1. Provide sufficient shared VM capacity through coordination, then finish both trusted numeric modes serially with all12 literal persisted checks and all12 rendered checks, source fingerprints and final stopped audit. No world truncation/sampling or weakening null behavior.
2. Adjudicate FD04 against approved P3 “unknown/conflicting mappings quarantine”: fail-entire-batch run metadata is demonstrated, immutable per-row rejection evidence/run-review integration is not established by the inspected repair report. Either demonstrate the accepted review-evidence contract or implement/verify the missing integration; avoid treating safe rejection as nonexistent or silently complete.
3. Freeze final candidate and run required aggregate tests, opt-in SQL, types, lint/build, DB lint, whitespace and final through15 fresh/populated/repair matrix (or explicitly justified coverage composition). Existing through13 and additive14/15 evidence is real; final aggregate coverage remains pending.
4. Preserve sanitized full-window/recovery/PWA/legacy results as durable publication evidence, not only ignored paths. Seven-family/provider/numeric sanitized bundles already exist; historical failure artifacts must stay labeled failures.
5. Parent reviews exact allowlist/diff, commits authorized scope, and publishes/verifies PR with tested commit equality. No merge/deploy/provider activation/real sends. Physical-device and deployed-beta issue#3 remain external gates.

changed: canonical requirements/findings and this acceptance record; private allowlist/inspection snapshot.
matters: completed bounded proofs are credited without claiming numeric/full-candidate/publication completion.
checks: retained artifact structure/counts;54 transition hashes;11 provider hashes;26 preserved hashes; original provider bundle equality; documentation diff/whitespace inspection.
risk (earlier snapshot): concurrent source changes can invalidate manifest hashes; final through15 and numeric WWC then remained unverified.
verdict: accept documentation reconciliation; ITERATE full Phase2 delivery.

## Final delivery reconciliation work item — 2026-10-30
project: BRACKET-FYI; approved Phase2; docs-only
done when:
- [x] Current ledgers credit SQL1166/1166, transitions2429/2429 and bounded FD04 source acceptance without SQL/numeric overclaim.
- [x] Explicit allowlist refreshed with addition provenance and all26 preservation hashes checked.
evidence: current verdict sections; proposed-commit-allowlist.json; retained source manifests.

## Current final-delivery verdict — 2026-10-30 local

**ITERATE full delivery; accept bounded documentation reconciliation.** Earlier HOLD, FD04 integration-gap and pending-through15 statements above and in historical reports retain their original meaning; current verdict supersedes only their now-verified scope. No runtime or source changes, staging, commit, push or PR performed by this child.

### Sources and independent inspection

- [DB38 repair report](phase-2-db38-final-repair.md) and [aggregate JSON](phase-2-db38-final-repair-evidence.json): inspected 38 current migration hashes and39 current SQL-test hashes, all matching; all39 test records pass and counts sum to **1166/1166**. Source SQLSTATE repair and DB38 hashes also match. Direct psql/pgTAP execution, not a Supabase test CLI claim.
- Latest through15 artifact `supabase/tests/transitions/evidence-20261031T003830Z_ee7366.json`: **2429/2429 assertion records pass**; SHA256 matches `2abe834fc247d460a12eb9341b6b3d86a14d6f191b08be487a551b0169ef1cb1`. Fresh, populated legacy/current and forward-repair coverage supersedes the pending matrix. DB38 independent review accepted; prior two-failure report remains historical.
- [FD04 integration report](phase-2-fd04-quarantine-integration.md): independent bounded source acceptance,190 focused tests, types/lint; actual adapter/orchestrator and RPC adapters use fake RPC endpoint. First rejected row/envelope witness holds the full batch, without exhaustive row diagnosis or prefix projection. SQL constraints, immutability and end-to-end persistence remain **pending separate worker evidence**; no current SQL persistence acceptance inferred.
- [Runtime recovery](phase-2-runtime-recovery.md) and durable JSON retain the later COPY attempt's **9/12 SQL-only,0 rendered** failure, OOM kill3→4, automatically recovered stopped/no-send audit. Earlier9 rendered remain historical. Missing WWC reviewed48/64, reviewed64/64 and unknown-placement null are not passed; no numeric12/12 claim.
- [Browser preservation](phase-2-browser-evidence-preservation.md) and [sanitized bundle](browser-acceptance-retained-evidence.json) cover UCL211/13, WWC64/7, legacy15, recovery16 and PWA5. This closes the durable retention gap, not final source identity or physical-device proof.
- All26 preservation hashes rechecked and match; baseline paths and every case-study path excluded. Parent owns final application checks; this child does not infer their outcome. Private `tmp/final-ledger-reconciliation/final-delivery-inspection.json` records inspected source SHA256s and checks.

### Publication interpretation — no new approval gate

Approved plan **Outcome and authority** explicitly authorizes commits/pushes/PRs and says “An early packet/preparatory PR is not full-roadmap completion.” Its normative [engineering contract](full-roadmap-execution-contract.md) §A says “A preparatory PR can be verified without satisfying the whole-roadmap finish line.” Thus a transparently scoped **preparatory public PR (including draft)** with explicit numeric blocked gate is within standing authority; full-roadmap verification is not a blanket prerequisite to opening that scoped PR. Draft is a presentation choice, not an exemption from accurate evidence.

The plan's **Independent acceptance evidence** / **Delivery verdict** and contract final-head recipe still require final-candidate checks, exact evidence identities and published PR head equal tested commit for a **verified PR** claim. Numeric9/12 means full agreed scope is not accepted/delivered; unresolved FD04 persistence likewise cannot be marked verified. Label scoped completion honestly, retain exact unmet requirements and resume conditions, and do not close deployed-beta issue#3. Nothing authorizes merge/deploy/live activation/real sends or raw/private publication. No additional owner permission is required for already-authorized scoped publication; parent owns the readiness decision and execution.

### Refreshed exact allowlist and addition provenance

`tmp/final-ledger-reconciliation/proposed-commit-allowlist.json`: **396 individually enumerated paths**, refreshed SHA256 snapshot, all26 baseline paths excluded; no directory wildcard admission. Ten additions over the previous386-path proposal:

| New path (repository relative) | Provenance / scope |
| --- | --- |
| `docs/architecture/implementation/browser-acceptance-retained-evidence.json` | Sanitized browser projection; browser preservation report records originals/hashes. |
| `docs/architecture/implementation/phase-2-browser-evidence-preservation.md` | W5 original-to-durable preservation report. |
| `docs/architecture/implementation/phase-2-db38-final-repair-evidence.json` | DB38 repaired SQL1166/transition2429 manifest, source identities and review. |
| `docs/architecture/implementation/phase-2-db38-final-repair.md` | DB38 owned repair, regression and independent review report. |
| `docs/architecture/implementation/phase-2-fd04-quarantine-integration.md` | P3/P4 bounded source contract and independent source acceptance report. |
| `docs/architecture/implementation/phase-2-runtime-recovery-evidence.json` | Historical recovery report's OOM/two-failure manifest, not promoted to pass. |
| `lib/ingestion/quarantine/adapter-rejection.ts` | Exact new production path listed in FD04 report's owned-file list. |
| `tests/ingestion/quarantine/adapter-rejection.test.ts` | Exact new bounded witness regression listed in FD04 report. |
| `supabase/tests/transitions/evidence-20261031T002058Z_1a4065.json` | Recovery report's historical through15 artifact before DB38 repair. |
| `supabase/tests/transitions/evidence-20261031T003830Z_ee7366.json` | Repaired through15 artifact; exact hash validated against DB38 manifest. |

Existing FD04 orchestrator/ports/runtime/tests and migration14/DB38 paths were already enumerated; their snapshot hashes refreshed, not new inclusion authority. Raw logs, bytecode and ignored tmp/runtime/secret state remain excluded. During enumeration two concurrent arrivals were deliberately **held**, not silently admitted: `docs/architecture/implementation/phase-2-post-fd04-parent-checks.md` and `tests/events/provider-fd04-quarantine-db.test.ts`. Parent must inspect their completed provenance/evidence and any later FD04 report before adding exact paths. Manifest admission is not independent security/test certification of every preexisting file.

### Precise remaining gates

1. Sufficient coordinated runtime capacity, then full unchanged numeric SQL and browser modes: all12 persisted and all12 rendered literal checkpoints, source identities and stopped audit. No truncated worlds, sampling or weakened null oracle.
2. FD04 actual DB persistence/replay/immutability acceptance from the separately owned runtime proof. Bounded source contract is accepted; exhaustive per-row diagnosis remains explicitly out of claim.
3. Complete parent final application/types/lint/build checks and final-candidate DB lint/evidence binding; latest reported DB lint was exit0/18 warnings on the prior candidate. Record exact commands, counts/warnings and tested commit. Re-run affected proof if substantive source changes invalidate it; do not rerun an unchanged passing SQL/transition matrix merely to satisfy stale HOLD text.
4. Freeze writers, refresh **every source/allowlist hash** and add only inspected late arrivals. Review exact diffs and exclusions, stage/commit authorized paths, verify published PR head equals tested commit. A blocked numeric preparatory PR is not full-scope delivery.
5. External live-provider entitlement/terms/parity, physical device and deployed-beta remain separate, unexecuted gates; no merge/deploy/real sends.

changed: canonical ledger/findings current verdicts, this reconciliation, private allowlist/inspection snapshot.
matters: credits actual repaired SQL/transition and FD04 source proof without claiming missing numeric/persistence/publication acceptance.
checks: SQL1166 total;38 migration +39 SQL hashes;2429 transition assertions and artifact SHA;26/26 preserved hashes; explicit additions/exclusions.
risk: concurrent FD04 evidence and parent checks can supersede this snapshot; final hash refresh mandatory.
verdict: accept documentation reconciliation; ITERATE full Phase2 delivery.

## Publication candidate closeout — supersedes pending FD04 seam proof

Work item BRACKET-DRAFT-PUBLICATION-20261030 (standing approved preparatory PR authority).
FD04 actual SQL proof now **1/1 PASS** on the final harness, with seven source hashes matching and independent bounded acceptance. Immutable observation UPDATE/DELETE denial, replay, actual SQL42501 failure and separate-transaction repair are credited. Fetch/attempt-admission doubles, unmapped_match-only coverage and no PostgREST remain explicit; no full provider claim.

Parent application checks are **1246 passed/32 skipped**, build PASS, lint **0 errors/13 warnings** before only the added opt-in test. Final worker TypeScript and scoped lint pass after that test; no product changes followed. SQL **1166/1166** and through15 transitions **2429/2429** remain credited with source-hash binding, not rerun here. Historical browser/provider evidence is not promoted to final-head runtime acceptance. DB lint18 warnings remains historical.

Exactly four inspected late paths are admitted over396: phase-2-post-fd04-parent-checks.md, tests/events/provider-fd04-quarantine-db.test.ts, phase-2-fd04-sql-proof.md and phase-2-fd04-sql-proof-evidence.json (docs under this directory). Final private manifest enumerates400 paths and SHA256s; protected26/case studies/raw logs/bytecode remain excluded. All publication bytes are scanned for credential shapes, JSON artifacts parsed and synthetic token provenance inspected; this is publication hygiene, not a new comprehensive semantic code review.

Numeric9/12 shared-memory/OOM gate remains unresolved. No runtime reruns, VM/container changes, merge, deploy, spend or live sends performed in this closeout. Scoped draft publication is not full Phase2 acceptance; exact commit and remote/PR outcome are recorded in the delivery receipt and PR body when available.

## Published preparatory draft — 2026-10-30 closeout

[Draft PR #4](https://github.com/yonnastgetahun/bracket-fyi/pull/4) is open against main. Initial publication head was 5de02b2d39be0cc327e96765b7b84dcd7304248a; this closeout is documentation-only. Exact final remote/head equality is recorded in the private publication receipt and PR body, avoiding a self-referential commit hash.

400 explicitly allowlisted paths were committed; all26 protected working-tree hashes remain intact. SQL/transition/FD04 evidence binds84 distinct source paths to committed bytes. The branch also includes its earlier foundation (583 changed files against main); no case studies or protected uncommitted owner work were added. Staged diff-check returned exit2 for Markdown hard-break whitespace and blank EOF in nine files; earlier unstaged checks did not include those newly tracked files. These formatting findings remain disclosed, not silently waived as a passing check.

Publication is complete only for this preparatory draft. Numeric9/12 shared-memory/OOM gate, full final-head runtime/DB-lint acceptance and external live/device/deployed-beta gates remain open. No merge/deploy/spend/live sends or runtime/VM/container changes. Git push used the configured CA; GitHub API used verified default SSL with that CA and retained proxy after gh's platform trust failure. No TLS verification disabled. Full Phase2 verdict remains **ITERATE**.
