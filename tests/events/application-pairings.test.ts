import { describe,it,expect,vi } from "vitest";
import { applicationCommand } from "../../lib/events/application-contract";
import { buildApplicationManifest } from "../../lib/events/application-manifest";
import { scoreEvent } from "../../lib/events/scoring-bridge";
import { applicationChoices } from "../../lib/events/application-picks";
import { applicationConsent,applicationBroadcast,reviewApplicationPairings } from "../../lib/events/application-pairings";
import type { SupabaseClient } from "@supabase/supabase-js";
describe("reviewed round boundary",()=>{
 it("requires explicit synthetic acknowledgement and rejects supplied graph/operator controls",()=>{
  const review={action:"pairings",windowId:"w",version:1,configurationVersion:1,basisToken:"a".repeat(64),pairings:{m:["a","b"]},reason:"review",syntheticAcknowledged:true};
  expect(applicationCommand.safeParse(review).success).toBe(true);
  expect(applicationCommand.safeParse({...review,syntheticAcknowledged:false}).success).toBe(false);
  expect(applicationCommand.safeParse({...review,manifest:{}}).success).toBe(false);
  expect(applicationCommand.safeParse({action:"notification-control",enabled:true}).success).toBe(false);
  expect(applicationCommand.safeParse({action:"consent",role:"participant",enabled:true,kinds:["broadcast"],fakeAcknowledged:true,endpoint:"https://real.invalid"}).success).toBe(false);
 });
 it("a losing previous-round pick never prevents a reviewed actual next-round pick",()=>{
  const base=buildApplicationManifest("wwc-2027","2030-01-01T00:00:00Z",1,"UTC");
  const prior=base.markets.find(m=>m.stage==="round-of-16")!;
  const other=base.markets.filter(m=>m.stage==="round-of-16")[1];
  const next=base.markets.find(m=>m.stage==="quarter-final")!;
  const a=base.entrants[0].id,b=base.entrants[1].id,c=base.entrants[2].id,d=base.entrants[3].id;
  const manifest={...base,lifecycle:{...base.lifecycle,binding:{...base.lifecycle.binding,markets:base.lifecycle.binding.markets.map(m=>({...m,orientation:m.marketId===prior.id?[a,b] as [string,string]:m.marketId===other.id?[c,d] as [string,string]:m.marketId===next.id?[b,c] as [string,string]:m.orientation}))}}};
  expect(()=>scoreEvent({edition:{catalog:manifest,graphVersion:1},binding:manifest.lifecycle.binding,components:[],
   windows:Object.fromEntries(manifest.windows.map(w=>[w.id,"locked"])),outcomes:{[prior.id]:{kind:"winner",entrant:b},[other.id]:{kind:"winner",entrant:c},[next.id]:{kind:"winner",entrant:b}},
   participants:[{id:"p",graphVersion:1,picks:{[prior.id]:a,[next.id]:b}}]})).not.toThrow();
  expect(applicationChoices({id:next.id,domain:next.outcomeDomain,choices:[b,c],sources:next.inputs,actualPairing:[b,c]},[],{[prior.id]:a})).toEqual([b,c]);
 });
 it("authentication rejection occurs before every private pairing/notification operation",async()=>{
  const query={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),maybeSingle:vi.fn().mockResolvedValue({data:null,error:null})};
  const db={from:vi.fn(()=>query),rpc:vi.fn()} as unknown as SupabaseClient;
  const token="b3600000-0000-4000-8000-000000000003",id="b3600000-0000-4000-8000-000000000002";
  await expect(applicationConsent(db,id,token,{role:"participant",kinds:["broadcast"],enabled:true})).rejects.toMatchObject({code:"unauthorized"});
  await expect(applicationBroadcast(db,id,token,{message:"x",idempotencyKey:"x"})).rejects.toMatchObject({code:"unauthorized"});
  await expect(reviewApplicationPairings(db,id,token,{windowId:"w",version:1,configurationVersion:1,basisToken:"a".repeat(64),pairings:{m:["a","b"]},reason:"review"})).rejects.toMatchObject({code:"unauthorized"});
  expect(db.rpc).not.toHaveBeenCalled();
 });
});
