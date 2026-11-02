import { describe,it,expect,vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildApplicationManifest,initiallyOpen } from "../../lib/events/application-manifest";
import { applicationChoices } from "../../lib/events/application-picks";
import { reviewApplicationQualifiers } from "../../lib/events/application-pairings";
import { structuralQualifierReviewInput } from "../../lib/events/application-contract";
import { scoreEvent } from "../../lib/events/scoring-bridge";

describe("reviewed structural qualification consumer",()=>{
 it("accepts only explicit synthetic review with complete optional source authority",()=>{
  const input={configurationVersion:1,basisToken:"a".repeat(64),idempotencyKey:"q",reason:"Review",syntheticAcknowledged:true};
  expect(structuralQualifierReviewInput.safeParse(input).success).toBe(true);
  expect(structuralQualifierReviewInput.safeParse({...input,syntheticAcknowledged:false}).success).toBe(false);
  expect(structuralQualifierReviewInput.safeParse({...input,qualifiers:{east:"invented"}}).success).toBe(false);
  expect(structuralQualifierReviewInput.safeParse({...input,sourceLeagueId:"b3600000-0000-4000-8000-000000000002"}).success).toBe(false);
  expect(structuralQualifierReviewInput.safeParse({...input,sourceLeagueId:"b3600000-0000-4000-8000-000000000002",sourceOrganizerToken:"b3600000-0000-4000-8000-000000000003"}).success).toBe(true);
  expect(structuralQualifierReviewInput.safeParse({...input,sourceBasisToken:"b".repeat(64)}).success).toBe(false);
 });
 it("NCAA has twelve unscored Opening Round games and 63 scored games, closed until qualification",()=>{
  const m=buildApplicationManifest("ncaa-men-2027","2035-01-01T00:00:00Z",1,"UTC");
  expect(m.markets.filter(m=>!m.scored)).toHaveLength(12);
  expect(m.markets.filter(m=>m.scored)).toHaveLength(63);
  expect(m.windows.some(w=>initiallyOpen(m,w.id))).toBe(false);
 });
 it("NBA holds initial window, shares actual Play-In IDs, and has no Play-In scored markets",()=>{
  const m=buildApplicationManifest("nba-2027","2035-01-01T00:00:00Z",1,"UTC");
  const src=buildApplicationManifest("nba-play-in-2027","2035-01-01T00:00:00Z",1,"UTC");
  expect(initiallyOpen(m,m.windows[0].id)).toBe(false);
  expect(src.entrants.every(e=>m.entrants.some(x=>x.id===e.id))).toBe(true);
  expect(m.markets).toHaveLength(15);
  expect(src.markets).toHaveLength(6);
  expect(m.markets.some(x=>src.markets.some(s=>s.id===x.id))).toBe(false);
  expect(m.markets.flatMap(x=>x.inputs).filter(s=>s.kind==="reviewed-placement")).toHaveLength(4);
 });
 it("a reviewed qualifier controls draft choices without rewriting a previously saved canonical pick",()=>{
  const base=buildApplicationManifest("nba-2027","2035-01-01T00:00:00Z",1,"UTC");
  const market=base.markets.find(m=>m.inputs.some(s=>s.kind==="reviewed-placement"))!;
  const binding=base.lifecycle.binding.markets.find(b=>b.marketId===market.id)!;
  const fixed=market.inputs.find(s=>s.kind==="entrant")!;
  if(fixed.kind!=="entrant")throw Error("fixture");
  const actual=binding.eligibleEntrantIds.find(id=>id.endsWith("seed-9"))!;
  const prior=binding.eligibleEntrantIds.find(id=>id.endsWith("seed-7"))!;
  const pair:[string,string]=[fixed.entrantId,actual];
  const m={...base,lifecycle:{...base.lifecycle,binding:{...base.lifecycle.binding,markets:base.lifecycle.binding.markets.map(b=>b.marketId===market.id?{...b,orientation:pair}:b)}}};
  const picks={[market.id]:prior};
  expect(applicationChoices({id:market.id,domain:market.outcomeDomain,choices:market.choices,sources:market.inputs,actualPairing:pair},[],picks)).toEqual(expect.arrayContaining(pair));
  expect(applicationChoices({id:market.id,domain:market.outcomeDomain,choices:market.choices,sources:market.inputs,actualPairing:pair},[],picks)).not.toContain(prior);
  const rows=scoreEvent({edition:{catalog:m,graphVersion:1},binding:m.lifecycle.binding,components:[],outcomes:{[market.id]:{kind:"winner",entrant:actual}},windows:{[m.windows[0].id]:"locked"},participants:[{id:"p",graphVersion:1,picks}]});
  expect(rows[0].earned).toBe(0);
  expect(picks[market.id]).toBe(prior);
 });
 it("authenticates target before reading private configuration or source evidence",async()=>{
  const query={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),maybeSingle:vi.fn().mockResolvedValue({data:null,error:null})};
  const db={from:vi.fn(()=>query),rpc:vi.fn()} as unknown as SupabaseClient;
  await expect(reviewApplicationQualifiers(db,"b3600000-0000-4000-8000-000000000002","b3600000-0000-4000-8000-000000000003",{
   configurationVersion:1,basisToken:"a".repeat(64),idempotencyKey:"review",reason:"Synthetic review",
  })).rejects.toMatchObject({code:"unauthorized"});
  expect(db.rpc).not.toHaveBeenCalled();
 });
});
