# Phase 2 provider skeptic 2 — PS-01–05

Date: 2026-10-27. Independent current-working-tree synthetic review. **Verdict: ITERATE. All five findings reproduced, with narrowed claims below.**

## Bounded work item

project: BRACKET-FYI

done when:
- [x] Challenge each PS finding against actual provider source with independent synthetic execution and controls.
- [x] Separate demonstrated parser/transport defects from unproved credential disclosure, settlement and live-provider effects.

evidence: execution results and reproducible recipes below; existing provider tests 2 files / 7 passed.

Only this report written. No source/test/schema changes, commits, network, real credentials, DB access or activation. Pre-existing dirty/untracked work preserved. Read repository AGENTS, original provider/schema review, full-roadmap provider contracts, both provider implementations/tests and shared HTTP/error handling.

## Execution method

All commands routed through /Users/yonnasgetahun/clawd/bin/exec; repository paths absolute. An inline Node heredoc loaded /Users/yonnasgetahun/bracket-fyi/node_modules/typescript, registered a .ts require hook using transpileModule (CommonJS, ES2022, esModuleInterop), and resolved @/ to the repository root through Module._resolveFilename. Thus actual provider, HTTP, error and imported contract source executed, not a mock projector. global.fetch was replaced with a throwing NETWORK FORBIDDEN sentinel. Each provider input received its own async injected fetch returning new Response(JSON.stringify(body)); the credential getter returned an invented placeholder and incremented a counter. No harness file retained.

Common BDL input: {sport:"nfl",season:2027,mode:"provider"}, injected fetch and counted getter. BDL body helper: {data:rows,meta:{per_page:100,next_cursor:null}}.
Common OSC input: {mode:"provider",year:2027,ceremonyIds:[4],categoryIds:[9],page:1}, injected fetch. OSC valid row helper R(id): {id,ceremony_id:4,ceremony_year:2027,category_id:9,winner:false}. All OSC multiplerow cases use DISTINCT ids, eliminating duplicate quarantine as a confounder.

## Dispositions and exact reproductions

### PS-01 — confirmed recursive shape escape; narrow the secret claim

BDL body row: {season:2027,status:{secret:"SYNTHETIC"},home_team:{name:{secret:"SYNTHETIC"},secret:"DROP"},secret:"DROP"}.
Actual returned row: {season:2027,status:{secret:"SYNTHETIC"},home_team:{name:{secret:"SYNTHETIC"}}}. Unknown sibling keys are removed; objects under permitted scalar leaves survive. Counterexample defeats recursive allowlisting even though ordinary sibling stripping works.

Control: OSC R(1) with movie:{secret:"SYNTHETIC"}, total=1/page=1/totalPages=1 throws ProviderAdapterError invalid_response. BDL with status:"SYNTHETIC" and home_team.name:"SYNTHETIC" accepts both strings. Therefore distinguish malformed **objects beneath scalar-designated keys** from a secret-looking **string value inside a permitted text field**. Scalar typing fixes the first, not semantic secret detection in otherwise permitted text. No actual credential was echoed or leaked by these probes, and no persistence/public sink was exercised. Preserve high-priority safe-page boundary remediation; do not label this demonstrated credential exfiltration.

### PS-02 — confirmed NFL/MLB forbidden keys; range behavior unresolved

For each sport use dateStart="2027-01-01", dateEnd="2027-01-03" and empty valid response (NBA additionally nbaPhase="playoffs"). All five URLs contain start_date, end_date, and dates[]=2027-01-01 plus dates[]=2027-01-03. NFL additionally has seasons[], per_page and season_types[]; MLB has seasons[], per_page and season_type.

The registry explicitly excludes start_date/end_date for NFL/MLB; confirmed MEDIUM allowlist breach. It explicitly permits those keys for NBA/NCAAB/NCAAF, so do not generalize the invalid-key finding to all five. No Jan 2 date is emitted in dates[]. That proves only endpoint-list construction, not how a real provider combines date-list and range filters or whether a game is actually lost. Define sport-specific date semantics and test exact query-key sets; any enumeration must be bounded. No live behavior assumed.

### PS-03 — confirmed MLB runs validation bypass, separate from settlement

With sport="mlb", row {season:2027,home_team_data:{runs:v},away_team_data:{runs:v}}, separately set v=-1, 1.5, "two", {secret:"SYNTHETIC"}, 0, null. All six cases accepted and retained unchanged for BOTH teams. Control NFL home_team_score=-1 throws typed invalid_response. The generic scalar score check does exist but the nested runs copy bypasses it.

Confirmed MEDIUM malformed score admission. Object-valued runs overlap PS-01; negative, fractional and string runs independently demonstrate numeric validation failure. Zero and null should remain distinct valid score/unknown controls, not regress to fabricated zero. Neither a wrong winner nor settlement was produced or established by this transport.

### PS-04 — confirmed mode fail-open and inherited-key credential access; separate outcomes

| Input override | Credential reads | Injected fetch calls | Result |
| --- | ---: | ---: | --- |
| BDL mode="manual" | 0 | 0 | Empty page |
| OSC mode="manual" | 0 | 0 | Empty page |
| BDL mode="typo" or null | 1 each | 1 each | Accepted empty valid page |
| OSC mode="typo" or null | 0 | 1 each | Accepted empty valid page |
| BDL sport="constructor", "toString", "__proto__" | 1 each | 0 each | Native TypeError |
| BDL sport="not-a-sport" | 0 | 0 | ProviderAdapterError invalid_response |

Confirmed MEDIUM runtime admission defect in callable entry points. Invalid modes reach the injected transport (BDL after credential read); inherited sport names reach credential access but fail URL construction before fetch. OSC is unauthenticated and has no credential requirement: do not claim OSC secret access. No prototype pollution, arbitrary-origin request, credential disclosure or deployed caller exposure proved. Static TypeScript types do not enforce runtime config, but exploit reachability through application callers was not assessed. Require exact supported modes and own-key sport admission before credential resolution; preserve manual no-fetch/no-credential control.

### PS-05 — confirmed inconsistent OSC envelope, independent of duplicates

Each body uses data=[R(1),...,R(n)] with unique ids. Request page equals response page.

| total / page / totalPages / n | Actual result |
| --- | --- |
| 0 / 1 / 0 / 2 | Accepted; both rows provisional; no nextPage |
| 1 / 1 / 1 / 2 | Accepted; both rows provisional; no nextPage |
| 1 / 3 / 1 / 0 | Accepted; no nextPage |
| 101 / 1 / 1 / 101 | Accepted; all 101 provisional; no nextPage |
| 0 / 1 / 0 / 0 | Accepted valid empty control |
| 0 / 1 / 1 / 0 | Rejected invalid_response control |
| 1 / 1 / 1 / 1 | Accepted valid terminal control |

Confirmed MEDIUM pagination coherence/limit defect. Existing check rejects some malformed metadata but not these contradictions. The 101-row case stays below the existing 2 MiB body cap: byte boundedness does not prove requested row-limit compliance. Coherent empty-page policy must be explicit; preserve conventional page=1/totalPages=0 for empty results. Do not impose totalPages=ceil(total/100) without a guaranteed provider page-size contract: existing tests intentionally use total=2,totalPages=2 with one row. At minimum enforce data length <= requested limit and <= total, empty total has no rows, and nonempty page bounds. This review does not prove data loss in a downstream paginator or falsely settled awards.

## Existing test proof and limits

Executed:

~~~sh
/Users/yonnasgetahun/clawd/bin/exec -- npm --prefix /Users/yonnasgetahun/bracket-fyi test -- --root /Users/yonnasgetahun/bracket-fyi tests/ingestion/providers/balldontlie.test.ts tests/ingestion/providers/oscarbase.test.ts
~~~

Result: 2 files / 7 tests passed. Independent inline harness: 32 probes covering findings plus controls; all outcomes above observed. Existing BDL tests do not constrain permitted scalar leaf types, nested runs types, runtime unknown modes/inherited sports, or exact date query keys. Existing OSC tests protect nested scalar types and some pagination cases, but not these envelope contradictions or unknown mode.

changed: this report only.
matters: green transport tests do not establish recursive safe-field, runtime admission or pagination contract compliance.
checks: actual-source synthetic execution plus focused suite; no network or credentials.
risk: provider live semantics, caller reachability, downstream persistence/settlement and concurrent source changes outside this snapshot unverified.
verdict: **ITERATE**; findings need implementation and separate post-fix skeptical verification. This report does not cover typed nomination DB/schema findings or authorize activation.
