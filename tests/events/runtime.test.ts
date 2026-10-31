import { describe, expect, it, vi } from "vitest";
import { createEventRuntime } from "@/lib/events/runtime";
import { produceRuntimeNotifications } from "@/lib/events/runtime-producers";

const league = "10000000-0000-4000-8000-000000000001";
const basis = "a".repeat(64);
const now = new Date("2026-10-27T12:00:00Z");
const signals = [
 {kind:"lock_reminder",leagueId:league,windowId:"picks",revision:1,cutoff:"2026-10-27T12:30:00Z"},
 {kind:"contest_live",leagueId:league,contestId:"match",revision:1,startsAt:"2026-10-27T11:59:00Z"},
 {kind:"schedule_change",leagueId:league,contestId:"match",revision:2,changedAt:"2026-10-27T11:00:00Z"},
 {kind:"provider_stale",leagueId:league,bindingId:"provider",episodeStartedAt:"2026-10-27T11:30:00Z"},
] as const;
describe("bounded event runtime",()=>{
 it("uses stable business identities, not basis or retry clock; revisions differ",async()=>{
  const emit=vi.fn().mockResolvedValue(1),read=vi.fn().mockResolvedValue({basisToken:basis,state:"active",generation:2,evaluatedGeneration:2});
  expect(await produceRuntimeNotifications({emit,read},signals,now)).toMatchObject({emitted:4,skipped:0});
  const first=emit.mock.calls.map(c=>c[2]);
  read.mockResolvedValue({basisToken:"b".repeat(64),state:"active",generation:3,evaluatedGeneration:3});
  await produceRuntimeNotifications({emit,read},signals,new Date(now.getTime()+1000));
  expect(emit.mock.calls.slice(4).map(c=>c[2])).toEqual(first);
  await produceRuntimeNotifications({emit,read},[{...signals[2],revision:3}],now);
  expect(emit.mock.calls[8][2]).not.toBe(first[2]);
  expect(emit.mock.calls[0][4]).toBe("2026-10-27T12:30:00.000Z");
 });
 it("skips expired/future events and dirty bases; invalid input has no effects",async()=>{
  const emit=vi.fn(),read=vi.fn().mockResolvedValue({basisToken:basis,state:"reconciliation-pending",generation:2,evaluatedGeneration:1});
  expect(await produceRuntimeNotifications({emit,read},signals,now)).toMatchObject({emitted:0,skipped:4});
  read.mockClear();
  await produceRuntimeNotifications({emit,read},[signals[0]],new Date("2026-10-27T10:00:00Z"));
  await produceRuntimeNotifications({emit,read},[signals[1]],new Date("2026-10-27T13:00:00Z"));
  expect(read).not.toHaveBeenCalled();expect(emit).not.toHaveBeenCalled();
  await expect(produceRuntimeNotifications({emit,read},[...signals,{kind:"bogus"}],now)).rejects.toThrow();
  expect(emit).not.toHaveBeenCalled();
 });
 it("sweeps before emit and invokes actual fake worker; never invokes private control",async()=>{
  const calls:string[]=[];
  const rpc=vi.fn(async(name:string)=>{
   calls.push(name);
   const data:Record<string,unknown>={
    scan_event_series:[],scan_event_lifecycle_work:[], read_event_lifecycle:{state:"active",generation:1,evaluatedGeneration:1,basisToken:basis,leaderboard:[],effective:{}},
    emit_event_notification:1,scan_event_notifications:["outbox"],
    admit_event_notification:{admitted:true,attemptId:"attempt"},
    start_event_notification:{started:true,startBudgetMs:5000,route:"/l/"+league,payload:{kind:"lock_reminder"}},
    finish_event_notification:{},
   };
   if(!(name in data)) throw new Error("Unexpected RPC");
   return {data:data[name],error:null};
  });
  const runtime=createEventRuntime({rpc});
  const result=await runtime.tick({signals:[signals[0]],now});
  expect(calls).toEqual(["scan_event_series","scan_event_lifecycle_work","read_event_lifecycle","emit_event_notification","scan_event_notifications","admit_event_notification","start_event_notification","finish_event_notification"]);
  expect(result.notifications.sent).toBe(1);
  expect(result.fakeCalls).toBe(1);
 });
 it("stopped notification admission makes zero sends; rejects unbounded job before RPC",async()=>{
  const rpc=vi.fn(async(name:string)=>({data:["scan_event_series","scan_event_lifecycle_work"].includes(name)?[]:name==="scan_event_notifications"?["outbox"]:{admitted:false},error:null}));
  const runtime=createEventRuntime({rpc});
  expect((await runtime.tick()).fakeCalls).toBe(0);
  for(const value of [0,501,NaN,1.5]) await expect(runtime.tick({notificationLimit:value})).rejects.toThrow();
  expect(rpc).toHaveBeenCalledTimes(4);
 });
});
