import { describe,it,expect } from "vitest";
import { listEventDefinitions } from "../../lib/events/catalog";
const origin="http://127.0.0.1:3137";
type Client={cookie:string};
function assertPublicShape(value:unknown):void {
 if(!value || typeof value!=="object")return;
 for(const [key,child] of Object.entries(value)) {
  expect(["magic_token","organizer_token","push_subscription","basis"]).not.toContain(key);
  assertPublicShape(child);
 }
}
async function request(path:string,client:Client,body?:unknown) {
 const res=await fetch(origin+path,{signal:AbortSignal.timeout(10000),method:body?"POST":"GET",headers:{Origin:origin,...(body?{"Content-Type":"application/json"}:{}),...(client.cookie?{Cookie:client.cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const set=res.headers.get("set-cookie");if(set)client.cookie=[client.cookie,set.split(";")[0]].filter(Boolean).join("; ");
 return {status:res.status,body:await res.json(),set};
}
describe.skipIf(process.env.RUN_EVENT_APPLICATION_HTTP!=="1")("actual local event HTTP/service",()=>{
 it("nine-template create, join, cookies, privacy, lifecycle and conflict",async()=>{
  for(const d of listEventDefinitions()){
   const admin={cookie:""},guest={cookie:""},stranger={cookie:""};
   const made=await request("/events/create",admin,{templateKey:d.key,name:"HTTP rehearsal "+d.key,startsAt:new Date(Date.now()+3600000).toISOString(),timeZone:"America/Los_Angeles",syntheticAcknowledged:true,...(d.key==="oscars-2027"?{categories:["Picture"]}:{})});
   expect(made.status,JSON.stringify(made.body)).toBe(201);
   expect(made.set).toContain("HttpOnly");expect(made.body).toEqual({id:expect.any(String)});
   const path="/events/"+made.body.id+"/data";
   let state=await request(path,admin);expect(state.status,JSON.stringify(state.body)).toBe(200);
   expect(state.body.organizer).toBe(true);expect(state.body.view.state).toBe("active");
   const joined=await request(path,guest,{action:"join",invitation:state.body.invitation,displayName:"Player"});
   expect(joined.status,JSON.stringify(joined.body)).toBe(200);expect(joined.set).toContain("HttpOnly");expect(joined.body).toEqual({ok:true});
   const w=state.body.windows.find((w:{state:string})=>w.state==="open");
   if(w){
    // H/D/A draw and independent category choices have a hand-authored oracle.
    if(d.key==="oscars-2027"||d.key==="wwc-2027"||d.key==="ucl-2026-27"){
     const picks=Object.fromEntries(w.markets.map((m:{id:string;domain:string;choices:string[]})=>[m.id,m.domain==="regulation-home-draw-away"?"draw":m.choices[0]]));
     const saved=await request(path,guest,{action:"submit",windowId:w.id,version:w.version,picks});expect(saved.status,JSON.stringify(saved.body)).toBe(200);
     const publicBefore=await request(path,stranger);expect(publicBefore.body.picks).toEqual([]);expect(publicBefore.body.invitation).toBeNull();expect(publicBefore.body.view.effective).toEqual({});
     expect((await request(path,guest)).body.picks.length).toBe(w.markets.length);
    }
    const denied=await request(path,stranger,{action:"freeze",frozen:true});expect(denied.status).toBe(403);
    expect((await request(path,admin,{action:"window",windowId:w.id,version:w.version,operation:"lock"})).status).toBe(200);
    expect((await request(path,guest,{action:"submit",windowId:w.id,version:w.version,picks:{}})).status).toBe(409);
    state=await request(path,admin);expect(state.status,JSON.stringify(state.body)).toBe(200);
    const m=w.markets[0],effective=state.body.view.effective[m.id];
    const command={action:"override",marketId:m.id,reason:"Local synthetic oracle",expectedEffectiveToken:effective.effectiveToken,expectedCanonicalToken:effective.canonicalToken,idempotencyKey:crypto.randomUUID(),
     payload:{outcome:m.domain==="nomination-winner-set"?{kind:"winner-set",entrants:[m.choices[0]]}:m.domain==="regulation-home-draw-away"?{kind:"draw"}:{kind:"winner",entrant:m.eligible[0]}}};
    const result=await request(path,admin,{action:"result",command});expect(result.status,JSON.stringify(result.body)).toBe(200);
    const after=await request(path,stranger);assertPublicShape(after.body);
    expect(after.body.view.effective[m.id].source).toBe("override");
    if(d.key==="oscars-2027"){expect(after.body.view.state).toBe("complete");expect(after.body.view.leaderboard[0].earned).toBe(1);}
    const replay=await request(path,admin,{action:"result",command});expect(replay.status,JSON.stringify(replay.body)).toBe(200);
    const beforeStale=await request(path,admin);
    const stale=await request(path,admin,{action:"result",command:{...command,idempotencyKey:crypto.randomUUID()}});expect(stale.status).toBe(409);
    const afterStale=await request(path,admin);expect(afterStale.status).toBe(200);
    expect(afterStale.body.view).toEqual(beforeStale.body.view);
    expect(afterStale.body.windows).toEqual(beforeStale.body.windows);
    expect(afterStale.body.picks).toEqual(beforeStale.body.picks);
   }
  }
 },180000);
 it("denies cross-origin and unsupported worker actions",async()=>{
  const res=await fetch(origin+"/events/create",{method:"POST",headers:{Origin:"https://attacker.invalid","Content-Type":"application/json"},body:"{}"});
  expect(res.status).toBe(403);
 });
});
