/** Full-window-only evidence boundary. Never serialize arbitrary browser errors. */
import assert from 'node:assert/strict';
import {json,timeout} from './event-helpers.mjs';
import {assertCheckpoint} from './full-window-plan.mjs';

export const SAFE_FAILURE='Full-window verification failed; raw browser diagnostics omitted to protect credentials.';
export function recordFullBrowserFailure(report){
 report.status='failed';
 report.error=SAFE_FAILURE;
 // Do not attach the original error as a cause: Node prints nested causes to stderr.
 return new Error(SAFE_FAILURE);
}
export async function runWithSafeFailure(work){
 try{await work();}
 catch{
  console.error(SAFE_FAILURE);
  process.exitCode=1;
 }
}
export async function safeVisit(page,url){
 // An invitation fragment on the current room is otherwise same-document:
 // no mount/fetch occurs. This helper promises a fresh HTTP-backed visit.
 const target=new URL(url),current=new URL(page.url());
 if(target.hash&&target.origin===current.origin&&target.pathname===current.pathname)
  await page.goto('about:blank',{waitUntil:'domcontentloaded'});

 const endpoint=new URL(url).origin+new URL(url).pathname+'/data';
 // Both failures are observed even when navigation fails before the response arrives.
 // The shared visit helper leaves its response promise dangling on goto rejection.
 const [response]=await Promise.all([
  Promise.resolve().then(()=>page.waitForResponse(r=>r.url()===endpoint&&r.request().method()==='GET')),
  Promise.resolve().then(()=>page.goto(url,{waitUntil:'domcontentloaded',timeout})),
 ]);
 const data=await json(response);
 await page.waitForSelector('main h1',{visible:true});
 return data;
}
export function assertRenderedCheckpoint(visible,data,plan,index,participantId,options={}){
 assertCheckpoint(data,plan,index,participantId,options);
 const dto=data.view.leaderboard[0];
 assert.deepEqual(visible,{
  rank:dto.rank,earned:dto.earned,wrong:dto.wrong,
  maximum:dto.maximum===null?'Temporarily unverified':String(dto.maximum),
 },'Rendered standings must exactly match the validated checkpoint DTO');
 return visible;
}
