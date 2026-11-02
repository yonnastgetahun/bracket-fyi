import { createHash } from "node:crypto";
import { z } from "zod";
import type { NotificationKind } from "./notifications";

const id=z.string().trim().min(1).max(200);
const time=z.string().datetime({offset:true});
const common={leagueId:z.string().uuid()};
const revision=z.number().int().positive().safe();
/** Trusted scheduler observations only; never accept these through browser routes.
 * revision is the persisted schedule/window revision, not a polling/run ID.
 * episodeStartedAt is the persisted health transition, not the last poll time.
 */
export const runtimeSignalSchema=z.discriminatedUnion("kind",[
 z.object({...common,kind:z.literal("lock_reminder"),windowId:id,revision,cutoff:time}).strict(),
 z.object({...common,kind:z.literal("contest_live"),contestId:id,revision,startsAt:time}).strict(),
 z.object({...common,kind:z.literal("schedule_change"),contestId:id,revision,changedAt:time}).strict(),
 z.object({...common,kind:z.literal("provider_stale"),bindingId:id,episodeStartedAt:time}).strict(),
]);
export type RuntimeSignal=z.infer<typeof runtimeSignalSchema>;
export const runtimeSignalsSchema=z.array(runtimeSignalSchema).max(500);
interface ProducerPorts {
 read(league:string):Promise<{basisToken:string;state:string;generation:number;evaluatedGeneration:number}>;
 emit(league:string,kind:NotificationKind,key:string,basis:string,expiry:string|null):Promise<number>;
}
export async function produceRuntimeNotifications(ports:ProducerPorts, input:readonly unknown[], now:Date) {
 const signals=runtimeSignalsSchema.parse(input);
 if(!Number.isFinite(now.getTime())) throw new Error("Invalid runtime clock");
 let emitted=0,skipped=0;
 const failed:{index:number;code:string}[]=[];
 for(const [index,signal] of signals.entries()){
  let identity:unknown[],start:number,end:number;
  switch(signal.kind){
   case "lock_reminder":
    end=Date.parse(signal.cutoff);start=end-3600000;
    identity=[signal.windowId,signal.revision,new Date(end).toISOString()];break;
   case "contest_live":
    start=Date.parse(signal.startsAt);end=start+3600000;
    identity=[signal.contestId,signal.revision,new Date(start).toISOString()];break;
   case "schedule_change":
    start=Date.parse(signal.changedAt);end=start+86400000;
    identity=[signal.contestId,signal.revision];break;
   case "provider_stale":
    start=Date.parse(signal.episodeStartedAt);end=start+3600000;
    identity=[signal.bindingId,new Date(start).toISOString()];break;
  }
  if(now.getTime()<start || now.getTime()>=end){skipped++;continue;}
  try{
   const view=await ports.read(signal.leagueId);
   if(view.state==="reconciliation-pending" || view.state==="held" || view.generation!==view.evaluatedGeneration){skipped++;continue;}
   const key="runtime:v1:"+signal.kind+":"+createHash("sha256")
    .update(JSON.stringify([signal.leagueId,signal.kind,...identity])).digest("hex");
   emitted+=await ports.emit(signal.leagueId,signal.kind,key,view.basisToken,new Date(end).toISOString());
  }catch{
   // No inline retries with a captured stale basis. Next tick reads a fresh view.
   failed.push({index,code:"producer-unavailable"});
  }
 }
 return {emitted,skipped,failed};
}
