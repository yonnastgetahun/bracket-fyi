# Phase 2 provider skeptic 3 — independent pre-repair disproof

Date: 2026-10-27. **Verdict: ITERATE. PS-01–05 reproduced; no finding disproven.** Scope: third skeptical review required before repair, not a post-fix acceptance.

## Bounded work item

project: BRACKET-FYI

done when:
- [x] Challenge malformed scalar retention, query keys, MLB scores, runtime admission and OSC pagination using actual source and independent synthetic responses.
- [x] Record controls and narrow severity to demonstrated outcomes.

evidence: 39 injected-fetch probes, exit 0; exact executable harness below.

Read repository AGENTS.md (resolved symlink to /Users/yonnasgetahun/Projects/agent-scripts/AGENTS.MD), provider/schema review, skeptic 1 and 2 reports, fixed provider registry and actual BDL/OSC/shared HTTP implementations. Only this report written intentionally. No source/test changes, network requests, provider access, real credentials, DB access, commits or activation. Existing dirty/untracked work preserved. Scope-specific independent reproduction used instead of generic branch-review workflow.

## Method and source identity

Actual TypeScript transpiled in memory through installed TypeScript; native module loading with @/ alias resolution. Actual HTTP bounding/parsing helper remains intact. Every request receives an injected fetch returning an original synthetic JSON Response. Global fetch throws. Invented credential getter counts access only; no credential store or environment inspected. All probes use season/year 2031 and invented nomination IDs starting at 301.

SHA-256 before and after the 39 probes matched:

| File under lib/ingestion/providers | SHA-256 |
| --- | --- |
| balldontlie.ts | 472d231acf1817a533b2ea9cc65f25fef04b5ba333ea9d34cbc6a6da7b7ea545 |
| oscarbase.ts | b5efc68def1334202959f99cb9b926f16ca2c89715d6c2d4aa0a50968bc32b75 |
| http.ts | bcbca34027766a09fe916008a5513538f59a447aa8eded0d297301590b89062b |

Static rg over lib/app/tests found only definitions and transport tests for fetchBdlPage/fetchOscarPage. No application caller was found in those directories. This is proof of callable boundary behavior, not a deployed ingestion incident. Existing test suite was not rerun in this pass; independent probes are the verification evidence, not prior reviewers' green tests.

## PS-01 — confirmed; HIGH contract-remediation priority, not proven high-impact disclosure

Marker M = {private_blob:{nested:["S3-SENTINEL"]}}.

Input row {season:2031,id:301,status:M,home_team:{name:M,extra:"DROP"},extra:"DROP"} returns exactly the permitted keys with **M unchanged at both status and home_team.name**. The extra siblings disappear. A separate row with date:[M] and home_team.id:[M] also retains both arrays. This independently excludes a narrow “only one malformed object field” explanation.

Negative controls:
- home_team:[M] rejects typed invalid_response: container validation exists, but does not constrain leaf values.
- OSC movie:M rejects typed invalid_response.
- BDL status:"S3-SENTINEL" and team name:"Invented Team" return strings normally. Scalar validation cannot identify arbitrary sensitive meaning in permitted text.

The recursive allowlist promise fails at returned BdlSafePage. Retain HIGH as the existing workflow's **safe-payload boundary repair priority** because arbitrary unenumerated nested contents traverse purportedly sanitized output. Evidence does **not** establish real secrets, stored/provider data leakage, credential exfiltration, executable injection, public exposure or canonical settlement. If severity means observed production/security impact rather than contract priority, HIGH is not established by this snapshot alone. Parser shape validation is the necessary repair; do not claim semantic secret detection.

## PS-02 — confirmed MEDIUM, limited to registry violation

Dates 2031-01-04 through 2031-01-06 produce start_date, end_date and two dates[] entries containing only Jan 4 and Jan 6 for each of five sports.

NFL exact decoded query:
seasons[]=2031 & per_page=100 & season_types[]=3 & start_date=2031-01-04 & dates[]=2031-01-04 & end_date=2031-01-06 & dates[]=2031-01-06.

MLB differs by season_type=postseason. Both start_date/end_date are forbidden by their fixed registry rows. NBA/NCAAB/NCAAF permit these keys: their identical construction is a **negative control against generalizing the forbidden-key finding**. No-date NFL omits all date keys and uses only permitted season/phase/page keys.

No Jan 5 dates[] entry is emitted, but no live provider behavior was exercised. Lost games, rejected production requests and filter intersection/union semantics remain unproved. Define bounded sport-specific range/list semantics before repair acceptance.

## PS-03 — confirmed MEDIUM malformed score evidence

For both home_team_data.runs and away_team_data.runs together, each value -2, 0.5, "7", and M was accepted and retained unchanged. This includes a numeric string, not merely obvious nonscore text. Zero and null were also retained as distinct score/unknown controls.

NFL home_team_score=-2 rejects typed invalid_response. Thus the common top-level numeric guard works, but nested runs copying bypasses it. Object-valued runs overlap PS-01; negative/fractional/string values independently establish PS-03. No winner, series clinch or scoring result was emitted. Preserve zero/null semantics rather than coercing unknown to zero.

## PS-04 — confirmed MEDIUM exported runtime admission defect; operational impact bounded

| Input | Getter reads | Injected fetches | Observed outcome |
| --- | ---: | ---: | --- |
| BDL mode typo/null/undefined (each) | 1 | 1 | Accepted valid empty page |
| OSC mode typo/null/undefined (each) | N/A | 1 | Accepted valid empty page |
| BDL manual | 0 | 0 | Empty page |
| OSC manual | N/A | 0 | Empty page |
| BDL sport constructor/__proto__/toString (each) | 1 | 0 | Native TypeError |
| BDL sport cricket | 0 | 0 | Typed invalid_response |

JavaScript probes intentionally cross the declared TypeScript unions. Runtime inputs are not type-checked by those declarations. Missing mode behaves as provider mode too. Literal manual still prevents fetching; do not misdescribe this as manual itself leaking requests.

Inherited sport keys cause premature getter access, **not an outbound request**. No prototype mutation, arbitrary origin, actual token disclosure or app-reachable stop-switch bypass demonstrated. OSC has no credential getter. Fix exact modes and own-key membership before credential access; retain manual no-fetch controls.

## PS-05 — confirmed MEDIUM pagination coherence and row-limit defect

All rows use distinct IDs and matching scope; successful nonempty rows stay provisional.

| total / page / totalPages / row count | Observed |
| --- | --- |
| 0 / 1 / 0 / 2 | Accepted, 2 provisional, no nextPage |
| 1 / 1 / 1 / 2 | Accepted, 2 provisional, no nextPage |
| 1 / 4 / 1 / 0 | Accepted, no nextPage |
| 101 / 1 / 2 / 101 | Accepted, 101 provisional, nextPage=2 |
| 0 / 1 / 0 / 0 | Accepted empty control |
| 1 / 1 / 1 / 1 | Accepted terminal control |
| 2 / 1 / 2 / 1 | Accepted sparse-page control, nextPage=2 |
| 0 / 1 / 1 / 0 | Rejected invalid_response control |
| response page=2, request page=1 | Rejected invalid_response control |

The sparse-page control matters: do not invent totalPages=ceil(total/100) without a provider occupancy promise. Require obvious count/bounds coherence and response row count <= requested 100. The conventional page=1/totalPages=0 empty case needs an explicit exception. Duplicate quarantine cannot explain these results because IDs are distinct. Small valid JSON passes the 2 MiB transport guard; byte bounding does not enforce pagination. No downstream loss/completeness assertion or settled award was demonstrated.

## Exact reproduction

Execute the following heredoc through the workspace wrapper as **one shell-quoted command argument** (the wrapper joins arguments and resets cwd). It creates no harness file. All paths absolute.

```sh
node <<'SKEPTIC3'
const fs=require("fs"),Module=require("module"),crypto=require("crypto"),assert=require("assert/strict");
const root="/Users/yonnasgetahun/bracket-fyi",ts=require(root+"/node_modules/typescript");
const resolve=Module._resolveFilename;
Module._resolveFilename=function(id,p,...r){return resolve.call(this,id.startsWith("@/")?root+"/"+id.slice(2):id,p,...r)};
require.extensions[".ts"]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
global.fetch=()=>{throw Error("NETWORK FORBIDDEN")};
const files=["balldontlie","oscarbase","http"];
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash("sha256").update(fs.readFileSync(root+"/lib/ingestion/providers/"+f+".ts")).digest("hex")]));
const before=hashes(); console.log(JSON.stringify({hashes:before}));
const {fetchBdlPage}=require(root+"/lib/ingestion/providers/balldontlie.ts"),{fetchOscarPage}=require(root+"/lib/ingestion/providers/oscarbase.ts");
let count=0;
async function b(label,rows=[{season:2031}],extra={}){
 let reads=0,calls=0,url;const out={label};
 try{out.result=await fetchBdlPage({sport:"nfl",season:2031,mode:"provider",credential:{getValue(){reads++;return "invented-not-a-credential"}},fetch:async u=>{calls++;url=String(u);return new Response(JSON.stringify({data:rows,meta:{per_page:100,next_cursor:null}}))},...extra})}catch(e){out.error=e.name;out.code=e.failure?.code}
 Object.assign(out,{reads,calls,url});console.log(JSON.stringify(out));count++;return out;
}
const R=id=>({id,ceremony_id:14,ceremony_year:2031,category_id:29,winner:false});
async function o(label,n=1,meta={total:1,page:1,totalPages:1},extra={},rowExtra={}){
 let calls=0;const out={label};
 try{const r=await fetchOscarPage({mode:"provider",year:2031,ceremonyIds:[14],categoryIds:[29],page:meta.page,fetch:async()=>{calls++;return new Response(JSON.stringify({...meta,data:Array.from({length:n},(_,i)=>({...R(i+301),...rowExtra}))}))},...extra});out.result={...r,data:r.data.length>2?{length:r.data.length,dispositions:[...new Set(r.data.map(x=>x.disposition))]}:r.data}}catch(e){out.error=e.name;out.code=e.failure?.code}
 out.calls=calls;console.log(JSON.stringify(out));count++;return out;
}
(async()=>{
 const marker={private_blob:{nested:["S3-SENTINEL"]}};
 const a=await b("PS01-object",[{season:2031,id:301,status:marker,home_team:{name:marker,extra:"DROP"},extra:"DROP"}]);
 assert.deepEqual(a.result.data[0].status,marker);assert.deepEqual(a.result.data[0].home_team,{name:marker});assert.equal(a.result.data[0].extra,undefined);
 await b("PS01-array",[{season:2031,date:[marker],home_team:{id:[marker]}}]);
 await b("control-bdl-scalar",[{season:2031,status:"S3-SENTINEL",home_team:{name:"Invented Team"}}]);
 assert.equal((await b("control-team-container",[{season:2031,home_team:[marker]}])).code,"invalid_response");
 assert.equal((await o("control-osc-scalar-object",1,undefined,{}, {movie:marker})).code,"invalid_response");
 for(const sport of ["nfl","mlb","nba","ncaab","ncaaf"])await b("PS02-"+sport,[],{sport,...(sport==="nba"?{nbaPhase:"playoffs"}:{}),dateStart:"2031-01-04",dateEnd:"2031-01-06"});
 await b("control-no-dates",[]);
 for(const runs of [-2,0.5,"7",marker,0,null])await b("PS03-"+JSON.stringify(runs),[{season:2031,home_team_data:{runs},away_team_data:{runs}}],{sport:"mlb"});
 assert.equal((await b("control-top-score",[{season:2031,home_team_score:-2}])).code,"invalid_response");
 for(const mode of ["typo",null,undefined,"manual"]){await b("PS04-bdl-"+String(mode),[],{mode});await o("PS04-osc-"+String(mode),0,{total:0,page:1,totalPages:0},{mode})}
 for(const sport of ["constructor","__proto__","toString","cricket"])await b("PS04-sport-"+sport,[],{sport});
 for(const [label,n,total,page,totalPages] of [
 ["PS05-zero",2,0,1,0],["PS05-count",2,1,1,1],["PS05-page",0,1,4,1],["PS05-limit",101,101,1,2],
 ["control-empty",0,0,1,0],["control-terminal",1,1,1,1],["control-sparse",1,2,1,2],["control-bad-zero",0,0,1,1]])
 await o(label,n,{total,page,totalPages});
 await o("control-page-mismatch",0,{total:2,page:2,totalPages:2},{page:1});
 assert.deepEqual(hashes(),before);console.log(JSON.stringify({probes:count,sourceHashesUnchanged:true}));
})().catch(e=>{console.error(e);process.exitCode=1});
SKEPTIC3
```

Observed final line: {"probes":39,"sourceHashesUnchanged":true}; process exit 0. Assertions cover scalar escape, selected rejecting controls and unchanged provider source hashes; the remaining labeled outputs were inspected against the tables above.

## Closeout

changed: this report only.
matters: independent controls did not defeat any PS finding; necessary repairs are concrete without exaggerating production exposure.
checks: 39 actual-source, injected-synthetic-fetch probes; no network; source hashes unchanged; scoped caller search.
risk: live provider semantics, downstream retention/settlement and runtime configuration reachability remain unverified; no DB/schema conclusions added.
verdict: **ITERATE**. Pre-repair third skeptical review complete. Post-repair independent verification still required; this report does not accept future fixes or activate providers.
