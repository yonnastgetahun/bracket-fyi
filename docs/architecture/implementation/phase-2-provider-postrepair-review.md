# Phase 2 provider postrepair acceptance

Date: 2026-10-27. **ACCEPT PS-01–05 at the repaired exported transport/parser boundary only.** Independent malformed-input challenges no longer reproduce the five defects. This is not acceptance of complete adapters, Phase 2, live activation or automatic settlement.

## Bounded work item

project: BRACKET-FYI
done when:
- [x] Independently challenge PS-01–05 against actual source with synthetic requests and legitimate controls.
- [x] Record exact source identities, commands, asserted outcomes and remaining scope.
evidence: 107 independently authored actual-source probes and focused suite below.

Read resolved repository AGENTS.md, v1.0 P4/P6 and provider requirements, fixed provider contracts, repair report and skeptics 1–3. No generic branch-review skill applied: this is a narrowly assigned boundary acceptance, not branch/spec-wide review. Only this report intentionally written; no source/test fixes, provider/network requests, actual credential reads, DB access, commits, subscription/route changes or activation. Existing subscription route retained. TASKS.md read; assignment restricts writes to this report.

## Method and exact snapshot

Installed TypeScript transpiles actual adapters and their actual HTTP/error dependencies in memory; native module loading resolves @/ to the absolute repository. No projector/parser mocks. Injected fetch returns native Response containing original synthetic JSON. Global fetch throws. Invented credential getter counts access; no environment or credential store inspected. This harness does not derive its malformed cases from BDL_SPORT_CONFIG, avoiding the repair suite's registry-coupling limitation. Source and test hashes match before/after independent probes:

| File | SHA-256 |
| --- | --- |
| lib/ingestion/providers/balldontlie.ts | 5ee5e2c1b9c850d43b55c091034b626483dfdd4476f516bbd94d738f3c6ebb94 |
| lib/ingestion/providers/oscarbase.ts | 2b28ff304cda19c72a3d58808b1c870a1038de6a1a6d550d765bde7feab9e653 |
| lib/ingestion/providers/http.ts | bcbca34027766a09fe916008a5513538f59a447aa8eded0d297301590b89062b |
| tests/ingestion/providers/balldontlie.test.ts | d3086de9bb6e4b26077c60de5b771bb290fdb8e6386ef3a14617ba87af1a87de |
| tests/ingestion/providers/oscarbase.test.ts | 607d324119e4f95d99e8bd4ee029c8f99fb3c81586fa92eae9f9ad4f330a36ce |

## Finding dispositions — behavior, not counts

| Finding | Independent adversarial evidence and controls | Disposition |
| --- | --- | --- |
| PS-01 recursive safe fields | Across all five sports: objects/arrays at status/date/team ID/name/league leaves; string conference ID; boolean OT score; string postseason; fractional period; numeric postponed/division; malformed OT elements; array team container all throw ProviderAdapterError/invalid_response after exactly one injected fetch. Legitimate unknown status strings and team id=0/name survive; private siblings vanish at both depths. College [0,3], empty OT list and null team preserved exactly. | Accept recursive shape repair. No semantic secret detector or complete identity admission claimed. |
| PS-02 exact dates/query | NFL/MLB one-sided bounds, multiday range, invalid non-leap date, numeric dates and empty strings reject before getter/fetch (0/0). Valid leap-day equal bounds emit exactly one dates[] and only season/page/sport-filter keys. No-date requests omit dates. NBA Play-In and both college sports retain start_date/end_date range, without dates[]; exact key/value objects asserted. | Accept narrowed contract: NFL/MLB no dates or explicit equal bounds only. No live range/intersection semantics inferred. |
| PS-03 MLB runs | BOTH sides individually reject negative, fractional, numeric-string, false, object, array and unsafe integer runs. Each side independently preserves zero, 8, null and absent runs (empty nested object); no unknown→zero conversion. | Accept integer validation and unknown-value distinction. No winner/series scoring claim. |
| PS-04 runtime guards | Both transports reject undefined/null/typo/false/array/object modes before any fetch or BDL getter. BDL constructor/__proto__/toString/array/null/cricket sports reject in BOTH manual and provider modes, before getter/fetch. Valid manual produces empty data with zero reads/calls. | Accept exported runtime guard repair, not application-level stop-switch proof. |
| PS-05 pagination | Distinct-ID envelopes reject zero-total with row, rows>total, page>totalPages, 101-row response, total>100*totalPages, empty-total page 2, contradictory empty-total totalPages, response/request page mismatch and string total. Empty convention, one-row terminal, sparse first/terminal pages and 100-row boundary pass; nextPage exact. Both true/false winners remain provisional. Duplicate IDs and out-of-scope category remain quarantined; nested OSC movie object rejects. | Accept count/bounds repair without inventing full-page occupancy or settlement guarantees. |

Additional BDL controls: same cursor rejects; per_page=101 rejects; cursor 7→8 succeeds. These are regression controls, not a new full-pagination audit.

### Precisely preserved limitations

- PS-G1 remains: BDL transport can accept season-only rows; required canonical game/team/date identity and reviewed postseason/CFP/Play-In membership are downstream obligations. Safe shape is not sufficient identity.
- PS-G2 remains: OSC grouped nomination mapping, cross-page duplicate/conflict handling and operator settlement/correction attestation. A terminal page and winner=false never establish a settled loser.
- No shared account budget/orchestrator/stop/shadow integration, durable replay, normalization/revision ordering, DB/scorer/UI end-to-end proof supplied here. Spec v1.0's full synthetic integration remains outstanding.
- Runtime guards tested across declared TypeScript unions using JavaScript. Scoped caller search finds only definitions and transport tests in lib/app/tests; no production consumer found there. No deployed exploit or ingestion completion inferred.
- No live schema parity, provider entitlement, date semantics, terms/retention permission, or activation verified. Alternate real types may fail closed until reviewed.
- Hash-bounded review only; concurrent or later source edits require fresh relevant verification.

## Commands and results

Focused suite, executed exactly:

~~~sh
/Users/yonnasgetahun/clawd/bin/exec -- npm --prefix /Users/yonnasgetahun/bracket-fyi test -- --root /Users/yonnasgetahun/bracket-fyi tests/ingestion/providers/balldontlie.test.ts tests/ingestion/providers/oscarbase.test.ts
~~~

Exit 0: BDL 13 tests, OSC 16 tests; 2 files / 29 passed. No new typecheck/build/full-suite claim.

Caller search (entire shell body passed as one quoted wrapper argument):

~~~sh
/Users/yonnasgetahun/clawd/bin/exec -- 'rg -n '\''fetchBdlPage|fetchOscarPage'\'' /Users/yonnasgetahun/bracket-fyi/lib /Users/yonnasgetahun/bracket-fyi/app /Users/yonnasgetahun/bracket-fyi/tests'
~~~

Exit 0; only definitions and corresponding transport tests found.

One initial spec-search invocation incorrectly passed the unprotected alternation through the wrapper; shell reported P4/P6/synthetic/manual command-not-found. Corrected by shell-quoting the entire body; successful scoped spec search then read P4/P6 and related requirements. That failed read was not verification evidence and changed no source.

### Exact independent reproduction

The following was executed as a single shell body through /Users/yonnasgetahun/clawd/bin/exec, with ordinary shell single-quote escaping of the whole body. Wrapper resets cwd; every repository path is absolute. No harness file written.

~~~sh
node <<'POSTREPAIR'
const fs=require("fs"),Module=require("module"),crypto=require("crypto"),a=require("assert/strict");
const root="/Users/yonnasgetahun/bracket-fyi",ts=require(root+"/node_modules/typescript"),resolve=Module._resolveFilename;
Module._resolveFilename=function(id,p,...r){return resolve.call(this,id.startsWith("@/")?root+"/"+id.slice(2):id,p,...r)};
require.extensions[".ts"]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
global.fetch=()=>{throw Error("NETWORK FORBIDDEN")};
const files=["lib/ingestion/providers/balldontlie.ts","lib/ingestion/providers/oscarbase.ts","lib/ingestion/providers/http.ts","tests/ingestion/providers/balldontlie.test.ts","tests/ingestion/providers/oscarbase.test.ts"];
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash("sha256").update(fs.readFileSync(root+"/"+f)).digest("hex")]));
const before=hashes();console.log(JSON.stringify({hashes:before}));
const {fetchBdlPage}=require(root+"/"+files[0]),{fetchOscarPage}=require(root+"/"+files[1]);
let n=0;const groups={};let group;
async function b(extra={},row={season:2032},meta={per_page:100,next_cursor:null}){
 let reads=0,calls=0,url;const out={};
 try{out.result=await fetchBdlPage({sport:"nfl",season:2032,mode:"provider",credential:{getValue(){reads++;return "invented"}},fetch:async u=>{calls++;url=new URL(u);return new Response(JSON.stringify({data:[row],meta}))},...extra})}catch(e){out.error=e.name;out.code=e.failure?.code}
 return {...out,reads,calls,url};
}
const R=id=>({id,ceremony_id:41,ceremony_year:2032,category_id:62,winner:false});
async function o(extra={},meta={total:1,page:1,totalPages:1},rows=[R(801)]){
 let calls=0;const out={};
 try{out.result=await fetchOscarPage({mode:"provider",year:2032,ceremonyIds:[41],categoryIds:[62],page:meta.page,fetch:async()=>{calls++;return new Response(JSON.stringify({...meta,data:rows}))},...extra})}catch(e){out.error=e.name;out.code=e.failure?.code}
 return {...out,reads:0,calls};
}
function checked(){n++;groups[group]=(groups[group]||0)+1}
function bad(x,early=false){a.equal(x.error,"ProviderAdapterError");a.equal(x.code,"invalid_response");a.equal(x.calls,early?0:1);if(early)a.equal(x.reads,0);checked()}
function good(x,verify){a.equal(x.error,undefined);verify(x);checked()}
(async()=>{
 group="PS01";
 const cases=[
 ["nfl",{status:{inner:["MARK"]}}],["nba",{home_team:{name:["MARK"]}}],["mlb",{away_team:{id:{deep:"MARK"}}}],
 ["ncaab",{home_team:{conference_id:"41"}}],["ncaaf",{home_score_ot:false}],
 ["nfl",{postseason:"false"}],["nba",{period:0.2}],["mlb",{date:[]}],
 ["ncaab",{away_ot_scores:[0,null]}],["ncaab",{home_ot_scores:[{x:1}]}],["ncaaf",{visitor_team:[]}],
 ["nfl",{home_team:{division:3}}],["nba",{postponed:0}],["mlb",{home_team:{league:{x:1}}}]
 ];
 for(const [sport,fields] of cases)bad(await b({sport,...(sport==="nba"?{nbaPhase:"playin"}:{})},{season:2032,...fields}));
 for(const sport of ["nfl","nba","mlb","ncaab","ncaaf"])good(await b({sport,...(sport==="nba"?{nbaPhase:"playoffs"}:{})},{season:2032,status:"unrecognized-state",home_team:{id:0,name:"Invented",private:{x:1}},private:{x:1}}),x=>a.deepEqual(x.result.data[0],{season:2032,status:"unrecognized-state",home_team:{id:0,name:"Invented"}}));
 good(await b({sport:"ncaab"},{season:2032,home_ot_scores:[0,3],away_ot_scores:[],home_team:null}),x=>a.deepEqual(x.result.data[0],{season:2032,home_ot_scores:[0,3],away_ot_scores:[],home_team:null}));
 group="PS03";
 for(const side of ["home_team_data","away_team_data"]){
 for(const v of [-4,0.25,"0",false,{},[],Number.MAX_SAFE_INTEGER+1])bad(await b({sport:"mlb"},{season:2032,[side]:{runs:v}}));
 for(const v of [0,8,null])good(await b({sport:"mlb"},{season:2032,[side]:{runs:v}}),x=>a.equal(x.result.data[0][side].runs,v));
 good(await b({sport:"mlb"},{season:2032,[side]:{}}),x=>a.deepEqual(x.result.data[0][side],{}));
 }
 group="PS02";
 for(const sport of ["nfl","mlb"]){
 for(const d of [{dateStart:"2032-02-28"},{dateEnd:"2032-02-29"},{dateStart:"2032-02-28",dateEnd:"2032-03-01"},{dateStart:"2031-02-29",dateEnd:"2031-02-29"},{dateStart:20320229,dateEnd:20320229},{dateStart:"",dateEnd:""}])bad(await b({sport,...d}),true);
 for(const d of [{},{dateStart:"2032-02-29",dateEnd:"2032-02-29"}])good(await b({sport,...d}),x=>{
 const expected={"seasons[]":"2032",per_page:"100",...(sport==="nfl"?{"season_types[]":"3"}:{season_type:"postseason"}),...(d.dateStart?{"dates[]":"2032-02-29"}:{})};
 a.deepEqual(Object.fromEntries(x.url.searchParams),expected);a.equal([...x.url.searchParams].length,Object.keys(expected).length);a.equal(x.calls,1);a.equal(x.reads,1);
 });
 }
 for(const sport of ["nba","ncaab","ncaaf"])good(await b({sport,...(sport==="nba"?{nbaPhase:"playin"}:{}),dateStart:"2032-02-28",dateEnd:"2032-03-01"}),x=>a.deepEqual(Object.fromEntries(x.url.searchParams),{"seasons[]":"2032",per_page:"100",...(sport==="nba"?{season_type:"playin"}:{}),start_date:"2032-02-28",end_date:"2032-03-01"}));
 group="PS04";
 for(const mode of [undefined,null,"typo",false,["provider"],{toString(){return "provider"}}]){bad(await b({mode}),true);bad(await o({mode}),true)}
 for(const sport of ["constructor","__proto__","toString",["nfl"],null,"cricket"])for(const mode of ["manual","provider"])bad(await b({sport,mode}),true);
 good(await b({mode:"manual"}),x=>{a.equal(x.calls,0);a.equal(x.reads,0);a.deepEqual(x.result.data,[])});
 good(await o({mode:"manual"}),x=>{a.equal(x.calls,0);a.deepEqual(x.result.data,[])});
 group="PS05";
 for(const [total,page,totalPages,count] of [[0,1,0,1],[1,1,1,2],[1,2,1,0],[101,1,2,101],[201,1,2,1],[0,2,0,0],[0,1,1,0]])bad(await o({},{total,page,totalPages},Array.from({length:count},(_,i)=>R(801+i))));
 bad(await o({page:1},{total:2,page:2,totalPages:2},[]));
 bad(await o({},{total:"1",page:1,totalPages:1}));
 for(const [total,page,totalPages,count,next] of [[0,1,0,0,undefined],[1,1,1,1,undefined],[2,1,2,1,2],[2,2,2,1,undefined],[200,1,2,100,2]])good(await o({},{total,page,totalPages},Array.from({length:count},(_,i)=>({...R(801+i),winner:i%2===0}))),x=>{a.equal(x.result.nextPage,next);a.equal(x.result.data.length,count);a.ok(x.result.data.every(r=>r.disposition==="provisional"))});
 good(await o({},{total:2,page:1,totalPages:1},[R(801),R(801)]),x=>a.ok(x.result.data.every(r=>r.disposition==="quarantined")));
 good(await o({},undefined,[{...R(801),category_id:63}]),x=>a.equal(x.result.data[0].disposition,"quarantined"));
 bad(await o({},undefined,[{...R(801),movie:{hidden:"MARK"}}]));
 group="BDL-pagination-controls";
 bad(await b({cursor:7},undefined,{per_page:100,next_cursor:7}));
 bad(await b({},undefined,{per_page:101,next_cursor:null}));
 good(await b({cursor:7},undefined,{per_page:100,next_cursor:8}),x=>a.equal(x.result.nextCursor,8));
 a.deepEqual(hashes(),before);
 console.log(JSON.stringify({probes:n,groups,sourceHashesUnchanged:true,allAssertionsPassed:true}));
})().catch(e=>{console.error(e);process.exitCode=1});

POSTREPAIR
~~~

Exit 0, final asserted output:

~~~json
{"probes":107,"groups":{"PS01":20,"PS03":22,"PS02":19,"PS04":26,"PS05":17,"BDL-pagination-controls":3},"sourceHashesUnchanged":true,"allAssertionsPassed":true}
~~~

Every counted probe includes rejection type/code/call-count assertions or explicit success-output assertions. This is not merely output inspection or a count-based acceptance.

changed: this review report only.
matters: independent malformed inputs fail closed while legitimate unknown, sparse and manual controls survive.
checks: 107 actual-source synthetic probes; 29 focused tests; hash stability; scoped callers.
risk: all integration/live/settlement gaps above remain.
verdict: **ACCEPT PS-01–05 narrowly; HOLD complete-provider and whole-roadmap acceptance.**
