import { describe, expect, it, vi } from "vitest";
import { BdlRouterAdapter } from "@/lib/ingestion/providers/balldontlie-router";
import type { PullContext } from "@/lib/ingestion/providers/provider-adapter";
import { createEventProviderRegistry } from "@/lib/events/runtime-providers";
import { config, game, request, response } from "../../events/provider-four-family-fixture";
import { request as nflRequest, game as nflGame } from "../../events/provider-bdl-vertical-fixture";

const cases = [
 {name:"NFL",context:nflRequest(),row:nflGame(),path:"/nfl/v1/games",phase:null,winner:"nfl-entry-home"},
 {name:"NBA playoffs",context:request("nba"),row:game("nba"),path:"/v1/games",phase:"playoffs",winner:"family-entry-home"},
 {name:"NBA Play-In",context:request("nba",{adapterConfig:config("nba","playin")}),row:{...game("nba"),postseason:false},path:"/v1/games",phase:"playin",winner:"family-entry-home"},
 ...(["mlb","ncaab","ncaaf"] as const).map(sport=>({name:sport,context:request(sport),row:game(sport),path:`/${sport}/v1/games`,phase:sport==="mlb"?"postseason":null,winner:"family-entry-home"})),
];
describe("binding-aware BDL routing",()=>{
 it.each(cases)("routes $name through the production adapter",async c=>{
  const getValue=vi.fn(()=>"synthetic");
  const fetch=vi.fn<typeof globalThis.fetch>(async input=>{
   const url=new URL(String(input));
   expect(url.pathname).toBe(c.path);
   expect(url.searchParams.get("season_type")).toBe(c.phase);
   return response(c.row);
  });
  const registry=createEventProviderRegistry({fetch});
  const batch=await registry.get("balldontlie")!.pull({...c.context,credential:{reference:"synthetic",getValue}});
  expect(batch.observations[1].data).toMatchObject({outcomeType:"winner",winnerEventEntryExternalId:c.winner});
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(getValue).toHaveBeenCalledTimes(1);
 });
 it.each([
  {bindingId:undefined},{bindingId:"not-a-binding"},{eventEditionId:undefined},
  {bindingKey:undefined},{providerKey:"football-data"},{adapterConfigVersion:0},
  {adapterConfig:{mode:"provider"}},{adapterConfig:{mode:"provider",sport:"__proto__"}},
  {adapterConfig:{...config("nba"),phase:undefined}},
  {adapterConfig:{...config("nba"),phase:"cfp"}},
  {adapterConfig:{...config("ncaaf"),sport:"nfl",phase:"cfp"}},
  {adapterConfig:{...config("mlb"),mode:"unknown"}},
 ])("rejects missing/wrong binding before credentials or HTTP: %j",async patch=>{
  const fetch=vi.fn<typeof globalThis.fetch>();
  const getValue=vi.fn(()=>{throw Error("secret accessed");});
  const adapter=new BdlRouterAdapter({fetch});
  const context={...request("nba"),...patch,credential:{reference:"synthetic",getValue}} as PullContext;
  await expect(adapter.pull(context)).rejects.toMatchObject({failure:{code:"invalid_response",details:{reason:"invalid_binding"}}});
  expect(fetch).not.toHaveBeenCalled();expect(getValue).not.toHaveBeenCalled();
 });
 it("manual needs neither binding nor credential and performs zero I/O",async()=>{
  const fetch=vi.fn<typeof globalThis.fetch>();
  const context={adapterConfig:{mode:"manual"},requestedAt:"2027-01-20T20:00:00Z",
   get credential(){throw Error("credential property accessed");}} as unknown as PullContext;
  expect(await new BdlRouterAdapter({fetch}).pull(context)).toMatchObject({observations:[],fetchedCount:0});
  expect(fetch).not.toHaveBeenCalled();
 });
 it("rejects Play-In membership through a playoffs binding before I/O",async()=>{
  const fetch=vi.fn<typeof globalThis.fetch>();
  const c=config("nba","playin"); c.phase="playoffs";
  await expect(new BdlRouterAdapter({fetch}).pull(request("nba",{adapterConfig:c}))).rejects.toMatchObject({failure:{details:{reason:"invalid_match_mapping"}}});
  expect(fetch).not.toHaveBeenCalled();
 });
 it("does not leak same-ID membership, cursors or credentials across concurrent families",async()=>{
  const fetch=vi.fn<typeof globalThis.fetch>(async (input,init)=>{
   const url=new URL(String(input));
   const sport=url.pathname.includes("ncaaf")?"ncaaf":"nba";
   expect(new Headers(init?.headers).get("Authorization")).toBe(sport);
   expect(url.searchParams.get("cursor")).toBe(sport==="nba"?"7":"11");
   return Response.json({data:[game(sport)],meta:{per_page:100,next_cursor:sport==="nba"?8:12}});
  });
  const router=new BdlRouterAdapter({fetch});
  const batches=await Promise.all((["nba","ncaaf"] as const).map(sport=>{
   const c=config(sport);c.eventEditionExternalId=sport+"-edition";
   return router.pull(request(sport,{adapterConfig:c,cursor:{cursor:sport==="nba"?7:11},credential:{reference:sport,getValue:()=>sport}}));
  }));
  expect(batches.map(b=>b.nextCursor)).toEqual([{cursor:8},{cursor:12}]);
  expect(batches.map(b=>b.observations[1].data)).toMatchObject([{eventEditionExternalId:"nba-edition"},{eventEditionExternalId:"ncaaf-edition"}]);
  expect(fetch).toHaveBeenCalledTimes(2);
 });
 it("rejects a wrong-family response without emitting observations",async()=>{
  const router=new BdlRouterAdapter({fetch:async()=>response(nflGame())});
  await expect(router.pull(request("mlb"))).rejects.toMatchObject({failure:{code:"invalid_response"}});
 });
 it("registry does not fall back on unknown keys or allow BDL replacement",()=>{
  const fetch=vi.fn<typeof globalThis.fetch>();
  const registry=createEventProviderRegistry({fetch});
  expect(registry.get("nba")).toBeUndefined();expect(registry.get("__proto__")).toBeUndefined();
  expect(()=>createEventProviderRegistry({fetch,otherAdapters:[new BdlRouterAdapter({fetch})]})).toThrow("Duplicate");
  expect(fetch).not.toHaveBeenCalled();
 });
 it("routes other explicitly registered providers unchanged and redacts untyped errors",()=>{
  const fetch=vi.fn<typeof globalThis.fetch>();const router=new BdlRouterAdapter({fetch});
  const other={...router,key:"other",pull:vi.fn(),classifyError:router.classifyError};
  expect(createEventProviderRegistry({fetch,otherAdapters:[other]}).get("other")).toBe(other);
  expect(JSON.stringify(router.classifyError(Error("SECRET")))).not.toContain("SECRET");
 });
});
