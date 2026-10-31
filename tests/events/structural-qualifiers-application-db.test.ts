import { NextRequest } from "next/server";
import { POST } from "../../app/events/[id]/data/route";
import * as application from "../../lib/events/application";
import { credentialCookie } from "../../lib/events/application-contract";
import { randomUUID } from "node:crypto";
import { describe,it,expect,vi } from "vitest";
import { dbAdapter,sql,quote as q } from "./series-db-harness";
import { createApplicationLeague,readApplication,changeApplicationWindow,submitApplicationPicks } from "../../lib/events/application";
import { reviewApplicationQualifiers } from "../../lib/events/application-pairings";
import { applicationChoices } from "../../lib/events/application-picks";
import { createLifecycleRepository } from "../../lib/events/lifecycle-repository";
import { createEventRepository } from "../../lib/events/repository";

describe.runIf(process.env.RUN_STRUCTURAL_QUALIFIERS_DB==="1")("actual application qualifier service",()=>{
 for(const key of ["ncaa-men-2027","nba-2027"])it(key+" creates, reviews actual qualification, submits and holds incompatible locked correction",async()=>{
  const db=dbAdapter(),life=createLifecycleRepository(db),repo=createEventRepository(db);
  const create=(templateKey:string)=>createApplicationLeague(db,{templateKey,name:"Synthetic qualifier consumer",startsAt:new Date(Date.now()+86400000).toISOString(),timeZone:"UTC",syntheticAcknowledged:true});
  const main=await create(key),source=key==="nba-2027"?await create("nba-play-in-2027"):main;
  let target=await readApplication(db,main.id,{organizer:main.organizerCredential});
  let sourceView=await readApplication(db,source.id,{organizer:source.organizerCredential});
  const sourceMarkets=sourceView.windows.flatMap(w=>w.markets).filter(m=>key==="nba-2027"||!m.scored);
  const results:Record<string,string>={};
  for(const m of sourceMarkets)results[m.id]=applicationChoices(m,sourceMarkets,results)[0];
  async function result(mid:string,winner:string){
   const capture=await life.capture(source.id);
   await life.mutate(source.id,source.organizerCredential,{action:"override",marketId:mid,payload:{outcome:{kind:"winner",entrant:winner}},
    expectedEffectiveToken:capture.basis.effective[mid].effectiveToken,reason:"Synthetic actual qualifier",idempotencyKey:randomUUID()});
  }
  for(const [mid,winner] of Object.entries(results))await result(mid,winner);
  if(source.id!==main.id){
   const player=await repo.join(source.id,sourceView.invitation!,"Separate Play-In entrant");
   const w=sourceView.windows[0];await submitApplicationPicks(db,source.id,player.credential,{windowId:w.id,version:w.version,picks:results});
   await changeApplicationWindow(db,source.id,source.organizerCredential,{windowId:w.id,version:w.version,operation:"lock"});
   sourceView=await readApplication(db,source.id,{organizer:source.organizerCredential});
   expect(sourceView.view.state).toBe("complete");expect(sourceView.view.leaderboard[0].earned).toBe(6);
   expect((await readApplication(db,main.id,{organizer:main.organizerCredential})).participants).toHaveLength(0);
  }
  async function review(){
   target=await readApplication(db,main.id,{organizer:main.organizerCredential});
   const basis=await life.capture(source.id);
   return reviewApplicationQualifiers(db,main.id,main.organizerCredential,{configurationVersion:target.configurationVersion,basisToken:target.basisToken!,
    idempotencyKey:randomUUID(),reason:"Explicit actual qualification review",
    ...(source.id!==main.id?{sourceLeagueId:source.id,sourceOrganizerToken:source.organizerCredential,sourceBasisToken:basis.basisToken}:{})});
  }
  expect(await review()).toMatchObject({status:"adopted",configurationVersion:2});
  target=await readApplication(db,main.id,{organizer:main.organizerCredential});
  let repeatHttpRequest:()=>NextRequest;
  const mock=vi.spyOn(application,"applicationClient").mockReturnValue(db);
  try {
   const originalRequest=new NextRequest("http://localhost/events/"+main.id+"/data",{method:"POST",headers:{origin:"http://localhost","content-type":"application/json",cookie:credentialCookie(main.id,"organizer")+"="+main.organizerCredential},
    body:JSON.stringify({action:"qualifiers",configurationVersion:target.configurationVersion,basisToken:target.basisToken,
     idempotencyKey:randomUUID(),reason:"Actual HTTP qualifier consumer",syntheticAcknowledged:true,
     ...(source.id!==main.id?{sourceLeagueId:source.id,sourceOrganizerToken:source.organizerCredential}:{})})});
   repeatHttpRequest=()=>new NextRequest(originalRequest.clone());
   const response=await POST(repeatHttpRequest(),{params:Promise.resolve({id:main.id})});
   expect(response.status).toBe(200);expect(await response.json()).toEqual({ok:true});
  }finally{mock.mockRestore();}
  const w=target.windows.find(w=>w.markets.some(m=>m.scored))!;
  expect(w.pairingsReviewed).toBe(true);
  expect(w.markets.filter(m=>m.stage===(key==="nba-2027"?"first-round":"round-of-64")).every(m=>m.actualPairing?.length===2)).toBe(true);
  const player=await repo.join(main.id,target.invitation!,"Main entrant");
  await changeApplicationWindow(db,main.id,main.organizerCredential,{windowId:w.id,version:w.version,operation:"open"});
  target=await readApplication(db,main.id,{organizer:main.organizerCredential});
  const open=target.windows.find(x=>x.id===w.id)!;const picks:Record<string,string>={};
  for(const m of open.markets)picks[m.id]=applicationChoices(m,open.markets,picks)[0];
  await submitApplicationPicks(db,main.id,player.credential,{windowId:open.id,version:open.version,picks});
  await changeApplicationWindow(db,main.id,main.organizerCredential,{windowId:open.id,version:open.version,operation:"lock"});
  const saved=sql(`select jsonb_agg(to_jsonb(p) order by slot_id) from picks p where league_id=${q(main.id)}`);
  const correction=sourceMarkets.find(m=>m.id.includes(key==="nba-2027"?"east.seven-eight":"east.opening-"))!;
  const alternate=correction.eligible.find(id=>id!==results[correction.id])!;
  await result(correction.id,alternate);
  if(key==="nba-2027"){
   // Keep the corrected actual decider path coherent: old seventh is now eligible loser.
   const decider=sourceMarkets.find(m=>m.id.endsWith("east.eighth-seed-decider"))!;
   await result(decider.id,results[correction.id]);
  }
  const retryMock=vi.spyOn(application,"applicationClient").mockReturnValue(db);
  try {
   // Lost-response retry is the same HTTP request even if the source basis moved.
   const retried=await POST(repeatHttpRequest!(),{params:Promise.resolve({id:main.id})});
   expect(retried.status).toBe(200);expect(await retried.json()).toEqual({ok:true});
  }finally{retryMock.mockRestore();}
  expect(await review()).toMatchObject({status:"held",configurationVersion:2});
  expect((await readApplication(db,main.id,{organizer:main.organizerCredential})).view.state).toBe("held");
  expect(sql(`select jsonb_agg(to_jsonb(p) order by slot_id) from picks p where league_id=${q(main.id)}`)).toBe(saved);
 },180000);
});
