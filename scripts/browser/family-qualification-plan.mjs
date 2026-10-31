import assert from 'node:assert/strict';
import {familyPlan} from './family-completion-plan.mjs';
// Independent handoff oracle: first 7/8-game winner is seed 7; decider winner seed 8.
// Only IDs change; the 15-market main playoff prediction graph remains independent.
export function qualifiedNbaPlan(manifest,playInPlan){
 assert.equal(manifest.editionKey,'nba-2027');
 assert.equal(playInPlan.manifest.editionKey,'nba-play-in-2027');
 const replacements=new Map();
 for(const entrant of manifest.entrants){
  if(entrant.seed!==7&&entrant.seed!==8)continue;
  const source=playInPlan.scored.find(m=>m.qualificationSeed===entrant.seed &&
   m.id.includes(':'+entrant.group+'.'));
  assert(source,'Independent qualification source missing');
  replacements.set(entrant.id,playInPlan.outcomes[source.id].entrant);
 }
 assert.equal(replacements.size,4);
 const qualified=JSON.parse(JSON.stringify(manifest),(_,value)=>typeof value==='string'?(replacements.get(value)??value):value);
 return familyPlan(qualified);
}

// Awards creation provisions immutable nomination UUIDs. Bind by unique fixture
// identity/name and verify per-category membership; never reinterpret score oracles.
export function provisionedAwardsPlan(plan,data){
 assert.equal(plan.manifest.editionKey,'oscars-2027');
 const ids=new Map();
 for(const entrant of plan.manifest.entrants){
  const matches=data.entrants.filter(e=>e.name===entrant.name);
  assert.equal(matches.length,1,'Synthetic nomination identity must be unique');
  assert.match(matches[0].id,/^[0-9a-f-]{36}$/i);
  ids.set(entrant.id,matches[0].id);
 }
 assert.equal(new Set(ids.values()).size,ids.size);
 const bound=JSON.parse(JSON.stringify(plan),(_,v)=>typeof v==='string'?(ids.get(v)??v):v);
 for(const market of bound.scored){
  const actual=data.windows.flatMap(w=>w.markets).find(m=>m.id===market.id);
  assert(actual);
  assert.deepEqual([...actual.choices].sort(),market.inputs.map(s=>s.entrantId).sort(),'Exact provisioned category membership required');
 }
 // Persisted winner sets are canonical lexicographic sets, not nomination order.
 if(bound.correction.outcome.kind==='winner-set')bound.correction.outcome.entrants.sort();
 return bound;
}
