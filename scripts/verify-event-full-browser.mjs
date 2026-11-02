/**
 * Full-window P11 UI journey; no SQL, seeded league, direct POST, or product bypass.
 * Parent/runtime owner only: BRACKET_FULL_BROWSER_ACK=synthetic-loopback-only node scripts/verify-event-full-browser.mjs
 */
import './event-runtime-register.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {origin,newPage,fill,json,button,action,openWindow,formFor,publicPrivacy,row,result} from './browser/event-helpers.mjs';
import {picksSnapshot,roomUrl} from './browser/contracts.mjs';
import {fullPlan,assertShape} from './browser/full-window-plan.mjs';
import {safeVisit as visit,runWithSafeFailure,recordFullBrowserFailure,assertRenderedCheckpoint} from './browser/full-browser-evidence.mjs';

await runWithSafeFailure(async()=>{

assert.equal(process.env.BRACKET_FULL_BROWSER_ACK,'synthetic-loopback-only','Runtime owner must acknowledge disposable loopback application');
const {buildSyntheticManifest}=await import('../lib/events/catalog.ts');
const {default:puppeteer}=await import(createRequire(import.meta.url).resolve('puppeteer-core'));
const out=path.resolve(import.meta.dirname,'../tmp/browser-acceptance/full-window-'+new Date().toISOString().replaceAll(':','-'));
fs.mkdirSync(out,{recursive:true});
const reports=[];
function persist(){fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({
 scope:'Full UI-created UCL 13 windows/211 scored + WWC 7 windows/64 scored; no fixture seed. Synthetic only.',
 allScoredMarketsAndWindowsCovered:reports.length===2&&reports.every(r=>r.status==='passed'),
 reports},null,2));}
function localFuture(){
 const date=new Date(Date.now()+7*86400000);
 return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
async function disabledPast(page,index){
 const scope=await openWindow(page,index);
 const form=await formFor(page,'Save complete window','old',scope);
 assert(await page.$$eval(form+' select',els=>els.length>0&&els.every(e=>e.disabled)));
 assert(await page.$eval(form+' button',e=>e.disabled));
}
async function rejectLateJoin(page,invite,room,id){
 await visit(page,invite);
 await fill(page,'input[name=displayName]','Late entrant rejected');
 const response=page.waitForResponse(r=>r.url()===room+'/data'&&r.request().method()==='POST');
 await button(page,'Join & save this device');
 const rejected=await response;
 assert.equal(rejected.status(),409,'Late join must fail as membership conflict');
 assert.equal((await rejected.json()).error,'The event changed or this window is not ready. Refresh before retrying.');
 await page.waitForSelector('[role=alert]',{visible:true});
 assert(!(await page.cookies()).some(c=>c.name==='event_participant_'+id));
 const data=await visit(page,room);
 assert.equal(data.participantId,null);assert.equal(data.participants.length,1);
}
const browser=await puppeteer.launch({executablePath:process.env.BRACKET_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});
try{
 for(const key of ['ucl-2026-27','wwc-2027']){
  const plan=fullPlan(buildSyntheticManifest(key,{startsAt:new Date(Date.now()+7*86400000).toISOString()}));
  const report={key,status:'running',expectedScored:plan.oracle.total,expectedWindows:plan.oracle.counts.length,
   requiredStructuralUnits:plan.oracle.structural,coveredMarkets:[],windows:[],reviews:0,checks:[]};
  reports.push(report);persist();
  const contexts=await Promise.all(Array.from({length:4},()=>browser.createBrowserContext()));
  try{
   const [organizer,player,observer,late]=await Promise.all(contexts.map(newPage));
   report.phase='create';
   await organizer.goto(origin+'/events',{waitUntil:'domcontentloaded'});
   await organizer.waitForFunction(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$'));});
   await organizer.locator('input[type=radio][value="'+key+'"]').click();
   await organizer.waitForFunction(key=>document.querySelector('input[type=radio]:checked')?.value===key,{},key);
   await fill(organizer,'input[name=name]','Full-window synthetic '+key);
   await fill(organizer,'input[name=startsAt]',localFuture());
   await organizer.locator('input[type=checkbox]').click();
   const created=organizer.waitForResponse(r=>r.url()===origin+'/events/create'&&r.request().method()==='POST');
   await button(organizer,'Create manual event →');
   await json(await created);
   await organizer.waitForSelector('input[aria-label="Invitation link"]',{visible:true});
   const room=roomUrl(organizer.url());
   const invite=await organizer.$eval('input[aria-label="Invitation link"]',e=>e.value);
   assert.equal(new URL(invite).origin,origin);
   report.room=room; // Never persist invitation, cookies, credentials or raw transport.
   report.phase='join';
   await visit(player,invite);
   await fill(player,'input[name=displayName]','Full-window player');
   let data=await action(player,'Join & save this device');
   assert(data.windows.every(w=>w.id.startsWith('synthetic-'+key+':')),'Actual created template must match selected template');
   const participantId=data.participantId;
   assert(participantId);assert.equal(new URL(player.url()).hash,'');
   assertShape(data,plan);
   assert(Object.values(data.view.effective).every(r=>r.outcome.kind==='unresolved'),'Fresh UI league only');
   report.checks.push('ui-create','separate-context-invitation-join','fresh-full-manifest');
   let lockedPicks=[];
   for(let index=0;index<plan.manifest.windows.length;index++){
    report.phase='open-and-review';report.currentWindow=index;
    const w=plan.manifest.windows[index];
    const markets=plan.manifest.markets.filter(m=>m.windowId===w.id);
    let org=await visit(organizer,room);
    assertShape(org,plan);
    if(index===0)assert(Object.values(org.view.effective).every(r=>r.outcome.kind==='unresolved'),'Fresh organizer capture must contain no seeded results');
    let scope=await openWindow(organizer,index);
    if(org.windows[index].state==='unopened'){
     assert(markets.some(m=>m.inputs.some(s=>s.kind!=='entrant')),'Unexpected unopened initial matchday');
     await organizer.$eval(scope+' details',e=>{e.open=true;});
     let form=await formFor(organizer,'Save versioned review','review',scope);
     for(const m of markets)for(let i=0;i<2;i++){
      const selector=form+' select[name="'+m.id+':'+i+'"]';
      const selected=await organizer.select(selector,plan.pairings[m.id][i]);
      assert.deepEqual(selected,[plan.pairings[m.id][i]]);
     }
     await fill(organizer,form+' input[name=reason]','Original synthetic rehearsal placement; deterministic winners and group seeds; not official qualification evidence');
     await organizer.locator(form+' input[type=checkbox]').click();
     const version=org.configurationVersion;
     org=await action(organizer,'Save versioned review',form);
     assert.equal(org.configurationVersion,version+1);
     assert.equal(org.windows[index].state,'unopened');
     assert.equal(org.windows[index].pairingsReviewed,true);
     for(const m of markets)assert.deepEqual(org.windows[index].markets.find(x=>x.id===m.id).actualPairing,plan.pairings[m.id]);
     assert.deepEqual(picksSnapshot(org.picks),picksSnapshot(lockedPicks),'Review must preserve older picks');
     scope=await openWindow(organizer,index);
     form=await formFor(organizer,'Open if prerequisites resolved','open',scope);
     await fill(organizer,form+' input[name=cutoff]',localFuture());
     org=await action(organizer,'Open if prerequisites resolved',form);
     report.reviews++;
    }
    assert.equal(org.windows[index].state,'open');
    assert.deepEqual(picksSnapshot(org.picks),picksSnapshot(lockedPicks));
    data=await visit(player,room);
    assert.deepEqual(picksSnapshot(data.picks),picksSnapshot(lockedPicks),'Opening later window must not rewrite old picks');
    for(let old=0;old<index;old++){
     assert.equal(data.windows[old].state,'locked');
     await disabledPast(player,old);
    }
    if(index>0)await rejectLateJoin(late,invite,room,data.id);
    report.phase='picks';
    scope=await openWindow(player,index);
    const form=await formFor(player,'Save complete window','picks',scope);
    for(let i=0;i<markets.length;i++){
     const choice=plan.picks[markets[i].id];
     assert.deepEqual(await player.select(form+' label:nth-child('+(i+1)+') select',choice),[choice]);
    }
    data=await action(player,'Save complete window',form);
    const newPicks=markets.map(m=>({participantId,marketId:m.id,choice:plan.picks[m.id]}));
    assert.deepEqual(picksSnapshot(data.picks),picksSnapshot([...lockedPicks,...newPicks]));
    publicPrivacy(await visit(observer,room),lockedPicks);
    org=await visit(organizer,room);
    assert.deepEqual(picksSnapshot(org.picks),picksSnapshot(lockedPicks),'Organizer cannot read open picks');
    scope=await openWindow(organizer,index);
    report.phase='lock';
    org=await action(organizer,'Lock window now',scope);
    assert.equal(org.windows[index].state,'locked');
    lockedPicks.push(...newPicks);
    data=await visit(player,room);await disabledPast(player,index);
    assert.deepEqual(picksSnapshot(data.picks),picksSnapshot(lockedPicks));
    publicPrivacy(await visit(observer,room),lockedPicks);
    // Each logical leg/qualifier/game has its own audited result entered in the actual result desk.
    for(const m of markets){
     report.phase='result';report.currentMarket=m.id;
     org=await result(organizer,m.id,plan.winners[m.id]);
     assert.deepEqual(org.view.effective[m.id].outcome,{kind:'winner',entrant:plan.winners[m.id]});
     report.coveredMarkets.push(m.id);
     if(key==='wwc-2027'&&m.role==='champion'){
      const beforeBronze=await visit(observer,room);
      assertRenderedCheckpoint(await row(observer,'Full-window player',63,0),beforeBronze,plan,index,participantId,{beforeBronze:true});
      report.checks.push('champion-known-bronze-unresolved-not-complete');
     }
     persist();
    }
    data=await visit(observer,room);
    publicPrivacy(data,lockedPicks);
    const visible=assertRenderedCheckpoint(await row(observer,'Full-window player',plan.oracle.earned[index],0),data,plan,index,participantId);
    report.windows.push({id:w.id,scored:markets.length,earned:visible.earned,maximum:visible.maximum,wrong:visible.wrong,rank:visible.rank,state:data.view.state});
    console.log('PASS full-window',key,index+1,'/',plan.oracle.counts.length,'earned',visible.earned);
    persist();
   }
   await rejectLateJoin(late,invite,room,data.id);
   assert.equal(report.reviews,plan.oracle.reviews);
   assert.equal(report.windows.length,plan.oracle.counts.length);
   assert.equal(report.coveredMarkets.length,plan.oracle.total);
   assert.equal(new Set(report.coveredMarkets).size,plan.oracle.total);
   assert.deepEqual([...report.coveredMarkets].sort(),plan.manifest.markets.map(m=>m.id).sort());
   assert.equal(lockedPicks.length,plan.oracle.total);
   await observer.screenshot({path:path.join(out,key+'-complete.png'),fullPage:true});
   report.checks.push('every-window-open-pick-lock-result','every-later-pairing-reviewed-in-ui','older-picks-immutable-and-disabled',
    'late-join-denied-every-later-window','all-logical-units-manual-result','literal-all-correct-score-and-complete');
   report.status='passed';report.phase='complete';
  }catch(error){report.failureType=['AssertionError','TimeoutError','TypeError','Error'].includes(error?.name)?error.name:'Other';throw recordFullBrowserFailure(report);}
  finally{persist();await Promise.all(contexts.map(c=>c.close()));}
 }
}finally{await browser.close();console.log('Full-window evidence:',out);}

});
