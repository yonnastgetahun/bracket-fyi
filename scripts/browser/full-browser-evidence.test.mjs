import '../event-runtime-register.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fullPlan} from './full-window-plan.mjs';
import {assertRenderedCheckpoint,SAFE_FAILURE,recordFullBrowserFailure} from './full-browser-evidence.mjs';
const {buildSyntheticManifest}=await import('../../lib/events/catalog.ts');

function checkpoint(plan,index,beforeBronze=false,maximum=beforeBronze?null:plan.oracle.maximum[index]){
 const earned=beforeBronze?63:plan.oracle.earned[index];
 const settled=new Set(plan.manifest.windows.slice(0,index+1).flatMap(w=>plan.manifest.markets
  .filter(m=>m.windowId===w.id&&(!beforeBronze||m.role!=='bronze')).map(m=>m.id)));
 const data={view:{state:earned===plan.oracle.total?'complete':'locked',
  leaderboard:[{id:'p',rank:1,earned,wrong:0,maximum}],
  effective:Object.fromEntries(plan.manifest.markets.map(m=>[m.id,{source:settled.has(m.id)?'override':'unresolved',
   outcome:settled.has(m.id)?{kind:'winner',entrant:plan.winners[m.id]}:{kind:'unresolved'},held:false,excluded:false}]))}};
 return {data,visible:{rank:1,earned,wrong:0,maximum:maximum===null?'Temporarily unverified':String(maximum)}};
}
for(const [key,total] of [['ucl-2026-27',211],['wwc-2027',64]]){
 const plan=fullPlan(buildSyntheticManifest(key,{startsAt:'2030-01-01T00:00:00Z'}));
 test(key+': exact rendered final, rejects unverified/999 and every mismatched cell',()=>{
  const index=plan.manifest.windows.length-1;
  const {data,visible}=checkpoint(plan,index);
  assert.equal(visible.maximum,String(total));
  assertRenderedCheckpoint(visible,data,plan,index,'p');
  for(const patch of [{maximum:'Temporarily unverified'},{maximum:'999'},{maximum:String(total-1)},
   {rank:2},{earned:total-1},{wrong:1}]){
   assert.throws(()=>assertRenderedCheckpoint({...visible,...patch},data,plan,index,'p'));
  }
  for(const maximum of [null,999]){
   const bad=checkpoint(plan,index,false,maximum);
   assert.throws(()=>assertRenderedCheckpoint(bad.visible,bad.data,plan,index,'p'));
  }
 });
 test(key+': every interim rendered maximum is contractually unverified',()=>{
  for(let i=0;i<plan.manifest.windows.length-1;i++){
   const {data,visible}=checkpoint(plan,i);
   assertRenderedCheckpoint(visible,data,plan,i,'p');
   for(const maximum of [String(plan.oracle.earned[i]),'999'])
    assert.throws(()=>assertRenderedCheckpoint({...visible,maximum},data,plan,i,'p'));
  }
 });
 if(key==='wwc-2027')test('WWC before bronze rendered 63 checkpoint retains DTO maximum parity',()=>{
  const {data,visible}=checkpoint(plan,6,true);
  assertRenderedCheckpoint(visible,data,plan,6,'p',{beforeBronze:true});
  assert.throws(()=>assertRenderedCheckpoint({...visible,maximum:'999'},data,plan,6,'p',{beforeBronze:true}));
 });
}
test('failure evidence contains only fixed diagnostic, with no original error or cause',()=>{
 const report={key:'ucl-2026-27',status:'running'};
 const error=recordFullBrowserFailure(report);
 assert.equal(report.status,'failed');
 assert.equal(report.error,SAFE_FAILURE);
 assert.equal(error.message,SAFE_FAILURE);
 assert.equal(error.cause,undefined);
});
test('secret-bearing navigation failure sanitizes actual stderr and evidence, consumes waiter rejection',()=>{
 const helper=new URL('./full-browser-evidence.mjs',import.meta.url).href;
 const secret='synthetic-invitation-secret-do-not-log';
 const code=`
  import {safeVisit,runWithSafeFailure,recordFullBrowserFailure} from ${JSON.stringify(helper)};
  const invite='http://127.0.0.1:3137/events/fake#join=${secret}';
  const report={status:'running'};
  const page={
   url(){return "about:blank";},
   waitForResponse(){return new Promise((_,reject)=>setImmediate(()=>reject(new Error('wait failed '+invite))));},
   async goto(){throw new Error('net::ERR_FAILED at '+invite);},
  };
  await runWithSafeFailure(async()=>{
   try{await safeVisit(page,invite);}
   catch{throw recordFullBrowserFailure(report);}
   finally{console.log(JSON.stringify(report));}
  });
 `;
 const child=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8'});
 assert.equal(child.status,1,child.stderr);
 assert.equal(child.signal,null);
 assert.equal(child.stderr.trim(),SAFE_FAILURE);
 assert.deepEqual(JSON.parse(child.stdout),{status:'failed',error:SAFE_FAILURE});
 for(const output of [child.stdout,child.stderr]){
  assert(!output.includes(secret));assert(!output.includes('#join='));
 }
});
test('outer failure boundary also suppresses secret-bearing setup/cleanup errors',()=>{
 const helper=new URL('./full-browser-evidence.mjs',import.meta.url).href;
 const child=spawnSync(process.execPath,['--input-type=module','-e',
  `import {runWithSafeFailure} from ${JSON.stringify(helper)}; await runWithSafeFailure(async()=>{throw new Error('cleanup #join=private-secret');});`],{encoding:'utf8'});
 assert.equal(child.status,1);assert.equal(child.stderr.trim(),SAFE_FAILURE);assert.equal(child.stdout,'');
});
test('runner wires safe failure boundary, navigation and rendered checkpoint checks',()=>{
 const source=readFileSync(new URL('../verify-event-full-browser.mjs',import.meta.url),'utf8');
 assert.match(source,/await runWithSafeFailure\(async\(\)=>/);
 assert.match(source,/safeVisit as visit/);
 assert.match(source,/throw recordFullBrowserFailure\(report\)/);
 assert.equal((source.match(/assertRenderedCheckpoint\(/g)||[]).length,2);
 assert.doesNotMatch(source,/String\(error\)|throw error/);
});
