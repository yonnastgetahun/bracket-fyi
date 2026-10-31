# Phase 2 bridge/seeder independent review

## Review work item

project: BRACKET-FYI
done when:
- [x] Independent semantic oracles exercise partial graphs, feasible maxima and drift.
- [x] Nine draft/manual editions and insert/lost-ack/replay semantics are verified locally.
- [x] Findings and full-integration exclusions are recorded without changing implementation/tests.
evidence: commands and executable synthetic probes below.

## Scope and verdict

**2026-10-27 — ITERATE on the structural-qualification boundary; bounded ACCEPT of the exercised Play-In/UCL scoring and conforming-repository seeder behavior. Full integration remains OPEN.**

Reviewed working-tree `lib/events/scoring-bridge.ts`, `template-seeder.ts`, associated event tests, catalog, outcomes primitive, and the bridge/seeder implementation reports against approved spec v1.0 §§3, 4, 6–7. Baseline HEAD was `3ca08fbd7d3cfa5266a2114ab3bb3f9f391d83e8`; working-tree files, not HEAD alone, are the reviewed artifact. No production or test edits, hosted database, provider/network requests, publication, or real notifications.

This is independent execution of independently derived expectations, not acceptance based on builder test counts. The existing report's 15 bridge tests is consistent with this rerun.

## Findings

### F1 — Known unscored qualification is not used to condition a scored maximum (medium; integration correctness boundary)

Locations: `lib/events/scoring-bridge.ts:161`, `:168`, `:195`.

Minimal actual NCAA subgraph: Opening Round A versus B (structural/unscored), followed by scored Round-of-64 winner-of-opening versus C. Set effective opening outcome to A. Leave Round-of-64 orientation unresolved, lock its window, save B as the Round-of-64 pick. Supply the exhaustive *pre-result* possible Round-of-64 winners A/B/C as one trusted component.

Observed accepted row: **earned 0, maximum 1, wrong 0, pending 1**.

Independent expectation: B cannot win after elimination. The supplied state must either be rejected (locked NCAA market lacks resolved qualification/pairing), or the maximum must not count B (0 for that saved pick; null is a conservative fallback). Reporting 1 is not supported by the known graph result.

Reason: predicted path validation receives only saved picks; no structural pick exists to carry A's qualification. World filtering consults structural outcomes only while checking a non-null actual orientation. The primitive subsequently sees only scored markets, so it cannot filter B using the unscored opening outcome. Graph-version evidence does not change on ordinary result updates. This differs from the tested scored Play-In predecessors, whose outcomes do constrain worlds.

Boundary qualification: the bridge report explicitly places admission/windows and exhaustive feasible-world generation upstream. A conforming upstream service that always resolves NCAA orientation before lock or rebuilds the feasible domain using all structural outcomes avoids the case. Consequently this is **not proof that a wired production journey currently produces a wrong score**; it is a reproducible accepted-input gap that must be closed or enforced/tested at that integration boundary. The existing generic “contradictory known advancement rejected” claim should not be read as covering this case.

Recommendation: condition worlds on effective structural dependencies too, or enforce resolved structural qualification/pairings before accepting locked scored markets. Add a regression through the public integration boundary; do not reclassify an eliminated entrant as feasible.

### F2 — Lost-ack read-back omits template identity check (low; defensive repository-contract asymmetry)

Location: `lib/events/template-seeder.ts:58`.

The ordinary existing-config branch rejects a row whose `templateId` differs from the ensured ID. The catch/read-back branch checks version, sealed state and manifest but **not templateId**. A repository whose first list is empty, insert throws, and second list returns an otherwise-identical version-1 manifest under another template ID is accepted for the first edition. The independent probe reached the second edition, proving it did not rethrow the failed insertion.

A correctly scoped `listConfigs(templateId)` adapter prevents this, so this is not a demonstrated database exploit. Still, matching identity is part of “exact read-back” and inexpensive to validate consistently. Require `raced.templateId === templateId`; regress the mismatch and preserve the insertion error. Adapter-level filtering/uniqueness proof remains mandatory.

## Independent semantic evidence

### Play-In — complete small-state oracle

Independently derive the eight valid conference completions:

- Choose 7-v-8 winner from A/B.
- Choose 9-v-10 winner from C/D.
- Choose decider winner from the first game's loser and second game's winner.

For every completion, exercise all eight subsets of settled markets: **64 invocations, each with all eight coherent participant predictions**. Some partial states recur intentionally. Expected earned/wrong/pending are direct equality/count arithmetic; maximum is the best number of matching picks across compatible completions; ranks are competition ranks by earned descending, wrong ascending.

All exact row arrays passed, including partial downstream outcomes, upstream correction alternatives, distinct hypothetical routes, and shared ranks. This covers 512 participant-state evaluations without importing a production feasibility generator. Explicit stale graph binding, persisted pick version and feasible-evidence version all reject.

### UCL — independent score-sign partition

Fix A's first-leg 2–0 win; reverse home/away for leg two. Enumerate original second-leg regulation scores for B and A from 0 through 5, resolving aggregate parity in either direction. Deduplication yields four semantic worlds:

| Leg-two result | Qualifier |
| --- | --- |
| A | A |
| Draw | A |
| B | A |
| B | B |

The finite enumeration has witnesses for every sign class; the algebra independently establishes completeness: a draw or A win cannot erase A's two-goal lead, while a B win can leave A ahead, tie aggregate, or put B ahead. There is no away-goals rule.

For picks B / draw / B, observed and independently expected **earned 0 / maximum 1 / wrong 1 / pending 2**. Removing trusted evidence produces null maximum. No independent per-market optimistic sum is used.

### Full catalog partial-event boundaries

Using complete catalog graphs and recursively derived potential eligibility (not builder scoring expectations):

| Scenario | Earned | Maximum | Wrong | Pending |
| --- | ---: | --- | ---: | ---: |
| UCL 144 league draws correctly picked, later windows unopened, no trusted feasibility | 144 | null | 0 | 67 |
| WWC 48 group draws correctly picked, later windows unopened, no trusted feasibility | 48 | null | 0 | 16 |

Both exact rows passed. These are full-graph scoring projections, **not lifecycle completion proofs**. They confirm later markets remain present and an unproven future domain is not fabricated as 211/64. Numeric full-event maxima still require trusted joint domains and integration evidence.

### Seeder — independent edition list and failures

Hardcoded expected nine keys, independent of `listEventDefinitions()`: UCL, NFL, NCAA, NBA playoffs, NBA Play-In, WWC, MLB, CFP, Oscars with their approved edition keys.

Executed ten fresh repository scenarios: no lost acknowledgement and a lost acknowledgement after each of insert positions 1–9. Every run:

- Returned exactly those nine keys.
- Made exactly nine insert calls.
- Persisted version 1, unsealed, draft, manual enabled, automation unavailable.
- Replayed without another insert and with byte-identical persisted rows.
- Classified the acknowledged-by-read-back position as existing.

Separate preexisting version-2-only, sealed-version-1 and drifted-manifest probes reject with zero insert calls. Existing tests additionally passed. This is injected in-memory repository proof, not transaction/unique-constraint or adapter proof. Availability metadata prevents no HTTP exposure by itself; publication remains a separate gate.

## Executed commands and reproducibility

All shell calls used absolute `/Users/yonnasgetahun/clawd/bin/exec`. Existing suite command, explicitly changing cwd inside the guarded command:

```sh
/Users/yonnasgetahun/clawd/bin/exec -- 'cd /Users/yonnasgetahun/bracket-fyi && ./node_modules/.bin/vitest run tests/events/scoring-bridge.test.ts tests/events/template-seeder.test.ts tests/events/catalog.test.ts'
```

Observed: **3 files / 38 tests passed** (15 bridge, 3 seeder, 20 catalog). This corroborates regressions but is not the independent oracle by itself.

Independent probes below were each executed via guarded `node` stdin with a TypeScript CommonJS transpile hook. They create no source/test files and use no network. Assertion failures terminate the probe. Scripts are retained here so findings are reproducible rather than dependent on an unretained scratch harness.

## Remaining acceptance boundary

Not proved here: full-event numeric maxima for every format; reseed/placement evidence authenticity or exhaustiveness; database seeder adapter and unique-index races; effective-result repository atomicity; graph/config version persistence; old-reader/transition behavior; all-nine create/join/pick/lock/result/leaderboard UI journeys; notification/lifecycle reconciliation; hosted/live readiness. Series, medal, nomination and home/draw/away correction cases were rerun in existing tests, not independently regenerated in this review. No full P2/P10/P11/P12 closure.

changed: this review document only.
matters: independently establishes small-graph semantics and nine-template replay while identifying two boundary gaps.
checks: 38 existing tests; independent 64-state Play-In oracle, UCL partition, two full partial-event projections, version drift, ten seeder failure/replay scenarios, and two counterexamples.
risk: F1 structural-result conditioning and F2 catch-path identity require explicit dispositions; integration remains open.
verdict: iterate for F1 boundary; accept the proven bounded helper behavior, not full delivery.

## Appendix A — Independent Play-In, version and seeder probes

```js

const fs=require('fs'),ts=require('/Users/yonnasgetahun/bracket-fyi/node_modules/typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {getEventDefinition,listEventDefinitions}=require('/Users/yonnasgetahun/bracket-fyi/lib/events/catalog.ts');
const {scoreEvent}=require('/Users/yonnasgetahun/bracket-fyi/lib/events/scoring-bridge.ts');
const {seedEventTemplates}=require('/Users/yonnasgetahun/bracket-fyi/lib/events/template-seeder.ts');
const assert=require('assert/strict');
const base=getEventDefinition('nba-play-in-2027'), ms=base.markets.slice(0,3), [s,n,t]=ms.map(m=>m.id);
const [a,b,c,d]=base.entrants.slice(0,4).map(e=>e.id);
const allWorlds=[];
for(const first of [a,b]) for(const second of [c,d]) for(const last of [first===a?b:a,second]) allWorlds.push({[s]:first,[n]:second,[t]:last});
const cat={...base,markets:ms,windows:base.windows.filter(w=>ms.some(m=>m.windowId===w.id)),edges:base.edges.filter(e=>ms.some(m=>m.id===e.from)&&ms.some(m=>m.id===e.to))};
const input={edition:{catalog:cat,graphVersion:1},binding:{reviewed:true,graphVersion:1,markets:ms.map((m,i)=>({marketId:m.id,inputs:m.inputs,eligibleEntrantIds:[[a,b],[c,d],[a,b,c,d]][i],orientation:i===0?[a,b]:i===1?[c,d]:null}))},windows:Object.fromEntries(cat.windows.map(w=>[w.id,'locked'])),outcomes:{},participants:allWorlds.map((p,i)=>({id:'p'+i,graphVersion:1,picks:p})),components:[{marketIds:[s,n,t],evidence:{reviewed:true,graphVersion:1,reference:'independent-cartesian-rules'},worlds:allWorlds.map(w=>Object.fromEntries(Object.entries(w).map(([k,v])=>[k,[v]])))}]};
let states=0;
for(const actual of allWorlds) for(let mask=0;mask<8;mask++){
 const settled=Object.fromEntries([s,n,t].filter((_,i)=>mask&(1<<i)).map(k=>[k,actual[k]]));
 const viable=allWorlds.filter(w=>Object.entries(settled).every(([k,v])=>w[k]===v));
 const outcomes=Object.fromEntries(Object.entries(settled).map(([k,v])=>[k,{kind:'winner',entrant:v}]));
 const expected=input.participants.map(p=>{
  const earned=Object.entries(settled).filter(([k,v])=>p.picks[k]===v).length;
  return {id:p.id,earned,maximum:Math.max(...viable.map(w=>[s,n,t].filter(k=>p.picks[k]===w[k]).length)),wrong:Object.keys(settled).length-earned,pending:3-Object.keys(settled).length};
 }).sort((x,y)=>y.earned-x.earned||x.wrong-y.wrong);
 expected.forEach((r,i)=>r.rank=i&&r.earned===expected[i-1].earned&&r.wrong===expected[i-1].wrong?expected[i-1].rank:i+1);
 assert.deepEqual(scoreEvent({...input,outcomes}),expected);states++;
}
console.log('PASS independent Play-In: '+states+' partial/full states x 8 coherent participants; exact earned/max/wrong/pending/rank');
for(const field of ['binding','participant','evidence']){
 const x=structuredClone(input);
 if(field==='binding')x.binding.graphVersion=2;
 if(field==='participant')x.participants[0].graphVersion=2;
 if(field==='evidence')x.components[0].evidence.graphVersion=2;
 assert.throws(()=>scoreEvent(x));
}
console.log('PASS graph/pick/evidence version drift rejected');
class Repo{
 constructor(lost=0){this.rows=[];this.lost=lost;this.inserts=0;}
 async ensureTemplate(key){return {id:'template:'+key};}
 async listConfigs(id){return this.rows.filter(x=>x.templateId===id);}
 async insertConfig(row){assert(!this.rows.some(r=>r.templateId===row.templateId&&r.version===row.version));this.rows.push(structuredClone(row));this.inserts++;if(this.inserts===this.lost)throw Error('lost ack');}
}
(async()=>{
 const keys=['ucl-2026-27','nfl-2026-postseason','ncaa-men-2027','nba-2027','nba-play-in-2027','wwc-2027','mlb-2027','cfp-2026-27','oscars-2027'];
 for(let lost=0;lost<=9;lost++){
  const repo=new Repo(lost);const first=await seedEventTemplates(repo);assert.deepEqual(first.map(r=>r.key),keys);
  const snapshot=JSON.stringify(repo.rows);await seedEventTemplates(repo);assert.equal(repo.inserts,9);assert.equal(JSON.stringify(repo.rows),snapshot);
  assert(repo.rows.every(r=>r.version===1&&!r.sealed&&r.manifest.availability==='draft'&&r.manifest.manualMode===true&&r.manifest.automation==='unavailable'));
  if(lost)assert.equal(first[lost-1].disposition,'existing');
 }
 console.log('PASS nine independent edition keys; no-loss and every lost-ack position; byte-identical replay, nine insert calls, all draft/manual/unsealed/unavailable');
 for(const change of [r=>r.version=2,r=>r.sealed=true,r=>r.manifest.label='drift']){
  const repo=new Repo();const def=structuredClone(listEventDefinitions()[0]);const row={templateId:'template:'+def.key,version:1,sealed:false,manifest:def};change(row);repo.rows=[row];
  await assert.rejects(()=>seedEventTemplates(repo));assert.equal(repo.inserts,0);
 }
 console.log('PASS different-only-version, sealed, and manifest drift reject without insert');
 const def=listEventDefinitions()[0];
 class WrongReadback extends Repo{
  async insertConfig(row){throw Error('insert failed');}
  async listConfigs(id){this.reads=(this.reads||0)+1;if(this.reads===1)return [];return [{templateId:'WRONG-TEMPLATE',version:1,sealed:false,manifest:def}];}
 }
 const wrong=new WrongReadback();
 // Stop after first accepted recovery by throwing at second edition; first key acceptance can be observed in ensureTemplate calls.
 wrong.ensureTemplate=async function(key){if(key!==def.key)throw Error('REACHED_SECOND_EDITION');return {id:'template:'+key};};
 try{await seedEventTemplates(wrong);}catch(e){console.log('PROBE wrong-template catch-path readback:',e.message);}
})();

```

## Appendix B — Full partial-event projections and structural-qualification counterexample

```js

const fs=require('fs'),ts=require('/Users/yonnasgetahun/bracket-fyi/node_modules/typescript'),assert=require('assert/strict');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {getEventDefinition}=require('/Users/yonnasgetahun/bracket-fyi/lib/events/catalog.ts'),{scoreEvent}=require('/Users/yonnasgetahun/bracket-fyi/lib/events/scoring-bridge.ts');
function binding(cat){
 const by=new Map(cat.markets.map(m=>[m.id,m])),memo=new Map();
 function pool(s){if(s.kind==='entrant')return [s.entrantId];if(s.kind==='reviewed-placement')return cat.entrants.map(e=>e.id);if(s.kind==='reseed')return s.pool.flatMap(pool);return eligible(s.marketId);}
 function eligible(id){if(!memo.has(id))memo.set(id,[...new Set(by.get(id).inputs.flatMap(pool))]);return memo.get(id);}
 return {reviewed:true,graphVersion:1,markets:cat.markets.map(m=>({marketId:m.id,inputs:m.inputs,eligibleEntrantIds:eligible(m.id),orientation:m.inputs.length===2&&m.inputs.every(s=>s.kind==='entrant')?m.inputs.map(s=>s.entrantId):null}))};
}
for(const [key,count,total] of [['ucl-2026-27',144,211],['wwc-2027',48,64]]){
 const cat=getEventDefinition(key),early=cat.markets.filter(m=>m.outcomeDomain==='regulation-home-draw-away'&&m.role==='game');
 assert.equal(early.length,count);assert.equal(cat.markets.filter(m=>m.scored).length,total);
 const ids=new Set(early.map(m=>m.id)),x={edition:{catalog:cat,graphVersion:1},binding:binding(cat),outcomes:Object.fromEntries(early.map(m=>[m.id,{kind:'draw'}])),windows:Object.fromEntries(cat.windows.map(w=>[w.id,early.some(m=>m.windowId===w.id)?'locked':'unopened'])),participants:[{id:'P',graphVersion:1,picks:Object.fromEntries(early.map(m=>[m.id,'draw']))}],components:[]};
 const result=scoreEvent(x);assert.deepEqual(result,[{id:'P',earned:count,maximum:null,wrong:0,pending:total-count,rank:1}]);console.log(key,JSON.stringify(result));
}
const base=getEventDefinition('ncaa-men-2027'),opening=base.markets.find(m=>!m.scored),next=base.markets.find(m=>m.scored&&m.inputs.some(s=>s.marketId===opening.id));
const cat={...base,markets:[opening,next],edges:base.edges.filter(e=>e.from===opening.id&&e.to===next.id)},[a,b]=opening.inputs.map(s=>s.entrantId),direct=next.inputs.find(s=>s.kind==='entrant').entrantId;
const x={edition:{catalog:cat,graphVersion:1},binding:binding(cat),outcomes:{[opening.id]:{kind:'winner',entrant:a}},windows:Object.fromEntries(cat.windows.map(w=>[w.id,'locked'])),participants:[{id:'P',graphVersion:1,picks:{[next.id]:b}}],components:[{marketIds:[next.id],evidence:{reviewed:true,graphVersion:1,reference:'all-three-prequalification-winners'},worlds:[a,b,direct].map(id=>({[next.id]:[id]}))}]};
console.log('PROBE NCAA unscored qualifier A beats B; locked scored pick B; unresolved R64 orientation:',JSON.stringify(scoreEvent(x)));

```

## Appendix C — UCL score-sign oracle

```js

const fs=require('fs'),ts=require('/Users/yonnasgetahun/bracket-fyi/node_modules/typescript'),assert=require('assert/strict');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {getEventDefinition}=require('/Users/yonnasgetahun/bracket-fyi/lib/events/catalog.ts'),{scoreEvent}=require('/Users/yonnasgetahun/bracket-fyi/lib/events/scoring-bridge.ts');
const base=getEventDefinition('ucl-2026-27'),tieId=base.markets.find(m=>m.role==='leg').tieId,[a,b]=base.entrants.map(e=>e.id);
const ms=base.markets.filter(m=>m.tieId===tieId).map(m=>({...m,inputs:(m.leg===2?[b,a]:[a,b]).map(entrantId=>({kind:'entrant',entrantId}))})),[l1,l2,q]=ms.map(m=>m.id),ids=new Set([l1,l2,q]);
const cat={...base,markets:ms,windows:base.windows.filter(w=>w.id===ms[0].windowId),edges:base.edges.filter(e=>ids.has(e.from)&&ids.has(e.to)),championMarketId:null};
const worlds=new Map();
for(let goalsB=0;goalsB<=5;goalsB++)for(let goalsA=0;goalsA<=5;goalsA++){
 const leg=goalsA===goalsB?'draw':goalsA>goalsB?a:b;
 const qualifiers=2+goalsA===goalsB?[a,b]:[2+goalsA>goalsB?a:b];
 for(const winner of qualifiers){const w={[l1]:[a],[l2]:[leg],[q]:[winner]};worlds.set(JSON.stringify(w),w);}
}
assert.equal(worlds.size,4);
const x={edition:{catalog:cat,graphVersion:1},binding:{reviewed:true,graphVersion:1,markets:ms.map(m=>({marketId:m.id,inputs:m.inputs,eligibleEntrantIds:[a,b],orientation:m.leg===2?[b,a]:[a,b]}))},windows:{[ms[0].windowId]:'locked'},outcomes:{[l1]:{kind:'winner',entrant:a}},participants:[{id:'R',graphVersion:1,picks:{[l1]:'away',[l2]:'draw',[q]:b}}],components:[{marketIds:[l1,l2,q],evidence:{reviewed:true,graphVersion:1,reference:'independent-score-sign-partition'},worlds:[...worlds.values()]}]};
assert.deepEqual(scoreEvent(x),[{id:'R',earned:0,maximum:1,wrong:1,pending:2,rank:1}]);
console.log('PASS UCL independently enumerated 36 second-leg scorelines + both parity resolutions collapse to four worlds; B/draw/B gives 0/1/wrong1/pending2');
const y=structuredClone(x);y.components[0].evidence=null;assert.equal(scoreEvent(y)[0].maximum,null);
console.log('PASS UCL missing trusted evidence keeps maximum null');

```
