import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe,it,expect,vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { listEventDefinitions } from "../../lib/events/catalog";
import { applicationChoices, type PickMarket } from "../../lib/events/application-picks";
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
vi.mock("../../lib/events/application",async importOriginal=>({
 ...await importOriginal<typeof import("../../lib/events/application")>(),
 applicationClient:()=>dbAdapter(),
}));
import { POST as create } from "../../app/events/create/route";
import { POST,GET } from "../../app/events/[id]/data/route";
type Jar={cookie:string};
const origin="http://127.0.0.1:3137";
async function request(id:string|null,jar:Jar,body?:unknown){
 const path=id?"/events/"+id+"/data":"/events/create";
 const req=new NextRequest(origin+path,{method:body?"POST":"GET",headers:{Origin:origin,Host:new URL(origin).host,"Content-Type":"application/json",Cookie:jar.cookie},...(body?{body:JSON.stringify(body)}:{})});
 const result=id?(body?await POST(req,{params:Promise.resolve({id})}):await GET(req,{params:Promise.resolve({id})})):await create(req);
 const set=result.headers.get("set-cookie");if(set)jar.cookie=[jar.cookie,set.split(";")[0]].filter(Boolean).join("; ");
 return {status:result.status,body:await result.json(),cookie:set};
}
describe.runIf(process.env.RUN_EVENT_APPLICATION_DB==="1")("actual route handlers → application → service_role SQL (local only)",()=>{
 it("creates all nine and proves scoped join/picks/lock/typed result/provenance",async()=>{
  for(const d of listEventDefinitions().filter(d=>!process.env.EVENT_APPLICATION_TEMPLATE||d.key===process.env.EVENT_APPLICATION_TEMPLATE)){
   const admin={cookie:""},player={cookie:""},publicViewer={cookie:""};
   const created=await request(null,admin,{templateKey:d.key,name:"Synthetic app "+d.key,startsAt:new Date(Date.now()+86400000).toISOString(),timeZone:"America/Los_Angeles",syntheticAcknowledged:true,...(d.key==="oscars-2027"?{categories:["Picture"]}:{})});
   expect(created.status,d.key+" create "+JSON.stringify(created.body)).toBe(201);expect(created.cookie).toContain("HttpOnly");
   const id=created.body.id;let state=await request(id,admin);
   expect(state.status,d.key+" read "+JSON.stringify(state.body)).toBe(200);
   expect(state.body.view.state).toBe("active");expect(Object.keys(created.body)).toEqual(["id"]);
   const join=await request(id,player,{action:"join",invitation:state.body.invitation,displayName:"Synthetic player"});
   expect(join.status,d.key+" join").toBe(200);expect(join.body).toEqual({ok:true});
   expect((await request(id,publicViewer,{action:"freeze",frozen:true})).status).toBe(403);
   if(d.key==="ncaa-men-2027"){
    for(const structural of state.body.windows.flatMap((w:{markets:{id:string;scored:boolean;eligible:string[]}[]})=>w.markets).filter((m:{scored:boolean})=>!m.scored)){
     const e=state.body.view.effective[structural.id];
     expect((await request(id,admin,{action:"result",command:{action:"override",marketId:structural.id,payload:{outcome:{kind:"winner",entrant:structural.eligible[0]}},reason:"Synthetic opening qualification",expectedEffectiveToken:e.effectiveToken,idempotencyKey:randomUUID()}})).status).toBe(200);
    }
    const scored=state.body.windows.find((w:{markets:{scored:boolean}[]})=>w.markets.some(m=>m.scored));
    expect((await request(id,admin,{action:"window",windowId:scored.id,version:scored.version,operation:"open"})).status).toBe(200);
    state=await request(id,admin);
   }
   const window=state.body.windows.find((w:{state:string})=>w.state==="open");
   expect(window,d.key+" open window").toBeTruthy();
   const m=window.markets[0];
   {
    const picks:Record<string,string>={};
    const all=state.body.windows.flatMap((w:{markets:PickMarket[]})=>w.markets);
    for(const market of window.markets) picks[market.id]=market.domain==="regulation-home-draw-away"?"draw":applicationChoices(market,all,picks)[0];
    expect((await request(id,player,{action:"submit",windowId:window.id,version:window.version,picks})).status,d.key+" submit").toBe(200);
    const privateCheck=await request(id,publicViewer);expect(privateCheck.status,d.key+" prelock read "+JSON.stringify(privateCheck.body)).toBe(200);expect(privateCheck.body.picks).toEqual([]);
    const ownCheck=await request(id,player);expect(ownCheck.status,d.key+" own read").toBe(200);expect(ownCheck.body.picks.length).toBe(window.markets.length);
   }
   expect((await request(id,admin,{action:"window",windowId:window.id,version:window.version,operation:"lock"})).status,d.key+" lock").toBe(200);
   state=await request(id,admin);
   const current=state.body.view.effective[m.id],command={action:"override",marketId:m.id,payload:{outcome:m.domain==="nomination-winner-set"?{kind:"winner-set",entrants:[m.choices[0]]}:m.domain==="regulation-home-draw-away"?{kind:"draw"}:{kind:"winner",entrant:m.eligible[0]}},
    reason:"Synthetic application oracle",expectedEffectiveToken:current.effectiveToken,expectedCanonicalToken:current.canonicalToken,idempotencyKey:randomUUID()};
   expect((await request(id,admin,{action:"result",command})).status,d.key+" result").toBe(200);
   expect((await request(id,admin,{action:"result",command:{...command,idempotencyKey:randomUUID()}})).status).toBe(409);
   const after=await request(id,publicViewer);
   expect(after.status,d.key+" public read "+JSON.stringify(after.body)).toBe(200);
   expect(after.body.invitation).toBeNull();expect(after.body.view.effective[m.id].source).toBe("override");
   expect(JSON.stringify(after.body)).not.toMatch(/magic_token|organizer_token|push_subscription/);
   if(d.key==="oscars-2027"){
    expect(after.body.view.state).toBe("complete");expect(after.body.view.leaderboard[0].earned).toBe(1);
    for(const change of [{action:"hold",payload:{held:true},state:"held"},{action:"hold",payload:{held:false},state:"complete"},{action:"release",payload:{},state:"locked"}]){
     const fresh=(await request(id,admin)).body.view.effective[m.id];
     expect((await request(id,admin,{action:"result",command:{...change,state:undefined,marketId:m.id,reason:"Synthetic lifecycle control",expectedEffectiveToken:fresh.effectiveToken,expectedCanonicalToken:fresh.canonicalToken,idempotencyKey:randomUUID()}})).status).toBe(200);
     expect((await request(id,publicViewer)).body.view.state).toBe(change.state);
    }
   }
   console.info("Verified synthetic application:",d.key);
  }
 },300000);
});
