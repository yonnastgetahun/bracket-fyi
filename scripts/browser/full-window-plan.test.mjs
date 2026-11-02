import '../event-runtime-register.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fullPlan,validatePlan,assertCheckpoint,assertShape} from './full-window-plan.mjs';
const {buildSyntheticManifest}=await import('../../lib/events/catalog.ts');
const {buildApplicationManifest}=await import('../../lib/events/application-manifest.ts');
const {evaluateLifecycle}=await import('../../lib/events/lifecycle.ts');
const plans=Object.fromEntries(['ucl-2026-27','wwc-2027'].map(key=>[key,fullPlan(buildSyntheticManifest(key,{startsAt:'2030-01-01T00:00:00Z'}))]));
function checkpoint(plan,index,beforeBronze=false){
 const settled=new Set(plan.manifest.windows.slice(0,index+1).flatMap(w=>plan.manifest.markets.filter(m=>m.windowId===w.id&&(!beforeBronze||m.role!=='bronze')).map(m=>m.id)));
 const earned=beforeBronze?63:plan.oracle.earned[index];
 return {windows:plan.manifest.windows.map(w=>({...w,markets:plan.manifest.markets.filter(m=>m.windowId===w.id)})),view:{
  state:earned===plan.oracle.total?'complete':'locked',
  leaderboard:[{id:'p',rank:1,earned,wrong:0,maximum:beforeBronze?null:plan.oracle.maximum[index]}],
  effective:Object.fromEntries(plan.manifest.markets.map(m=>[m.id,{source:settled.has(m.id)?'override':'unresolved',
   outcome:settled.has(m.id)?{kind:'winner',entrant:plan.winners[m.id]}:{kind:'unresolved'},held:false,excluded:false}]))}};
}
function applicationCapture(plan,index,beforeBronze=false){
 const manifest=buildApplicationManifest(plan.manifest.editionKey,'2030-01-01T00:00:00Z',1,'UTC');
 const settled=new Set(plan.manifest.windows.slice(0,index+1).flatMap(w=>plan.manifest.markets
  .filter(m=>m.windowId===w.id&&(!beforeBronze||m.role!=='bronze')).map(m=>m.id)));
 const binding={...manifest.lifecycle.binding,markets:manifest.lifecycle.binding.markets.map(b=>({
  ...b,orientation:plan.pairings[b.marketId]??b.orientation,
 }))};
 const effective=Object.fromEntries(manifest.markets.map(m=>[m.id,{
  outcome:settled.has(m.id)?{kind:'winner',entrant:plan.winners[m.id]}:{kind:'unresolved'},
  source:settled.has(m.id)?'override':'unresolved',excluded:false,held:false,
 }]));
 const windows=manifest.windows.map(w=>({id:w.id,version:1,state:manifest.markets
  .filter(m=>m.windowId===w.id&&m.scored&&(!beforeBronze||m.role!=='bronze')).every(m=>settled.has(m.id))?'locked':'open'}));
 const picks=Object.fromEntries(plan.manifest.markets.filter(m=>m.scored).map(m=>[
  m.id,m.outcomeDomain==='regulation-home-draw-away'
   ?(plan.picks[m.id]==='home'?'home':'away') : plan.picks[m.id],
 ]));
 return {generation:1,basisToken:'a'.repeat(64),basis:{configurationVersion:1,manifest:{...manifest,lifecycle:{...manifest.lifecycle,binding}},windows,participants:[{id:'p',graphVersion:1,picks}],effective,holds:[],quarantines:[],locked:true,frozen:false,disabled:false}};
}
test('literal full-window shapes: 211 UCL scored logical units and 64 WWC, no unscored structural units',()=>{
 const u=plans['ucl-2026-27'],w=plans['wwc-2027'];
 assert.equal(u.manifest.windows.length,13);assert.equal(w.manifest.windows.length,7);
 assert.equal(u.manifest.markets.filter(m=>m.stage==='league').length,144);
 assert.equal(u.manifest.markets.filter(m=>m.role==='leg').length,44);
 assert.equal(u.manifest.markets.filter(m=>m.role==='qualifier').length,22);
 assert.equal(w.manifest.markets.filter(m=>m.stage==='group').length,48);
 assert.equal(w.manifest.markets.filter(m=>m.role==='bronze').length,1);
 for(const plan of Object.values(plans))for(let i=0;i<plan.manifest.windows.length;i++){
  const data=checkpoint(plan,i);assertShape(data,plan);assertCheckpoint(data,plan,i,'p');
 }
});
test('synthetic UCL placement uses distinct top eight and 16 playoff entrants, reversed legs, agreeing qualifiers',()=>{
 const p=plans['ucl-2026-27'];
 const playoffs=p.manifest.markets.filter(m=>m.stage==='play-off'&&m.role==='qualifier');
 const r16=p.manifest.markets.filter(m=>m.stage==='round-of-16'&&m.role==='qualifier');
 assert.deepEqual(playoffs.flatMap(m=>p.pairings[m.id]),p.ranking.slice(8,24));
 assert.deepEqual(r16.map(m=>p.pairings[m.id][0]),p.ranking.slice(0,8));
 assert.deepEqual(r16.map(m=>p.pairings[m.id][1]),playoffs.map(m=>p.winners[m.id]));
 assert.equal(new Set(r16.flatMap(m=>p.pairings[m.id])).size,16);
 const bad=structuredClone(p),leg=bad.manifest.markets.find(m=>m.leg===2);
 bad.pairings[leg.id].reverse();
 assert.throws(()=>validatePlan(bad));
 const wrong=structuredClone(p),qual=wrong.manifest.markets.find(m=>m.role==='qualifier');
 wrong.winners[qual.id]=wrong.pairings[qual.id][1];wrong.picks[qual.id]=wrong.winners[qual.id];
 assert.throws(()=>validatePlan(wrong));
});
test('WWC group lower seeds advance; winners feed final and losers bronze, no extra fourth-place point',()=>{
 const p=plans['wwc-2027'];
 const r16=p.manifest.markets.filter(m=>m.stage==='round-of-16').flatMap(m=>p.pairings[m.id]);
 assert.equal(new Set(r16).size,16);
 assert(r16.every(id=>p.manifest.entrants.find(e=>e.id===id).seed<=2));
 const sf=p.manifest.markets.filter(m=>m.stage==='semi-final');
 const final=p.manifest.markets.find(m=>m.role==='champion'),bronze=p.manifest.markets.find(m=>m.role==='bronze');
 assert.deepEqual(p.pairings[final.id],sf.map(m=>p.winners[m.id]));
 assert.deepEqual(p.pairings[bronze.id],sf.map(m=>p.pairings[m.id].find(e=>e!==p.winners[m.id])));
 const bad=structuredClone(p);bad.pairings[bronze.id]=p.pairings[final.id];bad.winners[bronze.id]=bad.pairings[bronze.id][0];bad.picks[bronze.id]=bad.winners[bronze.id];
 assert.throws(()=>validatePlan(bad));
 const pending=checkpoint(p,6,true);assertCheckpoint(pending,p,6,'p',{beforeBronze:true});
 pending.view.state='complete';assert.throws(()=>assertCheckpoint(pending,p,6,'p',{beforeBronze:true}));
});
test('oracle rejects inflated score, wrong rank/count, waiver, held result, wrong winner and unresolved final',()=>{
 for(const p of Object.values(plans)){
  const i=p.manifest.windows.length-1;
  for(const mutate of [
   d=>d.view.leaderboard[0].earned--,
   d=>d.view.leaderboard[0].maximum--,
   d=>d.view.leaderboard[0].wrong++,
   d=>d.view.leaderboard[0].rank++,
   d=>d.view.leaderboard.push({...d.view.leaderboard[0],id:'extra'}),
   d=>d.view.state='reconciliation-pending',
   d=>d.view.state='locked',
   d=>d.view.effective[p.manifest.markets[0].id].excluded=true,
   d=>d.view.effective[p.manifest.markets[0].id].held=true,
   d=>d.view.effective[p.manifest.markets[0].id].outcome.entrant='wrong',
   d=>d.view.effective[p.manifest.championMarketId].outcome={kind:'unresolved'},
  ]){
   const d=checkpoint(p,i);mutate(d);assert.throws(()=>assertCheckpoint(d,p,i,'p'));
  }
 }
});
test('oracle requires contractually unverified interim maxima and exact settled final',()=>{
 for(const p of Object.values(plans)){
  for(let i=0;i<p.manifest.windows.length-1;i++){
   const d=checkpoint(p,i);
   assert.equal(d.view.leaderboard[0].maximum,null);
   assertCheckpoint(d,p,i,'p');
   for(const maximum of [p.oracle.earned[i],1,999]){
    d.view.leaderboard[0].maximum=maximum;
    assert.throws(()=>assertCheckpoint(d,p,i,'p'));
   }
  }
  const final=checkpoint(p,p.manifest.windows.length-1);
  assert.equal(final.view.leaderboard[0].maximum,p.oracle.total);
  final.view.leaderboard[0].maximum=null;
  assert.throws(()=>assertCheckpoint(final,p,p.manifest.windows.length-1,'p'));
 }
});
test('authoritative application lifecycle/scorer returns null until each full window is settled',()=>{
 for(const p of Object.values(plans)){
  for(let i=0;i<p.manifest.windows.length;i++){
   const [row]=evaluateLifecycle({leagueId:'full-window',...applicationCapture(p,i)});
   assert.equal(row.id,'p');
   assert.equal(row.earned,p.oracle.earned[i]);
   assert.equal(row.maximum,p.oracle.maximum[i]);
  }
  if(p.manifest.editionKey==='wwc-2027'){
   const [row]=evaluateLifecycle({leagueId:'full-window',...applicationCapture(p,6,true)});
   assert.deepEqual([row.earned,row.maximum,row.pending],[63,null,1]);
  }
 }
});
test('all league/group results alone cannot complete; no future seeded results',()=>{
 for(const [key,index,earned] of [['ucl-2026-27',7,144],['wwc-2027',2,48]]){
  const p=plans[key],d=checkpoint(p,index);
  assert.equal(d.view.leaderboard[0].earned,earned);
  assertCheckpoint(d,p,index,'p');
  d.view.state='active';assert.throws(()=>assertCheckpoint(d,p,index,'p'));
  d.view.state='complete';assert.throws(()=>assertCheckpoint(d,p,index,'p'));
  d.view.state='locked';d.view.effective[p.manifest.championMarketId].outcome={kind:'winner',entrant:p.winners[p.manifest.championMarketId]};
  assert.throws(()=>assertCheckpoint(d,p,index,'p'));
 }
});
test('missing, extra, or newly unscored structural markets fail closed',()=>{
 const p=plans['ucl-2026-27'];
 const bad=structuredClone(p.manifest);bad.markets[0].scored=false;
 assert.throws(()=>fullPlan(bad));
 const short=structuredClone(p.manifest);short.markets.pop();assert.throws(()=>fullPlan(short));
 const d=checkpoint(p,12);d.windows.pop();assert.throws(()=>assertShape(d,p));
});

test('fresh active room has no published effective projection until first lock',()=>{
 const plan=plans['ucl-2026-27'];
 const data=checkpoint(plan,0);data.view.state='active';data.view.effective={};
 data.windows=data.windows.map(w=>({...w,state:'open'}));
 assertShape(data,plan);
 const missing=structuredClone(data);missing.windows[0].markets.pop();assert.throws(()=>assertShape(missing,plan));
 const locked=structuredClone(data);locked.windows[0].state='locked';assert.throws(()=>assertShape(locked,plan));
 const afterLock=checkpoint(plan,0);afterLock.view.effective={};assert.throws(()=>assertShape(afterLock,plan));
});

test('active organizer result desk exposes full capture while public projection stays empty',()=>{
 const plan=plans['ucl-2026-27'];const data=checkpoint(plan,0);
 data.organizer=true;data.view.state='active';data.windows=data.windows.map(w=>({...w,state:'open'}));
 assertShape(data,plan);
 const missing=structuredClone(data);missing.view.effective={};assert.throws(()=>assertShape(missing,plan));
 const publicData=structuredClone(data);publicData.organizer=false;assert.throws(()=>assertShape(publicData,plan));
});
