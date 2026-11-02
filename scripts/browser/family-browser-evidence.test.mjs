import test from 'node:test';
import assert from 'node:assert/strict';
import {safely,closeOwned,FAMILY_FAILURE,renderedFamilyRows} from './family-browser-evidence.mjs';
test('setup/journey/cleanup exceptions never inspect arbitrary credentials or exception getters',async()=>{
 for(const phase of ['setup','journey','cleanup']){
  const logs=[],report={phase,status:'running'};
  const hostile=new Proxy({},{get(){throw Error('secret should not be accessed');}});
  assert.equal(await safely(async()=>{throw hostile;},()=>{report.status='failed';},s=>logs.push(s)),false);
  assert.deepEqual(logs,[FAMILY_FAILURE]);assert.equal(report.status,'failed');
 }
});
test('cleanup closes every acquired resource even when one synchronous/async close throws',async()=>{
 const calls=[];
 assert.equal(await closeOwned([{close(){calls.push(1);throw Error('private');}},{async close(){calls.push(2);throw Error('private');}},{async close(){calls.push(3);}}]),false);
 assert.deepEqual(calls,[1,2,3]);assert.equal(await closeOwned([]),true);
});
test('rendered maxima and ranks checked exactly including two-player ties',async()=>{
 const expected=[{earned:3,maximum:3,wrong:0,rank:1},{earned:3,maximum:3,wrong:0,rank:1}];
 const page={async $$eval(){return [['1','A','3','3','0'],['1','B','3','3','0']];}};
 await renderedFamilyRows(page,expected,['A','B']);
 for(const cells of [[['1','A','3','Temporarily unverified','0'],['1','B','3','3','0']],[['1','A','3','3','0'],['2','B','3','3','0']]])
  await assert.rejects(()=>renderedFamilyRows({async $$eval(){return cells;}},expected,['A','B']));
});
