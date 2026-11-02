import assert from 'node:assert/strict';
export function roomUrl(value) {
 const u=new URL(value);
 assert.equal(u.origin,'http://127.0.0.1:3137');
 assert.match(u.pathname,/^\/events\/[0-9a-f-]{36}$/i);
 assert(!u.search&&!u.hash,'Fixture room cannot carry credentials');
 return u.href;
}
export function effective(data,marketId,expected) {
 const actual=data.view.effective[marketId];
 assert(actual,'Missing effective result '+marketId);
 assert.equal(actual.source,expected.source);
 assert.deepEqual(actual.outcome,expected.outcome);
 assert.equal(actual.canonicalVersion,expected.canonicalVersion);
 assert.equal(data.view.state,expected.state);
}
export function picksSnapshot(picks) {
 return picks.map(p=>[p.participantId,p.marketId,p.choice]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
export function standings(data,expected) {
 assert(expected.length>0,'Empty standings oracle');
 assert.deepEqual(data.view.leaderboard.map(r=>({id:r.id,rank:r.rank,earned:r.earned,wrong:r.wrong})).sort((a,b)=>a.id.localeCompare(b.id)),
  expected.map(r=>({id:r.id,rank:r.rank,earned:r.earned,wrong:r.wrong})).sort((a,b)=>a.id.localeCompare(b.id)));
}
