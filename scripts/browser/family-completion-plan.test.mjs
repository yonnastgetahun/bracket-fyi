import '../event-runtime-register.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {familyPlan,FAMILY_ORACLES,CATEGORIES,assertFamilyComplete} from './family-completion-plan.mjs';
const {buildSyntheticManifest}=await import('../../lib/events/catalog.ts');
const plans=Object.keys(FAMILY_ORACLES).map(key=>familyPlan(buildSyntheticManifest(key,{startsAt:'2030-01-01T00:00:00Z',categories:CATEGORIES})));
function capture(p,corrected=false){return {view:{state:'complete',leaderboard:p.expected[corrected?'corrected':'complete'].map((r,i)=>({id:['p','q'][i],...r})),effective:Object.fromEntries(p.manifest.markets.map(m=>[m.id,{source:'override',held:false,excluded:false,outcome:corrected&&m.id===p.correction.marketId?p.correction.outcome:p.outcomes[m.id]}]))}};}
test('seven literal full totals, no byes or children scored; twelve structural NCAA qualifiers',()=>{
 assert.deepEqual(plans.map(p=>p.total),[13,63,15,6,11,11,3]);
 for(const p of plans){assert.equal(Object.keys(p.picks.perfect).length,p.total);assert.equal(Object.keys(p.picks.challenger).length,p.total);assertFamilyComplete(capture(p),p,['p','q']);assertFamilyComplete(capture(p,true),p,['p','q'],true);}
 const ncaa=plans[1];assert.equal(ncaa.structural.length,12);assert.equal(ncaa.manifest.entrants.length,76);
 assert(plans[2].scored.every(m=>m.series.bestOf===7));
 assert.deepEqual([...new Set(plans[4].scored.map(m=>m.series.bestOf))],[3,5,7]);
});
test('NFL upset changes reseeded opponents without changing seed-one advancement credit',()=>{
 const p=plans[0],m=p.scored.find(m=>m.id.includes('afc.divisional.1'));
 assert.notDeepEqual(p.pairings[m.id],p.predictedPairings[m.id]);
 assert.equal(p.picks.challenger[m.id],p.winners[m.id]);
 assert.deepEqual(p.expected.complete,[{earned:13,maximum:13,wrong:0,rank:1},{earned:11,maximum:11,wrong:2,rank:2}]);
});
test('Play-In challenger retains C decider credit against changed opponent, no champion',()=>{
 const p=plans[3],m=p.scored.find(m=>m.id.includes('east.eighth-seed-decider'));
 assert.notDeepEqual(p.pairings[m.id],p.predictedPairings[m.id]);assert.equal(p.picks.challenger[m.id],p.winners[m.id]);
 assert.equal(p.manifest.championMarketId,null);
 assert.deepEqual(p.expected.complete,[{earned:6,maximum:6,wrong:0,rank:1},{earned:5,maximum:5,wrong:1,rank:2}]);
});
test('all selected Oscars categories; correction is tied nomination set, not multiplied credits',()=>{
 const p=plans.at(-1);assert.equal(p.total,CATEGORIES.length);assert.equal(p.correction.outcome.kind,'winner-set');assert.equal(p.correction.outcome.entrants.length,2);
 assert.deepEqual(p.expected.corrected,[{earned:3,maximum:3,wrong:0,rank:1},{earned:3,maximum:3,wrong:0,rank:1}]);
});
test('completion gate rejects first-market smoke, stale maximum/rank, waived/held and missing units',()=>{
 for(const p of plans)for(const mutate of [d=>d.view.state='locked',d=>d.view.leaderboard[0].earned=1,d=>d.view.leaderboard[0].maximum=null,d=>d.view.leaderboard[1].rank=1,d=>d.view.effective[p.scored[0].id].held=true,d=>d.view.effective[p.scored[0].id].excluded=true,d=>delete d.view.effective[p.scored.at(-1).id],d=>d.view.effective[p.scored.at(-1).id].outcome={kind:'unresolved'}]){
  const d=capture(p);mutate(d);assert.throws(()=>assertFamilyComplete(d,p,['p','q']));
 }
});
test('shape drift and unsupported sources fail before browser launch',()=>{
 for(const p of plans){const m=structuredClone(p.manifest);m.markets.pop();assert.throws(()=>familyPlan(m));}
 const m=structuredClone(plans[0].manifest);m.markets[0].inputs[0]={kind:'reviewed-placement',placement:'invented'};assert.throws(()=>familyPlan(m));
});

test('production pure lifecycle scores complete and corrected paths against independent totals',async()=>{
 const {buildApplicationManifest}=await import('../../lib/events/application-manifest.ts');
 const {evaluateLifecycle}=await import('../../lib/events/lifecycle.ts');
 for(const p of plans)for(const corrected of [false,true]){
  const manifest=buildApplicationManifest(p.manifest.editionKey,'2030-01-01T00:00:00Z',1,'UTC',CATEGORIES);
  const effective=capture(p,corrected).view.effective;
  const rows=evaluateLifecycle({leagueId:'synthetic-family-plan',generation:1,basisToken:'a'.repeat(64),basis:{
   configurationVersion:1,manifest,windows:manifest.windows.map(w=>({id:w.id,version:1,state:'locked'})),
   participants:Object.entries(p.picks).map(([id,picks])=>({id,graphVersion:1,picks})),effective,holds:[],quarantines:[],locked:true,frozen:false,disabled:false,
  }});
  for(const [i,id] of ['perfect','challenger'].entries()){
   const actual=rows.find(r=>r.id===id),expected=p.expected[corrected?'corrected':'complete'][i];
   assert.deepEqual({earned:actual.earned,maximum:actual.maximum,wrong:actual.wrong,rank:actual.rank},expected,p.manifest.editionKey+' corrected='+corrected);
  }
 }
});
