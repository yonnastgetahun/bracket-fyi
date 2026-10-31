import { z } from "zod";
import { canonicalKeySchema, providerBatchSchema, type ProviderBatch } from "@/lib/ingestion/contracts";
import { isProviderAdapterError, ProviderAdapterError, type ProviderFailure } from "@/lib/ingestion/errors";
import type { BdlFetch, BdlSport } from "./balldontlie";
import { BdlNflAdapter } from "./balldontlie-nfl";
import { BdlNbaAdapter } from "./balldontlie-nba";
import { BdlMlbAdapter } from "./balldontlie-mlb";
import { BdlNcaabAdapter } from "./balldontlie-ncaab";
import { BdlNcaafAdapter } from "./balldontlie-ncaaf";
import type { ProviderAdapter, PullContext } from "./provider-adapter";

const bindingSchema = z.object({
 bindingId: z.uuid(), eventEditionId: z.uuid(), bindingKey: canonicalKeySchema,
 providerKey: z.literal("balldontlie"), adapterConfigVersion: z.number().int().positive(),
 adapterConfig: z.object({
  mode: z.literal("provider"), sport: z.enum(["nfl","nba","mlb","ncaab","ncaaf"]),
  phase: z.string().optional(),
 }),
});
const phases: Record<BdlSport, readonly (string | undefined)[]> = {
 // NFL's existing reviewed contract predates the explicit phase field.
 nfl: [undefined, "playoffs"], nba: ["playoffs","playin"], mlb: ["postseason"],
 ncaab: ["tournament"], ncaaf: ["cfp"],
};
const invalidBinding = () => new ProviderAdapterError({
 code:"invalid_response",retry:"never",message:"BALLDONTLIE binding requires reviewed configuration",
 details:{reviewRequired:true,reason:"invalid_binding"},
});

/** One registry key, per-pull binding selection. Never cache sport/phase by provider key:
 * concurrent bindings share an account but must not share membership or cursor state.
 */
export class BdlRouterAdapter implements ProviderAdapter {
 readonly key = "balldontlie";
 readonly capabilities = new Set(["schedule","live_status","final_results"] as const);
 private readonly adapters: Record<BdlSport, ProviderAdapter>;
 constructor(dependencies: {fetch:BdlFetch}) {
  this.adapters = {
   nfl:new BdlNflAdapter(dependencies), nba:new BdlNbaAdapter(dependencies),
   mlb:new BdlMlbAdapter(dependencies), ncaab:new BdlNcaabAdapter(dependencies),
   ncaaf:new BdlNcaafAdapter(dependencies),
  };
 }
 classifyError(error:unknown):ProviderFailure {
  return isProviderAdapterError(error) ? error.failure :
   {code:"permanent",retry:"never",message:"BALLDONTLIE pull failed",details:{}};
 }
 async pull(context:PullContext):Promise<ProviderBatch> {
  // Manual manifests do not require a provider binding or credential.
  if(context.adapterConfig?.mode === "manual")
   return providerBatchSchema.parse({observations:[],fetchedCount:0,receivedAt:context.requestedAt});
  const parsed=bindingSchema.safeParse(context);
  if(!parsed.success) throw invalidBinding();
  const {sport,phase}=parsed.data.adapterConfig;
  if(!phases[sport].includes(phase)) throw invalidBinding();
  return this.adapters[sport].pull(context);
 }
}
