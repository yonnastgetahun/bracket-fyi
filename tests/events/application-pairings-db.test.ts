import { execFileSync } from "node:child_process";
import { describe,it,expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createApplicationLeague,readApplication,changeApplicationWindow,submitApplicationPicks } from "../../lib/events/application";
import { reviewApplicationPairings,applicationConsent,applicationBroadcast } from "../../lib/events/application-pairings";
import { createEventRepository } from "../../lib/events/repository";
import { createLifecycleRepository } from "../../lib/events/lifecycle-repository";
const quote=(v:unknown):string=>v===null||v===undefined?"null":"'"+String(typeof v==="object"?JSON.stringify(v):v).replaceAll("'","''")+"'";
const identifier=(v:string)=>{if(!/^[a-z_]+$/.test(v))throw new Error("Invalid test SQL identifier");return '"'+v+'"';};
function sql(statement:string):string {
 return execFileSync("docker",["exec","-i","supabase_db_bracket-fyi","psql","-X","-U","postgres","-d","postgres","-Atq","-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose"],
  {input:"set role service_role; "+statement,encoding:"utf8",timeout:60000,maxBuffer:32*1024*1024,stdio:["pipe","pipe","pipe"]}).trim();
}
function failure(error:unknown){
 const stderr=String((error as {stderr?:unknown}).stderr??"");
 const code=stderr.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1]??"XX000";
 if(code!=="40001")console.warn("Local SQL failure",code,stderr.match(/permission denied for (?:table|function|schema) [a-z_]+/)?.[0]??"details suppressed",String((error as {code?:string}).code??""));
 // Never output commands, row values or generated credentials on failure.
 return {data:null,error:{code,message:"Local service SQL rejected operation"}};
}
class TableQuery {
 private columns="*";private filters:string[]=[];private sorting="";private one=false;private inserted:Record<string,unknown>[]|null=null;
 constructor(private table:string){}
 select(columns:string){this.columns=columns;return this;}
 eq(column:string,value:unknown){this.filters.push(identifier(column)+"="+quote(value));return this;}
 order(column:string,options?:{ascending?:boolean}){this.sorting=" order by "+identifier(column)+(options?.ascending===false?" desc":" asc");return this;}
 single(){this.one=true;return this;}
 maybeSingle(){this.one=true;return this;}
 insert(values:Record<string,unknown>|Record<string,unknown>[]){this.inserted=Array.isArray(values)?values:[values];return this;}
 async then<T>(resolve:(value:{data:unknown;error:null|{code:string;message:string}})=>T):Promise<T>{
  try{
   const columns=this.columns==="*"?"*":this.columns.split(",").map(identifier).join(",");
   let statement:string;
   if(this.inserted){
    const keys=Object.keys(this.inserted[0]);
    statement="with inserted as (insert into "+identifier(this.table)+"("+keys.map(identifier).join(",")+") values "+
     this.inserted.map(row=>"("+keys.map(k=>quote(row[k])).join(",")+")").join(",")+" returning "+columns+") select coalesce(jsonb_agg(to_jsonb(t)),'[]') from inserted t;";
   }else statement="select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select "+columns+" from "+identifier(this.table)+(this.filters.length?" where "+this.filters.join(" and "):"")+this.sorting+") t;";
   const rows=JSON.parse(sql(statement));return resolve({data:this.one?(rows[0]??null):rows,error:null});
  }catch(error){return resolve(failure(error));}
 }
}
function dbAdapter(){
 return {from:(table:string)=>new TableQuery(table),rpc:async(name:string,args:Record<string,unknown>)=>{
  const call=identifier(name)+"("+Object.entries(args).map(([k,v])=>identifier(k)+"=>"+(k==="p_market_ids"?"ARRAY["+((v as string[]).map(quote)).join(",")+"]::text[]":quote(v))).join(",")+")";
  try {return {data:JSON.parse(sql(["join_event_league","read_event_picks"].includes(name)?"select coalesce(jsonb_agg(to_jsonb(t)),'[]') from "+call+" t;":"select coalesce(to_jsonb("+call+"),'null'::jsonb);")),error:null};}
  catch(error){return failure(error);}
 }} as unknown as SupabaseClient;
}

describe.runIf(process.env.RUN_EVENT_APPLICATION_DB==="1")("reviewed round service integration",()=>{
 for(const key of ["wwc-2027","ucl-2026-27"])it(key+" preserves saved picks and adopts a complete explicit review",async()=>{
  const db=dbAdapter(),created=await createApplicationLeague(db,{templateKey:key,name:"Pairing rehearsal",startsAt:new Date(Date.now()+86400000).toISOString(),timeZone:"UTC",syntheticAcknowledged:true});
  const id=created.id,token=created.organizerCredential;
  let state=await readApplication(db,id,{organizer:token});
  const player=await createEventRepository(db).join(id,state.invitation!,"Synthetic pairing player");
  const early=state.windows.find(w=>w.state==="open")!;
  await submitApplicationPicks(db,id,player.credential,{windowId:early.id,version:early.version,picks:Object.fromEntries(early.markets.map(m=>[m.id,"draw"]))});
  const saved=sql("select jsonb_agg(to_jsonb(p) order by slot_id) from picks p where league_id="+quote(id));
  const target=state.windows.find(w=>w.state==="unopened")!;
  const pairings:Record<string,[string,string]>={};
  const placements=new Map<string,string>();let index=0;
  for(const m of target.markets) pairings[m.id]=m.sources.map(s=>{
   const source=JSON.stringify(s);if(placements.has(source))return placements.get(source)!;
   const id=key==="wwc-2027"&&s.kind==="reviewed-placement"
    ?state.entrants.find(e=>e.id.endsWith(":entrant:"+s.placement[0]+"."+s.placement[1]))!.id
    :state.entrants[index++].id;
   placements.set(source,id);return id;
  }) as [string,string];
  const input=()=>({windowId:target.id,version:state.windows.find(w=>w.id===target.id)!.version,configurationVersion:state.configurationVersion,basisToken:state.basisToken!,pairings,reason:"Explicit synthetic review"});
  await expect(reviewApplicationPairings(db,id,token,input())).rejects.toMatchObject({code:"conflict"});
  // Real mutation RPCs, one SQL transaction to resolve only original synthetic prerequisite matches.
  const mids=state.windows.filter(w=>w.state==="open").flatMap(w=>w.markets.map(m=>m.id));
  sql("do $test$ declare mid text; snap jsonb; begin foreach mid in array ARRAY["+mids.map(quote).join(",")+"] loop snap:=capture_event_lifecycle("+quote(id)+"); perform mutate_event_lifecycle("+quote(id)+","+quote(token)+",mid,'override','{\"outcome\":{\"kind\":\"draw\"}}','Synthetic prerequisite',snap->'basis'->'effective'->mid->>'effectiveToken',null,'prereq:'||mid); end loop; end $test$;");
  state=await readApplication(db,id,{organizer:token});
  await expect(reviewApplicationPairings(db,id,player.credential,input())).rejects.toMatchObject({code:"unauthorized"});
  await reviewApplicationPairings(db,id,token,input());
  expect(sql("select jsonb_agg(to_jsonb(p) order by slot_id) from picks p where league_id="+quote(id))).toBe(saved);
  state=await readApplication(db,id,{organizer:token});
  expect(state.configurationVersion).toBe(2);
  expect(state.view.state).not.toBe("reconciliation-pending");
  const reviewed=state.windows.find(w=>w.id===target.id)!;
  expect(reviewed.pairingsReviewed).toBe(true);
  await changeApplicationWindow(db,id,token,{windowId:target.id,version:reviewed.version,operation:"open",cutoff:new Date(Date.now()+3600000).toISOString()});
  state=await readApplication(db,id,{organizer:token});
  const open=state.windows.find(w=>w.id===target.id)!;
  await submitApplicationPicks(db,id,player.credential,{windowId:open.id,version:open.version,picks:Object.fromEntries(open.markets.map(m=>[m.id,m.domain==="regulation-home-draw-away"?"draw":pairings[m.id][0]]))});
  await applicationConsent(db,id,player.credential,{role:"participant",kinds:["broadcast"],enabled:true});
  state=await readApplication(db,id,{organizer:token});
  await applicationBroadcast(db,id,token,{message:"Synthetic broadcast only",idempotencyKey:"pairing-broadcast"});
  expect(sql("select count(*) from notification_outbox where league_id="+quote(id)+" and intent_type='broadcast'")).toBe("1");
  await applicationConsent(db,id,player.credential,{role:"participant",kinds:["broadcast"],enabled:false});
  await changeApplicationWindow(db,id,token,{windowId:open.id,version:open.version,operation:"lock"});
  state=await readApplication(db,id,{organizer:token});
  const before=sql("select jsonb_agg(to_jsonb(p) order by slot_id) from picks p where league_id="+quote(id));
  const result=await reviewApplicationPairings(db,id,token,input());
  expect(result.status).toBe("held");
  expect(sql("select jsonb_agg(to_jsonb(p) order by slot_id) from picks p where league_id="+quote(id))).toBe(before);
  expect((await createLifecycleRepository(db).capture(id)).basis.configurationVersion).toBe(2);
  state=await readApplication(db,id,{organizer:token});expect(state.view.state).toBe("held");
 },180000);
});
