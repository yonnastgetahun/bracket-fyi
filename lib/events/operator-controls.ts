/** Shared SQL integration contract (migration 00008).
 * Notification owner: acquire SELECT ... FOR SHARE on event_runtime_control
 * WHERE singleton=true BEFORE binding/event/league/attempt locks; global_stopped=true denies.
 * Operator global.stop updates the same singleton FOR UPDATE. Local environment is pinned.
 * notification.control delegates to 00007's set_event_notification_control
 * with an exact null-event/environment/action grant plus version/reason/audit.
 * The old uncredentialed setter is private after 00008.
 * Notification controls remain separately owned by 00007. Do not duplicate provider controls.
 * assert_event_operator(credential,environment,eventId,action) resolves registry actor;
 * callable inside SECURITY DEFINER functions only (not granted to service_role).
 */
export interface ProviderAttemptControls {
 admit(input: {runId:string;leaseToken:string;attemptKey:string}):Promise<{
  allowed:boolean;permitId?:string;startDeadline?:string;
 }>;
 start(input:{permitId:string;runId:string;leaseToken:string}):Promise<boolean>;
 complete(input:{permitId:string;runId:string;leaseToken:string;uncertain:boolean}):Promise<void>;
}

import { z } from "zod";
import type { EventRpcClient } from "./repository";
const permitSchema = z.object({allowed:z.boolean(),permitId:z.string().uuid().optional(),startDeadline:z.string().datetime({offset:true}).optional()});
/** Service job identity is its current run lease, never an operator credential. */
export function createProviderAttemptControls(client:EventRpcClient):ProviderAttemptControls {
 async function rpc(name:string,args:Record<string,unknown>) {
  const {data,error}=await client.rpc(name,args);
  if(error) throw new Error("Provider attempt control unavailable");
  return data;
 }
 return {
  async admit(input) {
   return permitSchema.parse(await rpc("admit_event_provider_attempt",{
    p_run_id:input.runId,p_lease_token:input.leaseToken,p_attempt_key:input.attemptKey}));
  },
  async start(input) {
   return z.boolean().parse(await rpc("start_event_provider_attempt",{
    p_permit_id:input.permitId,p_run_id:input.runId,p_lease_token:input.leaseToken}));
  },
  async complete(input) {
   await rpc("complete_event_provider_attempt",{
    p_permit_id:input.permitId,p_run_id:input.runId,p_lease_token:input.leaseToken,p_uncertain:input.uncertain});
  },
 };
}
