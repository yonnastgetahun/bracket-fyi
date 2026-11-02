/**
 * Parent-owned local synthetic fixtures, actual UI writes, no DB/operator access.
 * node scripts/verify-event-browser-lanes.mjs shared|later fixture.json
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {origin,newPage,visit,action,result,openWindow,formFor,fill,publicPrivacy,button} from './browser/event-helpers.mjs';
import {effective,roomUrl,picksSnapshot,standings} from './browser/contracts.mjs';
import {keyboardActivate,layoutAndNames,liveSaved} from './browser/accessibility.mjs';

const [lane,file]=process.argv.slice(2);
assert(['shared','later'].includes(lane)&&file,'Usage: shared|later fixture.json');
const fixture=JSON.parse(fs.readFileSync(file,'utf8'));
assert.equal(fixture.schemaVersion,1);
assert.equal(fixture.synthetic,true);
assert.equal(fixture.origin,origin);
const require=createRequire(import.meta.url);
const {default:puppeteer}=await import(require.resolve('puppeteer-core'));
const out=path.resolve('tmp/browser-acceptance',new Date().toISOString().replaceAll(':','-')+'-'+lane);
fs.mkdirSync(out,{recursive:true});
const report={lane,status:'running',checks:[],scope:'Fixture-backed UI; fixture setup is separate evidence'};
const browser=await puppeteer.launch({executablePath:process.env.BROWSER_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});
const contexts=[];
async function pageFor(room,role) {
 const context=await browser.createBrowserContext();contexts.push(context);
 const page=await newPage(context);
 const url=roomUrl(room.url);
 if(role){
  const cookie=room[role+'Cookie'];
  assert(cookie&&cookie.value,'Missing '+role+' cookie');
  assert.equal(cookie.name,'event_'+role+'_'+url.split('/').at(-1));
  await context.setCookie({name:cookie.name,value:cookie.value,url:origin,httpOnly:true,sameSite:'Strict'});
 }
 return page;
}
function check(name){report.checks.push(name);}
async function renderedStandings(page,expected) {
 standings(await visit(page,page.url()),expected);
 const rows=await page.$$eval('tbody tr',rows=>rows.map(r=>[...r.cells].map(c=>c.textContent)));
 assert.equal(rows.length,expected.length);
 for(const r of expected){
  const actual=rows.find(row=>row[1]===r.name);
  assert(actual,'Missing rendered player '+r.name);
  assert.deepEqual([Number(actual[0]),Number(actual[2]),Number(actual[4])],[r.rank,r.earned,r.wrong]);
 }
}
async function shared() {
 assert.equal(fixture.leagues.length,3);
 assert.equal(new Set(fixture.leagues.map(l=>l.url)).size,3,'Three independent leagues required');
 assert.deepEqual(fixture.leagues.map(l=>l.mode).sort(),['canonical','override','release']);
 const market=fixture.marketId;
 assert(fixture.latestCanonicalVersion>fixture.overrideBasisVersion,'Canonical correction must postdate overrides');
 for(const league of fixture.leagues){
  const page=await pageFor(league);
  const data=await visit(page,roomUrl(league.url));
  effective(data,market,league.before);
  assert.equal(league.before.canonicalVersion,fixture.latestCanonicalVersion);
  assert.equal(league.before.source,league.mode==='canonical'?'canonical':'override');
  if(league.mode==='canonical')assert.deepEqual(league.before.outcome,fixture.latestOutcome);
  await renderedStandings(page,league.beforeRows);
  if(league.mode==='release'){
   assert.notDeepEqual(league.before.outcome,fixture.latestOutcome,'Release must observably change result');
   const organizer=await pageFor(league,'organizer');
   await visit(organizer,league.url);
   await result(organizer,market,null,'release');
   await liveSaved(organizer);
   const released=await visit(page,league.url);
   effective(released,market,league.after);
   assert.equal(league.after.source,'canonical');
   assert.deepEqual(league.after.outcome,fixture.latestOutcome);
   assert.equal(league.after.canonicalVersion,fixture.latestCanonicalVersion);
   await renderedStandings(page,league.afterRows);
   check('release-reveals-latest-canonical-and-rendered-score');
  }
  await layoutAndNames(page);
  await page.screenshot({path:path.join(out,league.mode+'.png'),fullPage:true});
  check(league.mode+'-result-provenance-score-layout');
 }
 // Re-read all three after the release; active override must remain isolated.
 for(const league of fixture.leagues){
  const observer=await pageFor(league);
  const data=await visit(observer,league.url);
  effective(data,market,league.mode==='release'?league.after:league.before);
  await renderedStandings(observer,league.mode==='release'?league.afterRows:league.beforeRows);
 }
 check('release-isolation-three-leagues');
}
async function later() {
 assert(['ucl-2026-27','wwc-2027'].includes(fixture.templateKey));
 const room=fixture.league;
 const organizer=await pageFor(room,'organizer'),player=await pageFor(room,'participant'),observer=await pageFor(room),newcomer=await pageFor(room);
 let org=await visit(organizer,roomUrl(room.url));
 const playerBefore=await visit(player,room.url);
 const publicBefore=await visit(observer,room.url);
 assert(playerBefore.participantId,'Existing participant fixture required');
 assert.equal(publicBefore.view.state,'locked','Fixture must have passed first lock');
 const index=org.windows.findIndex(w=>w.id===fixture.windowId);
 assert(index>0,'Later scored window required');
 const old=org.windows.filter(w=>w.state==='locked');
 assert(old.length>0,'An older immutable window is required');
 const oldIds=new Set(old.flatMap(w=>w.markets.map(m=>m.id)));
 const original=picksSnapshot(publicBefore.picks.filter(p=>oldIds.has(p.marketId)));
 assert(original.length>0,'Old picks fixture must not be empty');
 assert.equal(org.windows[index].state,'unopened');
 const windowMarkets=org.windows[index].markets;
 assert.deepEqual(Object.keys(fixture.pairings).sort(),windowMarkets.map(m=>m.id).sort(),'Review every logical slot');
 let scope=await openWindow(organizer,index);
 await organizer.evaluate(()=>{
  const d=[...document.querySelectorAll('[data-proof-window] details')].find(e=>e.querySelector('summary')?.textContent==='Review synthetic placements & home/away order');
  if(!d)throw Error('Missing reviewed placement UI');d.open=true;
 });
 let form=await formFor(organizer,'Save versioned review','review',scope);
 for(const market of windowMarkets){
  const pair=fixture.pairings[market.id];
  assert.equal(pair.length,2);assert.notEqual(pair[0],pair[1]);
  for(let slot=0;slot<2;slot++)await organizer.select(form+' select[name='+JSON.stringify(market.id+':'+slot)+']',pair[slot]);
 }
 await fill(organizer,form+' input[name=reason]','Parent-reviewed synthetic final-stage fixture');
 await organizer.locator(form+' input[type=checkbox]').click();
 org=await action(organizer,'Save versioned review',form);
 assert.equal(org.windows[index].pairingsReviewed,true);
 for(const m of org.windows[index].markets)assert.deepEqual(m.actualPairing,fixture.pairings[m.id]);
 check('versioned-reviewed-placement-ui');
 scope=await openWindow(organizer,index);
 form=await formFor(organizer,'Open if prerequisites resolved','open',scope);
 const cutoff=new Date(Date.now()+86400000);
 await fill(organizer,form+' input[name=cutoff]',new Date(cutoff.getTime()-cutoff.getTimezoneOffset()*60000).toISOString().slice(0,16));
 org=await action(organizer,'Open if prerequisites resolved',form);
 assert.equal(org.windows[index].state,'open');
 let participant=await visit(player,room.url);
 assert.equal(participant.participantId,playerBefore.participantId);
 scope=await openWindow(player,index);form=await formFor(player,'Save complete window','picks',scope);
 const scored=org.windows[index].markets.filter(m=>m.scored);
 assert.deepEqual(Object.keys(fixture.picks).sort(),scored.map(m=>m.id).sort());
 for(let i=0;i<scored.length;i++)await player.select(form+' label:nth-child('+(i+1)+') select',fixture.picks[scored[i].id]);
 participant=await action(player,'Save complete window',form);
 await liveSaved(player);
 for(const m of scored)assert.equal(participant.picks.find(p=>p.participantId===participant.participantId&&p.marketId===m.id)?.choice,fixture.picks[m.id]);
 const openedPublic=await visit(observer,room.url);
 publicPrivacy(openedPublic,publicBefore.picks);
 assert.deepEqual(picksSnapshot((await visit(organizer,room.url)).picks),picksSnapshot(publicBefore.picks));
 assert.equal(openedPublic.windows[index].state,'open');
 check('locked-league-existing-player-saves-private-later-window');
 // Original invitation is still invalid for a NEW participant after first lock.
 assert(org.invitation,'Organizer fixture must retain invitation');
 await visit(newcomer,room.url+'#invite='+encodeURIComponent(org.invitation));
 await fill(newcomer,'input[name=displayName]','Rejected late browser entrant');
 const rejected=newcomer.waitForResponse(r=>r.url()===room.url+'/data'&&r.request().method()==='POST');
 await button(newcomer,'Join & save this device');
 const rejection=await rejected;
 assert([403,409,422].includes(rejection.status()),'Late join must be rejected, not a server error');
 await newcomer.waitForSelector('[role=alert]',{visible:true});
 const rejectedData=await visit(newcomer,room.url);
 assert.equal(rejectedData.participantId,null);
 assert.equal(rejectedData.participants.length,publicBefore.participants.length);
 check('new-join-rejected-after-first-lock');
 // Walk old controls; no reopened picks or silently rewritten history.
 await visit(player,room.url);
 for(const w of old){
  const i=participant.windows.findIndex(item=>item.id===w.id);
  if(!w.markets.some(m=>m.scored))continue;
  scope=await openWindow(player,i);form=await formFor(player,'Save complete window','old',scope);
  assert(await player.$$eval(form+' select',els=>els.length>0&&els.every(e=>e.disabled)));
  assert(await player.$eval(form+' button',e=>e.disabled));
 }
 await visit(organizer,room.url);scope=await openWindow(organizer,index);
 await action(organizer,'Lock window now',scope);
 participant=await visit(player,room.url);
 assert.equal(participant.windows[index].state,'locked');
 scope=await openWindow(player,index);form=await formFor(player,'Save complete window','locked',scope);
 assert(await player.$$eval(form+' select',els=>els.length>0&&els.every(e=>e.disabled)));
 const afterLock=await visit(observer,room.url);
 assert.deepEqual(picksSnapshot(afterLock.picks.filter(p=>oldIds.has(p.marketId))),original);
 for(const m of scored)assert.equal(afterLock.picks.find(p=>p.participantId===participant.participantId&&p.marketId===m.id)?.choice,fixture.picks[m.id]);
 check('older-picks-immutable-and-new-window-lock-reveals');
 assert.equal(fixture.results.length,scored.length,'Settle each scored unit exactly once');
 assert.deepEqual(fixture.results.map(r=>r.marketId).sort(),scored.map(m=>m.id).sort());
 if(fixture.templateKey==='wwc-2027'){
  assert.equal(scored.length,2,'Medal window must contain final and bronze');
  assert(scored.some(m=>/bronze|third/i.test(m.id)),'Bronze market required');
  assert(scored.some(m=>/final/i.test(m.id)&&!/semi/i.test(m.id)),'Final market required');
  assert(/final/i.test(fixture.results[0].marketId)&&!/semi/i.test(fixture.results[0].marketId),'Settle final before bronze');
  assert(/bronze|third/i.test(fixture.results[1].marketId),'Settle bronze last');
 }
 for(const step of fixture.results){
  await result(organizer,step.marketId,step.choice);
  const state=await visit(observer,room.url);
  assert.equal(state.view.effective[step.marketId].outcome.kind,'winner');
  assert.equal(state.view.effective[step.marketId].outcome.entrant,step.choice);
  assert.equal(state.view.state,step.state);
  await renderedStandings(observer,step.rows);
  assert.deepEqual(picksSnapshot(state.picks.filter(p=>oldIds.has(p.marketId))),original);
 }
 assert.equal(fixture.results.at(-1).state,'complete','Fixture must finish complete event');
 if(fixture.templateKey==='wwc-2027')assert.notEqual(fixture.results[0].state,'complete','Final alone cannot complete medal event');
 check('all-final-window-units-score-and-complete');
 // Exercise a real keyboard interaction and live-region feedback without sending notices.
 await visit(player,room.url);
 const consent=await formFor(player,'Save fake consent','consent');
 await player.locator(consent+' input[type=checkbox]:not([name])').click();
 const post=player.waitForResponse(r=>r.url()===room.url+'/data'&&r.request().method()==='POST');
 const reload=player.waitForResponse(r=>r.url()===room.url+'/data'&&r.request().method()==='GET');
 await keyboardActivate(player,'button','Save fake consent');
 const response=await post;assert(response.ok());
 const body=JSON.parse(response.request().postData());
 assert.deepEqual({action:body.action,enabled:body.enabled,fakeAcknowledged:body.fakeAcknowledged},{action:'consent',enabled:false,fakeAcknowledged:true});
 assert((await reload).ok());
 await player.waitForFunction(()=>document.querySelector('[aria-live=polite]')?.textContent.includes('Saved.'));
 await liveSaved(player);
 check('keyboard-fake-consent-revocation-live-status-no-real-send');
 for(const page of [organizer,player,observer])await layoutAndNames(page);
 await observer.screenshot({path:path.join(out,fixture.templateKey+'.png'),fullPage:true});
 check('desktop-narrow-controls-layout');
}
try{
 await (lane==='shared'?shared():later());
 report.status='passed';
}catch(error){
 report.status='failed';
 // Fixture cookies, invitations and arbitrary server error bodies never enter evidence.
 report.errorType=error.name;
 report.failedAfter=report.checks.at(-1)||'fixture-validation';
 console.error('FAIL',lane,report.failedAfter,error.name);
 process.exitCode=1;
}finally{
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
 await Promise.all(contexts.map(c=>c.close()));
 await browser.close();
 console.log('Evidence:',out);
}
