import assert from 'node:assert/strict';
import {origin,visit} from './event-helpers.mjs';

export function assertNumericSnapshot({api,headers,rows},checkpoint) {
 assert.equal(api.id,checkpoint.leagueId,'HTTP room must match persisted fixture');
 assert.equal(api.organizer,false);
 assert.equal(api.participantId,null);
 assert.equal(api.invitation,null);
 assert.equal(api.view.state,checkpoint.state);
 assert.deepEqual(headers,['Rank','Player','Points','Maximum','Wrong']);
 const names=new Map(api.participants.map(p=>[p.id,p.name]));
 const actual=api.view.leaderboard.map(r=>[names.get(r.id),r.earned,r.maximum,r.wrong,r.rank]);
 const sort=(a,b)=>String(a[0]).localeCompare(String(b[0]));
 assert.deepEqual(actual.sort(sort),checkpoint.expected.map(r=>[...r]).sort(sort),'HTTP persisted numeric oracle');
 if(checkpoint.pending)assert.deepEqual(api.view.leaderboard.map(r=>r.pending),checkpoint.pending);
 // Compare strings, not Number(): Number("") and Number(null) both mask zero bugs.
 const expected=checkpoint.expected.map(([name,earned,maximum,wrong,rank])=>
  [String(rank),name,String(earned),maximum===null?'Temporarily unverified':String(maximum),String(wrong)]);
 assert.deepEqual([...rows].sort((a,b)=>a[1].localeCompare(b[1])),expected.sort((a,b)=>a[1].localeCompare(b[1])),'Rendered Rank/Player/Points/Maximum/Wrong');
}
export async function verifyNumericCheckpoint(page,checkpoint) {
 assert.match(checkpoint.leagueId,/^[a-f0-9-]{36}$/);
 const api=await visit(page,origin+'/events/'+checkpoint.leagueId);
 // visit observes actual GET, never route interception or fabricated React props.
 await page.waitForFunction(()=>document.querySelectorAll('table tbody tr').length>0);
 const rendered=await page.evaluate(()=>{
  const tables=[...document.querySelectorAll('table')].filter(t=>t.getClientRects().length);
  if(tables.length!==1)throw Error('Expected one visible standings table');
  return {headers:[...tables[0].querySelectorAll('thead th')].map(e=>e.textContent.trim()),
   rows:[...tables[0].querySelectorAll('tbody tr')].map(r=>[...r.cells].map(c=>c.textContent.trim()))};
 });
 assertNumericSnapshot({api,...rendered},checkpoint);
 return {name:checkpoint.name,rendered:true,rows:rendered.rows.length};
}
