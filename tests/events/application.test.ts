import { describe,it,expect } from "vitest";
import { listEventDefinitions } from "../../lib/events/catalog";
import { buildApplicationManifest,initiallyOpen } from "../../lib/events/application-manifest";
import { scoreEvent } from "../../lib/events/scoring-bridge";
import { applicationCommand,credentialCookie,credentialOptions } from "../../lib/events/application-contract";
import { localEventApplicationEnabled } from "../../lib/events/application";
describe("application manifest",()=>{
 for(const definition of listEventDefinitions())it(definition.key+" preserves graph and honest maximum",()=>{
  const m=buildApplicationManifest(definition.key,"2030-01-01T00:00:00Z",2,"America/Los_Angeles",["Picture"]);
  expect(m.synthetic).toBe(true);expect(m.lifecycle.binding.graphVersion).toBe(2);
  expect(m.markets.every(m=>m.choices.length>0)).toBe(true);
  expect(m.markets.filter(m=>m.scored).length).toBe(definition.key==="oscars-2027"?1:definition.markets.filter(m=>m.scored).length);
  const rows=scoreEvent({edition:{catalog:m,graphVersion:2},binding:m.lifecycle.binding,components:[],outcomes:{},
   windows:Object.fromEntries(m.windows.map(w=>[w.id,"open"])),participants:[{id:"person",graphVersion:2,picks:{}}]});
  expect(rows[0].maximum).toBeNull();
  expect(m.markets.filter(m=>!m.scored).every(x=>!initiallyOpen(m,x.windowId))).toBe(true);
 });
 it("never opens unresolved qualification or pairing windows",()=>{
  const m=buildApplicationManifest("ucl-2026-27","2030-01-01T00:00:00Z",2,"UTC");
  expect(m.windows.filter(w=>initiallyOpen(m,w.id))).toHaveLength(8);
  expect(m.windows.filter(w=>w.prerequisiteMarketIds.length).every(w=>!initiallyOpen(m,w.id))).toBe(true);
 });
 it("requires canonical token on release and rejects private worker commands",()=>{
  expect(applicationCommand.safeParse({action:"capture"}).success).toBe(false);
  expect(applicationCommand.safeParse({action:"result",command:{action:"release",marketId:"x",reason:"reason",expectedEffectiveToken:"a".repeat(64),idempotencyKey:"retry",payload:{}}}).success).toBe(false);
 });
 it("scopes HttpOnly cookies to exact league",()=>{
  const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  expect(credentialOptions(id)).toMatchObject({httpOnly:true,sameSite:"strict",path:"/events/"+id});
  expect(credentialCookie(id,"organizer")).not.toEqual(credentialCookie(id,"participant"));
 });
 it("cannot enable with a hosted URL",()=>{
  const old=process.env.NEXT_PUBLIC_SUPABASE_URL,flag=process.env.BRACKET_LOCAL_EVENT_PREVIEW;
  process.env.BRACKET_LOCAL_EVENT_PREVIEW="1";process.env.NEXT_PUBLIC_SUPABASE_URL="https://example.supabase.co";
  expect(localEventApplicationEnabled()).toBe(false);
  if(old===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=old;
  if(flag===undefined)delete process.env.BRACKET_LOCAL_EVENT_PREVIEW;else process.env.BRACKET_LOCAL_EVENT_PREVIEW=flag;
 });
});
