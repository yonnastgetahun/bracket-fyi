import test from "node:test";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import assert from "node:assert/strict";
import { mkdtempSync,mkdirSync,lstatSync,readFileSync,realpathSync,rmSync,symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { fixtureDatabase } from "./fixture-sql";
import { validateLegacyRecoveryTarget,databaseName,ownedRuntimeDatabaseName,containerName,origin,legacyPlan,firstWindowPicks,assertPreserved,privateOutput } from "./legacy-recovery-fixture-plan";
const target={BRACKET_FIXTURE_DATABASE:databaseName,BRACKET_FIXTURE_DISPOSABLE:databaseName,BRACKET_FIXTURE_CONTAINER:containerName,BRACKET_FIXTURE_ORIGIN:origin,BRACKET_SEED_LEGACY_RECOVERY:"synthetic-only"};
test("exact DB/container/loopback and independent opt-in are all mandatory",()=>{
 assert.deepEqual(validateLegacyRecoveryTarget(target),{database:databaseName,container:containerName});
 assert.deepEqual(validateLegacyRecoveryTarget({...target,BRACKET_FIXTURE_DATABASE:ownedRuntimeDatabaseName,BRACKET_FIXTURE_DISPOSABLE:ownedRuntimeDatabaseName}),{database:ownedRuntimeDatabaseName,container:containerName});
 for(const key of Object.keys(target))for(const value of [undefined,"", "postgres","bracket_other_disposable","http://localhost:3137","http://127.0.0.1:3137@evil.test"])
  assert.throws(()=>validateLegacyRecoveryTarget({...target,[key]:value}));
 assert.throws(()=>validateLegacyRecoveryTarget({...target,BRACKET_FIXTURE_DATABASE:"bracket_other_disposable",BRACKET_FIXTURE_DISPOSABLE:"bracket_other_disposable"}));
});
test("legacy catalog categories, nominees, matches and independent flat winners agree",()=>{
 const p=legacyPlan();assert.equal(p.categories.length,2);
 assert.equal(new Set(p.categories.map(c=>c.name)).size,2);
 for(const [i,c] of p.categories.entries()){
  assert.equal(p.pickemMatches[i].home_slot,"category:"+c.id);
  assert.equal(p.expectedCategories[i].label,c.name);
  assert(c.nominees.every(id=>p.registry.some(t=>t.id===id)));
  assert.equal(p.expectedCategories[i].winner,p.registry.find(t=>t.id===c.nominees[0])!.name);
 }
 assert.equal(p.customMatches.length,3);assert.equal(p.teams.length,4);
 assert.equal(p.teams[0].id,"seed-0");assert.equal(p.teams[0].name,"Synthetic original");
 assert(p.teams.every(t=>!t.id.startsWith("bye")));
});
test("all scored first-window picks are distinct by role, structural markets excluded",()=>{
 const markets=[{id:"one",scored:true,choices:["home","draw","away"]},{id:"two",scored:true,choices:["home","draw","away"]},{id:"structure",scored:false,choices:[]}];
 assert.deepEqual(firstWindowPicks(markets),{a:{one:"home",two:"home"},b:{one:"away",two:"away"}});
 assert.throws(()=>firstWindowPicks([]));assert.throws(()=>firstWindowPicks([{id:"bad",scored:true,choices:["only"]}]));
});
test("preservation oracle detects participant/pick/timestamp drift",()=>{
 const before={participants:[{id:"a"},{id:"b"}],picks:[{id:"pick",participant_id:"a",slot_id:"m",team_id:"home",submitted_at:"same",locked:false}]};
 assertPreserved(before,structuredClone(before));
 for(const change of [{participants:[]},{picks:[]},{picks:[{...before.picks[0],submitted_at:"changed"}]},{picks:[{...before.picks[0],team_id:"away"}]}])
  assert.throws(()=>assertPreserved(before,{...before,...change}));
});
test("seeder import performs no environment validation or runtime work",async()=>{
 const seeder=await import("../seed-legacy-recovery-browser-fixtures");
 assert.equal(typeof seeder.seedLegacyRecovery,"function");
 // Guard must reject before Docker/SQL/FS work.
 await assert.rejects(()=>seeder.seedLegacyRecovery({}));
});
test("private output is 0700/0600, exclusive, and refuses symlinked ancestors",()=>{
 // macOS /var is a symlink; resolve temp root for the strict all-ancestors guard.
 const root=realpathSync(mkdtempSync(join(tmpdir(),"bracket-fixture-unit-")));
 try {
  const output=privateOutput(root,randomUUID());output.write("legacy.json",{private:"synthetic-test"});
  assert.equal(lstatSync(output.out).mode&0o777,0o700);
  assert.equal(lstatSync(join(output.out,"legacy.json")).mode&0o777,0o600);
  assert.deepEqual(JSON.parse(readFileSync(join(output.out,"legacy.json"),"utf8")),{private:"synthetic-test"});
  assert.throws(()=>output.write("legacy.json",{}));assert.throws(()=>output.write("../escape",{}));
  const unsafe=join(root,"unsafe");mkdirSync(unsafe);symlinkSync(join(root,"tmp"),join(unsafe,"tmp"));
  assert.throws(()=>privateOutput(unsafe,randomUUID()));
 }finally {rmSync(root,{recursive:true,force:true});}
});

test("owned P11 container is explicit, strictly shaped, and propagated unchanged",()=>{
 const container="bracket-p11-db-012345abcdef";
 assert.deepEqual(validateLegacyRecoveryTarget({...target,BRACKET_FIXTURE_CONTAINER:container}),{database:databaseName,container});
 // Adapter construction is inert, and invalid container rejection precedes subprocess work.
 assert.equal(typeof fixtureDatabase(databaseName,container).sql,"function");
 assert.equal(typeof fixtureDatabase(databaseName).sql,"function");
 for(const value of ["bracket-p11-db-012345abcde","bracket-p11-db-012345abcdef0","bracket-p11-db-012345ABCDEf",
  "bracket-p11-db-012345abcdef\n","other","--host=tcp://remote","supabase_db_other",""]){
  assert.throws(()=>validateLegacyRecoveryTarget({...target,BRACKET_FIXTURE_CONTAINER:value}));
  assert.throws(()=>fixtureDatabase(databaseName,value));
 }
});

test("SQL adapter routes only to validated local container and suppresses raw subprocess errors",(t)=>{
 const calls:{args:readonly string[];options:unknown}[]=[];
 const fake=t.mock.method(childProcess,"execFileSync",(_file:string,args:readonly string[],options:unknown)=>{
  calls.push({args,options});return "ok";
 });
 syncBuiltinESMExports();
 try{
  const selected="bracket-p11-db-012345abcdef";
  assert.equal(fixtureDatabase(databaseName,selected).sql("select 1;"),"ok");
  assert.deepEqual(calls[0].args.slice(0,5),["--host","unix:///var/run/docker.sock","exec","-i",selected]);
  fixtureDatabase(databaseName).sql("select 1;");
  assert.equal(calls[1].args[4],containerName);
  fake.mock.mockImplementation(()=>{throw Object.assign(new Error("private-credential-marker"),{stderr:"ERROR:  XX001: private-credential-marker"});});
  assert.throws(()=>fixtureDatabase(databaseName,selected).sql("private-sql-marker"),
   (error:unknown)=>error instanceof Error&&error.message==="Local fixture SQL rejected (XX001); private DB retained");
 }finally{fake.mock.restore();syncBuiltinESMExports();}
});
