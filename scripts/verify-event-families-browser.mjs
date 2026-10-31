/** Parent-owned runtime only. No seed, SQL, direct POST, child-game emulation or live transport. */
import './event-runtime-register.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {origin,newPage,fill,json,button,action,openWindow,formFor,publicPrivacy,result} from './browser/event-helpers.mjs';
import {safeVisit as visit} from './browser/full-browser-evidence.mjs';
import {picksSnapshot,roomUrl} from './browser/contracts.mjs';
import {familyPlan,FAMILY_ORACLES,CATEGORIES,assertFamilyComplete} from './browser/family-completion-plan.mjs';
import {qualifiedNbaPlan,provisionedAwardsPlan} from './browser/family-qualification-plan.mjs';
import {safely,closeOwned,renderedFamilyRows} from './browser/family-browser-evidence.mjs';

const names=['Family perfect','Family challenger'];
function future(){const d=new Date(Date.now()+7*86400000);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
async function applyOutcome(page,id,outcome){
 if(outcome.kind==='winner')return result(page,id,outcome.entrant);
 assert.equal(outcome.kind,'winner-set');
 const form=await formFor(page,'Apply audited change','family-result');
 assert.deepEqual(await page.select(form+' label:nth-child(1) select',id),[id]);
 await page.select(form+' label:nth-child(2) select','override');
 const options=await page.$$eval(form+' input[name=winners]',els=>els.map(e=>e.value));
 assert(outcome.entrants.every(e=>options.includes(e)),'Nomination membership unavailable; no sports-winner fallback');
 await page.$$eval(form+' input[name=winners]',(els,winners)=>{for(const e of els)if(e.checked!==winners.includes(e.value))e.click();},outcome.entrants);
 await fill(page,form+' input[name=reason]','Original synthetic full-category settlement/correction');
 return action(page,'Apply audited change',form);
}
async function disabled(page,index){
 const scope=await openWindow(page,index),form=await formFor(page,'Save complete window','family-disabled',scope);
 assert(await page.$$eval(form+' select',els=>els.length>0&&els.every(e=>e.disabled)));
 assert(await page.$eval(form+' button',e=>e.disabled));
}
function shape(data,plan){
 const actual=data.windows.flatMap(w=>w.markets);
 assert.deepEqual(actual.map(m=>[m.id,m.scored]).sort(),plan.manifest.markets.map(m=>[m.id,m.scored]).sort());
 assert.equal(data.windows.filter(w=>w.markets.some(m=>m.scored)).length,1);
}

let browser,out,current,playInHandoff;
const reports=[];
function persist(){if(out)fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({
 scope:'Seven UI-created complete manual parent-market journeys; series children and qualification persistence are separate integration evidence.',
 allSevenComplete:reports.length===7&&reports.every(r=>r.status==='passed'),
 seriesChildPersistenceVerified:false,qualificationPersistenceVerified:reports.filter(r=>['ncaa-men-2027','nba-2027'].includes(r.key)).length===2&&reports.filter(r=>['ncaa-men-2027','nba-2027'].includes(r.key)).every(r=>r.checks.includes('reviewed-actual-qualification-ui')),reports,
},null,2));}
const success=await safely(async()=>{
 assert.equal(process.env.BRACKET_FAMILIES_BROWSER_ACK,'synthetic-loopback-only');
 const selected=process.env.BRACKET_FAMILY_BROWSER_TEMPLATE;
 assert(!selected||Object.hasOwn(FAMILY_ORACLES,selected));
 const {buildSyntheticManifest}=await import('../lib/events/catalog.ts');
 // Validate all independent plans before acquiring browser resources.
 const build=k=>buildSyntheticManifest(k,{startsAt:new Date(Date.now()+7*86400000).toISOString(),categories:CATEGORIES});
 const playInPlan=familyPlan(build('nba-play-in-2027'));
 const order=['nfl-2026-postseason','ncaa-men-2027','nba-play-in-2027','nba-2027','mlb-2027','cfp-2026-27','oscars-2027'];
 const plans=order.filter(k=>!selected||k===selected||(selected==='nba-2027'&&k==='nba-play-in-2027')).map(k=>k==='nba-2027'?qualifiedNbaPlan(build(k),playInPlan):familyPlan(build(k)));
 const {default:puppeteer}=await import(createRequire(import.meta.url).resolve('puppeteer-core'));
 out=path.resolve(import.meta.dirname,'../tmp/browser-acceptance/seven-family-'+new Date().toISOString().replaceAll(':','-'));
 fs.mkdirSync(out,{recursive:true});
 browser=await puppeteer.launch({executablePath:process.env.BRACKET_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});
 for(let plan of plans){
  const key=plan.manifest.editionKey,contexts=[];
  current={key,status:'running',phase:'setup',expectedScored:plan.total,expectedStructural:plan.structural.length,covered:[],checks:[]};
  reports.push(current);persist();
  try{
   // Sequential allocation retains every successfully acquired context on partial setup failure.
   for(let i=0;i<4;i++)contexts.push(await browser.createBrowserContext());
   const [organizer,perfect,challenger,observer]=await Promise.all(contexts.map(newPage));
   const players=[perfect,challenger],ids=[];
   for(const page of [organizer,...players])page.on('response',response=>{
    if(response.request().method()==='POST'){
     current.lastPostStatus=response.status();persist();
    }
   });
   current.phase='create';
   await organizer.goto(origin+'/events',{waitUntil:'domcontentloaded'});
   await organizer.waitForFunction(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$'));});
   await organizer.locator('input[type=radio][value="'+key+'"]').click();
   await organizer.waitForFunction(key=>document.querySelector('input[type=radio]:checked')?.value===key,{},key);
   await fill(organizer,'input[name=name]','Full-family synthetic '+key);
   await fill(organizer,'input[name=startsAt]',future());
   if(key==='oscars-2027')await fill(organizer,'input[name=categories]',CATEGORIES.join(', '));
   await organizer.locator('input[type=checkbox]').click();
   const [created]=await Promise.all([
    organizer.waitForResponse(r=>r.url()===origin+'/events/create'&&r.request().method()==='POST'),
    button(organizer,'Create manual event →'),
   ]);
   await json(created);
   await organizer.waitForSelector('input[aria-label="Invitation link"]',{visible:true});
   const room=roomUrl(organizer.url()),invite=await organizer.$eval('input[aria-label="Invitation link"]',e=>e.value);
   assert.equal(new URL(invite).origin,origin);
   current.phase='join';
   for(const [i,player] of players.entries()){
    await visit(player,invite);await fill(player,'input[name=displayName]',names[i]);
    const d=await action(player,'Join & save this device');shape(d,plan);assert(d.participantId);ids.push(d.participantId);
    assert.equal(new URL(player.url()).hash,'');
   }
   assert.notEqual(ids[0],ids[1]);
   let org=await visit(organizer,room);shape(org,plan);
   if(key==='oscars-2027')plan=provisionedAwardsPlan(plan,org);
   assert(Object.values(org.view.effective).every(r=>r.outcome.kind==='unresolved'),'No preseeded results');
   current.phase='structural-qualification';
   for(const m of plan.structural){current.currentMarket=m.id;await applyOutcome(organizer,m.id,plan.outcomes[m.id]);current.covered.push(m.id);}
   org=await visit(organizer,room);
   if(['ncaa-men-2027','nba-2027'].includes(key)){
    assert.equal(org.structuralQualifierReviewSupported,true);
    const review=await formFor(organizer,'Review latest qualifiers','family-qualifiers');
    if(key==='nba-2027'){
     assert(playInHandoff,'Completed independent Play-In journey required');
     await fill(organizer,review+' input[name=sourceLeagueId]',playInHandoff.id);
     await fill(organizer,review+' input[name=sourceOrganizerToken]',playInHandoff.credential);
    }
    await fill(organizer,review+' input[name=reason]','Reviewed actual synthetic qualification; entries and points remain separate');
    await organizer.locator(review+' input[type=checkbox]').click();
    org=await action(organizer,'Review latest qualifiers',review);
    const initial=plan.scored.filter(m=>m.inputs.every(s=>s.kind==='entrant'||plan.structural.some(q=>q.id===s.marketId)));
    for(const m of initial)assert.deepEqual(org.windows.flatMap(w=>w.markets).find(q=>q.id===m.id).actualPairing,plan.pairings[m.id]);
    current.checks.push('reviewed-actual-qualification-ui');
   }
   const index=org.windows.findIndex(w=>w.markets.some(m=>m.scored));assert(index>=0);
   current.phase='open-reviewed-window';persist();
   if(org.windows[index].state==='unopened'){
    const scope=await openWindow(organizer,index),form=await formFor(organizer,'Open if prerequisites resolved','family-open',scope);
    // Existing cutoffs are monotonic: never replace one with a later wall-clock value.
    if(!org.windows[index].cutoff)await fill(organizer,form+' input[name=cutoff]',future());current.phase='submit-open-window';persist();org=await action(organizer,'Open if prerequisites resolved',form);
   }
   current.phase='assert-open-window';persist();
   assert.equal(org.windows[index].state,'open','Missing qualification integration; do not synthesize resolved state');
   const saved=[];
   current.phase='picks';
   for(const [i,player] of players.entries()){
    const data=await visit(player,room);shape(data,plan);
    const scope=await openWindow(player,index),form=await formFor(player,'Save complete window','family-picks',scope);
    const picks=plan.picks[i===0?'perfect':'challenger'];
    const markets=data.windows[index].markets.filter(m=>m.scored);
    for(const [n,m] of markets.entries()){
     current.phase='pick-select';current.currentMarket=m.id;current.playerIndex=i;persist();
     const selector=form+' label:nth-child('+(n+1)+') select';
     const selected=await player.select(selector,picks[m.id]);
     assert.deepEqual(selected,[picks[m.id]],'Predicted graph choice unavailable');
    }
    current.phase='pick-submit';persist();
    const submitted=await action(player,'Save complete window',form);
    current.phase='pick-readback';persist();
    const own=markets.map(m=>({participantId:ids[i],marketId:m.id,choice:picks[m.id]}));
    assert.deepEqual(picksSnapshot(submitted.picks),picksSnapshot(own),'Only own open picks visible');saved.push(...own);
   }
   publicPrivacy(await visit(observer,room));org=await visit(organizer,room);assert.equal(org.picks.length,0);
   current.phase='lock';
   const scope=await openWindow(organizer,index);org=await action(organizer,'Lock window now',scope);assert.equal(org.windows[index].state,'locked');
   // Structural windows carry no picks, but remain required lifecycle windows.
   for(let w=0;w<org.windows.length;w++){
    if(w===index||org.windows[w].state==='locked')continue;
    assert(org.windows[w].markets.every(m=>!m.scored));
    const structuralScope=await openWindow(organizer,w);
    org=await action(organizer,'Lock window now',structuralScope);
    assert.equal(org.windows[w].state,'locked');
   }
   for(const player of players){await visit(player,room);await disabled(player,index);}
   publicPrivacy(await visit(observer,room),saved);
   current.phase='all-results';
   for(const m of plan.scored){
    current.currentMarket=m.id;
    org=await applyOutcome(organizer,m.id,plan.outcomes[m.id]);current.covered.push(m.id);
    assert.deepEqual(org.view.effective[m.id].outcome,plan.outcomes[m.id]);
    assert.deepEqual(picksSnapshot(org.picks),picksSnapshot(saved),'Actual opponent changes cannot rewrite predictions');
    if(m.id!==plan.scored.at(-1).id)assert.notEqual(org.view.state,'complete','Premature full-family completion');
    persist();
   }
   current.phase='completion';
   let data=await visit(observer,room);publicPrivacy(data,saved);assertFamilyComplete(data,plan,ids);
   await renderedFamilyRows(observer,plan.expected.complete,names);
   current.complete=plan.expected.complete;
   assert.equal(new Set(current.covered).size,plan.total+plan.structural.length);
   current.phase='correction';
   await applyOutcome(organizer,plan.correction.marketId,plan.correction.outcome);
   data=await visit(observer,room);publicPrivacy(data,saved);assertFamilyComplete(data,plan,ids,true);
   await renderedFamilyRows(observer,plan.expected.corrected,names);
   assert.deepEqual(picksSnapshot(data.picks),picksSnapshot(saved));current.corrected=plan.expected.corrected;
   current.phase='reopen';
   await result(organizer,plan.correction.marketId,'unused','release');
   data=await visit(observer,room);assert.equal(data.view.state,'locked');
   assert.equal(data.view.effective[plan.correction.marketId].outcome.kind,'unresolved');
   assert.deepEqual(picksSnapshot(data.picks),picksSnapshot(saved));
   for(const player of players){await visit(player,room);await disabled(player,index);}
   current.phase='recomplete';
   await applyOutcome(organizer,plan.correction.marketId,plan.outcomes[plan.correction.marketId]);
   data=await visit(observer,room);publicPrivacy(data,saved);assertFamilyComplete(data,plan,ids);
   await renderedFamilyRows(observer,plan.expected.complete,names);
   // No organizer/player screenshots: recovery credentials and invitation remain private.
   assert.equal(await observer.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await observer.screenshot({path:path.join(out,key+'-complete.png'),fullPage:true});
   current.checks.push('ui-create-two-joins-all-picks','open-picks-private','full-window-lock-disabled',
    'every-manual-required-market','literal-earned-max-wrong-rank','correction-reopen-recomplete','locked-picks-immutable','anonymous-390px');
   if(['nfl-2026-postseason','nba-play-in-2027'].includes(key))current.checks.push('changed-predicted-opponent-retains-downstream-credit');
   if(key==='nba-play-in-2027'){
    const id=new URL(room).pathname.split('/').at(-1);
    // Retain only in process memory for the explicit organizer-authorized handoff form.
    const cookie=(await contexts[0].cookies()).find(c=>c.name==='event_organizer_'+id);
    assert(cookie?.value);
    playInHandoff={id,credential:cookie.value};
   }
   current.status='passed';current.phase='complete';
  }finally{
   if(!await closeOwned(contexts)){current.status='failed';current.phase='cleanup';throw new Error('family-cleanup-failed');}
   persist();
  }
 }
 return true;
},()=>{if(current)current.status='failed';});
// Setup, journey and cleanup failures all pass through the same non-coercing boundary.
const cleanup=await safely(async()=>{assert(await closeOwned(browser?[browser]:[]));return true;},()=>{if(current){current.status='failed';current.phase='cleanup';}});
const persisted=await safely(async()=>{persist();return true;});
if(!success||!cleanup||!persisted)process.exitCode=1;
else console.log('Seven-family manual completion evidence:',out);
