/** Independently authored deterministic paths and literal hand totals; no application scorer. */
import assert from 'node:assert/strict';
export const CATEGORIES=Object.freeze(['Picture','Directing','Actor in a Leading Role']);
export const FAMILY_ORACLES=Object.freeze({
 'nfl-2026-postseason':{total:13,structural:0,challenger:11},
 'ncaa-men-2027':{total:63,structural:12,challenger:62},
 'nba-2027':{total:15,structural:0,challenger:14},
 'nba-play-in-2027':{total:6,structural:0,challenger:5},
 'mlb-2027':{total:11,structural:0,challenger:10},
 'cfp-2026-27':{total:11,structural:0,challenger:10},
 'oscars-2027':{total:3,structural:0,challenger:2},
});
function row(earned,wrong,rank){return {earned,maximum:earned,wrong,rank};}
export function familyPlan(manifest){
 const key=manifest.editionKey,oracle=FAMILY_ORACLES[key];
 assert(oracle,'Unsupported family');assert.equal(manifest.synthetic,true);assert.equal(manifest.lockMode,'whole-bracket');assert.equal(manifest.windows.length,1);
 const scored=manifest.markets.filter(m=>m.scored),structural=manifest.markets.filter(m=>!m.scored);
 assert.equal(scored.length,oracle.total);assert.equal(structural.length,oracle.structural);
 assert.equal(new Set(manifest.markets.map(m=>m.id)).size,oracle.total+oracle.structural);
 if(key==='oscars-2027')assert.deepEqual(scored.map(m=>decodeURIComponent(m.categoryId.split(':category:')[1])),CATEGORIES);
 const entrantById=new Map(manifest.entrants.map(e=>[e.id,e]));
 function path(challenger){
  const pairings={},winners={};
  function source(s){
   if(s.kind==='entrant'){assert(entrantById.has(s.entrantId));return s.entrantId;}
   if(s.kind==='winner'){assert(winners[s.marketId]);return winners[s.marketId];}
   if(s.kind==='loser'){assert(winners[s.marketId]);const loser=pairings[s.marketId].find(e=>e!==winners[s.marketId]);assert(loser);return loser;}
   assert.equal(s.kind,'reseed','No invented placement/review fallback');
   const pool=s.pool.map(source);assert.equal(new Set(pool).size,pool.length);
   return pool.sort((a,b)=>entrantById.get(a).seed-entrantById.get(b).seed)[s.rank];
  }
  for(const m of manifest.markets){
   const pair=m.inputs.map(source);assert.equal(pair.length,m.role==='category'?4:2);assert.equal(new Set(pair).size,pair.length);
   pairings[m.id]=pair;
   let side=key==='nba-play-in-2027'&&m.qualificationSeed===8?1:0;
   if(challenger&&((key==='nfl-2026-postseason'&&m.id.includes('afc.wild-card.1'))||(key==='nba-play-in-2027'&&m.id.includes('east.seven-eight'))))side=1;
   if(challenger&&!['nfl-2026-postseason','nba-play-in-2027'].includes(key)&&m.id===scored.at(-1).id)side=1;
   winners[m.id]=pair[side];
  }
  return {pairings,winners};
 }
 const actual=path(false),predicted=path(true);
 const picks={perfect:Object.fromEntries(scored.map(m=>[m.id,actual.winners[m.id]])),challenger:Object.fromEntries(scored.map(m=>[m.id,predicted.winners[m.id]]))};
 const outcomes=Object.fromEntries(manifest.markets.map(m=>[m.id,m.role==='category'?{kind:'winner-set',entrants:[actual.winners[m.id]]}:{kind:'winner',entrant:actual.winners[m.id]}]));
 const terminal=scored.at(-1),other=actual.pairings[terminal.id].find(e=>e!==actual.winners[terminal.id]);
 assert(other);
 const correction={marketId:terminal.id,outcome:terminal.role==='category'?{kind:'winner-set',entrants:[actual.winners[terminal.id],other]}:{kind:'winner',entrant:other}};
 const expected={complete:[row(oracle.total,0,1),row(oracle.challenger,oracle.total-oracle.challenger,2)]};
 if(key==='oscars-2027')expected.corrected=[row(3,0,1),row(3,0,1)];
 else if(key==='nfl-2026-postseason')expected.corrected=[row(12,1,1),row(10,3,2)];
 else if(key==='nba-play-in-2027')expected.corrected=[row(5,1,1),row(4,2,2)];
 else expected.corrected=[row(oracle.total-1,1,2),row(oracle.total,0,1)];
 return {manifest,total:oracle.total,scored,structural,...actual,predictedPairings:predicted.pairings,picks,outcomes,correction,expected};
}
export function assertFamilyComplete(data,plan,ids,corrected=false){
 assert.equal(data.view.state,'complete','Every required result must reconcile, not first-market smoke');
 assert.deepEqual(data.view.leaderboard.map(r=>({id:r.id,earned:r.earned,maximum:r.maximum,wrong:r.wrong,rank:r.rank})).sort((a,b)=>a.id.localeCompare(b.id)),
  plan.expected[corrected?'corrected':'complete'].map((r,i)=>({id:ids[i],...r})).sort((a,b)=>a.id.localeCompare(b.id)));
 assert.deepEqual(Object.keys(data.view.effective).sort(),plan.manifest.markets.map(m=>m.id).sort());
 for(const m of plan.manifest.markets){
  const r=data.view.effective[m.id];assert(r);assert(!r.held&&!r.excluded,'No waived/held markets');assert.equal(r.source,'override');
  assert.deepEqual(r.outcome,corrected&&m.id===plan.correction.marketId?plan.correction.outcome:plan.outcomes[m.id]);
 }
}
