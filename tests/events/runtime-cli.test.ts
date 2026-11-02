import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { expect,it,vi } from "vitest";
import { runEventRuntimeCli } from "../../scripts/event-runtime";
function setup(){
 const rpc=vi.fn(async()=>({data:[],error:null}));
 return {rpc,readFile:vi.fn(async()=>JSON.stringify({batchSize:2,maxBatches:1,notificationLimit:3})),
 createClient:vi.fn(()=>({rpc})),stdout:vi.fn(),stderr:vi.fn()};
}
it.each(["https://hosted.example","http://127.1","http://localhost.evil","http://localhost/path","http://user@localhost"])("rejects noncanonical local URL %s before I/O",async(url)=>{
 const d=setup();
 expect(await runEventRuntimeCli(["job.json"],{SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:"local-key"},d)).toBe(1);
 expect(d.readFile).not.toHaveBeenCalled();expect(d.createClient).not.toHaveBeenCalled();
});
it("bounded local CLI invokes sweep and fake worker without controlling or enabling them",async()=>{
 const d=setup();
 expect(await runEventRuntimeCli(["job.json"],{SUPABASE_SERVICE_ROLE_KEY:"local-key"},d)).toBe(0);
 expect(d.rpc.mock.calls).toHaveLength(3);
 expect(d.stdout.mock.calls[0][0]).toContain('"fakeCalls":0');
 expect(d.stdout.mock.calls[0][0]).not.toContain("local-key");
});
it("rejects invalid bounds, control and real transport fields before client construction",async()=>{
 for(const job of [{maxBatches:101},{notificationLimit:0},{stopped:false},{transport:"real"}]){
  const d=setup();d.readFile.mockResolvedValue(JSON.stringify(job));
  expect(await runEventRuntimeCli(["job.json"],{SUPABASE_SERVICE_ROLE_KEY:"local-key"},d)).toBe(1);
  expect(d.createClient).not.toHaveBeenCalled();
 }
});

it("executes the checked-in Node loader and one-shot entry with synthetic RPCs",()=>{
 const result=spawnSync(process.execPath,["--import","./scripts/event-runtime-register.mjs","--input-type=module","-e",`
  import {runEventRuntimeCli} from "./scripts/event-runtime.ts";
  const exit=await runEventRuntimeCli(["synthetic.json"],{SUPABASE_SERVICE_ROLE_KEY:"synthetic-job-key"},{
   readFile:async()=>"{}",
   createClient:()=>({rpc:async()=>({data:[],error:null})}),
   stdout:text=>process.stdout.write(text),stderr:text=>process.stderr.write(text)
  });
  process.exitCode=exit;
 `],{cwd:resolve(import.meta.dirname,"../.."),encoding:"utf8",timeout:15000});
 expect(result.status).toBe(0);
 expect(JSON.parse(result.stdout).fakeCalls).toBe(0);
});
