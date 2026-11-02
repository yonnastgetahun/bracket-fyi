import assert from "node:assert/strict";
import { lstatSync, mkdirSync, chmodSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
export const origin="http://127.0.0.1:3137";
export const databaseName="bracket_browser_legacy_recovery";
// Current serialized HTTP/P11 runtime target. Keep this explicit (not a
// pattern) so fixture SQL cannot be redirected to an arbitrary database.
export const ownedRuntimeDatabaseName="bracket_http_439610679a15";
export const containerName="supabase_db_bracket-fyi";
export const catalogName="Oscars 2025 (97th Academy Awards)";
export function validateLegacyRecoveryTarget(env:Record<string,string|undefined>) {
 const database=env.BRACKET_FIXTURE_DATABASE;
 assert(database===databaseName||database===ownedRuntimeDatabaseName,"Exact disposable database allowlist required");
 assert.equal(env.BRACKET_FIXTURE_DISPOSABLE,database,"Explicit disposable acknowledgment required");
 const container=env.BRACKET_FIXTURE_CONTAINER;
 assert(container===containerName||(typeof container==="string"&&/^bracket-p11-db-[a-f0-9]{12}$/.test(container)),
  "Explicit known local or owned isolated container required");
 assert.equal(env.BRACKET_FIXTURE_ORIGIN,origin,"Fixed loopback origin required");
 assert.equal(env.BRACKET_SEED_LEGACY_RECOVERY,"synthetic-only","Explicit seeding opt-in required");
 return {database,container};
}
export function legacyPlan() {
 const registry=["Synthetic nominee A","Synthetic alternate A","Synthetic nominee B","Synthetic alternate B"].map((name,i)=>({id:"synthetic-nominee-"+i,name,aliases:[]}));
 const categories=["Synthetic category A","Synthetic category B"].map((name,i)=>({id:"synthetic-category-"+i,name,nominees:registry.slice(i*2,i*2+2).map(t=>t.id)}));
 const teams=["Synthetic original","Synthetic Bravo","Synthetic Charlie","Synthetic Delta"].map((name,i)=>({id:"seed-"+i,name,aliases:[]}));
 return {registry,categories,teams,topology:{type:"pickem",categories},
  expectedCategories:categories.map((c,i)=>({label:c.name,winner:registry[i*2].name})),
  pickemMatches:categories.map((c,i)=>({round:1,match_number:i+1,home_slot:"category:"+c.id,away_slot:"category:"+c.id})),
  customTopology:{rounds:2,slots_per_round:[2,1],has_third_place:false},
  customMatches:[{round:1,match_number:1,home_slot:"seed-0",away_slot:"seed-1"},{round:1,match_number:2,home_slot:"seed-2",away_slot:"seed-3"},{round:2,match_number:1,home_slot:"w-r1m1",away_slot:"w-r1m2"}]};
}
export function firstWindowPicks(markets:{id:string;scored:boolean;choices:readonly string[]}[]) {
 const scored=markets.filter(m=>m.scored);
 assert(scored.length>0);
 assert(scored.every(m=>m.choices.includes("home")&&m.choices.includes("away")));
 return {a:Object.fromEntries(scored.map(m=>[m.id,"home"])),b:Object.fromEntries(scored.map(m=>[m.id,"away"]))};
}
export function assertPreserved(before:unknown,after:unknown) {assert.deepEqual(after,before,"Rotation changed persistent identity or picks");}
/** Fixed owned output subtree; exclusive files, no following symlink ancestors. */
export function privateOutput(root:string,run:string) {
 assert.match(run,/^[0-9a-f-]{36}$/);
 const base=resolve(root,"tmp","browser-fixtures");
 // Check every ancestor, including root, before creating the private leaf.
 const chain:string[]=[];let current=base;
 while(current!==resolve(current,"..")){chain.unshift(current);current=resolve(current,"..");}
 for(const path of chain){
  try{const stat=lstatSync(path);assert(!stat.isSymbolicLink()&&stat.isDirectory(),"Unsafe output ancestor");}
  catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;assert(path===resolve(root,"tmp")||path===base);mkdirSync(path,{mode:0o700});}
 }
 const out=resolve(base,run);mkdirSync(out,{mode:0o700});chmodSync(out,0o700);
 return {out,write(name:string,value:unknown){
  assert(["status.json","legacy.json","own-recovery.json","evidence.json","complete.json"].includes(name));
  writeFileSync(resolve(out,name),JSON.stringify(value,null,2)+"\n",{mode:0o600,flag:"wx"});
 }};
}
