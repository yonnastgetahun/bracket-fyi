import { describe,it,expect,vi } from "vitest";
import { readdirSync,readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createEventRepository } from "@/lib/events/repository";
import { createLifecycleRepository } from "@/lib/events/lifecycle-repository";
import { rpc as applicationRpc } from "@/lib/events/application";
import { sqlFailure } from "./sql-failure";

const root=new URL("../../supabase/",import.meta.url);
const read=(path:string)=>readFileSync(new URL(path,root),"utf8");
const expected:Record<string,number>={assert_event_membership:1,protect_event_window:1,protect_event_evaluation_basis:1,
 adopt_event_configuration:1,configure_event_window:1,submit_event_window:3,event_lifecycle_effective:1,
 event_lifecycle_basis:2,mutate_event_lifecycle:2,commit_event_lifecycle:1,join_event_league:1,
 emit_event_notification:2,review_event_pairings:4,event_operator_command:2};
function definitions(sql:string) {
 return [...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\([\s\S]*?\$\$[\s\S]*?\$\$;/gi)]
  .map(m=>[m[1],m[0]] as const);
}
function canonical(sql:string) {
 return sql.replace(/^create(?:\s+or\s+replace)?\s+function\s+(?:public\.)?/i,"create or replace function public.");
}
describe("non-retryable SQL business conflict repair",()=>{
 it("changes ONLY the 23 deliberate raises in 14 latest definitions, preserving guards/locks/settings/signatures",()=>{
  const latest=new Map<string,string>();
  for(const filename of readdirSync(new URL("migrations/",root)).sort().filter(n=>n.endsWith(".sql")&&n<"20261027000012"))
   for(const [name,body] of definitions(read("migrations/"+filename)))latest.set(name,body);
  const conflicts=Object.fromEntries([...latest].filter(([,body])=>body.includes("40001"))
   .map(([name,body])=>[name,body.match(/errcode='40001'/g)?.length??0]));
  expect(conflicts).toEqual(expected);
  const migration=read("migrations/20261027000012_http_business_conflicts.sql");
  const repaired=definitions(migration);
  expect(repaired.map(([name])=>name).sort()).toEqual(Object.keys(expected).sort());
  for(const [name,body] of repaired)
   expect(canonical(body),name).toBe(canonical(latest.get(name)!).replaceAll("errcode='40001'","errcode='PT409'"));
  const outsideDefinitions = repaired.reduce((sql, [,body]) => sql.replace(body, ""), migration)
   .replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
  expect(outsideDefinitions).toBe("begin; set local search_path=public,pg_temp; commit;");
  expect(migration).not.toMatch(/exception\s+when|serialization_failure/i);
  expect(migration).toBe(read("rollbacks/20261027000012_http_business_conflicts_forward_repair.sql"));
 });
 it.each(["PT409","40001","42501","23514","XX000","08006",undefined])("all application adapters preserve classification for %s",async(code)=>{
  const expected=code==="PT409"||code==="40001"?"conflict":code==="42501"?"unauthorized":code==="23514"?"invalid":"unavailable";
  const rpc=vi.fn().mockResolvedValue({data:null,error:{code,message:"private SQL bearer detail"}});
  const client={rpc};
  await expect(createEventRepository(client).submit("l","p",{windowId:"w",version:1,picks:{}})).rejects.toMatchObject({code:expected});
  await expect(createLifecycleRepository(client).capture("l")).rejects.toMatchObject({code:expected});
  await expect(applicationRpc(client as unknown as SupabaseClient,"review_event_pairings",{})).rejects.toMatchObject({code:expected});
  expect(rpc).toHaveBeenCalledTimes(3); // no application-level replay
 });
 it.each(["PT409","40001","42501","23514","XX000"])("SQL lifecycle harness preserves actual %s without private details",code=>{
  expect(sqlFailure({stderr:Buffer.from("ERROR:  "+code+": secret row and credential")})).toEqual({
   data:null,error:{code,message:"database command rejected"}});
 });
 it("unknown process/timeout/parse failures never impersonate a business conflict",()=>{
  for(const error of [new Error("timeout"),{stderr:"connection refused"},null,undefined])
   expect(sqlFailure(error).error.code).toBe("XX000");
 });
});
