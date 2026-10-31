import {describe,it,expect} from "vitest";
import {scoreEvent} from "../../lib/events/scoring-bridge";
import {evaluateLifecycle,type LifecycleCapture} from "../../lib/events/lifecycle";
import {playInFixture,eliminatedFixture,uclFixture,wwcFixture,scoreInput} from "./trusted-numeric-fixture";
import {numericTarget} from "./trusted-numeric-persistence";
describe("trusted numeric fixture preflight — NOT SQL or browser execution",()=>{
 it("fails closed without an explicit isolated target",()=>{
  expect(()=>numericTarget({})).toThrow("owned numeric");
  expect(()=>numericTarget({BRACKET_NUMERIC_DATABASE:"postgres"})).toThrow();
  expect(numericTarget({BRACKET_NUMERIC_DATABASE:"bracket_http_0123456789ab",BRACKET_NUMERIC_DISPOSABLE:"bracket_http_0123456789ab",BRACKET_NUMERIC_CONTAINER:"supabase_db_bracket-fyi"})).toEqual({database:"bracket_http_0123456789ab",container:"supabase_db_bracket-fyi"});
  expect(()=>numericTarget({BRACKET_NUMERIC_DATABASE:"bracket_numeric_0123456789ab",BRACKET_NUMERIC_DISPOSABLE:"other"})).toThrow();
 });
 for(const [name,build] of [
  ["play-in",playInFixture],["eliminated",eliminatedFixture],["ucl",()=>uclFixture()],["ucl-unknown",()=>uclFixture(true)],
  ["wwc",()=>wwcFixture()],["wwc-unknown",()=>wwcFixture(true)],
 ] as const)it(name+" fixtures survive JSON serialization and match independent expected literals",()=>{
  const f=build();
  expect(Buffer.byteLength(JSON.stringify(f.manifest))).toBeLessThan(24*1024*1024);
  for(const p of f.phases){
   const input=JSON.parse(JSON.stringify(scoreInput(f,p)));
   const rows=scoreEvent(input);
   expect(rows.map(r=>[r.id,r.earned,r.maximum,r.wrong,r.rank])).toEqual(p.expected);
   if(p.pending)expect(rows.map(r=>r.pending)).toEqual(p.pending);
   // Serialization + lifecycle evaluator preflight is still NOT a SQL round trip.
   const capture:LifecycleCapture={leagueId:"source-only",generation:1,basisToken:"a".repeat(64),basis:{
    configurationVersion:1,manifest:f.manifest,windows:Object.entries(p.windows).map(([id,state])=>({id,state,version:1})),
    participants:input.participants,effective:Object.fromEntries(f.manifest.markets.map(m=>[m.id,{
     outcome:p.outcomes[m.id]??{kind:"unresolved"},source:"override",canonicalResultId:null,canonicalVersion:0,canonicalToken:"a".repeat(64),
     overrideId:null,overrideRevision:0,expiresAt:null,derivedProvenance:null,held:false,excluded:false,effectiveToken:"a".repeat(64),provenanceToken:"a".repeat(64),
    }])),holds:[],quarantines:[],locked:true,frozen:false,disabled:false,
   }};
   expect(evaluateLifecycle(JSON.parse(JSON.stringify(capture))).map(r=>[r.id,r.earned,r.maximum,r.wrong,r.rank])).toEqual(p.expected);
  }
 },60000);
});
