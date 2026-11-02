/**
 * Parent-only runtime: node scripts/verify-event-recovery-browser.mjs private-fixture.json
 * Download files stay mode-0600 in an ephemeral private directory and are removed.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {fixtureFile,localRoom,runtime,details} from './verify-legacy-browser.mjs';
import {origin,visit,button,fill,action,openWindow,formFor} from './browser/event-helpers.mjs';
import {picksSnapshot} from './browser/contracts.mjs';

export function parseRecovery(text,url,role) {
 assert.equal(text.split('\n').filter(l=>l.startsWith('Credential: ')).length,1);
 assert(text.includes('\nLeague: '+url+'\n'));assert(text.includes('\nRole: '+role+'\n'));
 const token=text.split('\n').find(l=>l.startsWith('Credential: ')).slice(12).trim();
 assert(token.length>=20);assert(!/\s/.test(token));return token;
}
export function preserved(before,after,role='participant') {
 assert.deepEqual(after.participants,before.participants,'Roster identity/count changed');
 assert.deepEqual(picksSnapshot(after.picks),picksSnapshot(before.picks),'Visible saved picks changed');
 assert.equal(after.participantId,role==='participant'?before.participantId:null);
 assert.equal(after.organizer,role==='organizer');
}
export function otherParticipantPreserved(f,after,before=after) {
 const b=f.otherParticipant;
 assert(b.expectedOwnPicks.length>0,'Independent B pick fixture required');
 assert.equal(after.participantId,b.expectedParticipantId);
 assert.equal(after.organizer,false);
 const expected=b.expectedOwnPicks.map(p=>({...p,participantId:b.expectedParticipantId}));
 assert.deepEqual(picksSnapshot(after.picks),picksSnapshot(expected),'Private B saved picks changed');
 preserved(before,after);
}
export function validateRecoveryFixture(f) {
 localRoom(f.league.url,'events');localRoom(f.otherLeague.url,'events');
 assert.notEqual(f.league.url,f.otherLeague.url);
 assert(f.expectedParticipantId&&f.expectedOwnPicks?.length>0);
 const b=f.otherParticipant;
 assert(b?.expectedParticipantId&&b.expectedOwnPicks?.length>0,'Separate B identity and picks required');
 assert.notEqual(b.expectedParticipantId,f.expectedParticipantId);
 assert.equal(b.participantCookie?.name,f.league.participantCookie?.name);
 assert(typeof b.participantCookie?.value==='string'&&b.participantCookie.value.length>0);
 // Boolean assertion avoids embedding credential values in assertion errors.
 for(const room of [f.league,f.otherLeague])
  for(const role of ['participant','organizer'])
   assert(b.participantCookie.value!==room[role+'Cookie']?.value,'B credential must be separate');
 for(const value of Object.values(f.revoked??{}))
  assert(b.participantCookie.value!==value,'B credential must be current and separate');
 for(const role of ['participant','organizer']){
  for(const room of [f.league,f.otherLeague]){
   const c=room[role+'Cookie'];assert.equal(c?.name,'event_'+role+'_'+room.url.split('/').at(-1));assert(c.value);
  }
  assert(f.revoked?.[role]&&f.revoked[role]!==f.league[role+'Cookie'].value);
  assert.notEqual(f.otherLeague[role+'Cookie'].value,f.league[role+'Cookie'].value,'Foreign credential must be distinct');
 }
}
async function signedPage(state,room,role){
 const page=await state.page(),cookie=room[role+'Cookie'];
 await page.browserContext().setCookie({...cookie,url:origin,httpOnly:true,sameSite:'Strict'});
 return page;
}
async function recover(page,url,role,token,ok){
 const scope=await details(page,'Recover an existing session');
 // Organizer rooms also contain a notification role selector.
 await page.select(scope+' select[name=role]',role);await fill(page,scope+' input[name=credential]',token);
 assert.equal(await page.$eval(scope+' select[name=role]',e=>e.value),role);
 if(ok)return action(page,'Recover session');
 const post=page.waitForResponse(r=>r.url()===url+'/data'&&r.request().method()==='POST');
 await button(page,'Recover session',scope);const r=await post;
 const submitted=JSON.parse(r.request().postData());
 assert.equal(submitted.role,role);assert.equal(submitted.credential===token,true,'Recovery must submit the supplied credential');
 assert.equal(r.status(),403);assert.equal(r.headers()['set-cookie'],undefined);
 await page.waitForSelector('[role=alert]',{visible:true});
 assert((await page.$eval('[role=alert]',e=>e.textContent)).trim().length>0);
 return visit(page,url);
}
async function visiblePicks(page,data){
 let count=0;
 for(let i=0;i<data.windows.length;i++){
  const w=data.windows[i],own=data.picks.filter(p=>p.participantId===data.participantId&&w.markets.some(m=>m.id===p.marketId));
  if(!own.length)continue;
  const scope=await openWindow(page,i),form=await formFor(page,'Save complete window','saved',scope);
  const values=await page.$$eval(form+' select',els=>els.map(e=>e.value));
  assert.deepEqual(values,w.markets.filter(m=>m.scored).map(m=>own.find(p=>p.marketId===m.id)?.choice??''));
  count+=own.length;
 }
 assert(count>0,'No rendered own picks');
}
async function download(state,page,url,role){
 const directory=fs.mkdtempSync(path.join(state.out,'.private-download-'));fs.chmodSync(directory,0o700);
 const cdp=await page.createCDPSession();
 try{
  // Chromium may discard the CDP body for an attachment fetch. Clone the real
  // browser response transiently; compare disk bytes without another request.
  await page.evaluate(endpoint=>{
   const original=window.fetch;
   window.__proofRecoveryResponse={original,body:null};
   window.fetch=async(...args)=>{
    const response=await original.apply(window,args);
    if(response.url===endpoint)window.__proofRecoveryResponse.body=response.clone().text();
    return response;
   };
  },url+'/recovery');
  await cdp.send('Browser.setDownloadBehavior' ,{behavior:'allow',downloadPath:directory,browserContextId:page.browserContext().id});
  const response=page.waitForResponse(r=>r.url()===url+'/recovery'&&r.request().method()==='POST');
  await button(page,'Download my '+role+' recovery file');
  const r=await response;assert.equal(r.status(),200);
  assert.match(r.headers()['cache-control'],/no-store/);assert.equal(r.headers()['referrer-policy'],'no-referrer');
  assert.match(r.headers()['content-disposition'],/^attachment;/);assert.equal(r.headers()['x-content-type-options'],'nosniff');
  const filename='bracket-'+url.split('/').at(-1)+'-'+role+'-recovery.txt',target=path.join(directory,filename);
  const end=Date.now()+15000;
  while(!fs.existsSync(target)&&Date.now()<end)await delay(100);
  assert(fs.existsSync(target),'Browser did not complete download');
  fs.chmodSync(target,0o600);
  const text=fs.readFileSync(target,'utf8');
  const transported=await page.evaluate(async()=>await window.__proofRecoveryResponse.body);
  assert.equal(text===transported,true,'Downloaded file differs from actual browser response');
  const token=parseRecovery(text,url,role);
  await page.waitForFunction(()=>[...document.querySelectorAll('[role=status]')].some(e=>e.textContent.includes('Download requested.')));
  assert(!(await page.content()).includes(token),'Credential leaked into HTML');
  assert.equal(await page.evaluate(token=>Object.values(localStorage).some(v=>v.includes(token)),token),false);
  state.check(role+'-explicit-real-file-download-private-headers-no-dom-storage-secret');
  return token;
 }finally{
  await page.evaluate(()=>{const probe=window.__proofRecoveryResponse;if(probe){window.fetch=probe.original;delete window.__proofRecoveryResponse;}}).catch(()=>{});
  await cdp.detach();fs.rmSync(directory,{recursive:true,force:true});
 }
}
export async function main(file){
 const f=fixtureFile(file);validateRecoveryFixture(f);
 await runtime('event-recovery',async state=>{
  // Real two-participant room renders both revision-reset siblings together.
  // Duplicate keys trigger a dev overlay and can mis-reconcile saved picks.
  let duplicateKeys=0;
  const makePage=state.page;
  state.page=async()=>{
   const page=await makePage();
   page.on('console',message=>{if(message.text().includes('Encountered two children with the same key'))duplicateKeys++;});
   return page;
  };
  const url=f.league.url;
  const player=await signedPage(state,f.league,'participant');
  const before=await visit(player,url);
  assert.equal(before.participantId,f.expectedParticipantId);
  assert.equal(before.organizer,false);
  assert(before.participants.length>=2,'A second participant is required to prove isolation');
  assert(before.windows.some(w=>w.state==='open'),'Open picks privacy fixture required');
  const expected=f.expectedOwnPicks.map(p=>({participantId:f.expectedParticipantId,...p}));
  assert.deepEqual(picksSnapshot(before.picks),picksSnapshot(expected),'Fixture must contain only own open picks');
  await visiblePicks(player,before);
  const bPage=await signedPage(state,f.otherParticipant,'participant');
  const bBefore=await visit(bPage,url);
  otherParticipantPreserved(f,bBefore);
  assert.deepEqual(bBefore.participants,before.participants);
  await visiblePicks(bPage,bBefore);
  state.check('independent-B-context-has-expected-private-saved-picks-before-recovery');
  const checkB=async()=>{
   const current=await visit(bPage,url);
   otherParticipantPreserved(f,current,bBefore);
   await visiblePicks(bPage,current);
  };
  const org=await signedPage(state,f.league,'organizer'),orgBefore=await visit(org,url);
  assert.equal(orgBefore.organizer,true);assert.equal(orgBefore.participantId,null);assert(orgBefore.invitation);
  assert.deepEqual(orgBefore.picks,[],'Organizer must not see open player picks');
  const tokens={participant:await download(state,player,url,'participant'),organizer:await download(state,org,url,'organizer')};
  for(const role of ['participant','organizer']){
   const foreign=await signedPage(state,f.otherLeague,role),foreignView=await visit(foreign,f.otherLeague.url);
   assert.equal(foreignView.organizer,role==='organizer');
   if(role==='participant')assert(foreignView.participantId,'Cross-league negative must use a valid foreign participant');
   assert.equal(tokens[role],f.league[role+'Cookie'].value);
   const fresh=await state.page();assert.equal((await fresh.browserContext().cookies()).length,0);
   const anonymous=await visit(fresh,url);assert.equal(anonymous.participantId,null);assert.equal(anonymous.organizer,false);assert.deepEqual(anonymous.picks,[]);
   const restored=await recover(fresh,url,role,tokens[role],true);
   preserved(role==='participant'?before:orgBefore,restored,role);
   await checkB();
   if(role==='participant')await visiblePicks(fresh,restored);
   else{
    assert.equal(restored.invitation,orgBefore.invitation);
    await fresh.waitForSelector('input[aria-label="Invitation link"]',{visible:true});
    assert.equal(await fresh.$$eval('button',bs=>bs.filter(b=>b.textContent==='Download my participant recovery file').length),0);
   }
   const cookie=(await fresh.browserContext().cookies()).find(c=>c.name===f.league[role+'Cookie'].name);
   assert(cookie?.httpOnly);assert.equal(cookie.sameSite,'Strict');assert.equal(cookie.path,'/events/'+url.split('/').at(-1));
   state.check(role+'-fresh-context-restore-same-identity-picks-and-scoped-cookie');
   const invalid=[
    ['wrong',tokens[role].slice(0,-1)+(tokens[role].endsWith('a')?'b':'a')],
    ['revoked',f.revoked[role]],
    ['cross-league',f.otherLeague[role+'Cookie'].value],
    ['wrong-role',tokens[role==='participant'?'organizer':'participant']],
   ];
   for(const [label,token] of invalid){
    // Existing authenticated identity must survive a failed replacement.
    const cookieBefore=(await fresh.browserContext().cookies()).filter(c=>c.name.startsWith('event_'));
    const after=await recover(fresh,url,role,token,false);
    preserved(role==='participant'?before:orgBefore,after,role);
    await checkB();
    assert.deepEqual((await fresh.browserContext().cookies()).filter(c=>c.name.startsWith('event_')),cookieBefore);
    // A denied credential must also fail in a cookie-free context.
    const denied=await state.page();await visit(denied,url);
    const deniedData=await recover(denied,url,role,token,false);
    await checkB();
    assert.equal(deniedData.participantId,null);assert.equal(deniedData.organizer,false);assert.deepEqual(deniedData.picks,[]);
    assert.equal((await denied.browserContext().cookies()).filter(c=>c.name.startsWith('event_')).length,0);
    // Export validates the exact cookie, including revoked and foreign credentials.
    await denied.browserContext().setCookie({name:f.league[role+'Cookie'].name,value:token,url:origin,httpOnly:true,sameSite:'Strict'});
    const exportDenied=await denied.evaluate(async({url,role})=>{
     const r=await fetch(url+'/recovery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role})});
     return {status:r.status,disposition:r.headers.get('content-disposition')};
    },{url,role});
    assert.equal(exportDenied.status,403);assert.equal(exportDenied.disposition,null);
    await checkB();
    state.check(role+'-'+label+'-restore-export-denied-no-cookie-or-pick-mutation');
   }
  }
  const finalA=await visit(player,url);
  preserved(before,finalA);
  await visiblePicks(player,finalA);
  await checkB();
  state.check('independent-B-private-picks-preserved-after-every-restore-and-export-attempt');
  state.check('original-own-picks-roster-and-open-pick-privacy-preserved-after-all-negatives');
  assert.equal(duplicateKeys,0,'Room revision siblings must have unique React keys');
  state.check('room-revision-siblings-have-unique-react-keys');
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{await main(process.argv[2]);}
 catch{console.error('Recovery verification failed; private details suppressed.');process.exitCode=1;}
}
