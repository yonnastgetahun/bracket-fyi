import test from 'node:test';
import assert from 'node:assert/strict';
import {roomUrl,effective,picksSnapshot,standings} from './contracts.mjs';
const room='http://127.0.0.1:3137/events/00000000-0000-0000-0000-000000000001';
test('fixture target rejects remote, alternate port and credential-bearing URLs',()=>{
 assert.equal(roomUrl(room),room);
 for(const url of [room.replace('127.0.0.1','example.com'),room.replace('3137','3000'),room+'#invite=secret',room+'?token=secret',room.replace('/events/','/l/')])
  assert.throws(()=>roomUrl(url));
});
test('canonical oracle rejects stale version, wrong source, wrong outcome and pending state',()=>{
 const expected={source:'canonical',outcome:{kind:'winner',entrant:'A'},canonicalVersion:2,state:'locked'};
 const data={view:{state:'locked',effective:{m:{source:'canonical',outcome:{kind:'winner',entrant:'A'},canonicalVersion:2}}}};
 effective(data,'m',expected);
 for(const mutation of [{canonicalVersion:1},{source:'override'},{outcome:{kind:'winner',entrant:'B'}}])
  assert.throws(()=>effective({view:{...data.view,effective:{m:{...data.view.effective.m,...mutation}}}},'m',expected));
 assert.throws(()=>effective({view:{...data.view,state:'reconciliation-pending'}},'m',expected));
});
test('standings oracle detects extra participants, wrong rank and wrong score',()=>{
 const expected=[{id:'p',name:'Player',rank:1,earned:2,wrong:1}];
 const data={view:{leaderboard:[{id:'p',rank:1,earned:2,wrong:1,maximum:5}]}};
 standings(data,expected);
 assert.throws(()=>standings(data,[]));
 for(const row of [{id:'p',rank:2,earned:2,wrong:1},{id:'p',rank:1,earned:3,wrong:1}])
  assert.throws(()=>standings({view:{leaderboard:[row]}},expected));
 assert.throws(()=>standings({view:{leaderboard:[...data.view.leaderboard,{id:'q',rank:2,earned:1,wrong:2}]}},expected));
});
test('immutable snapshot includes participant identity and is order independent',()=>{
 const a={participantId:'p',marketId:'m',choice:'A'},b={participantId:'q',marketId:'m',choice:'B'};
 assert.deepEqual(picksSnapshot([a,b]),picksSnapshot([b,a]));
 assert.notDeepEqual(picksSnapshot([a]),picksSnapshot([{...a,choice:'B'}]));
 assert.notDeepEqual(picksSnapshot([a]),picksSnapshot([{...a,participantId:'q'}]));
});
