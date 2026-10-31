import { describe,it,expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readApplication,verifyApplicationCredential } from "../../lib/events/application";
const league="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",token="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
function fixture(found:boolean){
 const calls:unknown[][]=[];
 const db={from:(table:string)=>{
  calls.push(["from",table]);
  const query={select:(columns:string)=>{calls.push(["select",columns]);return query;},eq:(column:string,value:unknown)=>{calls.push(["eq",column,value]);return query;},maybeSingle:async()=>({data:found?{id:"own-id"}:null,error:null})};
  return query;
 }} as unknown as SupabaseClient;
 return {db,calls};
}
describe("exact scoped session before private selection",()=>{
 it("invalid organizer cookie cannot reach config, roster, invitation, or private capture",async()=>{
  const {db,calls}=fixture(false);
  await expect(readApplication(db,league,{organizer:token})).rejects.toMatchObject({code:"unauthorized"});
  expect(calls).toEqual([["from","leagues"],["select","id"],["eq","id",league],["eq","organizer_token",token]]);
 });
 it("participant recovery is scoped to both league and exact own credential",async()=>{
  const {db,calls}=fixture(true);
  expect(await verifyApplicationCredential(db,league,"participant",token)).toEqual({id:"own-id",credential:token});
  expect(calls).toEqual([["from","participants"],["select","id"],["eq","league_id",league],["eq","magic_token",token]]);
 });
 it("missing or malformed credentials do not query",async()=>{
  const {db,calls}=fixture(true);
  for(const value of [undefined,"not-a-token"])await expect(verifyApplicationCredential(db,league,"organizer",value)).rejects.toMatchObject({code:"unauthorized"});
  expect(calls).toEqual([]);
 });
});
