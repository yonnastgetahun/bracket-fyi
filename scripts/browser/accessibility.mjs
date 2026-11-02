import assert from 'node:assert/strict';

// No focus()/DOM click: prove the target can be reached in the real Tab sequence.
export async function keyboardActivate(page, selector, name, limit=250) {
 // Do not race the initial client hydration: an Enter sent to the pre-hydration
 // form invokes the browser's native GET submission instead of React's POST.
 await page.waitForNetworkIdle({idleTime:250,timeout:5000}).catch(()=>{});
 await page.waitForFunction(()=>{
  const form=document.querySelector('form');
  return !!form && Object.keys(form).some(key=>key.startsWith('__reactProps$'));
 },{timeout:10000}).catch(()=>{});
 await page.evaluate(()=>{document.activeElement?.blur();});
 // Puppeteer does not accept the chord spelling `Control+Home` on all
 // Chromium versions. Send the modifier as a real key transition so the
 // focus reset remains keyboard-only and deterministic.
 await page.keyboard.down('Control');
 try {
  await page.keyboard.press('Home');
 } finally {
  await page.keyboard.up('Control');
 }
 let reached=false;
 for(let n=0;n<limit;n++){
  await page.keyboard.press('Tab');
  reached=await page.evaluate((selector,name)=>{
   const e=document.activeElement;
   return e?.matches(selector)&&(e.getAttribute('aria-label')||e.textContent.trim())===name;
  },selector,name);
  if(reached)break;
 }
 assert(reached,'Keyboard unreachable: '+name);
 const visible=await page.evaluate(()=>{
  const e=document.activeElement,r=e.getBoundingClientRect(),s=getComputedStyle(e);
  return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&s.visibility!=='hidden'&&
   (s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>0||s.boxShadow!=='none');
 });
 assert(visible,'Focused control needs a visible focus indicator: '+name);
 await page.keyboard.press('Enter');
}
export async function layoutAndNames(page) {
 for(const width of [1280,390]){
  await page.setViewport({width,height:844,deviceScaleFactor:1});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Page overflow at '+width);
  const unnamed=await page.evaluate(()=>[...document.querySelectorAll('button,input:not([type=hidden]),select,textarea,a[href]')]
   .filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden')
   .filter(e=>!(e.getAttribute('aria-label')?.trim()||
    e.getAttribute('aria-labelledby')?.split(/\s+/).map(id=>document.getElementById(id)?.textContent||'').join('').trim()||
    [...(e.labels||[])].map(l=>l.textContent).join('').trim()||
    (e.matches('button,a')?e.textContent.trim():'')||e.getAttribute('title')?.trim()))
   .map(e=>e.tagName+':'+(e.getAttribute('name')||'')));
  assert.deepEqual(unnamed,[],'Visible controls without accessible names at '+width);
 }
}
export async function liveSaved(page) {
 assert(await page.$eval('[aria-live=polite]',e=>e.textContent.includes('Saved. The current event state is shown below.')),'Mutation feedback must be in polite live region');
}
