import { describe,it,expect,vi } from "vitest";
import { getEventDefinition } from "@/lib/events/catalog";
import { evaluateLifecycle,reconcileEventLifecycle,reconcileEventLifecycleSweep,lifecycleViewSchema,type LifecycleCapture } from "@/lib/events/lifecycle";
import { createLifecycleRepository } from "@/lib/events/lifecycle-repository";
import { EventCommandError } from "@/lib/events/repository";
function fixture():LifecycleCapture {
 const base=getEventDefinition("wwc-2027")!, m=base.markets[0], ids=m.inputs.map(s=>s.kind==="entrant"?s.entrantId:"");
 return {leagueId:"league",generation:2,basisToken:"a".repeat(64),basis:{
  configurationVersion:1,manifest:{...base,markets:[m],windows:[base.windows[0]],entrants:base.entrants.filter(e=>ids.includes(e.id)),edges:[],championMarketId:null,
   lifecycle:{binding:{reviewed:true,graphVersion:1,markets:[{marketId:m.id,inputs:m.inputs,eligibleEntrantIds:ids,orientation:[ids[0],ids[1]]}]},components:[]}},
  windows:[{id:m.windowId,version:1,state:"locked"}],
  participants:[{id:"P",graphVersion:1,picks:{[m.id]:"draw"}},{id:"Q",graphVersion:1,picks:{[m.id]:"home"}}],
  effective:{[m.id]:{outcome:{kind:"draw"},source:"canonical",canonicalResultId:"result",canonicalVersion:1,canonicalToken:"b".repeat(64),
   overrideId:null,overrideRevision:0,expiresAt:null,derivedProvenance:null,held:false,excluded:false,effectiveToken:"c".repeat(64),provenanceToken:"d".repeat(64)}},
  holds:[],quarantines:[],locked:true,frozen:false,disabled:false,
 }};
}
describe("durable lifecycle scoring bridge",()=>{
 it("uses captured effective outcome and existing independent draw oracle",()=>{
  expect(evaluateLifecycle(fixture()).map(r=>[r.id,r.earned,r.maximum,r.wrong,r.rank])).toEqual([["P",1,1,0,1],["Q",0,0,1,2]]);
 });
 it("audited exclusion removes points and wrong count without deleting saved picks",()=>{
  const x=fixture(),id=x.basis.manifest.markets[0].id; x.basis.effective[id].excluded=true;
  expect(evaluateLifecycle(x).map(r=>[r.id,r.earned,r.maximum,r.wrong,r.rank])).toEqual([["P",0,0,0,1],["Q",0,0,0,1]]);
  expect(x.basis.participants[0].picks[id]).toBe("draw");
  x.basis.effective[id].excluded=false; expect(evaluateLifecycle(x)[0].earned).toBe(1);
 });
 it("never leaks open-window picks through earned scores",()=>{
  const x=fixture();x.basis.windows[0].state="open";
  expect(evaluateLifecycle(x).map(r=>[r.earned,r.wrong])).toEqual([[0,0],[0,0]]);
 });
 it("fails closed on incomplete basis and stale graph",()=>{
  const x=fixture(); x.basis.effective={}; expect(()=>evaluateLifecycle(x)).toThrow("Incomplete effective basis");
  const y=fixture(); y.basis.configurationVersion=2; expect(()=>evaluateLifecycle(y)).toThrow("Invalid lifecycle capture");
 });
 it("submits exactly captured generation/token; conflict is not retried with old scores",async()=>{
  const x=fixture(),commit=vi.fn().mockRejectedValue(new Error("conflict"));
  await expect(reconcileEventLifecycle({capture:async()=>x,commit},"league")).rejects.toThrow("conflict");
  expect(commit).toHaveBeenCalledOnce(); expect(commit.mock.calls[0][0]).toBe(x);
  expect(commit.mock.calls[0][1]).toEqual(evaluateLifecycle(x));
 });
 it("never commits on scoring validation failure",async()=>{
  const x=fixture(); x.basis.effective={};const commit=vi.fn();
  await expect(reconcileEventLifecycle({capture:async()=>x,commit},"league")).rejects.toThrow();
  expect(commit).not.toHaveBeenCalled();
 });
 it("repository uses scoped args and sanitizes database error details",async()=>{
  const rpc=vi.fn().mockResolvedValue({data:null,error:{code:"42501",message:"SECRET"}});
  const repo=createLifecycleRepository({rpc});
  await expect(repo.mutate("league","credential",{marketId:"m",action:"release",payload:{},reason:"correction",expectedEffectiveToken:"e",expectedCanonicalToken:"c",idempotencyKey:"retry"})).rejects.toThrow("Session is not authorized");
  expect(rpc.mock.calls[0]).toEqual(["mutate_event_lifecycle",{p_league_id:"league",p_organizer_token:"credential",p_market_id:"m",p_action:"release",p_payload:{},p_reason:"correction",p_expected_effective_token:"e",p_expected_canonical_token:"c",p_idempotency_key:"retry"}]);
 });
 it("public lifecycle DTO recursively omits unknown provenance fields",()=>{
  const x=fixture(),m=x.basis.manifest.markets[0].id;
  const effective={...x.basis.effective[m],configurationVersion:1,requiredSetRevision:0,
   derivedProvenance:{algorithm:"series-wins-v1",algorithmVersion:1,children:[{id:"child",version:1,secret:"hidden"}],secret:"hidden"},secret:"hidden"};
  const view=lifecycleViewSchema.parse({state:"complete",generation:2,evaluatedGeneration:2,basisToken:x.basisToken,
   leaderboard:[],effective:{[m]:effective},secret:"hidden"});
  expect(JSON.stringify(view)).not.toContain("hidden");
 });
 it("bounded restart sweep advances clean cursors and never clears conflicts",async()=>{
  const scan=vi.fn().mockResolvedValueOnce([{league_id:"clean",generation:null},{league_id:"dirty",generation:2}]).mockResolvedValueOnce([]);
  const capture=vi.fn().mockResolvedValue(fixture()),commit=vi.fn().mockRejectedValue(new EventCommandError("conflict"));
  expect(await reconcileEventLifecycleSweep({scan,capture,commit},{batchSize:2})).toEqual({nextCursor:null,reconciled:0,conflicts:1,failed:[]});
  expect(capture).toHaveBeenCalledOnce();expect(scan.mock.calls[1]).toEqual(["dirty",2]);
 });
 it("sweep reports a bad basis and continues independent leagues without acknowledgment",async()=>{
  const scan=vi.fn().mockResolvedValue([{league_id:"bad",generation:1},{league_id:"good",generation:2}]);
  const capture=vi.fn().mockRejectedValueOnce(new Error("bad graph")).mockResolvedValueOnce(fixture());
  const commit=vi.fn().mockResolvedValue({state:"complete",replayed:false,coronation:true});
  expect(await reconcileEventLifecycleSweep({scan,capture,commit})).toEqual({nextCursor:null,reconciled:1,conflicts:0,failed:[{leagueId:"bad",code:"invalid-basis"}]});
  expect(commit).toHaveBeenCalledOnce();
 });
 it("scan basis failures surface per league while cursor and expiry work progress",async()=>{
  const scan=vi.fn().mockResolvedValueOnce([
   {league_id:"bad",generation:1,error_code:"invalid-basis"},
   {league_id:"expiry",generation:2,error_code:null},
   {league_id:"clean",generation:null,error_code:null},
  ]).mockResolvedValueOnce([]);
  const capture=vi.fn().mockResolvedValue(fixture());
  const commit=vi.fn().mockResolvedValue({state:"complete",replayed:false,coronation:false});
  expect(await reconcileEventLifecycleSweep({scan,capture,commit},{batchSize:3}))
   .toEqual({nextCursor:null,reconciled:1,conflicts:0,failed:[{leagueId:"bad",code:"invalid-basis"}]});
  expect(capture.mock.calls).toEqual([["expiry"]]);expect(commit).toHaveBeenCalledOnce();
  expect(scan.mock.calls[1]).toEqual(["clean",3]);
 });
 it("repository preserves bounded scan error codes, never diagnostic details",async()=>{
  const data=[{league_id:"a3500000-0000-4000-8000-000000000011",generation:1,error_code:"invalid-basis",detail:"private basis"}];
  const repo=createLifecycleRepository({rpc:async()=>({data,error:null})});
  expect(await repo.scan(null,1)).toEqual([{league_id:data[0].league_id,generation:1,error_code:"invalid-basis"}]);
 });
 it("repository does not silently acknowledge a mismatched capture",async()=>{
  const repo=createLifecycleRepository({rpc:async()=>({data:fixture(),error:null})});
  await expect(repo.capture("other")).rejects.toThrow("temporarily unavailable");
 });
});
