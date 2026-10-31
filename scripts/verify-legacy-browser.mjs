/**
 * Parent-only runtime: node scripts/verify-legacy-browser.mjs private-fixture.json
 * No seed/SQL/operator/sender calls. See phase-2-legacy-recovery-browser.md.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {origin,button,fill} from './browser/event-helpers.mjs';

export function localRoom(value,kind='l') {
 const u=new URL(value);
 assert.equal(u.origin,origin);
 assert.match(u.pathname,new RegExp('^/'+kind+'/[0-9a-f-]{36}$','i'));
 assert(!u.search&&!u.hash);
 return u.href;
}
export function fixtureFile(file) {
 assert(file,'Private fixture path required; no implicit skip');
 assert.equal(fs.statSync(file).mode&0o077,0,'Fixture must be private (chmod 600)');
 const f=JSON.parse(fs.readFileSync(file,'utf8'));
 assert.equal(f.schemaVersion,1);assert.equal(f.synthetic,true);assert.equal(f.origin,origin);
 return f;
}
export function legacyPicks(picks) {
 assert(picks.length>0,'Nonempty pick oracle required');
 return picks.map(p=>[p.participant_id,p.slot_id,p.picked_team_id]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
export function assertLegacyScore(data,expected) {
 assert.equal(data.rows.length,1);
 const r=data.rows[0];
 assert.deepEqual({rank:r.rank,points:r.total_points,wrong:r.wrong_picks,correct:r.correct_picks},expected);
 assert(data.picks.length>0);
}
export async function runtime(lane,run) {
 const out=path.resolve('tmp/browser-acceptance',new Date().toISOString().replaceAll(':','-')+'-'+lane);
 fs.mkdirSync(out,{recursive:true,mode:0o700});
 const report={lane,status:'running',checks:[]},contexts=[];
 let browser;
 const state={out,check:name=>report.checks.push(name),contexts};
 try{
  const require=createRequire(import.meta.url);
  const {default:puppeteer}=await import(require.resolve('puppeteer-core'));
  browser=await puppeteer.launch({executablePath:process.env.BROWSER_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});
  state.page=async()=>{
   const context=await browser.createBrowserContext();contexts.push(context);
   const page=await context.newPage();page.setDefaultTimeout(60000);
   await page.setBypassServiceWorker(true);
   await page.setViewport({width:390,height:844});
   await page.setRequestInterception(true);
   page.on('request',r=>{
    const u=new URL(r.url());
    if(u.origin!==origin&&!['blob:','data:','about:'].includes(u.protocol))return void r.abort();
    // No subscribe persistence, broadcast, cron or real push transport in this runner.
    if(/\/api\/(admin\/broadcast|participant\/subscribe)|\/cron|\/send/.test(u.pathname)){
     if(u.pathname==='/api/participant/subscribe'&&page.fakePushHandler)return void page.fakePushHandler(r);
     state.forbidden=(state.forbidden||0)+1;return void r.abort();
    }
    if(u.pathname==='/api/admin/competitor'&&page.renameFailure){
     return void (page.renameFailure==='network'?r.abort('failed'):r.respond({status:page.renameFailure,contentType:'application/json',body:'{"error":"Synthetic rejection"}'}));
    }
    void r.continue();
   });
   page.on('dialog',d=>void d.accept());
   return page;
  };
  await run(state);
  assert.equal(state.forbidden||0,0,'Unexpected notification/send request');
  report.status='passed';
 }catch(e){report.status='failed';report.errorType=e.name;report.errorFrame=e.stack?.match(/(?:verify-event-recovery-browser|verify-legacy-browser)\.mjs:\d+:\d+/)?.[0];report.failedAfter=report.checks.at(-1)||'prerequisites';process.exitCode=1;}
 finally{
  await Promise.all(contexts.map(c=>c.close()));
  if(browser)await browser.close();
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2),{mode:0o600});
  console.log(lane,report.status,'Evidence:',out);
 }
}
export async function goto(page,url) {
 const r=await page.goto(url,{waitUntil:'networkidle2'});assert(r?.ok(),'Navigation rejected');
}
export async function getJSON(page,url) {
 return page.evaluate(async url=>{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('Read rejected');return r.json();},url);
}
async function clickHeadingButton(page,text){
 await page.evaluate(text=>{
  const candidates=[...document.querySelectorAll('button')].filter(b=>b.querySelector('p')?.textContent.trim()===text&&!b.disabled);
  if(candidates.length!==1)throw Error('Missing template/scoring button');candidates[0].setAttribute('data-choice','true');
 },text);
 await page.locator('[data-choice]').click();
 await page.evaluate(()=>document.querySelector('[data-choice]')?.removeAttribute('data-choice'));
}
export async function details(page,prefix) {
 await page.evaluate(prefix=>{
  document.querySelectorAll('[data-scope]').forEach(e=>e.removeAttribute('data-scope'));
  const d=[...document.querySelectorAll('details')].filter(d=>d.querySelector(':scope > summary')?.textContent.trim().startsWith(prefix));
  if(d.length!==1)throw Error('Missing details');d[0].open=true;d[0].setAttribute('data-scope','yes');
 },prefix);
 return '[data-scope]';
}
async function scopedChoice(page,label,choice,mode='pickem',round=1){
 await page.evaluate((label,mode,round)=>{
  document.querySelectorAll('[data-card]').forEach(e=>e.removeAttribute('data-card'));
  let matches=[...document.querySelectorAll('p,span')].filter(e=>e.textContent.trim()===label);
  if(mode==='result-bracket')matches=matches.filter(e=>e.parentElement.parentElement.parentElement.querySelector(':scope > p')?.textContent.trim()==='Round '+round);
  if(matches.length!==1)throw Error('Ambiguous card '+label);
  matches[0].parentElement.setAttribute('data-card','yes');
 },label,mode,round);
 await button(page,choice,'[data-card]');
}
async function create(state,kind,f) {
 const p=await state.page();await goto(p,origin+'/create');
 await clickHeadingButton(p,kind==='custom'?'Custom bracket':'Oscars 2025 (97th Academy Awards)');
 await button(p,'Continue →');
 if(kind==='custom')await fill(p,'textarea','Synthetic Alpha\nSynthetic Bravo\nSynthetic Charlie\nSynthetic Delta');
 await button(p,'Continue →');
 await fill(p,'input[type=text]','Browser '+kind+' '+Date.now());
 await button(p,'Continue →');
 await clickHeadingButton(p,'Flat');await button(p,'Continue →');
 const response=p.waitForResponse(r=>r.url()===origin+'/api/create-league'&&r.request().method()==='POST');
 await button(p,'Create league');const r=await response;assert(r.ok());const created=await r.json();
 assert(created.leagueId&&created.joinToken&&created.organizerToken);
 const room=localRoom(origin+'/l/'+created.leagueId);
 const meta=await getJSON(p,origin+'/api/league/'+created.leagueId);
 assert.equal(meta.template_type,kind==='custom'?'bracket':'pickem');
 if(kind==='pickem')assert.equal(meta.template_id,f.pickem.templateId,'Only parent synthetic catalog allowed');
 await goto(p,room+'/admin?token='+encodeURIComponent(created.organizerToken));
 assert.equal(p.url(),room+'/admin');
 state.check(kind+'-created-through-ui');
 return {admin:p,room,created};
}
async function journey(state,kind,f) {
 const {admin,room,created}=await create(state,kind,f);
 const player=await state.page();await goto(player,room+'?join='+encodeURIComponent(created.joinToken));
 assert.equal(player.url(),room);
 if(kind==='custom'){
  await scopedChoice(player,'R1 · M1','Synthetic Alpha');
  await scopedChoice(player,'R1 · M2','Synthetic Charlie');
  await button(player,'Next round');
  await scopedChoice(player,'R2 · M1','Synthetic Alpha');
  await button(player,'Champion pick');await button(player,'Synthetic Alpha');await button(player,'Next');
 }else{
  assert(f.pickem.categories.length>0);
  for(const c of f.pickem.categories)await scopedChoice(player,c.label,c.winner);
  assert(await player.evaluate(()=>{
   const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Submit picks');
   const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
  }),'Pickem submit pointer target must not be covered by league navigation');
  await button(player,'Submit picks');
 }
 await fill(player,'input[placeholder="e.g. Yonnas"]','Browser '+kind);
 state.check(kind+'-identity-form-reached');
 const pending=player.waitForResponse(r=>r.url()===origin+'/api/submit-picks'&&r.request().method()==='POST');
 await button(player,'Submit picks');const submitted=await pending;assert(submitted.ok());
 const body=JSON.parse(submitted.request().postData()),{magicToken}=await submitted.json();
 assert.equal(body.picks.length,kind==='custom'?4:f.pickem.categories.length);
 state.check(kind+'-picks-submitted');
 const magic=room+'/p/'+magicToken;
 await goto(player,magic);
 state.check(kind+'-magic-page-loaded');
 // Trigger the real component's read path without waiting for its 30-second interval.
 const ownRead=player.waitForResponse(r=>r.url().startsWith(room+'/data?participantId='));
 await player.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 const ownResponse=await ownRead;assert(ownResponse.ok());const original=(await ownResponse.json()).picks;
 const originalSnapshot=legacyPicks(original),participantId=original[0].participant_id;
 assert.deepEqual(original.map(p=>[p.slot_id,p.picked_team_id]).sort(),body.picks.filter(p=>p.slotId!=='champion').map(p=>[p.slotId,p.teamId]).sort());
 const fresh=await state.page();assert.equal((await fresh.browserContext().cookies()).length,0);
 await goto(fresh,magic);await goto(fresh,room);
 const recovered=await getJSON(fresh,room+'/data?participantId='+participantId);
 assert.deepEqual(legacyPicks(recovered.picks),originalSnapshot);
 assert((await fresh.$eval('body',e=>e.innerText)).includes('Browser '+kind));
 const cookie=(await fresh.browserContext().cookies()).find(c=>c.name==='bfyi_participant');assert(cookie?.httpOnly);
 state.check(kind+'-join-picks-and-fresh-magic-link-recovery');
 await goto(admin,room+'/admin');
 await details(admin,'Pick lock');
 const locked=admin.waitForResponse(r=>r.url()===origin+'/api/admin/lock'&&r.request().method()==='POST');
 await button(admin,'Lock picks now');await button(admin,'Lock');assert((await locked).ok());
 await goto(admin,room+'/admin');await details(admin,'Enter results');
 const results=kind==='custom'?[{label:'Match 1',winner:'Synthetic Alpha',round:1},{label:'Match 2',winner:'Synthetic Charlie',round:1},{label:'Match 1',winner:'Synthetic Alpha',round:2}]:f.pickem.categories;
 for(const c of results){
  const post=admin.waitForResponse(r=>r.url()===origin+'/api/admin/result'&&r.request().method()==='POST');
  await scopedChoice(admin,c.label,c.winner,kind==='custom'?'result-bracket':'pickem',c.round);
  const r=await post;assert(r.ok());const payload=JSON.parse(r.request().postData());
  assert(body.picks.some(p=>p.slotId===payload.templateMatchId&&p.teamId===payload.winnerTeamId));
 }
 const observer=await state.page();await goto(observer,room);
 const data=await getJSON(observer,room+'/data');
 const expected={rank:1,points:kind==='custom'?3:f.pickem.categories.length,wrong:0,correct:kind==='custom'?3:f.pickem.categories.length};
 assertLegacyScore(data,expected);
 assert.deepEqual(legacyPicks(data.picks),originalSnapshot);
 assert(data.picks.every(p=>p.locked),'Persisted pick rows must be locked');
 if(kind==='custom'){
  assert.equal(data.champions.length,1);
  assert.equal(data.champions[0].champion_team_id,body.picks.find(p=>p.slotId==='champion').teamId);
 }
 // Check actual rendered card score, not only response JSON.
 const rendered=await observer.evaluate(name=>{
  const cards=[...document.querySelectorAll('div.relative.rounded-xl')].filter(card=>card.querySelector('.tabular-nums')&&[...card.querySelectorAll('span')].some(e=>e.textContent.trim()===name));
  if(cards.length!==1)return null;
  const card=cards[0];
  return card?{text:card.innerText,points:card.querySelector('.tabular-nums')?.textContent}:null;
 },'Browser '+kind);
 assert(rendered);assert.equal(Number(rendered.points),expected.points);assert(rendered.text.includes('0 ✗'));
 const late=await state.page();await goto(late,room+'?join='+encodeURIComponent(created.joinToken));
 assert.equal(await late.$('input[placeholder="e.g. Yonnas"]'),null);
 assert.equal(await late.$$eval('button',bs=>bs.filter(b=>b.textContent.trim()==='Submit picks').length),0);
 state.check(kind+'-locked-results-persisted-rendered-score-no-new-entry');
 if(kind==='custom')await push(state,magic);
}
export function installFakePush() {
 const state={permission:'granted',reject:false,subscribe:0,unsubscribe:0,current:null};
 const subscription={toJSON:()=>({endpoint:'https://fake.invalid/no-send',keys:{p256dh:'synthetic',auth:'synthetic'}}),unsubscribe:async()=>{state.unsubscribe++;state.current=null;return true;}};
 const manager={getSubscription:async()=>state.current,subscribe:async()=>{
  state.subscribe++;if(state.reject)throw new Error('Synthetic PushManager rejection');
  state.current=subscription;return subscription;
 }};
 Object.defineProperty(window,'PushManager',{configurable:true,value:function(){}});
 Object.defineProperty(window,'Notification',{configurable:true,value:{permission:'default',requestPermission:async()=>state.permission}});
 Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{register:async()=>({pushManager:manager}),ready:Promise.resolve({pushManager:manager})}});
 window.__fakePush=state;
}
async function push(state,magic){
 const page=await state.page();await page.evaluateOnNewDocument(installFakePush);
 let responseStatus=200;const bodies=[];
 page.fakePushHandler=r=>{assert.equal(r.method(),'PATCH');bodies.push(JSON.parse(r.postData()));return r.respond({status:responseStatus,contentType:'application/json',body:'{"success":true}'});};
 await goto(page,magic);
 const off='button[aria-label="Enable notifications"]',on='button[aria-label="Notifications on — tap to disable"]';
 await page.waitForSelector(off,{visible:true}); // Missing VAPID fixture is a failure, not a skip.
 await page.locator(off).click();await page.waitForSelector(on,{visible:true});
 assert.equal(bodies.length,1);assert(bodies[0].subscription);
 await page.locator(on).click();await page.waitForSelector(off,{visible:true});
 assert.equal(bodies.length,2);assert.equal(bodies[1].subscription,null);
 assert.equal(await page.evaluate(()=>window.__fakePush.unsubscribe),1);
 responseStatus=403;await page.locator(off).click();
 await page.waitForFunction(()=>window.__fakePush.unsubscribe===2);
 await page.waitForSelector(off+':not([disabled])');
 assert.equal(bodies.length,3);assert.equal(await page.evaluate(()=>window.__fakePush.current),null);
 await page.evaluate(()=>{window.__fakePush.reject=true;});
 await page.locator(off).click();await page.waitForSelector(off+':not([disabled])');
 assert.equal(bodies.length,3);assert.equal(await page.evaluate(()=>window.__fakePush.subscribe),3);
 await page.evaluate(()=>{window.__fakePush.reject=false;window.__fakePush.permission='denied';});
 await page.locator(off).click();await page.waitForSelector(off+':not([disabled])');
 assert.equal(bodies.length,3);
 state.check('fake-push-subscribe-unsubscribe-server-rejection-rollback-manager-rejection-permission-denied-no-real-sends');
}
async function rename(state,f){
 const {a,b,teamId,before,after,templateId}=f.sharedRename;
 assert.notEqual(localRoom(a.url),localRoom(b.url));assert.notEqual(before,after);
 const pa=await state.page(),pb=await state.page();
 for(const [page,room] of [[pa,a],[pb,b]])await goto(page,room.url+'/admin?token='+encodeURIComponent(room.organizerToken));
 const meta=async(page,room)=>getJSON(page,origin+'/api/league/'+room.url.split('/').at(-1));
 const originalA=await meta(pa,a),originalB=await meta(pb,b);
 assert.equal(originalA.template_id,templateId);assert.equal(originalB.template_id,templateId);
 assert.equal(originalA.competitors.find(t=>t.id===teamId)?.name,before);
 assert.deepEqual(originalA.competitors,originalB.competitors,'Start from shared unrenamed registry');
 async function edit(mode,name){
  await goto(pa,a.url+'/admin');await details(pa,'Edit competitors');
  await pa.evaluate(id=>{
   const e=[...document.querySelectorAll('[data-scope] span')].find(e=>e.textContent===id);
   if(!e)throw Error('Missing competitor ID');e.parentElement.setAttribute('data-rename-row','yes');
  },teamId);
  await button(pa,'Rename','[data-rename-row]');
  await fill(pa,'[data-rename-row] input',name);pa.renameFailure=mode;
  const done=mode==='network'?pa.waitForRequest(r=>r.url()===origin+'/api/admin/competitor'):pa.waitForResponse(r=>r.url()===origin+'/api/admin/competitor');
  await pa.focus('[data-rename-row] input');await pa.keyboard.press('Enter');await done;
  if(mode){
   await pa.waitForSelector('[data-rename-row] [role=alert]',{visible:true});
   assert((await pa.$eval('[data-rename-row] [role=alert]',e=>e.textContent)).includes('Could not confirm'));
   assert.equal(await pa.$eval('[data-rename-row] input',e=>e.getAttribute('aria-label')),'Rename '+before);
   assert.equal((await meta(pa,a)).competitors.find(t=>t.id===teamId).name,before);
   // Cancel the retained draft before removing interception or navigating; blur must not retry it.
   await pa.focus('[data-rename-row] input');await pa.keyboard.press('Escape');
   await pa.waitForFunction(()=>!document.querySelector('[data-rename-row] input'));
   assert((await pa.$eval('[data-rename-row]',e=>e.textContent)).includes(before));
  }else await pa.waitForFunction(()=>!document.querySelector('[data-rename-row] input'));
  pa.renameFailure=null;
 }
 for(const rejection of [403,500,'network'])await edit(rejection,after);
 state.check('rename-http403-http500-network-truthful-error-persisted-name-unchanged');
 await edit(null,after);
 const changed=await meta(pa,a);assert.deepEqual(changed.competitors,originalA.competitors.map(t=>t.id===teamId?{...t,name:after}:t));
 assert.deepEqual(await meta(pb,b),originalB);
 for(const [page,room,label] of [[pa,a,after],[pb,b,before]]){
  await goto(page,room.url+'/admin');await details(page,'Edit competitors');
  assert(await page.evaluate((id,label)=>{
   const e=[...document.querySelectorAll('[data-scope] span')].find(e=>e.textContent===id);
   return e?.parentElement.textContent.includes(label);
  },teamId,label));
 }
 state.check('same-template-rename-retry-reload-isolation-stable-ids');
}
export async function main(file){
 const f=fixtureFile(file);
 assert(f.pickem?.templateId&&f.sharedRename,'Both synthetic pickem and shared-rename fixtures required');
 const lane=process.env.BRACKET_LEGACY_LANE;
 assert(!lane||['custom','pickem','rename'].includes(lane));
 await runtime('legacy',async s=>{
  if(!lane||lane==='custom')await journey(s,'custom',f);
  if(!lane||lane==='pickem')await journey(s,'pickem',f);
  if(!lane||lane==='rename')await rename(s,f);
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main(process.argv[2]);
