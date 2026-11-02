/** Minimal real React create/join regression; owned synthetic loopback runtime only. */
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {safeVisit} from './browser/full-browser-evidence.mjs';
import {newPage,fill,button,origin,visit,action} from './browser/event-helpers.mjs';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 const organizer=await newPage(await browser.createBrowserContext());
 organizer.setDefaultTimeout(15000);
 await organizer.goto(origin+'/events',{waitUntil:'networkidle0'});
 await fill(organizer,'input[name=name]','Synthetic create/join regression');
 const date=new Date(Date.now()+7*86400000);
 await fill(organizer,'input[name=startsAt]',new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16));
 await organizer.locator('input[type=checkbox]').click();
 assert(await organizer.$eval('form',e=>e.checkValidity()));
 const created=organizer.waitForResponse(r=>r.url()===origin+'/events/create'&&r.request().method()==='POST');
 await button(organizer,'Create manual event →');
 assert.equal((await created).status(),201);
 await organizer.waitForSelector('input[aria-label="Invitation link"]');
 const invite=await organizer.$eval('input[aria-label="Invitation link"]',e=>e.value);
 const player=await newPage(await browser.createBrowserContext());player.setDefaultTimeout(15000);
 await visit(player,invite);
 await fill(player,'input[name=displayName]','Regression participant');
 assert.equal(new URL(player.url()).hash,'');
 assert(await player.$eval('input[name=displayName]',e=>e.form.checkValidity()),'Scrubbed invitation must survive StrictMode effect replay');
 const joined=await action(player,'Join & save this device');assert(joined.participantId);
 const observer=await newPage(await browser.createBrowserContext());observer.setDefaultTimeout(15000);
 await safeVisit(observer,organizer.url());await safeVisit(observer,invite);
 await fill(observer,'input[name=displayName]','Repeated invitation');
 assert.equal(new URL(observer.url()).hash,'');
 assert(await observer.$eval('input[name=displayName]',e=>e.form.checkValidity()),'Repeated same-room invitation must reload and retain fragment');
 console.log('PASS repeated same-room invitation; create valid datetime; real click/POST observable; invitation scrubbed and retained; separate-context join');
} finally {await browser.close();}
