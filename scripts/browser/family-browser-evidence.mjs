/** Dedicated fail-closed boundary: never stringify browser exceptions, URLs, bodies or causes. */
import assert from 'node:assert/strict';
export const FAMILY_FAILURE='Seven-family verification failed; private diagnostics omitted.';
export async function safely(work,onFailure=()=>{},log=console.error){
 try{return await work();}catch{onFailure();log(FAMILY_FAILURE);return false;}
}
export async function closeOwned(resources){
 const settled=await Promise.allSettled(resources.map(r=>Promise.resolve().then(()=>r.close())));
 return settled.every(r=>r.status==='fulfilled');
}
export async function renderedFamilyRows(page,expected,names){
 const actual=await page.$$eval('tbody tr',rows=>rows.map(r=>[...r.cells].map(c=>c.textContent)));
 assert.deepEqual(actual.map(c=>({name:c[1],rank:Number(c[0]),earned:Number(c[2]),maximum:c[3],wrong:Number(c[4])})).sort((a,b)=>a.name.localeCompare(b.name)),
  expected.map((r,i)=>({...r,name:names[i],maximum:r.maximum===null?'Temporarily unverified':String(r.maximum)})).sort((a,b)=>a.name.localeCompare(b.name)));
}
