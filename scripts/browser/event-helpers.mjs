import assert from 'node:assert/strict';
export const origin='http://127.0.0.1:3137';
export const timeout=90000;
const saved='Saved. The current event state is shown below.';
export async function newPage(context,{serviceWorker=false}={}) {
 const page=await context.newPage();
 // API evidence must observe page fetches, not service-worker-owned transports.
 await page.setBypassServiceWorker(!serviceWorker);
 page.setDefaultTimeout(timeout);
 await page.setViewport({width:390,height:844,deviceScaleFactor:1});
 // Includes subresources/redirects: no external application/provider requests.
 await page.setRequestInterception(true);
 page.on('request',request=>{
  const url=new URL(request.url());
  if(url.origin===origin || ['data:','blob:','about:'].includes(url.protocol))void request.continue();
  else void request.abort('blockedbyclient');
 });
 page.on('dialog',dialog=>void dialog.accept());
 return page;
}
// Each use resolves a fresh DOM node. Never retain ElementHandles over a React refresh.
export async function button(page,text,scope='body') {
 const selector=scope+' button';
 const count=await page.$$eval(selector,(els,text)=>els.filter(e=>e.textContent.trim()===text&&!e.disabled&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').length,text);
 if(count!==1)throw Error('Expected one visible enabled button: '+text+'; found '+count);
 await page.$$eval(selector,(els,text)=>{
  document.querySelectorAll('[data-proof-button]').forEach(e=>e.removeAttribute('data-proof-button'));
  els.find(e=>e.textContent.trim()===text&&!e.disabled&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').setAttribute('data-proof-button','true');
 },text);
 await page.locator('[data-proof-button="true"]').click();
}
export async function formFor(page,buttonText,tag,scope='body') {
 await page.evaluate((scope,text,tag)=>{
  document.querySelectorAll('[data-proof-form="'+tag+'"]').forEach(e=>e.removeAttribute('data-proof-form'));
  const matches=[...document.querySelectorAll(scope+' button')].filter(e=>e.textContent.trim()===text && e.getClientRects().length);
  if(matches.length!==1 || !matches[0].closest('form'))throw Error('Cannot scope form: '+text);
  matches[0].closest('form').setAttribute('data-proof-form',tag);
 },scope,buttonText,tag);
 return '[data-proof-form="'+tag+'"]';
}
export async function fill(page,selector,value) {
 await page.waitForSelector(selector,{visible:true});
 // Chromium's segmented date control does not accept ISO strings via keyboard typing.
 // Use the native setter (not React's value tracker), then real bubbling events.
 if(await page.$eval(selector,e=>e.type==='datetime-local')) {
  await page.$eval(selector,(e,value)=>{
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);
   e.dispatchEvent(new Event('input',{bubbles:true}));
   e.dispatchEvent(new Event('change',{bubbles:true}));
  },value);
 } else await page.locator(selector).fill(value);
}
export async function json(response) {
 assert(response.ok(),'HTTP '+response.status()+' '+new URL(response.url()).pathname);
 return response.json();
}
export async function action(page,text,scope='body') {
 const endpoint=new URL(page.url()).origin+new URL(page.url()).pathname+'/data';
 // Listeners are installed BEFORE click. An old Saved message cannot satisfy this action.
 const post=page.waitForResponse(r=>r.url()===endpoint && r.request().method()==='POST').then(json);
 const reload=page.waitForResponse(r=>r.url()===endpoint && r.request().method()==='GET').then(json);
 const [,,data]=await Promise.all([button(page,text,scope),post,reload]);
 await page.waitForFunction(saved=>{
  const buttons=[...document.querySelectorAll('button')];
  return document.body.innerText.includes(saved) && buttons.some(b=>b.textContent.trim()==='Refresh state'&&!b.disabled);
 },{},saved);
 assert.equal(await page.$$eval('[role=alert]',els=>els.map(e=>e.textContent).join('')),'');
 return data;
}
export async function visit(page,url) {
 // An invitation fragment on the current room is otherwise same-document:
 // no mount/fetch occurs. This helper promises a fresh HTTP-backed visit.
 const target=new URL(url),current=new URL(page.url());
 if(target.hash&&target.origin===current.origin&&target.pathname===current.pathname)
  await page.goto('about:blank',{waitUntil:'domcontentloaded'});

 const endpoint=new URL(url).origin+new URL(url).pathname+'/data';
 const response=page.waitForResponse(r=>r.url()===endpoint && r.request().method()==='GET');
 // Navigation may reject before the waiter is awaited. Keep its original rejection
 // for the normal await, while preventing a later unhandled diagnostic leak.
 void response.catch(()=>{});
 await page.goto(url,{waitUntil:'domcontentloaded',timeout});
 const data=await json(await response);
 await page.waitForSelector('main h1',{visible:true});
 return data;
}
export async function openWindow(page,index) {
 // Only outer prediction-window details have the state summary.
 await page.evaluate(index=>{
  const windows=[...document.querySelectorAll('section details')].filter(e=>/^(open|unopened|locked) · v\d+$/.test(e.querySelector(':scope > summary > span:nth-child(2)')?.textContent??''));
  if(!windows[index])throw Error('Prediction window missing');
  windows.forEach(e=>{e.open=false;e.removeAttribute('data-proof-window');});
  windows[index].open=true;windows[index].setAttribute('data-proof-window','true');
 },index);
 return '[data-proof-window]';
}
export function publicPrivacy(data,lockedPicks=[]) {
 assert.equal(data.organizer,false);
 assert.equal(data.participantId,null);
 assert.equal(data.invitation,null);
 assert.equal(data.basisToken,null);
 assert.deepEqual(data.picks.map(p=>[p.marketId,p.choice]).sort(),lockedPicks.map(p=>[p.marketId,p.choice]).sort(),'Anonymous payload pick visibility');
 const forbidden=/^(organizer_token|magic_token|join_token|credential|organizerCredential|rawBody|rawPayload)$/i;
 function scan(value) {if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){assert(!forbidden.test(key),'Private payload field '+key);scan(item);}}
 scan(data);
}
export async function row(page,name,earned,wrong) {
 await page.waitForFunction((name,earned,wrong)=>{
  const r=[...document.querySelectorAll('tbody tr')].find(r=>r.cells[1]?.textContent===name);
  return r && r.cells[2].textContent===String(earned) && r.cells[4].textContent===String(wrong);
 },{},name,earned,wrong);
 const cells=await page.$$eval('tbody tr',(rows,name)=>[...rows.find(r=>r.cells[1]?.textContent===name).cells].map(c=>c.textContent),name);
 assert.equal(cells[0],'1','Single entrant rank');
 assert(cells[3]==='Temporarily unverified'||Number(cells[3])>=earned,'Maximum must not be below earned');
 return {rank:Number(cells[0]),earned:Number(cells[2]),maximum:cells[3],wrong:Number(cells[4])};
}
export async function result(page,marketId,choice,mode='override') {
 const scope=await formFor(page,'Apply audited change','result');
 await page.select(scope+' label:nth-child(1) select',marketId);
 await page.select(scope+' label:nth-child(2) select',mode);
 if(mode==='override') {
  if(await page.$(scope+' input[name=winners]')) {
   await page.$$eval(scope+' input[name=winners]',(els,choice)=>{for(const e of els)if(e.checked!==(e.value===choice))e.click();},choice);
  }else if(choice==='draw')await page.select(scope+' label:nth-child(3) select','draw');
  else {await page.select(scope+' label:nth-child(3) select','winner');await page.select(scope+' select[name=winner]',choice);}
 }
 await fill(page,scope+' input[name=reason]','Synthetic browser acceptance '+mode);
 return action(page,'Apply audited change',scope);
}
