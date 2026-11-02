/** Explicit local disposable DB adapter, patterned after application-db.test.ts.
 * SQL and generated credentials travel on stdin only; subprocess diagnostics are suppressed.
 */
import { execFileSync } from "node:child_process";
import type { SupabaseClient } from "@supabase/supabase-js";
export const quote=(v:unknown):string=>v===null||v===undefined?"null":"'"+String(typeof v==="object"?JSON.stringify(v):v).replaceAll("'","''")+"'";
const ident=(v:string)=>{if(!/^[a-z_]+$/.test(v))throw new Error("Invalid SQL identifier");return '"'+v+'"';};
export function fixtureDatabase(database:string,container="supabase_db_bracket-fyi") {
 if(container!=="supabase_db_bracket-fyi"&&!/^bracket-p11-db-[a-f0-9]{12}$/.test(container))throw new Error("Known local or owned isolated container required");
 if(!/^bracket_[a-z0-9_]{6,50}$/.test(database))throw new Error("Disposable database required");
 function sql(statement:string) {
  try{return execFileSync("docker",["--host","unix:///var/run/docker.sock","exec","-i",container,"psql","-X","-U","postgres","-d",database,"-Atq","-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose"],
   {input:statement,encoding:"utf8",timeout:120000,maxBuffer:32*1024*1024,stdio:["pipe","pipe","pipe"]}).trim();}
  catch(error){const code=String((error as {stderr?:unknown}).stderr??"").match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1]??"XX000";throw new Error("Local fixture SQL rejected ("+code+"); private DB retained");}
 }
 class Query {
  columns="*";filters:string[]=[];sorting="";one=false;inserted:Record<string,unknown>[]|null=null;
  constructor(readonly table:string){}
  select(columns:string){this.columns=columns;return this;}
  eq(column:string,value:unknown){this.filters.push(ident(column)+"="+quote(value));return this;}
  order(column:string,options?:{ascending?:boolean}){this.sorting=" order by "+ident(column)+(options?.ascending===false?" desc":" asc");return this;}
  single(){this.one=true;return this;} maybeSingle(){this.one=true;return this;}
  insert(values:Record<string,unknown>|Record<string,unknown>[]){this.inserted=Array.isArray(values)?values:[values];return this;}
  async then<T>(resolve:(value:{data:unknown;error:null})=>T):Promise<T>{
   const columns=this.columns==="*"?"*":this.columns.split(",").map(ident).join(",");
   let statement:string;
   if(this.inserted){const keys=Object.keys(this.inserted[0]);statement="with inserted as (insert into "+ident(this.table)+"("+keys.map(ident).join(",")+") values "+this.inserted.map(row=>"("+keys.map(k=>quote(row[k])).join(",")+")").join(",")+" returning "+columns+") select coalesce(jsonb_agg(to_jsonb(t)),'[]') from inserted t;";}
   else statement="select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select "+columns+" from "+ident(this.table)+(this.filters.length?" where "+this.filters.join(" and "):"")+this.sorting+") t;";
   const rows=JSON.parse(sql("set role service_role;"+statement));return resolve({data:this.one?(rows[0]??null):rows,error:null});
  }
 }
 const client={from:(table:string)=>new Query(table),rpc:async(name:string,args:Record<string,unknown>)=>{
  const call=ident(name)+"("+Object.entries(args).map(([k,v])=>ident(k)+"=>"+(k==="p_market_ids"?"ARRAY["+((v as string[]).map(quote)).join(",")+"]::text[]":quote(v))).join(",")+")";
  const data=JSON.parse(sql("set role service_role;"+(["join_event_league","read_event_picks"].includes(name)?"select coalesce(jsonb_agg(to_jsonb(t)),'[]') from "+call+" t;":"select coalesce(to_jsonb("+call+"),'null'::jsonb);")));
  return {data,error:null};
 }} as unknown as SupabaseClient;
 return {sql,client};
}
