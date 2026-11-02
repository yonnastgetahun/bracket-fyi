/** Independent hand oracle. No application scorer or fixture seeder imports. */
import assert from 'node:assert/strict';
export const FULL_ORACLES = Object.freeze({
 // Reviewed placement dependencies are deliberately omitted by the trusted
 // application manifest. Until every scored unit is settled, feasibility is
 // therefore contractually unverified; only the settled total is numeric.
 'ucl-2026-27': {counts:[18,18,18,18,18,18,18,18,24,24,12,6,1], earned:[18,36,54,72,90,108,126,144,168,192,204,210,211], maximum:[null,null,null,null,null,null,null,null,null,null,null,null,211], total:211, structural:0, reviews:5},
 'wwc-2027': {counts:[16,16,16,8,4,2,2], earned:[16,32,48,56,60,62,64], maximum:[null,null,null,null,null,null,64], total:64, structural:0, reviews:4},
});
export function fullPlan(manifest) {
 const oracle=FULL_ORACLES[manifest.editionKey];
 assert(oracle,'Only UCL and WWC are supported');
 assert.equal(manifest.synthetic,true);
 assert.equal(manifest.lockMode,'per-window');
 assert.equal(manifest.markets.filter(m=>!m.scored).length,oracle.structural,'New structural units require explicit oracle; never silently skip');
 assert.equal(new Set(manifest.markets.map(m=>m.id)).size,oracle.total);
 assert.deepEqual(manifest.windows.map(w=>manifest.markets.filter(m=>m.windowId===w.id&&m.scored).length),oracle.counts);
 const pairings={}, winners={}, picks={};
 const wins=Object.fromEntries(manifest.entrants.map(e=>[e.id,0]));
 const placements=new Map();
 let ranking;
 function source(s) {
  if(s.kind==='entrant')return s.entrantId;
  if(s.kind==='winner'){assert(winners[s.marketId],'Unresolved upstream winner');return winners[s.marketId];}
  if(s.kind==='loser'){const loser=pairings[s.marketId]?.find(id=>id!==winners[s.marketId]);assert(loser,'Unresolved upstream loser');return loser;}
  assert.equal(s.kind,'reviewed-placement','Unsupported source');
  if(placements.has(s.placement))return placements.get(s.placement);
  let entrant;
  if(manifest.editionKey==='wwc-2027'){
   assert.match(s.placement,/^[A-H][12]$/);
   entrant=manifest.entrants.find(e=>e.group===s.placement[0]&&e.seed===Number(s.placement[1]))?.id;
  }else{
   // Original rehearsal policy: wins, then original entrant order. Not UEFA tie-break evidence.
   ranking??=manifest.entrants.map((e,index)=>({id:e.id,index})).sort((a,b)=>wins[b.id]-wins[a.id]||a.index-b.index).map(e=>e.id);
   const match=/^(play-off|round-of-16)\.tie-(\d+)\.(home|away)$/.exec(s.placement);
   assert(match,'Unrecognized UCL placement');
   const i=Number(match[2])-1;
   if(match[1]==='play-off')entrant=ranking[8+2*i+(match[3]==='away'?1:0)];
   else entrant=match[3]==='home'?ranking[i]:winners[manifest.markets.find(m=>m.stage==='play-off'&&m.role==='qualifier'&&m.id.includes('.tie-'+(i+1)+'.'))?.id];
  }
  assert(entrant,'Missing reviewed entrant');
  placements.set(s.placement,entrant);return entrant;
 }
 for(const m of manifest.markets){
  const pair=m.inputs.map(source);
  assert.equal(pair.length,2);assert.notEqual(pair[0],pair[1]);
  pairings[m.id]=pair;
  winners[m.id]=m.leg===2?pair[1]:pair[0];
  picks[m.id]=m.outcomeDomain==='regulation-home-draw-away'?(winners[m.id]===pair[0]?'home':'away'):winners[m.id];
  if(m.stage==='league')wins[winners[m.id]]++;
 }
 const plan={manifest,oracle,pairings,winners,picks,ranking};
 validatePlan(plan);
 return plan;
}
export function validatePlan({manifest,pairings,winners,picks}) {
 for(const m of manifest.markets){
  const pair=pairings[m.id];
  assert.equal(pair?.length,2);assert.notEqual(pair[0],pair[1]);assert(pair.includes(winners[m.id]));
  assert.equal(picks[m.id],m.outcomeDomain==='regulation-home-draw-away'?(winners[m.id]===pair[0]?'home':'away'):winners[m.id]);
  m.inputs.forEach((s,i)=>{
   if(s.kind==='entrant')assert.equal(pair[i],s.entrantId);
   if(s.kind==='winner')assert.equal(pair[i],winners[s.marketId]);
   if(s.kind==='loser')assert.equal(pair[i],pairings[s.marketId].find(e=>e!==winners[s.marketId]));
  });
  if(m.role==='qualifier'){
   const [a,b]=m.legMarketIds;
   assert.deepEqual(pairings[b],[...pairings[a]].reverse(),'Second leg must reverse');
   assert.deepEqual(pair,pairings[a]);
   assert.equal(winners[a],winners[b],'Both decisive legs support same qualifier');
   assert.equal(winners[m.id],winners[a],'Qualifier contradicts two wins');
  }
 }
}
export function assertShape(data,plan) {
 assert.deepEqual(data.windows.map(w=>[w.id,w.markets.map(m=>m.id)]),plan.manifest.windows.map(w=>[w.id,plan.manifest.markets.filter(m=>m.windowId===w.id).map(m=>m.id)]));
 assert.equal(data.windows.flatMap(w=>w.markets).filter(m=>m.scored).length,plan.oracle.total);
 // Active rooms have no published score/result projection before first lock.
 // Manifest membership remains exact; locked/complete projections must be full.
 if(data.view.state==='active') {
  assert(data.windows.every(w=>w.state!=='locked'),'Active projection cannot hide a locked window');
  assert.equal(Object.keys(data.view.effective).length,data.organizer?plan.oracle.total:0);
 } else assert.equal(Object.keys(data.view.effective).length,plan.oracle.total);
}
export function assertCheckpoint(data,plan,index,participantId,{beforeBronze=false}={}) {
 if(beforeBronze){assert.equal(plan.manifest.editionKey,'wwc-2027');assert.equal(index,6);}
 const earned=beforeBronze?63:plan.oracle.earned[index];
 const expectedMaximum=beforeBronze?null:plan.oracle.maximum[index];
 const final=index===plan.oracle.earned.length-1&&!beforeBronze;
 assert.notEqual(data.view.state,'reconciliation-pending');
 assert.equal(data.view.state==='complete',final,'Full lifecycle completion, not champion-only completion');
 if(!final)assert.equal(data.view.state,'locked','Overall league remains locked while later windows open');
 assert.deepEqual(data.view.leaderboard.map(r=>({id:r.id,rank:r.rank,earned:r.earned,wrong:r.wrong})),
  [{id:participantId,rank:1,earned,wrong:0}]);
 const max=data.view.leaderboard[0].maximum;
 assert.equal(max,expectedMaximum,'Maximum must match the hand-derived jointly consistent completion oracle');
 const expected=plan.manifest.windows.slice(0,index+1).flatMap(w=>plan.manifest.markets.filter(m=>m.windowId===w.id))
  .filter(m=>!beforeBronze||m.role!=='bronze');
 assert.equal(expected.length,earned,'Literal cumulative count disagrees with manifest');
 for(const m of expected){
  const r=data.view.effective[m.id];
  assert(r);assert.equal(r.source,'override');
  assert.deepEqual(r.outcome,{kind:'winner',entrant:plan.winners[m.id]});
  assert(!r.held&&!r.excluded,'No waived or held required units');
 }
 const pending=plan.manifest.markets.filter(m=>!expected.some(e=>e.id===m.id));
 for(const m of pending)assert.equal(data.view.effective[m.id].outcome.kind,'unresolved','Future units must not be preseeded');
}
