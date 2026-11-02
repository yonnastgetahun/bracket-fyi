import '../event-runtime-register.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const {buildSyntheticManifest}=await import('../../lib/events/catalog.ts');
import {familyPlan,CATEGORIES} from './family-completion-plan.mjs';
import {qualifiedNbaPlan,provisionedAwardsPlan} from './family-qualification-plan.mjs';
test('NBA handoff uses actual independent Play-In winners, with 15 separate scored markets',()=>{
 const build=k=>buildSyntheticManifest(k,{startsAt:'2027-01-01T00:00:00Z'});
 const play=familyPlan(build('nba-play-in-2027')),nba=qualifiedNbaPlan(build('nba-2027'),play);
 assert.equal(nba.scored.length,15);
 assert.equal(nba.expected.complete[0].earned,15);
 for(const group of ['east','west']){
  const seven=play.scored.find(m=>m.id.includes(':'+group+'.seven-eight'));
  const eight=play.scored.find(m=>m.id.includes(':'+group+'.eighth-seed-decider'));
  assert(nba.scored.some(m=>nba.pairings[m.id].includes(play.outcomes[seven.id].entrant)));
  assert(nba.scored.some(m=>nba.pairings[m.id].includes(play.outcomes[eight.id].entrant)));
 }
 assert(nba.scored.every(m=>!play.scored.some(p=>p.id===m.id)));
});

test('awards UUID binding preserves category membership and independent score oracle',()=>{
 const plan=familyPlan(buildSyntheticManifest('oscars-2027',{startsAt:'2027-01-01T00:00:00Z',categories:CATEGORIES}));
 const ids=new Map(plan.manifest.entrants.map((e,i)=>[e.id,'a0000000-0000-4000-8000-'+String(100-i).padStart(12,'0')]));
 const data={entrants:plan.manifest.entrants.map(e=>({id:ids.get(e.id),name:e.name})),
 windows:[{markets:plan.scored.map(m=>({id:m.id,choices:m.inputs.map(s=>ids.get(s.entrantId))}))}]};
 const bound=provisionedAwardsPlan(plan,data);
 assert.deepEqual(bound.expected,plan.expected);
 assert.deepEqual(bound.correction.outcome.entrants,[...bound.correction.outcome.entrants].sort());
 assert.equal(bound.picks.perfect[plan.scored[0].id],ids.get(plan.picks.perfect[plan.scored[0].id]));
 const wrong=structuredClone(data);
 wrong.windows[0].markets[0].choices[0]=data.windows[0].markets[1].choices[0];
 assert.throws(()=>provisionedAwardsPlan(plan,wrong));
 const duplicate=structuredClone(data);duplicate.entrants.push({...duplicate.entrants[0]});
 assert.throws(()=>provisionedAwardsPlan(plan,duplicate));
});
