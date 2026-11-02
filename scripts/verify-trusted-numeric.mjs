// Runtime-owner entrypoint. Connects only to an already-running local browser.
// node --import ./scripts/event-runtime-register.mjs scripts/verify-trusted-numeric.mjs sql|browser
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runNumericPersistence} from '../tests/events/trusted-numeric-persistence.ts';
import {newPage} from './browser/event-helpers.mjs';
import {verifyNumericCheckpoint} from './browser/trusted-numeric.mjs';
const mode=process.argv[2];
assert(['sql','browser'].includes(mode),'Explicit sql or browser mode required');
let browser,context,page;
const rendered=[],persisted=[];
const base=resolve('tmp/trusted-numeric');mkdirSync(base,{recursive:true});
const out=mkdtempSync(resolve(base,'run-'));
try {
 if(mode==='browser'){
  const url=new URL(process.env.BRACKET_NUMERIC_BROWSER_URL??'');
  assert(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash,'Existing local CDP HTTP endpoint required');
  const require=createRequire(import.meta.url);
  const {default:puppeteer}=await import(require.resolve('puppeteer-core'));
  browser=await puppeteer.connect({browserURL:url.origin});
  context=await browser.createBrowserContext();page=await newPage(context);
 }
 const result=await runNumericPersistence(process.env,async checkpoint=>{
  persisted.push(checkpoint.name);
  if(mode==='browser')rendered.push(await verifyNumericCheckpoint(page,checkpoint));
 });
 writeFileSync(resolve(out,'result.json'),JSON.stringify({...result,rendered,browserExecuted:mode==='browser'&&rendered.length===result.checks.length,status:'passed'},null,2)+'\n',{flag:'wx'});
 console.log('Trusted numeric '+mode+' proof passed; '+result.checks.length+' checkpoints. '+out);
} catch(error) {
 writeFileSync(resolve(out,'result.json'),JSON.stringify({status:'failed',mode,completedPersisted:persisted,completedRendered:rendered,errorType:error?.name??'Error',reason:String(error?.message??'Unknown failure').split('\n')[0].slice(0,500)},null,2)+'\n',{flag:'wx'});
 console.error('Trusted numeric proof failed; incomplete report: '+out);
 process.exitCode=1;
} finally {
 if(context)await context.close();
 if(browser)browser.disconnect(); // Never close the runtime owner's browser.
}
