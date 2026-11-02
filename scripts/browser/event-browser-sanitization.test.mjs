import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {SourceTextModule, SyntheticModule} from 'node:vm';

const source=readFileSync(new URL('../verify-event-browser.mjs',import.meta.url),'utf8');
const SAFE_FAILURE='browser-journey-failed';
const secret='synthetic-private-invitation-cookie-body';

// Evaluate the actual runner with inert browser/filesystem modules. No Chrome,
// network, database, or evidence-directory writes; only the journey rejects.
async function failJourney(error,phase='journey') {
 const writes=[];
 let contextsClosed=0,browserClosed=0;
 const moduleFor=async(exports)=>{
  const stub=new SyntheticModule(Object.keys(exports),function(){
   for(const [key,value] of Object.entries(exports))this.setExport(key,value);
  });
  await stub.link(()=>{throw Error('unexpected mock dependency');});
  await stub.evaluate();return stub;
 };
 const browser={
  async createBrowserContext(){return {async close(){contextsClosed++;}};},
  async close(){browserClosed++;if(phase==='cleanup')throw error;},
 };
 const puppeteer=await moduleFor({default:{async launch(){if(phase==='launch')throw error;return browser;}}});
 const helpers=Object.fromEntries(['origin','newPage','fill','json','action','visit','openWindow','formFor','publicPrivacy','row','result','button'].map(name=>[name,()=>{throw Error('unexpected helper');}]));
 helpers.newPage=async()=>{throw error;};
 const modules={
  'node:module':{createRequire:()=>({resolve:()=> 'puppeteer-core'})},
  'node:assert/strict':{default:assert},
  'node:fs':{default:{mkdirSync(){},writeFileSync(file,body){writes.push({file,body});}}},
  'node:path':{default:path},
  './browser/event-helpers.mjs':helpers,
  './browser/accessibility.mjs':{keyboardActivate(){},layoutAndNames(){}},
 };
 const runner=new SourceTextModule(source,{
  initializeImportMeta(meta){meta.url='file:///synthetic/verify-event-browser.mjs';meta.dirname='/synthetic';},
  importModuleDynamically:async()=>puppeteer,
 });
 await runner.link(specifier=>{
  assert(Object.hasOwn(modules,specifier),'Unexpected runner dependency');
  return moduleFor(modules[specifier]);
 });
 let thrown;
 try{await runner.evaluate();}catch(error){thrown=error;}
 assert.equal(writes.length,phase==='launch'?0:1,'Started journey persists its report');
 assert.equal(contextsClosed,phase==='launch'?0:3);assert.equal(browserClosed,phase==='launch'?0:1);
 return {serialized:writes[0]?.body??'{}',thrown};
}

for(const phase of ['launch','cleanup'])test('runner sanitizes '+phase,async()=>{
 const {serialized,thrown}=await failJourney(new Error(secret),phase);
 assert(!serialized.includes(secret));assert.equal(thrown.message,SAFE_FAILURE);assert(!thrown.stack.includes(secret));
});

for(const kind of ['error','assertion','string','object','hostile'])test('runner sanitizes '+kind+' failure before persistence and rethrow',async()=>{
 const url='http://127.0.0.1:3137/events/private#join='+secret;
 let error;
 if(kind==='error'){
  error=new Error(url);error.name=secret;error.stack='private stack '+secret;
  error.body={cookie:secret};error.cause=new Error(secret);
 }else if(kind==='assertion')error=new assert.AssertionError({actual:{body:secret},expected:'redacted',operator:'deepStrictEqual'});
 else if(kind==='string')error=url;
 else if(kind==='object')error={message:secret,name:secret,url,stack:secret,body:secret,toString(){return url;}};
 else error=new Proxy({},{get(){throw new Error(secret);}});
 const {serialized,thrown}=await failJourney(error);
 const report=JSON.parse(serialized).results[0];
 assert.equal(report.status,'failed');assert.equal(report.error,SAFE_FAILURE);
 assert.deepEqual(report.checks,[]);
 assert(!serialized.includes(secret));assert(!serialized.includes('#join='));
 assert(thrown instanceof Error);assert.equal(thrown.message,SAFE_FAILURE);
 assert.equal(thrown.cause,undefined);assert(!thrown.stack.includes(secret));
});
