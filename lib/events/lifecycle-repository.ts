import { z } from "zod";
import { EventCommandError, type EventRpcClient } from "./repository";
import { lifecycleViewSchema, type LifecycleCapture } from "./lifecycle";
import type { EventScoreRow } from "./scoring-bridge";
import type { Outcome } from "./outcomes";

export type LifecycleMutation =
 | {action:"override";payload:{outcome:Outcome;expiresAt?:string|null}}
 | {action:"release";payload:Record<string,never>}
 | {action:"hold";payload:{held:boolean}}
 | {action:"disposition";payload:{excluded:boolean}};
export type LifecycleCommand = LifecycleMutation & {
 marketId:string; reason:string; expectedEffectiveToken:string;
 expectedCanonicalToken?:string; idempotencyKey:string;
};
const commitResult=z.object({state:z.enum(["active","locked","complete","held"]),replayed:z.boolean(),coronation:z.boolean()});
async function rpc(client:EventRpcClient,name:string,args:Record<string,unknown>) {
 const {data,error}=await client.rpc(name,args);
 if(error) throw new EventCommandError(error.code==="42501"?"unauthorized":(error.code==="PT409" || error.code==="40001")?"conflict":
  ["22023","23514","22P02","22007"].includes(error.code??"")?"invalid":"unavailable");
 return data;
}
/** Server-only. Credential comes from verified HttpOnly organizer session.
 * Do not expose capture/commit/scan through browser-callable endpoints. */
export function createLifecycleRepository(client:EventRpcClient) {
 return {
  async mutate(leagueId:string,organizerCredential:string,command:LifecycleCommand) {
   return rpc(client,"mutate_event_lifecycle",{p_league_id:leagueId,p_organizer_token:organizerCredential,
    p_market_id:command.marketId,p_action:command.action,p_payload:command.payload,p_reason:command.reason,
    p_expected_effective_token:command.expectedEffectiveToken,p_expected_canonical_token:command.expectedCanonicalToken??null,
    p_idempotency_key:command.idempotencyKey});
  },
  async capture(leagueId:string):Promise<LifecycleCapture> {
   const value=await rpc(client,"capture_event_lifecycle",{p_league_id:leagueId});
   // Full scoring/graph validation follows in evaluateLifecycle. Never expose raw capture.
   if(!value || typeof value!=="object" || !("basis" in value) || !("leagueId" in value) || value.leagueId!==leagueId) throw new EventCommandError("unavailable");
   return value as LifecycleCapture;
  },
  async commit(capture:LifecycleCapture,leaderboard:readonly EventScoreRow[]) {
   return commitResult.parse(await rpc(client,"commit_event_lifecycle",{p_league_id:capture.leagueId,p_generation:capture.generation,
    p_basis_token:capture.basisToken,p_leaderboard:leaderboard}));
  },
  async read(leagueId:string) {
   // zod strips unknown envelope fields. DB reader itself contains no private picks.
   const parsed=lifecycleViewSchema.safeParse(await rpc(client,"read_event_lifecycle",{p_league_id:leagueId}));
   if(!parsed.success) throw new EventCommandError("unavailable");
   return parsed.data;
  },
  async scan(after:string|null=null,limit=100) {
   return z.array(z.object({league_id:z.string().uuid(),generation:z.number().int().positive().safe().nullable(),
     error_code:z.literal("invalid-basis").nullable().optional()}))
    .parse(await rpc(client,"scan_event_lifecycle_work",{p_after:after,p_limit:limit}));
  },
 };
}
