import { z } from "zod";
import { scoreEvent, type EventScoreInput, type EventScoreRow } from "./scoring-bridge";
import { parseOutcome, type Outcome } from "./outcomes";
import { EventCommandError } from "./repository";

export interface EffectiveLifecycleResult {
  outcome: Outcome;
  source: "override" | "canonical" | "unresolved";
  canonicalResultId: string | null;
  canonicalVersion: number;
  canonicalToken: string;
  overrideId: string | null;
  overrideRevision: number;
  expiresAt: string | null;
  derivedProvenance: unknown;
  held: boolean;
  excluded: boolean;
  effectiveToken: string;
  provenanceToken: string;
}
/** Server-only capture. Contains private picks; never serialize this to clients. */
export interface LifecycleCapture {
  leagueId: string;
  generation: number;
  basisToken: string;
  basis: {
    configurationVersion: number;
    manifest: EventScoreInput["edition"]["catalog"] & {
      lifecycle: Pick<EventScoreInput, "binding" | "components" | "weights">;
    };
    windows: {id:string; version:number; state:"unopened"|"open"|"locked"}[];
    participants: EventScoreInput["participants"];
    effective: Record<string, EffectiveLifecycleResult>;
    holds: string[];
    quarantines: string[];
    locked: boolean;
    frozen: boolean;
    disabled: boolean;
  };
}
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const integer = z.number().int().nonnegative().safe();
const row = z.object({ id:z.string(), earned:z.number().finite().nonnegative(), maximum:z.number().finite().nonnegative().nullable(),
  wrong:integer, pending:integer, rank:integer.positive() }).strict();
const displayedOutcome = z.discriminatedUnion("kind", [
  z.object({kind:z.literal("unresolved")}),z.object({kind:z.literal("draw")}),z.object({kind:z.literal("no-contest")}),
  z.object({kind:z.literal("winner"),entrant:z.string()}),
  z.object({kind:z.literal("winner-set"),entrants:z.array(z.string()).min(1)}),
]);
const displayedEffective = z.object({
  outcome:displayedOutcome,source:z.enum(["override","canonical","unresolved"]),
  canonicalResultId:z.string().nullable(),canonicalVersion:integer,canonicalToken:hash,
  overrideId:z.string().nullable(),overrideRevision:integer,expiresAt:z.string().nullable(),
  configurationVersion:integer.positive(),requiredSetRevision:integer,
  derivedProvenance:z.object({algorithm:z.string().nullable(),algorithmVersion:z.union([z.string(),z.number()]).nullable(),
    membershipVersion:integer.positive().nullable().optional(),
    children:z.array(z.object({id:z.string(),version:integer.positive(),resultId:z.string().uuid().nullable().optional()})).nullable()}),
  held:z.boolean(),excluded:z.boolean(),effectiveToken:hash,provenanceToken:hash,
});
export const lifecycleViewSchema = z.object({
  state:z.enum(["active","locked","complete","held","reconciliation-pending"]),
  generation:integer.positive(), evaluatedGeneration:integer, basisToken:hash,
  leaderboard:z.array(row), effective:z.record(z.string(),displayedEffective),
});
export type LifecycleView = z.infer<typeof lifecycleViewSchema>;

/** Trusted sealed manifest + captured DB data only. No separately fetched results,
 * caller-provided leaderboard, or client-provided score input in this interface. */
export function evaluateLifecycle(capture: LifecycleCapture): EventScoreRow[] {
  const b = capture.basis;
  if (!Number.isSafeInteger(capture.generation) || capture.generation < 1 ||
      !/^[a-f0-9]{64}$/.test(capture.basisToken) || !b.manifest.lifecycle ||
      b.manifest.lifecycle.binding.graphVersion !== b.configurationVersion) throw new Error("Invalid lifecycle capture");
  const catalog = b.manifest;
  const marketIds = catalog.markets.map(m=>m.id);
  if (marketIds.length !== Object.keys(b.effective).length || marketIds.some(id=>!b.effective[id])) throw new Error("Incomplete effective basis");
  const excluded = new Set(marketIds.filter(id=>b.effective[id].excluded));
  const lockedWindows = new Set(b.windows.filter(w=>w.state==='locked').map(w=>w.id));
  const revealed = new Set(catalog.markets.filter(m=>lockedWindows.has(m.windowId)).map(m=>m.id));
  const outcomes: Record<string,Outcome> = {};
  for (const market of catalog.markets) {
    const binding = catalog.lifecycle.binding.markets.find(m=>m.marketId===market.id);
    if (!binding) throw new Error("Missing reviewed market binding");
    outcomes[market.id] = parseOutcome(b.effective[market.id].outcome,binding.eligibleEntrantIds,
      market.outcomeDomain === "regulation-home-draw-away" ? ["winner","draw"] :
        market.outcomeDomain === "nomination-winner-set" ? ["winner-set"] : ["winner"]);
  }
  const components = catalog.lifecycle.components.flatMap(c=>{
    const ids=c.marketIds.filter(id=>!excluded.has(id));
    return ids.length ? [{...c,marketIds:ids,worlds:c.worlds?.map(w=>Object.fromEntries(Object.entries(w).filter(([id])=>!excluded.has(id)))) ?? null}] : [];
  });
  const input: EventScoreInput = {
    edition:{catalog:{...catalog,markets:catalog.markets.map(m=>excluded.has(m.id)?{...m,scored:false}:m)} as typeof catalog,graphVersion:b.configurationVersion},
    binding:catalog.lifecycle.binding,
    components,
    windows:Object.fromEntries(b.windows.map(w=>[w.id,w.state])),
    participants:b.participants.map(p=>({...p,picks:Object.fromEntries(Object.entries(p.picks).filter(([id])=>!excluded.has(id) && revealed.has(id)))})),
    outcomes,
    ...(catalog.lifecycle.weights ? {weights:Object.fromEntries(Object.entries(catalog.lifecycle.weights).filter(([id])=>!excluded.has(id)))} : {}),
  };
  return scoreEvent(input);
}

export interface LifecycleWorkerRepository {
  capture(leagueId:string): Promise<LifecycleCapture>;
  commit(capture:LifecycleCapture,leaderboard:readonly EventScoreRow[]): Promise<{state:string;replayed:boolean;coronation:boolean}>;
}
/** A crash before commit leaves dirty work; a crash after commit retries as a no-op.
 * Conflict is surfaced to caller for a fresh capture, never retried with old scores. */
export async function reconcileEventLifecycle(repository:LifecycleWorkerRepository,leagueId:string) {
  const capture = await repository.capture(leagueId);
  return repository.commit(capture,evaluateLifecycle(capture));
}

export interface LifecycleSweepRepository extends LifecycleWorkerRepository {
  scan(after:string|null,limit:number): Promise<{league_id:string;generation:number|null;error_code?:"invalid-basis"|null}[]>;
}
/** Restart-safe bounded sweep. Persist nextCursor only as an optimization; start
 * again at null after reaching the end, so expiry/new dirt behind a cursor recurs.
 * No lease to recover, no deletion/ack until the compare-basis commit succeeds. */
export async function reconcileEventLifecycleSweep(repository:LifecycleSweepRepository,
  options:{after?:string|null;batchSize?:number;maxBatches?:number}={}) {
  const batchSize=options.batchSize??100,maxBatches=options.maxBatches??10;
  if(!Number.isInteger(batchSize)||batchSize<1||batchSize>500||!Number.isInteger(maxBatches)||maxBatches<1||maxBatches>100)
    throw new Error("Invalid lifecycle sweep bound");
  let after=options.after??null,reconciled=0,conflicts=0;
  const failed:{leagueId:string;code:string}[]=[];
  for(let batch=0;batch<maxBatches;batch++){
    const work=await repository.scan(after,batchSize);
    for(const item of work){
      if(item.error_code){
        failed.push({leagueId:item.league_id,code:item.error_code});
      } else if(item.generation!==null){
        try { await reconcileEventLifecycle(repository,item.league_id); reconciled++; }
        catch(error){
          if(error instanceof EventCommandError && error.code==="conflict") conflicts++;
          else failed.push({leagueId:item.league_id,code:error instanceof EventCommandError?error.code:"invalid-basis"});
        }
      }
      after=item.league_id;
    }
    if(work.length<batchSize) return {nextCursor:null,reconciled,conflicts,failed};
  }
  return {nextCursor:after,reconciled,conflicts,failed};
}
