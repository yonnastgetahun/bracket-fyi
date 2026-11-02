import { z } from "zod";
import { deriveSeries } from "./derivation";
import { EventCommandError, type EventRpcClient } from "./repository";

const snapshotSchema=z.object({parentId:z.string().uuid(),membershipVersion:z.number().int().positive(),
 bestOf:z.union([z.literal(3),z.literal(5),z.literal(7)]),entrants:z.array(z.string().uuid()).length(2),held:z.boolean(),basisToken:z.string(),
 children:z.array(z.object({id:z.string().uuid(),resultId:z.string().uuid().nullable(),version:z.number().int().nonnegative(),winner:z.string().uuid().nullable()}))});
async function rpc(client:EventRpcClient,name:string,args:Record<string,unknown>) {
 const {data,error}=await client.rpc(name,args);
 if(error)throw new EventCommandError(error.code==="42501"?"unauthorized":["40001","PT409"].includes(error.code??"")?"conflict":["22023","23514","22P02"].includes(error.code??"")?"invalid":"unavailable");
 return data;
}
/** Shared structure authority is an event operator, never a league organizer.
 * SQL serializes child commits and checks this independently derived proposal.
 */
export function createSeriesRepository(client:EventRpcClient) {
 return {
  async review(credential:string,parentId:string,expectedVersion:number,children:readonly {id:string;replaces?:string}[],reason:string) {
   return rpc(client,"review_event_series",{p_credential:credential,p_parent:parentId,p_expected_version:expectedVersion,p_children:children,p_reason:reason});
  },
  async reconcile(parentId:string) {
   const snapshot=snapshotSchema.parse(await rpc(client,"capture_event_series",{p_parent:parentId}));
   const outcome=snapshot.held?{kind:"unresolved"}:deriveSeries(snapshot.entrants,snapshot.bestOf,snapshot.children.filter(c=>c.resultId!==null)).outcome;
   return rpc(client,"commit_event_series",{p_parent:parentId,p_basis:snapshot.basisToken,p_outcome:outcome});
  },
  async sweep(after:string|null=null,limit=100) {
   if(!Number.isSafeInteger(limit)||limit<1||limit>500)throw new EventCommandError("invalid");
   const ids=z.array(z.string().uuid()).parse(await rpc(client,"scan_event_series",{p_after:after,p_limit:limit}));
   const failed:string[]=[];
   for(const id of ids)try{await this.reconcile(id);}catch{failed.push(id);}
   return {scanned:ids.length,failed,after:ids.at(-1)??after};
  },
 };
}
