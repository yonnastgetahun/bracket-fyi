/** Synthetic loopback-only P11 journeys. Run only with the serialized local DB owner. */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {origin,newPage,fill,json,action,visit,openWindow,formFor,publicPrivacy,row,result,button} from './browser/event-helpers.mjs';
import {layoutAndNames} from './browser/accessibility.mjs';
try {
const require=createRequire(import.meta.url);
const {default:puppeteer}=await import(require.resolve('puppeteer-core'));
const keys=['ucl-2026-27','nfl-2026-postseason','ncaa-men-2027','nba-2027','nba-play-in-2027','wwc-2027','mlb-2027','cfp-2026-27','oscars-2027'];
const selectedKeys=process.env.BRACKET_BROWSER_TEMPLATE?[process.env.BRACKET_BROWSER_TEMPLATE]:keys;
assert(selectedKeys.every(key=>keys.includes(key)));
const out=path.resolve(import.meta.dirname,'../tmp/browser-acceptance',new Date().toISOString().replaceAll(':','-'));
fs.mkdirSync(out,{recursive:true});
const results=[];
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});
const timeout=90000;


try {
 for(const key of selectedKeys) {
  const report={key,status:'running',checks:[]};results.push(report);
  const contexts=await Promise.all([browser.createBrowserContext(),browser.createBrowserContext(),browser.createBrowserContext()]);
  try {
   const [organizer,player,observer]=await Promise.all(contexts.map(newPage));
   await organizer.goto(origin+'/events',{waitUntil:'domcontentloaded',timeout});
   await organizer.waitForFunction(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$'));});
   await organizer.locator('input[type=radio][value="'+key+'"]').click();
   await organizer.waitForFunction(key=>document.querySelector('input[type=radio]:checked')?.value===key,{},key);
   await fill(organizer,'input[name=name]','Browser proof '+key);
   const date=new Date(Date.now()+86400000);
   const local=new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
   await fill(organizer,'input[name=startsAt]',local);
   if(key==='oscars-2027')await fill(organizer,'input[name=categories]','Picture');
   await organizer.locator('input[type=checkbox]').click();
   // Match the route by origin/path, since dev-server rewrites may append a
   // harmless trailing slash while preserving the same loopback request.
   const created=organizer.waitForResponse(r=>new URL(r.url()).origin===origin&&new URL(r.url()).pathname==='/events/create'&&r.request().method()==='POST');
   // Handle rejection immediately even when clicking fails before this waiter is awaited.
   void created.catch(()=>{});
   // The form is React-controlled; use the normal pointer path for submit.
   await button(organizer,'Create manual event →');
   await json(await created);
   await organizer.waitForSelector('input[aria-label="Invitation link"]',{visible:true});
   const room=organizer.url();
   const invite=await organizer.$eval('input[aria-label="Invitation link"]',e=>e.value);
   assert.equal(new URL(invite).origin,origin);
   report.room=room;report.checks.push('create');
   await visit(player,invite);
   await fill(player,'input[name=displayName]','Browser player');
   // Invitation is populated from the fragment by the real room UI, not injected into a POST.
   let joined=await action(player,'Join & save this device');
   assert(joined.windows.every(w=>w.id.startsWith('synthetic-'+key+':')),'Actual created template must match selected template');assert(joined.participantId);assert.equal(joined.organizer,false);assert.equal(joined.invitation,null);
   assert.equal(new URL(player.url()).hash,'','Invitation fragment scrubbed');
   assert((await player.cookies()).some(c=>c.name==='event_participant_'+joined.id && c.httpOnly && c.sameSite==='Strict'),'Scoped participant session is HttpOnly and SameSite Strict');
   report.checks.push('invitation-join-separate-device');
   if(!joined.windows.some(w=>w.state==='open'&&w.markets.some(m=>m.scored))) {
    assert.equal(key,'ncaa-men-2027','Unexpected template prerequisite');
    let org=await visit(organizer,room);
    const structural=org.windows.flatMap(w=>w.markets).filter(m=>!m.scored);
    assert.equal(structural.length,12,'NCAA opening qualifiers are structural, not points');
    for(const market of structural)await result(organizer,market.id,market.eligible[0]);
    org=await visit(organizer,room);
    const scoredIndex=org.windows.findIndex(w=>w.markets.some(m=>m.scored));
    const openScope=await openWindow(organizer,scoredIndex);
    const openForm=await formFor(organizer,'Open if prerequisites resolved','initial-open',openScope);
    await fill(organizer,openForm+' input[name=cutoff]',local);
    await action(organizer,'Open if prerequisites resolved',openForm);
    joined=await visit(player,room);
    report.checks.push('twelve-structural-qualifiers-resolved-in-ui-before-scored-window-open');
   }
   const index=joined.windows.findIndex(w=>w.state==='open'&&w.markets.some(m=>m.scored));
   assert(index>=0,'No open scored window');
   const window=joined.windows[index],markets=window.markets.filter(m=>m.scored);
   let scope=await openWindow(player,index);
   let picksForm=await formFor(player,'Save complete window','picks',scope);
   // Re-query each select after React processes the previous dependent choice.
   const choices=[];
   for(let i=0;i<markets.length;i++){
    const control=picksForm+' label:nth-child('+(i+1)+') select';
    const choice=await player.$eval(control,e=>[...e.options].find(o=>o.value==='draw')?.value??[...e.options].find(o=>o.value&&!o.disabled)?.value);
    assert(choice,'Missing eligible prediction '+markets[i].id);
    await player.select(control,choice);
    choices.push({marketId:markets[i].id,choice});
   }
   const submitted=await action(player,'Save complete window',picksForm);
   assert.deepEqual(submitted.picks.map(p=>[p.marketId,p.choice]).sort(),choices.map(p=>[p.marketId,p.choice]).sort());
   report.checks.push('complete-first-open-window-picks');
   publicPrivacy(await visit(observer,room));
   const orgBefore=await visit(organizer,room);
   assert.equal(orgBefore.picks.length,0,'Organizer must not see another participant open picks');
   assert.equal(await observer.$$eval('button',els=>els.some(e=>e.textContent.trim()==='Apply audited change')),false);
   report.checks.push('open-picks-private-anonymous-and-organizer','anonymous-no-result-controls');
   scope=await openWindow(organizer,index);
   const locked=await action(organizer,'Lock window now',scope);
   assert.equal(locked.windows[index].state,'locked');
   await visit(player,room);scope=await openWindow(player,index);
   picksForm=await formFor(player,'Save complete window','picks',scope);
   assert(await player.$$eval(picksForm+' select',els=>els.length>0&&els.every(e=>e.disabled)));
   assert(await player.$eval(picksForm+' button',e=>e.disabled));
   publicPrivacy(await visit(observer,room),choices);
   await openWindow(observer,index);
   await observer.evaluate(()=>{const d=[...document.querySelectorAll('[data-proof-window] details')].find(d=>d.querySelector('summary')?.textContent==='Revealed picks');if(!d)throw Error('Missing revealed picks');d.open=true;});
   assert(await observer.$eval('[data-proof-window]',e=>e.innerText.includes('Browser player')));
   report.checks.push('lock-disabled-controls','locked-picks-revealed');
   const market=markets[0],choice=choices[0].choice;
   await result(organizer,market.id,choice);
   let publicData=await visit(observer,room);publicPrivacy(publicData,choices);
   report.correct=await row(observer,'Browser player',1,0);
   assert.equal(publicData.view.effective[market.id].source,'override');
   report.checks.push('manual-result-correct-score-and-rank');
   const other=market.eligible.find(id=>id!==choice);
   assert(other,'No alternative result');
   await result(organizer,market.id,other);
   await visit(observer,room);
   report.corrected=await row(observer,'Browser player',0,1);
   report.checks.push('manual-correction-wrong-score');
   await result(organizer,market.id,other,'release');
   publicData=await visit(observer,room);
   assert.equal(publicData.view.effective[market.id].outcome.kind,'unresolved');
   report.released=await row(observer,'Browser player',0,0);
   report.checks.push('release-to-unresolved-score');
   for(const [name,page] of [['organizer',organizer],['participant',player],['anonymous',observer]]) {
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' mobile horizontal overflow');
   }
   await layoutAndNames(observer);
   report.checks.push('desktop-and-narrow-names-layout');
   await observer.screenshot({path:path.join(out,key+'.png'),fullPage:true});
   report.checks.push('390px-no-page-overflow');report.status='passed';
  }catch{
   // Never inspect/coerce the thrown value: browser/assertion errors may carry secrets.
   report.status='failed';report.error='browser-journey-failed';
   throw new Error('browser-journey-failed');
  }
  finally {fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({scope:'First open scored window per template; NOT full P11 acceptance',results},null,2));await Promise.all(contexts.map(c=>c.close()));}
  console.log('PASS',key);
 }
}finally{await browser.close();console.log('Evidence:',out);}
}catch{
 // Setup and cleanup failures must obey the same no-private-diagnostics boundary.
 throw new Error('browser-journey-failed');
}
