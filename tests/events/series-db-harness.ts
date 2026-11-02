import { execFileSync } from "node:child_process";
import type { SupabaseClient } from "@supabase/supabase-js";
export const quote=(v:unknown):string=>v===null||v===undefined?"null":"'"+String(typeof v==="object"?JSON.stringify(v):v).replaceAll("'","''")+"'";
const identifier=(v:string)=>{if(!/^[a-z_]+$/.test(v))throw new Error("Invalid test SQL identifier");return '"'+v+'"';};
export function sql(statement:string,owner=false):string {
 const database=process.env.BRACKET_SERIES_TEST_DATABASE;
 if(!database || !/^bracket_series_[a-f0-9]{12}$/.test(database))throw new Error("Dedicated owned series DB required");
 return execFileSync("docker",["exec","-i","supabase_db_bracket-fyi","psql","-X","-U","postgres","-d",database,"-Atq","-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose"],
  {input:(owner?"":"set role service_role; ")+statement,encoding:"utf8",timeout:60000,maxBuffer:32*1024*1024,stdio:["pipe","pipe","pipe"]}).trim();
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
export function dbAdapter(){
 return {from:(table:string)=>new TableQuery(table),rpc:async(name:string,args:Record<string,unknown>)=>{
  const call=identifier(name)+"("+Object.entries(args).map(([k,v])=>identifier(k)+"=>"+(k==="p_market_ids"?"ARRAY["+((v as string[]).map(quote)).join(",")+"]::text[]":quote(v))).join(",")+")";
  try {return {data:JSON.parse(sql(["join_event_league","read_event_picks"].includes(name)?"select coalesce(jsonb_agg(to_jsonb(t)),'[]') from "+call+" t;":"select coalesce(to_jsonb("+call+"),'null'::jsonb);")),error:null};}
  catch(error){return failure(error);}
 }} as unknown as SupabaseClient;
}
