# Phase 2 provider skeptic 1 — independent disproof attempt

Date: 2026-10-27. **Verdict: ITERATE on PS-01–05.** No allegation was disproven at the transport boundary. PS-04 is **partly valid** once runtime reachability and severity are narrowed; the other four are **confirmed**, with impact limits below.

## Work item (recorded before completion)

project: BRACKET-FYI  
done when:
- [x] Test each allegation against actual guards and original synthetic in-memory HTTP responses.
- [x] Record exact evidence, reachability limits and disposition by ID.
evidence: inline guarded Node reproductions below; four focused test files, 76 passing tests.

Only this report was written intentionally; no source/test edits, provider network, real credentials, DB operations, commits or branch changes. Existing edits preserved. The assigned scope overrides generic branch-review workflow; no implementation skill applied. Read repo AGENTS, v1 §6/§8, Phase 2 execution plan and full-roadmap provider contracts, actual BDL/OSC/shared HTTP/errors implementations and tests. Optional bounded repair inspection followed the primary reproduction, not substituted for it.

## Method and reachability

The inline harness loads **actual TypeScript source** using installed TypeScript transpileModule, CommonJS module loading and only `@/` alias resolution. It does not replace the HTTP helper, error schema, parser or guards. All response bodies are original synthetic JSON wrapped in native in-memory Response. Global fetch is replaced with a throwing function; every permitted injected fetch returns an in-memory response. Credential getter returns an invented string, and access count is recorded. No temporary source or fixture files were written.

Searched `fetchBdlPage` and `fetchOscarPage` under lib/app/tests: only definitions and corresponding transport tests use them. Thus these are callable exported boundary defects, **not demonstrated app-driven calls, persisted raw secrets, canonical scoring errors or active production exposure**. No intervening production caller validating invalid modes was found, but no production consumer of these functions was found either.

Shared HTTP guard constrains redirects, response bytes and JSON parsing; none validates leaf schemas or provider pagination relationships. Synthetic responses below are small valid JSON, so those guards cannot disprove the findings.

Source SHA-256 at reproduction:

| File | SHA-256 |
| --- | --- |
| lib/ingestion/providers/balldontlie.ts | 472d231acf1817a533b2ea9cc65f25fef04b5ba333ea9d34cbc6a6da7b7ea545 |
| lib/ingestion/providers/oscarbase.ts | b5efc68def1334202959f99cb9b926f16ca2c89715d6c2d4aa0a50968bc32b75 |
| lib/ingestion/providers/http.ts | bcbca34027766a09fe916008a5513538f59a447aa8eded0d297301590b89062b |

## Finding dispositions

### PS-01 — CONFIRMED, recursive allowlist/type defect (P4; reported HIGH)

Source: balldontlie.ts projectRow, scalar assignment and nestedFields copying.

Disproof attempts: top-level unknown sibling removal; nested-team unknown sibling removal; compare OSC's per-field scalar checks. BDL correctly strips `secret:"DROP"` siblings in both places, but field-name filtering does not constrain the retained value.

Input row:
`{season:2027,id:1,status:{secret:"SENTINEL"},home_team:{name:{secret:"SENTINEL"},secret:"DROP"},secret:"DROP"}`.

Actual safe data:
`[{"id":1,"season":2027,"status":{"secret":"SENTINEL"},"home_team":{"name":{"secret":"SENTINEL"}}}]`.
One credential read, one injected fetch. The arbitrary objects at both allowed scalar leaves survive exactly. OSC control `movie:{secret:"SENTINEL"}` rejects invalid_response.

Retain HIGH as a safe-evidence boundary priority, **not a proven credential disclosure**: no credential read from the provider body and no persistence/log/public exposure was demonstrated. Explicit leaf schemas are needed; removing unknown siblings alone is insufficient.

### PS-02 — CONFIRMED query violation; range impact conditional (P6; MEDIUM)

Source: balldontlie.ts dateStart/dateEnd URL construction.

Disproof attempts: compare each sport against the actual fixed registry; ordinary no-date request; observe exact generated query rather than presume vendor behavior. NBA and college registries allow start_date/end_date; NFL/MLB do not.

For dates 2027-01-01 through 2027-01-03, both NFL and MLB emitted:
`start_date=2027-01-01&dates[]=2027-01-01&end_date=2027-01-03&dates[]=2027-01-03`,
in addition to seasons[], per_page and their correct sport phase filter. Exactly one injected request each.

The forbidden keys are established independently of provider behavior. No dates[]=2027-01-02 was emitted. **Do not claim actual lost games**: whether the live service ignores/rejects/intersects these keys was not tested. Missing range semantics is an input-contract ambiguity; repair must define bounded enumeration or explicit date selection for sports lacking range filters.

### PS-03 — CONFIRMED malformed MLB score admission (P4/safe schema; MEDIUM)

Source: balldontlie.ts projectRow nestedFields branch.

Disproof attempt: top-level NFL home_team_score=-1 rejects invalid_response, proving the scalar score check is active. It cannot protect nested MLB runs.

Executed all eight combinations: each of home_team_data.runs and away_team_data.runs set to `-1`, `1.5`, `"two"`, or `{"secret":"SENTINEL"}`. Each returned unchanged successfully, one injected fetch. Thus the defect applies to both sides, not just the originally shown home side.

Scope: invalid score evidence in BdlSafePage, **not observed settlement or a false winner**. Missing/null runs may legitimately remain unknown; rejection of malformed non-null scores must not imply that every unknown score is an error.

### PS-04 — PARTLY VALID; direct runtime guards deficient, production reachability unproved (P6; bounded MEDIUM)

Source: initial mode/sport admission in balldontlie.ts and initial mode admission in oscarbase.ts.

Disproof attempts:
- Valid manual BDL returns empty, zero credential reads and zero fetches; OSC manual also zero fetches. The allegation must not say manual mode itself leaks calls.
- Unknown ordinary sport "cricket" rejects typed invalid_response before credential/fetch.
- TypeScript excludes "typo"/"constructor" from the declared unions. The executable probe intentionally crosses that type boundary using JavaScript; this is runtime validation evidence, not a conforming TypeScript caller.

Actual:
- BDL mode "typo": one getter read, one injected fetch, successful page.
- OSC mode "typo": one injected fetch, successful provisional row.
- BDL sport "constructor": one getter read, **zero fetches**, native TypeError with no ProviderAdapterError failure code.

Runtime mode admission is therefore fail-open except for literal manual, and `in` accepts an inherited sport key. However no configuration loader or production call site was found for these exports. **Narrow the finding to exported transport input validation; no active ingestion-stop bypass, arbitrary-origin request or production request from malformed config is proven.** Add exact mode and own-key admission before credential access; the probe cannot establish an end-to-end operational incident.

### PS-05 — CONFIRMED inconsistent envelopes and row-bound omission (P6; MEDIUM)

Source: oscarbase.ts response pagination validation.

Disproof attempts: numeric-string page rejected; duplicate IDs quarantined; mismatched category quarantined. These controls work but do not enforce envelope coherence. To exclude duplicate quarantine as mitigation, the new contradictions use **distinct IDs 1 and 2**, valid selected scope and boolean winner=false.

Actual successful returns:
1. total=0/page=1/totalPages=0, two rows: both provisional.
2. total=1/page=1/totalPages=1, two rows: both provisional.
3. Requested page=3; total=1/page=3/totalPages=1, empty data: returned successfully without nextPage.
4. total=101/page=1/totalPages=2, 101 distinct valid rows: all provisional, nextPage=2, despite request limit=100.

The page=1/totalPages=0 empty-result exception may be legitimate; **nonempty total=0 is not excused by that convention**. Do not require totalPages===ceil(total/100) without an explicit provider promise about page occupancy; bounds and obvious contradictions alone settle this finding. The result remains provisional, so accepted terminal pagination does not prove category settlement or complete evidence.

## Exact primary reproduction

Executed through the guarded wrapper, passing the following entire shell body as one quoted argument:
`/Users/yonnasgetahun/clawd/bin/exec -- '<shell body below>'` (ordinary shell single-quote escaping applied). Wrapper resets cwd; every module/root path is absolute. This is included inline so reproduction needs no new file.

```sh
node <<'SKEPTIC_JS'
const fs=require("fs"),path=require("path"),Module=require("module"),crypto=require("crypto");
const root="/Users/yonnasgetahun/bracket-fyi";
const ts=require(root+"/node_modules/typescript");
const resolve=Module._resolveFilename;
Module._resolveFilename=function(id,parent,...rest){return resolve.call(this,id.startsWith("@/")?root+"/"+id.slice(2):id,parent,...rest)};
require.extensions[".ts"]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
global.fetch=()=>{throw Error("NETWORK FORBIDDEN")};
const {fetchBdlPage}=require(root+"/lib/ingestion/providers/balldontlie.ts");
const {fetchOscarPage}=require(root+"/lib/ingestion/providers/oscarbase.ts");
async function b(id,extra={},data=[{season:2027}],meta={per_page:100,next_cursor:null}){
 let calls=0,reads=0,url;
 try {const result=await fetchBdlPage({sport:"nfl",season:2027,mode:"provider",credential:{getValue(){reads++;return "invented-test-token"}},fetch:async(u)=>{calls++;url=String(u);return new Response(JSON.stringify({data,meta}))},...extra}); console.log(JSON.stringify({id,calls,reads,url,result}));}
 catch(e){console.log(JSON.stringify({id,calls,reads,error:e.name,code:e.failure?.code}));}
}
const row={id:1,ceremony_id:4,ceremony_year:2027,category_id:9,winner:false};
async function o(id,extra={},data=[row],meta={total:1,page:1,totalPages:1}){
 let calls=0;
 try{const result=await fetchOscarPage({mode:"provider",year:2027,ceremonyIds:[4],categoryIds:[9],page:1,fetch:async()=>{calls++;return new Response(JSON.stringify({data,...meta}))},...extra});console.log(JSON.stringify({id,calls,result:{...result,data:result.data.length>2?{length:result.data.length,dispositions:[...new Set(result.data.map(r=>r.disposition))]}:result.data}}));}
 catch(e){console.log(JSON.stringify({id,calls,error:e.name,code:e.failure?.code}));}
}
(async()=>{
 for(const f of ["balldontlie","oscarbase","http"]) console.log("SHA256",f,crypto.createHash("sha256").update(fs.readFileSync(root+"/lib/ingestion/providers/"+f+".ts")).digest("hex"));
 await b("PS01",{},[{season:2027,id:1,status:{secret:"SENTINEL"},home_team:{name:{secret:"SENTINEL"},secret:"DROP"},secret:"DROP"}]);
 for(const sport of ["nfl","mlb"]) await b("PS02-"+sport,{sport,dateStart:"2027-01-01",dateEnd:"2027-01-03"});
 for(const runs of [-1,1.5,"two",{secret:"SENTINEL"}]) for(const side of ["home_team_data","away_team_data"]) await b("PS03-"+side,{sport:"mlb"},[{season:2027,[side]:{runs}}]);
 await b("PS04-bdl-mode",{mode:"typo"});
 await o("PS04-osc-mode",{mode:"typo"});
 await b("PS04-prototype",{sport:"constructor"});
 await b("control-manual",{mode:"manual"});
 await o("control-osc-manual",{mode:"manual"});
 await b("control-unknown-sport",{sport:"cricket"});
 await b("control-season",{},[{season:2026}]);
 await b("control-bad-score",{},[{season:2027,home_team_score:-1}]);
 await b("control-cursor",{cursor:4},[],{per_page:100,next_cursor:4});
 await o("PS05-zero",{},[row,{...row,id:2}],{total:0,page:1,totalPages:0});
 await o("PS05-count",{},[row,{...row,id:2}],{total:1,page:1,totalPages:1});
 await o("PS05-page",{page:3},[],{total:1,page:3,totalPages:1});
 await o("PS05-over100",{},Array.from({length:101},(_,i)=>({...row,id:i+1})),{total:101,page:1,totalPages:2});
 await o("control-osc-string-meta",{},[],{total:0,page:"1",totalPages:0});
 await o("control-osc-nested",{},[{...row,movie:{secret:"SENTINEL"}}]);
 await o("control-osc-duplicate",{},[row,row],{total:2,page:1,totalPages:1});
 await o("control-osc-scope",{},[{...row,category_id:10}]);
})().catch(e=>{console.error(e);process.exitCode=1});
SKEPTIC_JS
```

Exit 0. Every PS-labelled call succeeded as described except PS04-prototype, which caught native TypeError after the getter. Negative controls returned typed invalid_response, and manual controls returned with zero calls. Full output is summarized by exact values above; no live HTTP outcome is claimed.

## Focused existing tests

Executed:
```sh
/Users/yonnasgetahun/clawd/bin/exec -- npm --prefix /Users/yonnasgetahun/bracket-fyi test -- --root /Users/yonnasgetahun/bracket-fyi tests/ingestion/providers/balldontlie.test.ts tests/ingestion/providers/oscarbase.test.ts tests/ingestion/providers/football-data.test.ts tests/events/catalog.test.ts
```

Actual: **4 files / 76 tests passed**, exit 0 (BDL 3, OSC 4, football-data 49, catalog 20). Existing BDL/OSC coverage stays green despite every counterexample; that is absence of those regressions, not evidence against them.

## Optional bounded post-fix inspection — catalog and football-data

Read actual repaired code and tests before consulting repair summaries; independent verification below is not acceptance based on summaries.

Hashes:
- lib/events/catalog.ts: bc692f7e0e1ab62d65fa92c291acd74b7eabdf1983fd89fedf0a83bb7cf09109
- lib/ingestion/providers/football-data.ts: 2d6332b2caca70886bf9b69ec1b296fe1bf9b51670333f28d9ca4489816b022a

### Catalog: inspected repair supported at graph-export boundary

Independent execution called buildSyntheticManifest on all nine keys with startsAt=2033-02-03T04:05:06Z and two invented Oscar categories. Actual counts:

| Event | Entrants | Scored / unscored | Windows | Champion markets |
| --- | ---: | ---: | ---: | ---: |
| UCL | 36 | 211 / 0 | 13 | 1 |
| NFL | 14 | 13 / 0 | 1 | 1 |
| NCAA | 76 | 63 / 12 | 1 | 1 |
| NBA | 16 | 15 / 0 | 1 | 1 |
| Play-In | 8 | 6 / 0 | 1 | 0 |
| WWC | 32 | 64 / 0 | 7 | 1 |
| MLB | 12 | 11 / 0 | 1 | 1 |
| CFP | 12 | 11 / 0 | 1 | 1 |
| Oscars (two categories) | 8 | 2 / 0 | 1 | 0 |

All conditional-input markets had empty choices. More important than counts, inspected source encodes UCL leg reversal/qualifier links, NCAA unscored opening winners, separate Play-In loser/winner feeds, WWC bronze loser feeds, NBA/MLB series targets, NFL reseeding and CFP fixed paths. Independently executed the 20 existing catalog tests, including their graph evaluator and uniqueness/topological checks; all pass.

**Bounded support only**, not acceptance of UI pick resolution, real lock enforcement, persisted graph import, live official structure or whole-roadmap journeys. startsAt is a synthetic anchor, not a verified schedule; reviewed-placement sources remain intentionally unresolved.

### Football-data: sampled repaired boundaries supported; FD04 integration remains open

Fresh invented provider identifiers 71/72/73/74/75, reviewed contest reference "reviewed-contest", final regularTime 2–2, fullTime 3–3, penalties 6–7 and declared AWAY_TEAM produced:
- exactly contest and result observations;
- contest.externalId and result.data.contestExternalId both "reviewed-contest";
- result winner "entry-right", score 3–3 (not penalties summed into match score);
- lastUpdated retained as sanitized 2026-09-13T21:00:00.000Z; no providerUpdatedAt.

Independent negative probes:
- Change row season.id to 999: invalid_response, reason season_mismatch, rowIndex=0, fetchedCount=1.
- Change shootout fullTime to 4–3: invalid_response, reason score_conflict.
- Valid first row then unmapped ID 76: entire pull rejects invalid_response, reason unmapped_match, matchId="76", rowIndex=1, fetchedCount=2; no returned successful prefix.

49 existing football-data tests also pass. Source confirms explicit mode/own-status guards, reviewed IDs, scope/time checks, same-reference emission, single-match final consistency and untrusted provenance. **This does not prove SQL projection, immutable per-row quarantine, run-review UI or real provider parity.** FD04's failed-batch diagnostics are not equivalent to persisted per-row quarantine. No full adapter acceptance asserted.

Exact supplemental harness (same guarded inline invocation as above):
```js
const fs=require("fs"),path=require("path"),Module=require("module"),crypto=require("crypto");
const root="/Users/yonnasgetahun/bracket-fyi";
const ts=require(root+"/node_modules/typescript");
const resolve=Module._resolveFilename;
Module._resolveFilename=function(id,parent,...rest){return resolve.call(this,id.startsWith("@/")?root+"/"+id.slice(2):id,parent,...rest)};
require.extensions[".ts"]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
global.fetch=()=>{throw Error("NETWORK FORBIDDEN")};

const {FootballDataAdapter}=require(root+"/lib/ingestion/providers/football-data.ts");
const {buildSyntheticManifest,listEventDefinitions}=require(root+"/lib/events/catalog.ts");
for(const f of ["lib/events/catalog.ts","lib/ingestion/providers/football-data.ts"]) console.log("SHA256",f,crypto.createHash("sha256").update(fs.readFileSync(root+"/"+f)).digest("hex"));
for(const d of listEventDefinitions()){
 const m=buildSyntheticManifest(d.key,{startsAt:"2033-02-03T04:05:06Z",categories:["original-alpha","original-beta"]});
 console.log(JSON.stringify({catalog:d.key,entrants:m.entrants.length,scored:m.markets.filter(x=>x.scored).length,unscored:m.markets.filter(x=>!x.scored).length,windows:m.windows.length,champions:m.markets.filter(x=>x.role==="champion").length,unresolvedChoices:m.markets.filter(x=>x.inputs.some(s=>s.kind!=="entrant")).every(x=>x.choices.length===0)}));
}
const config={mode:"provider",season:2026,providerCompetitionId:"71",providerSeasonId:"72",seasonStart:"2026-07-01",seasonEnd:"2027-06-30",competitionExternalId:"synthetic-cup",eventEditionExternalId:"synthetic-edition",stageMappings:{FINAL:{externalId:"synthetic-final",name:"Synthetic Final",kind:"knockout",ordinal:1}},matchMappings:{"73":{contestExternalId:"reviewed-contest",contestKey:"reviewed-contest",name:"Synthetic contest"}},teamMappings:{"74":{eventEntryExternalId:"entry-left",competitorExternalId:"team-left",name:"Synthetic left"},"75":{eventEntryExternalId:"entry-right",competitorExternalId:"team-right",name:"Synthetic right"}}};
const base={id:73,utcDate:"2026-09-13T18:00:00Z",status:"FINISHED",stage:"FINAL",lastUpdated:"2026-09-13T21:00:00Z",competition:{id:71,code:"CL"},season:{id:72,startDate:config.seasonStart,endDate:config.seasonEnd},homeTeam:{id:74},awayTeam:{id:75},score:{duration:"PENALTY_SHOOTOUT",winner:"AWAY_TEAM",regularTime:{home:2,away:2},fullTime:{home:3,away:3},penalties:{home:6,away:7}}};
async function check(id,rows,overrides={}){
 const adapter=new FootballDataAdapter({fetch:async()=>new Response(JSON.stringify({competition:{id:71,code:"CL"},matches:rows}))});
 try{const batch=await adapter.pull({bindingId:"00000000-0000-4000-8000-000000000001",providerKey:"football-data",eventEditionId:"00000000-0000-4000-8000-000000000002",bindingKey:"synthetic",adapterConfigVersion:1,adapterConfig:config,windowStart:"2026-09-01T00:00:00Z",windowEnd:"2026-09-30T23:59:59Z",requestedAt:"2026-10-01T00:00:00Z",credential:{getValue:()=>"invented-test-token"},...overrides});console.log(JSON.stringify({id,observations:batch.observations.map(o=>({kind:o.entityKind,externalId:o.externalId,reference:o.data.contestExternalId,winner:o.data.winnerEventEntryExternalId,score:o.data.score,provenance:o.sanitizedPayload.lastUpdated,trustedRevision:o.providerUpdatedAt??null}))}));}
 catch(e){console.log(JSON.stringify({id,failure:e.failure}));}
}
(async()=>{
await check("FD02-03-05-positive",[base]);
await check("FD01-scope",[ {...base,season:{...base.season,id:999}} ]);
await check("FD03-impossible-shootout",[ {...base,score:{...base.score,fullTime:{home:4,away:3}}} ]);
await check("FD04-no-prefix",[base,{...base,id:76}]);
})();
```

## Closeout

changed: this report only; existing source/test edits preserved.  
matters: confirms four transport-boundary defects and narrows the runtime-input allegation without inventing production exploitation.  
checks: original in-memory counterexamples/negative controls exit 0; focused existing suite 76/76 passes; optional repaired-boundary samples supported.  
risk: no persistence, DB, app/browser, provider or activation proof; BDL/OSC integration absent in searched lib/app callers.  
verdict: **ITERATE PS-01–05; no whole-packet approval.**
