import test from 'node:test';
import assert from 'node:assert/strict';
import {assertNumericSnapshot} from './trusted-numeric.mjs';
const checkpoint={leagueId:'test',state:'locked',expected:[['P',0,1,1,2],['Q',1,null,0,1]],pending:[2,2]};
function snapshot() {
 return {api:{id:'test',organizer:false,participantId:null,invitation:null,participants:[{id:'p',name:'P'},{id:'q',name:'Q'}],
  view:{state:'locked',leaderboard:[{id:'q',earned:1,maximum:null,wrong:0,rank:1,pending:2},{id:'p',earned:0,maximum:1,wrong:1,rank:2,pending:2}]}},
  headers:['Rank','Player','Points','Maximum','Wrong'],rows:[['1','Q','1','Temporarily unverified','0'],['2','P','0','1','1']]};
}
test('assertion source accepts literal numbers and honest null (not rendered browser evidence)',()=>assertNumericSnapshot(snapshot(),checkpoint));
test('rejects coupled maximum 2 instead of 1 even if HTTP is correct',()=>{
 const s=snapshot();s.rows[1][3]='2';assert.throws(()=>assertNumericSnapshot(s,checkpoint));
});
test('rejects unknown rendered as numeric zero and numeric one rendered as unknown',()=>{
 for(const [row,value] of [[0,'0'],[1,'Temporarily unverified']]){
  const s=snapshot();s.rows[row][3]=value;assert.throws(()=>assertNumericSnapshot(s,checkpoint));
 }
});
test('rejects HTTP wrong maximum, stale state, wrong room and missing visible columns',()=>{
 for(const alter of [s=>{s.api.view.leaderboard[1].maximum=2;},s=>{s.api.view.state='complete';},s=>{s.api.id='other';},s=>{s.headers.pop();}]){
  const s=snapshot();alter(s);assert.throws(()=>assertNumericSnapshot(s,checkpoint));
 }
});
