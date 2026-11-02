# Phase 2 independent provider/schema review

Date: 2026-10-27. Verdict: **ITERATE / do not accept provider packet yet**.

## Review work item (recorded before report completion)

project: BRACKET-FYI
done when:
- [x] Independently challenge BDL/OSC parser boundaries with original synthetic inputs.
- [x] Inspect typed nomination constraints, reader gate and repair; distinguish runtime proof gaps.
evidence: 86 existing tests passed; adversarial observations and exact recipes below.

Scope: current working-tree `lib/ingestion/providers/{balldontlie,oscarbase}.ts`, their tests, `lib/ingestion/contracts.ts` and tests, migration/repair `20261027000001`, DB test 27. Binding requirements: spec v1.0 §6 P2/P4/P6 and `full-roadmap-provider-contracts.md` common transport and fixed registry. This is a bounded assigned independent review, not an implementation or full-roadmap acceptance. The generic review skill's branch-diff workflow does not replace this explicitly supplied file scope. No source/schema changes, provider calls, hosted access or activation.

All paths below are relative to **/Users/yonnasgetahun/bracket-fyi**. Reproduction harness used real source, TypeScript transpileModule/CommonJS and alias resolution, injected fetch returning original JSON Response objects; no HTTP requests. Local harness: `/tmp/bracket-provider-review.cjs`. Run: `/Users/yonnasgetahun/clawd/bin/exec -- node /tmp/bracket-provider-review.cjs`.

## Concrete findings

### PS-01 — HIGH: recursive scalar allowlist escape (P4)

Location: `lib/ingestion/providers/balldontlie.ts`, projectRow scalar assignment and nestedFields copy.

Repro: valid NFL request, response row `{season:2027,id:1,status:{secret:"SENTINEL"},home_team:{name:{secret:"SENTINEL"}}}`, meta `{per_page:100,next_cursor:null}`. Actual returned page retains **both** secret objects unchanged. A permitted field name is not permission for arbitrary nested contents. This defeats the safe-page contract even though unknown sibling keys are stripped. Existing recursive-allowlist test only exercises unwanted siblings, not malformed values beneath permitted scalar names. Require explicit scalar types/array schemas at every permitted leaf; reject malformed identity/status/date/team values before retention.

### PS-02 — MEDIUM: NFL/MLB query allowlist violated; date semantics ambiguous (P6)

Location: balldontlie.ts dateStart/dateEnd URL construction.

Repro: NFL with dateStart 2027-01-01/dateEnd 2027-01-03 emits `start_date` and `end_date`, in addition to two `dates[]` values. MLB uses identical code. Their registry permits dates[] but **not** start_date/end_date. Moreover two endpoints in dates[] do not represent the intervening date. Do not assume providers intersect/union these filters favorably. Make query generation sport-specific, and either enumerate a bounded date set or expose an explicit single-date/list contract. Exact query-key assertions are absent for BDL.

### PS-03 — MEDIUM: MLB runs skip score validation

Location: balldontlie.ts nestedFields projection.

Repro each of `home_team_data.runs = -1, 1.5, "two", {secret:"SENTINEL"}` with season 2027. All four returned unchanged. The scalar branch mentions runs but runs occurs only in nestedFields, where validation is bypassed. Both home/away runs require valid nonnegative integer-or-explicit-unknown semantics. No settlement occurs in this transport alone; impact is admitting malformed score evidence to a purported safe page.

### PS-04 — MEDIUM: invalid runtime mode makes outbound request; inherited sports pass admission

Location: balldontlie.ts initial guards; oscarbase.ts initial mode guard.

Repro BDL input mode `"typo"` with otherwise valid input: injected fetch called once. Every mode except manual behaves as provider. OSC has the same source pattern. Mode is an operational boundary; TypeScript types do not validate runtime configuration.

BDL sport `"constructor"` passes `in BDL_SPORT_CONFIG`, reads credential once, then raises native TypeError constructing the URL. Expected: typed invalid_response before credential access. Use exact runtime mode and own-key sport admission. Prototype case did **not** perform a fetch in this probe; no arbitrary-origin exploit is claimed.

### PS-05 — MEDIUM: OSC accepts inconsistent/out-of-range pagination

Location: oscarbase.ts envelope validation.

Executed:
- total=0, page=1, totalPages=0 with two rows: accepted.
- total=1, page=1, totalPages=1 with two rows: accepted.
- requested page=3, response total=1/page=3/totalPages=1/data=[]: accepted.

Duplicate rows were quarantined, but inconsistent envelope was still returned successfully. There is also no explicit data.length<=100 check. Require coherent empty/nonempty totals, page bounds (with a documented empty-result exception), and bounded row count. Do not equate an accepted terminal envelope with complete evidence. Existing tests reject numeric-string metadata and one inconsistent zero-total combination only.

## Scope gaps / observations, not overclaimed exploits

- **PS-G1 — BDL phase/identity admission remains unimplemented at this layer.** A same-season NFL row `{season:2027,postseason:false}` is accepted; even id/team/date omissions are accepted. NBA response rows cannot distinguish Play-In from playoffs solely by the selected fields. CFP membership cannot be inferred from season/week. Transport filters alone do not prove admission: bind explicit reviewed contest IDs and separate NBA phase membership before canonical projection. No current transport performs settlement, so this is a missing adapter obligation, not proof of cross-phase scoring today.
- BDL cursor negative/noninteger and next<=supplied cursor are rejected. Initial next_cursor=0 is accepted; this alone does not establish a loop because a subsequent cursor=0 request rejects nonadvancement. Test full page consumption and durable cursor transitions before calling pagination complete.
- **PS-G2 — OSC identity/settlement appropriately held locally, but full integration unproved.** Required identity fields and boolean winner are validated; nested scalar objects rejected. Mismatched scope and within-page duplicated ids are quarantined; matching rows remain provisional even winner=true/false. No canonical winner or completion is emitted. Movie/nominee/song fields are optional, so absent credit information is not enough for a complete manual nomination. Cross-page duplicate/conflict identity handling, reviewed per-row nomination mapping, grouped credits and operator settlement attestation are outside this parser. No inference that false=settled-loser is allowed.
- Shared account budgets, binding/stop/shadow orchestration, lifecycle/final normalization, revision ordering, persistence/replay and end-to-end adapter integration are not established by these transport unit tests.

## Typed nomination schema/contracts

Static inspection found no demonstrated membership or immutability bypass in the assigned migration:

- Composite nomination/category/edition and credit/edition foreign keys maintain membership. Category insertion trigger requires award/category and locks parent FOR SHARE. Parent-kind trigger prevents demotion after nominations exist.
- Nominations/credits reject update/delete; service role lacks update/delete/truncate. Winner membership trigger rejects null/empty/multidimensional/non-one-based arrays, null members, duplicate UUIDs, unknown/cross-category/cross-edition/ineligible nominations; sorts accepted UUIDs deterministically.
- Immutable nomination eligibility avoids check-then-update drift. FOR SHARE on parent and FOR KEY SHARE on selected nominations are sensible serialization mechanisms. **No concurrent two-connection race was executed**; simultaneous category demotion/nomination insert and eligibility/identity mutation versus result insertion require independent runtime proof. Existing DB test 27 is single-transaction coverage.
- contracts.ts accepts distinct nomination external IDs and singleton sets, rejects blank/trimmed duplicates, scalar-winner coexistence and incompatible lifecycle states. These external strings still require reviewed canonical mapping; the contract validator cannot prove edition/category membership itself.
- `read_contest_result_typed(id,false/null)` returns unsupported_format for a set; true returns the complete set, never coerces a scalar. It is expressly a canonical-result projection, not an effective league-result resolver. No application reader adoption or pending-reconciliation/override held behavior is established here. Legacy consumers must stay disabled for these categories until integrated.
- Forward repair adds an admission-pausing trigger; it neither drops/narrows typed schema nor deletes historical results/nominations/credits. Existing history remains readable. Old scalar/draw/pending/no_contest paths remain subject to existing constraints. **Repair application and before/after no-loss checks were not executed** and are not covered by DB test 27 as read. Required proof: insert historical singleton/tied sets plus old outcomes, apply repair locally, compare all historical rows/reads, verify new sets fail 55000 and valid old outcomes still append, then rollback the whole proof transaction. Do not run the repair file's literal COMMIT inside a rollback-only fixture; transaction-wrap its DDL deliberately.

## Verification and limitations

Executed command (wrapper resets cwd, so all locations explicit):

```sh
/Users/yonnasgetahun/clawd/bin/exec -- npm --prefix /Users/yonnasgetahun/bracket-fyi test -- --root /Users/yonnasgetahun/bracket-fyi tests/ingestion/providers/balldontlie.test.ts tests/ingestion/providers/oscarbase.test.ts tests/ingestion/contracts/contracts.test.ts
```

Result: **3 files / 86 tests passed** (3 BDL, 4 OSC, 79 contracts). Adversarial harness demonstrated PS-01 through PS-05 despite that green suite. All values original synthetic; no credentials obtained or provider response captured. A local docker inventory command did not return promptly; no DB mutations or hosted fallback were attempted. SQL statements/tests were reviewed, not independently executed in this pass.

Changed: this review report only within repository.
Matters: safe-field/query and malformed-input claims currently exceed tested behavior.
Risk: live provider semantics, DB races/repair and effective-reader integration remain unverified.
Verdict: **ITERATE**. Remediation must be followed by **separate skeptical reviewers**; this report does not pre-approve postreview fixes.
