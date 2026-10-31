import { beforeEach,describe,expect,it,vi } from "vitest";
import { NextRequest } from "next/server";
import { credentialCookie,ownRecoveryExportInput } from "../../lib/events/application-contract";
const state=vi.hoisted(()=>({rows:[] as Array<Record<string,string>>,queries:[] as string[],db:{} as unknown}));
vi.mock("../../lib/events/application",async original=>({...await original<typeof import("../../lib/events/application")>(),applicationClient:()=>state.db}));
import { POST as exportOwn } from "../../app/events/[id]/recovery/route";
import { POST as command } from "../../app/events/[id]/data/route";
import { verifyApplicationCredential } from "../../lib/events/application";
import type { SupabaseClient } from "@supabase/supabase-js";
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",other="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const participant="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",organizer="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const stranger="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",origin="http://localhost:3137";
const context=(league=id)=>({params:Promise.resolve({id:league})});
function request(body:unknown,role?:"participant"|"organizer",token=participant,league=id,path="recovery",requestOrigin=origin) {
 return new NextRequest(`${origin}/events/${league}/${path}`,{method:"POST",headers:{"Content-Type":"application/json",Origin:requestOrigin,...(role?{Cookie:`${credentialCookie(league,role)}=${token}`}:{})},body:JSON.stringify(body)});
}
beforeEach(()=>{
 state.rows=[{table:"participants",id:"own-participant",league_id:id,magic_token:participant,picks:"saved-own-picks"},
 {table:"participants",id:"other-participant",league_id:id,magic_token:stranger,picks:"private-other-picks"},
 {table:"leagues",id,organizer_token:organizer}];state.queries=[];
 state.db={from(table:string){
  const filters:Record<string,unknown>={table};
  const query={select(columns:string){expect(columns).toBe("id");state.queries.push(table);return query;},
   eq(column:string,value:unknown){filters[column]=value;return query;},
   async maybeSingle(){const row=state.rows.find(r=>Object.entries(filters).every(([k,v])=>r[k]===v));return {data:row?{id:row.id}:null,error:null};}};
  return query;
 }};
});
describe("explicit own recovery handoff (real verifier, in-memory DB query fixture)",()=>{
 it.each(["participant","organizer"] as const)("exports only authenticated own %s as private attachment and restores in a fresh context",async role=>{
  const token=role==="participant"?participant:organizer;
  const before=structuredClone(state.rows);
  const response=await exportOwn(request({role},role,token),context());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("content-disposition")).toContain("attachment;");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("set-cookie")).toBeNull();
  const content=await response.text();expect(content).toContain(`Role: ${role}`);expect(content).toContain(`/events/${id}`);
  expect(content).not.toContain(stranger);expect(content).not.toContain("private-other-picks");
  expect(content).not.toContain(role==="participant"?organizer:participant);
  const saved=content.match(/^Credential: (.+)$/m)![1];
  // No existing Cookie header: restoring is possible from the downloaded file alone.
  const restored=await command(request({action:"recover",role,credential:saved},undefined,token,id,"data"),context());
  expect(restored.status).toBe(200);expect(await restored.json()).toEqual({ok:true});
  const cookie=restored.cookies.get(credentialCookie(id,role));expect(cookie?.value).toBe(token);
  expect(restored.headers.get("set-cookie")).toContain("HttpOnly");expect(restored.headers.get("set-cookie")).toContain("SameSite=strict");expect(restored.headers.get("set-cookie")).toContain(`Path=/events/${id}`);
  expect(await verifyApplicationCredential(state.db as SupabaseClient,id,role,cookie?.value)).toEqual({id:role==="participant"?"own-participant":id,credential:token});
  // The fixture exposes no mutation methods: export/recover must preserve identity and stored picks.
  expect(state.rows).toEqual(before);
 });
 it("uses the validated browser origin when Next internal URL has a different hostname",async()=>{
  const browserOrigin="http://127.0.0.1:3137";
  const req=new NextRequest(`${origin}/events/${id}/recovery`,{method:"POST",headers:{
   "Content-Type":"application/json",Host:"127.0.0.1:3137",Origin:browserOrigin,
   Cookie:`${credentialCookie(id,"participant")}=${participant}`},body:JSON.stringify({role:"participant"})});
  const response=await exportOwn(req,context());expect(response.status).toBe(200);
  const content=await response.text();
  expect(content.includes(`\nLeague: ${browserOrigin}/events/${id}\n`)).toBe(true);
 });
 it("does not substitute organizer access for a participant cookie or accept a selected participant",async()=>{
  expect((await exportOwn(request({role:"participant"},"organizer",organizer),context())).status).toBe(403);
  for(const extra of [{participantId:"other-participant"},{credential:stranger},{leagueId:other}]){
   expect(ownRecoveryExportInput.safeParse({role:"participant",...extra}).success).toBe(false);
   expect((await exportOwn(request({role:"participant",...extra},"participant"),context())).status).toBe(400);
  }
 });
 it.each(["missing","wrong","revoked","cross-league","wrong-role"])("rejects %s export and recovery without issuing a cookie or leaking credentials",async scenario=>{
  let token=participant,league=id;let role:"participant"|"organizer"="participant";
  if(scenario==="wrong")token="ffffffff-ffff-4fff-8fff-ffffffffffff";
  if(scenario==="revoked")state.rows=state.rows.filter(r=>r.magic_token!==participant);
  if(scenario==="cross-league")league=other;
  if(scenario==="wrong-role")role="organizer";
  const response=await exportOwn(request({role},scenario==="missing"?undefined:role,token,league),context(league));
  expect(response.status).toBe(403);expect(response.headers.get("set-cookie")).toBeNull();
  expect(await response.text()).not.toContain(participant);
  if(scenario!=="missing"){
   const recovered=await command(request({action:"recover",role,credential:token},undefined,token,league,"data"),context(league));
   expect(recovered.status).toBe(403);expect(recovered.headers.get("set-cookie")).toBeNull();
   expect(await recovered.text()).not.toContain(token);
  }
 });
 it("rejects cross-origin export before any credential selection",async()=>{
  const response=await exportOwn(request({role:"participant"},"participant",participant,id,"recovery","https://evil.invalid"),context());
  expect(response.status).toBe(403);expect(state.queries).toEqual([]);
 });
});
