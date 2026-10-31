# Batch 1 independent skeptic 1 — runtime and consumers
Date: 2026-10-27. Scope: all High findings plus C5/C7/O1/FD-05. No application/test edits; no provider/network requests. Only this report written.

## Method and evidence ceiling
Inspected exact working-tree catalog.ts, outcomes.ts, providers/football-data.ts and providers/http.ts (the requested lib/ingestion/http.ts does not exist), v1 §§3–4/P2–P4/P10, execution-contract lines 56,91–109,155, template/provider contracts and observed-field mapping. Executed actual TypeScript via TypeScript transpileModule/CommonJS in memory, using installed dependencies; injected synthetic Response objects into FootballDataAdapter. No copied provider fixtures. SQL consumers source-inspected, NOT executed against a database. The generic diff-review skill was inspected but is not applicable to this fixed-file adversarial assignment; no additional review fan-out.

Key defensive counterevidence: catalog is draft/manual/unavailable, not live; rg finds no app/lib consumers of getEventDefinition/buildSyntheticManifest/scoreParticipant outside their declarations. Thus findings establish local API/acceptance defects, NOT observed production corruption. HTTP has fixed origin/path, query allowlist, redirect:error, abort/stream limits and sanitization. These do not validate returned event membership. Reviewed mapping gates and SQL edition/winner-membership checks exist. No repair made.

## Dispositions
### C1 — CONFIRMED
Attempted rebuttal: total 211, final market211 exists, explicit champion:210 should select it. Runtime defeats this: 168 result/24 qualifier/19 champion; championMarketId=market193, window11 (QF). catalog.ts:23–29 uses window index to select kinds and find(first champion) before fallback. Spec requires 188 regulation results +22 qualifiers +1 final. No advancement metadata rescues these templates.

### C2 — CONFIRMED
Attempted rebuttal: 76 might correctly denote entrants; 63 scored count is correct. But definition.markets are contests, not entrants: runtime 76 markets,13 structural,62 result,1 champion; market063 is window3 Sweet16. Actual terminal window has market075 scored and market076 structural. Counts [44,16,8,4,2,2] create the extra structural final; 12+63 should be75. Synthetic entrants independently number8, not76.

### C3 — CONFIRMED (narrow the semantic claim)
Runtime 8 series/7 champion; championMarketId market009 in conference semifinals although market015 exists in Finals. It is not established that kind=champion inherently prevents a series scorer from scoring the unit: MLB also represents its last series as champion. The decisive defect is first-of-seven champion selection plus absence of series identity/config for those later rounds, not a demonstrated seven-point loss in an integrated scorer.

### C4 — CONFIRMED
Runtime championMarketId market048, group window3; medal markets063/064 are indistinguishable result units. Their presence disproves “missing two medal slots,” but no final/bronze discriminator or winner/loser feed edges exists. Cannot infer which medal slot determines champion/third/fourth from this manifest.

### C5 — PARTIAL
Six NCAA/four NBA windows are factual; execution contract:56 requires lock mode and spec requires whole-bracket cutoff. Definition lacks lock mode/group, qualifier-completion opening rule and common cutoff. However several windows do NOT logically force different deadlines: a caller can assign identical cutoffs. windows.ts evaluateWindow independently evaluates supplied cutoff/state; there is no catalog-to-window consumer enforcing staggered locks. Treat as missing manifest semantics, not a proven exploitable late-round pick window.

### C6 — CONFIRMED
Runtime categories ["","a","a"] creates three scored markets without throwing, including blank category. Reversing ["a","b"] to ["b","a"] changes a's ID suffix1→2. All category markets share the same entrants array with identical synthetic-entrant IDs. Rebuttal: indexed market IDs are indeed unique, empty selection is rejected, and objects are frozen. Those guards do not reject duplicate categories or model ceremony+category+nomination identity. The defect concerns the claimed synthetic manifest, not populated official nominations.

### C7 — CONFIRMED (scope bounded)
Runtime NCAA entrants8, Play-In entrants6, edges0 for both; every market points to the same complete entrant array. Play-In requires8 entrants and winner/loser decider dependencies; NCAA requires76 and qualifier paths. Counterargument “generic small synthetic smoke fixtures are allowed” would be valid if only smoke fixtures were claimed. They cannot satisfy P2/E3/E4 advancement proof or complete local manifests; draft marking does not supply absent structure.

### O1 — CONFIRMED
Same single locked unresolved weight1 market x, picks={}:
- components=[] → {earned:0,maximum:0,wrong:1,pending:0}
- [{marketIds:["x"],worlds:null}] → maximum:null, same other fields
- same component with worlds:[{x:["a"]}] → maximum:0.
outcomes.ts:103 returns null before evaluating the locked forfeit, unlike uncovered branch:122. Unknown feasibility must remain unverified when it can change points; here all completion choices contribute zero. Spec §4 explicitly gives forfeits zero possible points. No consumer strips forfeited-only components before invocation.

### FD-01 — CONFIRMED at adapter boundary
Rebuttal: fixed CL URL/season/date query and reviewed match/team/stage allowlists strongly restrict ordinary traffic; SQL rejects canonical cross-edition references. Runtime nevertheless accepts mapped id9001 with row competition OTHER, season1901 and utcDate1901-01-01, emits final result attributed to configured ucl-2026-27; contradictory envelope competition also ignored. No consumer can recover removed competition/season metadata. Existing reviewed mapping does not authorize conflicting source identity. This is not proof of arbitrary unknown IDs being admitted.

### FD-02 — PARTIAL; unconditional failure disproven
Runtime contest externalId="9001", result contestExternalId="match-9001". Structural SQL 20261009000001:106 looks up observation external_object_id and :344–346 writes that reference; result SQL 20261009000002:187 looks up contestExternalId, :199–205 quarantines missing mapping. Thus test config with only9001 ref leaves result unmapped.
But config permits contestExternalId="9001"; a reviewed alias match-9001→same canonical contest also makes both resolve. Therefore mismatch is not intrinsically invalid under canonical-ID architecture and no unconditional database failure is established. Needs integration invariant/proof of both refs or matching config; SQL fail-closed guard prevents silent missing-ref projection. No database reproduction claimed.

### FD-03 — CONFIRMED at normalization boundary
Injected mapped FINAL, FINISHED/PENALTY_SHOOTOUT, regularTime1–1, declared HOME_TEAM, penalties5–4. Output final/draw with no winnerEventEntryExternalId; declaredWinner survives only in resultData. Rebuttal: regulation draw is CORRECT for nonfinal legs and existing tests deliberately require it. However normalization never branches on FINAL, while v1 §3.1 and observed-field contract explicitly require sole final champion including shootout. Result consumer accepts the emitted typed draw; no current stage-aware transformer found. Projection could be held for missing refs (FD-02), but fixing refs does not fix outcome semantics. Not evidence that every EXTRA_TIME row is wrong.

### FD-04 — CONFIRMED, with guards acknowledged
Injected unmapped id9002 → fetchedCount1,observations[]; stage/team mapping failures use same early return (football-data.ts:127). Dispatch processes observations only, so dropped row never reaches immutable evidence/quarantine. Counters preserve count, not identity/reason. FINISHED REGULAR score0–1 with declared HOME_TEAM → unresolved/pending without explicit conflict reason; contest still final. Existing pair-consistency guard successfully prevents a false winner, and malformed envelope/nonobject rows throw unsupported_shape. Downstream changed-terminal ordering can quarantine a contradiction when a prior final exists; it does not supply guaranteed quarantine on first observation or for rows never emitted. Observed-field mapping specifically requires contradictions/unknown identity held with reason.

### FD-05 — CONFIRMED; not correction authority
All injected rows have lastUpdated; emitted observations omit providerUpdatedAt AND omit lastUpdated from sanitizedPayload. observedAt is requestedAt. Dispatcher supports providerUpdatedAt and carries it into evidence; it cannot recover absent source time. Required provenance is explicit in observed-field mapping. Existing compareResultOrdering gates changed terminals on explicit reason/provenance/trusted-binding/newer time, so this finding does NOT justify automatically trusting lastUpdated for corrections. It should remain attributable source provenance under the established policy.

## Result
11 confirmed, 2 partial (C5, FD-02), none wholly disproven. Several broad interpretations disproven/narrowed above. Verdict: iterate; cannot accept batch from count-only tests. Runtime checks exercised actual exported functions; end-to-end DB/UI effects remain unverified.

## Reproduction details
The following exact in-memory harness was executed through guarded exec; it writes no test files and performs no network requests. Every fetch dependency returns an invented Response.

```js

const fs=require('fs'),ts=require('/Users/yonnasgetahun/bracket-fyi/node_modules/typescript'),Module=require('module');
const root='/Users/yonnasgetahun/bracket-fyi';
const cache={};function load(p){if(cache[p])return cache[p].exports;const m=new Module(p);cache[p]=m;m.filename=p;m.paths=Module._nodeModulePaths(root);m.require=(s)=>s.startsWith('@/')?load(root+'/'+s.slice(2)+'.ts'):require(require.resolve(s,{paths:[root]}));m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);return m.exports;}
const c=load(root+'/lib/events/catalog.ts');
for(const d of c.listEventDefinitions()){console.log(JSON.stringify({key:d.key,counts:d.markets.reduce((a,m)=>(a[m.kind]=(a[m.kind]||0)+1,a),{}),champion:d.championMarketId,championWindow:d.markets.find(m=>m.id===d.championMarketId)?.windowId,last:d.markets.at(-1)}));}
for(const key of ['ncaa-men-2027','nba-play-in-2027','oscars-2027']){const m=c.buildSyntheticManifest(key,{startsAt:'2030-01-01',categories:['','a','a']}); console.log('manifest',key,JSON.stringify({entrants:m.entrants.length,edges:m.edges.length,markets:m.markets.slice(0,3),shared:m.markets[0].entrants===m.markets[1].entrants}));}
for(const cats of [['a','b'],['b','a']])console.log('reorder',c.buildSyntheticManifest('oscars-2027',{startsAt:'2030-01-01',categories:cats}).markets.map(m=>m.id));
const o=load(root+'/lib/events/outcomes.ts');const markets=[{id:'x',weight:1,locked:true,result:{kind:'unresolved'}}];
for(const cs of [[],[{marketIds:['x'],worlds:null}],[{marketIds:['x'],worlds:[{x:['a']}]}]])console.log('forfeit',JSON.stringify(cs),o.scoreParticipant(markets,{},cs));
const {FootballDataAdapter}=load(root+'/lib/ingestion/providers/football-data.ts');
const context={bindingId:'00000000-0000-4000-8000-000000000001',providerKey:'football-data',eventEditionId:'00000000-0000-4000-8000-000000000002',bindingKey:'ucl-2026-27',adapterConfigVersion:1,adapterConfig:{mode:'provider',season:2027,seasonStart:'2026-07-01',seasonEnd:'2027-06-30',competitionExternalId:'ucl',eventEditionExternalId:'ucl-2026-27',stageMappings:{FINAL:{externalId:'final',name:'Final',kind:'knockout',ordinal:1}},matchMappings:{9001:{contestExternalId:'match-9001',contestKey:'ucl-match-9001',name:'Synthetic final'}},teamMappings:{101:{eventEntryExternalId:'entry-a',competitorExternalId:'team-a',name:'A'},202:{eventEntryExternalId:'entry-b',competitorExternalId:'team-b',name:'B'}}},windowStart:'2027-06-01T00:00:00Z',windowEnd:'2027-06-30T00:00:00Z',requestedAt:'2027-06-15T00:00:00Z',credential:{reference:'synthetic',getValue:()=> 'synthetic'}};
const row={id:9001,utcDate:'2027-06-10T18:00:00Z',status:'FINISHED',stage:'FINAL',lastUpdated:'2027-06-10T20:00:00Z',competition:{id:2001,code:'CL'},season:{id:2027,startDate:'2026-07-01',endDate:'2027-06-30'},homeTeam:{id:101},awayTeam:{id:202},score:{winner:'HOME_TEAM',duration:'PENALTY_SHOOTOUT',fullTime:{home:1,away:1},regularTime:{home:1,away:1},penalties:{home:5,away:4}}};
(async()=>{for(const [name,change] of [['final',{}],['wrong-edition',{competition:{id:999,code:'OTHER'},season:{id:1901,startDate:'1901-01-01',endDate:'1901-12-31'},utcDate:'1901-01-01'}],['unmapped',{id:9002}],['contradiction',{score:{winner:'HOME_TEAM',duration:'REGULAR',fullTime:{home:0,away:1}}}]]){let calls=0;const a=new FootballDataAdapter({fetch:async()=>{calls++;return new Response(JSON.stringify({competition:{code:'OTHER'},matches:[{...row,...change}]}))}});const b=await a.pull(context);console.log(name,calls,JSON.stringify(b));}})().catch(e=>{console.error(e);process.exitCode=1});

```
