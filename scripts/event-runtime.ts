#!/usr/bin/env -S node --import ./scripts/event-runtime-register.mjs
/** One-shot local job. Run from repo root:
 * node --import ./scripts/event-runtime-register.mjs scripts/event-runtime.ts job.json
 * job.json: {batchSize?,maxBatches?,notificationLimit?,after?,signals?}
 * Does not load dotenv or enable controls. Use event-operator.ts for separately
 * authorized global.stop and notification.control commands with current versions.
 */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { createEventRuntime } from "../lib/events/runtime";
import { runtimeSignalsSchema } from "../lib/events/runtime-producers";
import type { EventRpcClient } from "../lib/events/repository";
const jobSchema=z.object({
 after:z.string().uuid().nullable().optional(),
 batchSize:z.number().int().min(1).max(500).optional(),
 maxBatches:z.number().int().min(1).max(100).optional(),
 notificationLimit:z.number().int().min(1).max(500).optional(),
 signals:runtimeSignalsSchema.optional(),
}).strict();
export interface RuntimeCliDependencies {
 readFile(path:string):Promise<string>;
 createClient(url:string,key:string):EventRpcClient;
 stdout(text:string):void;stderr(text:string):void;
}
const defaults:RuntimeCliDependencies={
 readFile:path=>readFile(path,"utf8"),
 createClient:(url,key)=>({async rpc(name,args){
  const response=await fetch(url+"/rest/v1/rpc/"+name,{
   method:"POST",redirect:"error",signal:AbortSignal.timeout(30_000),
   headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},
   body:JSON.stringify(args),
  });
  if(!response.ok) return {data:null,error:{message:"Runtime RPC failed"}};
  return {data:await response.json(),error:null};
 }}),
 stdout:text=>{process.stdout.write(text);},stderr:text=>{process.stderr.write(text);},
};
export async function runEventRuntimeCli(argv:readonly string[],env:Readonly<Record<string,string|undefined>>,deps:RuntimeCliDependencies=defaults){
 try{
  const url=env.SUPABASE_URL??"http://127.0.0.1:54321";
  if(!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?\/?$/.test(url)) throw new Error("local only");
  const origin=new URL(url).origin;
  const key=env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key?.trim() || argv.length!==1 || !argv[0] || argv[0].startsWith("-") || argv[0].includes("://")) throw new Error("configuration");
  const source=await deps.readFile(argv[0]);
  if(Buffer.byteLength(source,"utf8")>1_048_576) throw new Error("oversize");
  const job=jobSchema.parse(JSON.parse(source));
  const result=await createEventRuntime(deps.createClient(origin,key)).tick(job);
  const output=JSON.stringify(result);
  if(output.includes(JSON.stringify(key).slice(1,-1))) throw new Error("reflection");
  deps.stdout(output+"\n");
  return result.sweep.failed.length || result.sweep.conflicts || result.produced.failed.length ? 2:0;
 }catch{
  deps.stderr("Local event runtime failed; inspect durable state before retrying.\n");
  return 1;
 }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 process.exitCode=await runEventRuntimeCli(process.argv.slice(2),process.env);
}
