import type { AdapterRegistry } from "@/lib/ingestion/orchestrator/ports";
import type { ProviderAdapter } from "@/lib/ingestion/providers/provider-adapter";
import type { BdlFetch } from "@/lib/ingestion/providers/balldontlie";
import { BdlRouterAdapter } from "@/lib/ingestion/providers/balldontlie-router";

/** Pass as createEventIngestionRuntime dependencies.adapters. Transport is explicit;
 * constructing a registry never enables a job, resolves credentials or performs I/O.
 * Other providers remain explicit; a family-specific BDL adapter cannot replace routing.
 */
export function createEventProviderRegistry(input:{
 fetch:BdlFetch;
 otherAdapters?:readonly ProviderAdapter[];
}):AdapterRegistry {
 const bdl=new BdlRouterAdapter({fetch:input.fetch});
 const adapters=new Map<string,ProviderAdapter>([[bdl.key,bdl]]);
 for(const adapter of input.otherAdapters??[]) {
  if(adapters.has(adapter.key)) throw new Error("Duplicate event provider adapter key");
  adapters.set(adapter.key,adapter);
 }
 return {get:key=>adapters.get(key)};
}
