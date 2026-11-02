import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('visit handles response rejection after navigation fails without stderr leakage',()=>{
 const helper=new URL('./event-helpers.mjs',import.meta.url).href;
 const source=`import {visit} from ${JSON.stringify(helper)};
 const page={url:()=> 'about:blank',waitForResponse:()=>new Promise((_,reject)=>setImmediate(()=>reject(new Error('synthetic-private-waiter-secret')))),goto:async()=>{throw new Error('synthetic-navigation-secret');}};
 try{await visit(page,'http://127.0.0.1:3137/events/test');}catch{}
 await new Promise(resolve=>setTimeout(resolve,20));`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8'});
 assert.equal(result.status,0,'Abandoned response waiter must be handled');
 assert(!result.stderr.includes('synthetic-private-waiter-secret'));
});
