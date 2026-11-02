import { beforeEach,describe,it,expect,vi } from "vitest";
import { NextRequest } from "next/server";
const mocks=vi.hoisted(()=>({client:{},create:vi.fn(),read:vi.fn(),verify:vi.fn(),join:vi.fn(),submit:vi.fn(),freeze:vi.fn(),window:vi.fn(),result:vi.fn()}));
vi.mock("../../lib/events/application",()=>({applicationClient:()=>mocks.client,createApplicationLeague:mocks.create,readApplication:mocks.read,verifyApplicationCredential:mocks.verify,submitApplicationPicks:mocks.submit,changeApplicationWindow:mocks.window,mutateApplicationResult:mocks.result}));
vi.mock("../../lib/events/repository",async importOriginal=>({...await importOriginal<typeof import("../../lib/events/repository")>(),createEventRepository:()=>({join:mocks.join,freeze:mocks.freeze})}));
import { POST as create } from "../../app/events/create/route";
import { POST,GET } from "../../app/events/[id]/data/route";
import { credentialCookie } from "../../lib/events/application-contract";
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",credential="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",origin="http://localhost:3137";
const context={params:Promise.resolve({id})};
function req(body:unknown,cookie="",path="/events/"+id+"/data"){
 return new NextRequest(origin+path,{method:"POST",headers:{"Content-Type":"application/json",Origin:origin,Cookie:cookie},body:JSON.stringify(body)});
}
beforeEach(()=>{vi.clearAllMocks();mocks.verify.mockResolvedValue({id,credential});});
describe("event HTTP handler boundaries",()=>{
 it("create returns only ID and scoped HttpOnly credential",async()=>{
  mocks.create.mockResolvedValue({id,organizerCredential:credential});
  const r=await create(req({},"","/events/create"));
  expect(r.status).toBe(201);expect(await r.json()).toEqual({id});
  expect(r.headers.get("set-cookie")).toContain("HttpOnly");
  expect(r.headers.get("set-cookie")).toContain("Path=/events/"+id);
  expect(r.headers.get("cache-control")).toContain("no-store");
 });
 it("own join credential goes only to cookie",async()=>{
  mocks.join.mockResolvedValue({participantId:id,credential});
  const r=await POST(req({action:"join",invitation:credential,displayName:"Guest"}),context);
  expect(r.status).toBe(200);expect(await r.json()).toEqual({ok:true});
  expect(r.headers.get("set-cookie")).toContain(credentialCookie(id,"participant"));
 });
 it("organizer mutation requires scoped cookie before service calls",async()=>{
  const r=await POST(req({action:"freeze",frozen:true}),context);expect(r.status).toBe(403);
  expect(mocks.verify).not.toHaveBeenCalled();expect(mocks.freeze).not.toHaveBeenCalled();
  const ok=await POST(req({action:"freeze",frozen:true},credentialCookie(id,"organizer")+"="+credential),context);
  expect(ok.status).toBe(200);expect(mocks.verify).toHaveBeenCalledWith(mocks.client,id,"organizer",credential);
  expect(mocks.freeze).toHaveBeenCalledWith(id,credential,true);
  expect(mocks.verify.mock.invocationCallOrder[0]).toBeLessThan(mocks.freeze.mock.invocationCallOrder[0]);
 });
 it("unknown worker/private fields rejected before dispatch",async()=>{
  for(const body of [{action:"capture"},{action:"freeze",frozen:true,leaderboard:[]}]){
   const r=await POST(req(body,credentialCookie(id,"organizer")+"="+credential),context);expect(r.status).toBe(400);
  }
  expect(mocks.verify).not.toHaveBeenCalled();
 });
 it("cross-origin writes denied before create",async()=>{
  const r=await create(new NextRequest(origin+"/events/create",{method:"POST",headers:{Origin:"https://evil.invalid","Content-Type":"application/json"},body:"{}"}));
  expect(r.status).toBe(403);expect(mocks.create).not.toHaveBeenCalled();
 });
 it("oversize payload rejected before create",async()=>{
  const r=await create(req({name:"x".repeat(70000)},"","/events/create"));
  expect(r.status).toBe(400);expect(mocks.create).not.toHaveBeenCalled();
 });
 it("GET forwards only exact scoped cookies and is never cached",async()=>{
  mocks.read.mockResolvedValue({id,name:"Safe"});
  const r=await GET(new NextRequest(origin+"/events/"+id+"/data",{headers:{Cookie:credentialCookie(id,"organizer")+"="+credential+"; event_organizer_wrong=other"}}),context);
  expect(await r.json()).toEqual({id,name:"Safe"});expect(r.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.read).toHaveBeenCalledWith(mocks.client,id,{organizer:credential,participant:undefined});
 });
});
