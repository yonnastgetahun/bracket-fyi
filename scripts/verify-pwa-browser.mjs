/** Local PWA assets and iOS dismissal, not installed-device/push-delivery proof. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {origin,newPage} from './browser/event-helpers.mjs';
import {layoutAndNames,keyboardActivate} from './browser/accessibility.mjs';
const url=new URL(process.argv[2]||'');
assert.equal(url.origin,origin);
assert.match(url.pathname,/^\/l\/[0-9a-f-]{36}$/i);
assert(!url.hash&&!url.search);
const leagueId=url.pathname.split('/').at(-1);
const require=createRequire(import.meta.url);
const {default:puppeteer}=await import(require.resolve('puppeteer-core'));
const out=path.resolve('tmp/browser-acceptance',new Date().toISOString().replaceAll(':','-')+'-pwa');
fs.mkdirSync(out,{recursive:true});
const report={lane:'pwa',status:'running',checks:[]};
const browser=await puppeteer.launch({executablePath:process.env.BROWSER_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const context=await browser.createBrowserContext();
 const page=await newPage(context,{serviceWorker:true});
 await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1');
 // Deliberately do not request Notification permission or call PushManager.subscribe.
 const sends=[];
 page.on('request',r=>{if(/subscribe|broadcast|send-push/.test(new URL(r.url()).pathname))sends.push(new URL(r.url()).pathname);});
 await page.goto(url.href,{waitUntil:'networkidle0'});
 const manifest=await page.evaluate(async()=>{
  const link=document.querySelector('link[rel=manifest]');if(!link)throw Error('No manifest link');
  const response=await fetch(link.href);if(!response.ok)throw Error('Manifest HTTP failure');
  return response.json();
 });
 assert.equal(manifest.name,'Bracket.fyi');assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/');
 assert(manifest.icons.some(i=>i.sizes==='192x192'));assert(manifest.icons.some(i=>i.sizes==='512x512'));
 for(const icon of manifest.icons){
  assert.equal(new URL(icon.src,origin).origin,origin);
  assert(await page.evaluate(async src=>{const r=await fetch(src);return r.ok&&r.headers.get('content-type')?.startsWith('image/');},icon.src));
 }
 report.checks.push('manifest-standalone-local-icons');
 await page.waitForFunction(async()=>Boolean((await navigator.serviceWorker.getRegistration())?.active),{timeout:30000});
 const registration=await page.evaluate(async()=>{
  const r=await navigator.serviceWorker.ready;
  return {script:r.active.scriptURL,scope:r.scope};
 });
 assert.equal(registration.script,origin+'/sw.js');assert.equal(registration.scope,origin+'/');
 await page.reload({waitUntil:'networkidle0'});
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 report.checks.push('actual-local-service-worker-active-and-controls-reload');
 await page.waitForFunction(()=>document.body.innerText.includes('Add Bracket.fyi to your home screen'));
 await keyboardActivate(page,'button','Dismiss');
 assert.equal(await page.evaluate(id=>localStorage.getItem('bfyi_ios_install_dismissed:'+id),leagueId),'true');
 await page.reload({waitUntil:'networkidle0'});
 assert.equal(await page.evaluate(()=>document.body.innerText.includes('Add Bracket.fyi to your home screen')),false);
 report.checks.push('keyboard-ios-install-dismissal-persists-per-league');
 await layoutAndNames(page);
 // The actual worker promises an app-shell cache, not dynamic league offline support.
 await page.goto(origin+'/create',{waitUntil:'networkidle0'});
 await page.setOfflineMode(true);
 await page.reload({waitUntil:'domcontentloaded'});
 assert(await page.$('main'),'Cached create shell absent offline');
 assert((await page.$eval('body',e=>e.textContent)).trim().length>0);
 await page.setOfflineMode(false);
 report.checks.push('offline-create-shell');
 assert.deepEqual(sends,[],'PWA lane must not subscribe/broadcast/send');
 report.checks.push('no-notification-subscription-or-send-requests');
 await page.screenshot({path:path.join(out,'pwa.png'),fullPage:true});
 report.status='passed';
}catch(error){report.status='failed';report.errorType=error.name;process.exitCode=1;}
finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));await browser.close();console.log('Evidence:',out);}
