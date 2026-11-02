import type { SlotSource, SyntheticManifest } from "./catalog";
import type { TrustedFeasibleComponent } from "./scoring-bridge";
import { uclTieWorlds } from "./ucl-tie";

type World = Record<string, string[]>;
const unknown = Symbol("unknown-synthetic-domain");

/**
 * Server-owned, original synthetic rules only. Exhaustive bounded enumeration,
 * never sampled worlds. Unknown placements, reseeding or excess work discard the
 * entire connected factor, including any supported markets coupled to it.
 * No provider fixture, qualification review or goal-margin evidence is invented.
 */
export function buildSyntheticFeasibility(
  catalog: SyntheticManifest, graphVersion: number, worldLimit = 4096,
): TrustedFeasibleComponent[] {
  if (catalog.synthetic !== true || !Number.isSafeInteger(graphVersion) || graphVersion < 1 ||
      !Number.isSafeInteger(worldLimit) || worldLimit < 1 || worldLimit > 65536)
    throw new Error("Invalid synthetic feasibility request");
  const all = new Map(catalog.markets.map(m=>[m.id,m]));
  const entrants = new Set(catalog.entrants.map(e=>e.id));
  if (all.size !== catalog.markets.length) throw new Error("Duplicate synthetic market");
  function references(s: SlotSource): string[] {
    if (s.kind === "entrant") return [];
    if (s.kind === "reviewed-placement") return [...s.marketIds];
    if (s.kind === "reseed") return s.pool.flatMap(references);
    return [s.marketId];
  }
  const dependencies = new Map(catalog.markets.map(m=>[m.id,
    [...new Set([...m.inputs.flatMap(references),...m.dependsOn])]]));
  const neighbors = new Map(catalog.markets.map(m=>[m.id,new Set<string>()]));
  for (const [id,refs] of dependencies) for (const ref of refs) {
    if (!all.has(ref)) throw new Error("Missing synthetic source market");
    neighbors.get(id)!.add(ref); neighbors.get(ref)!.add(id);
  }
  const visited = new Set<string>();
  return catalog.markets.flatMap<TrustedFeasibleComponent>(root=>{
    if (visited.has(root.id)) return [];
    const ids: string[] = [];
    function collect(id: string) {
      if (visited.has(id)) return;
      visited.add(id); ids.push(id); neighbors.get(id)!.forEach(collect);
    }
    collect(root.id);
    const marketIds = ids.filter(id=>all.get(id)!.scored);
    if (!marketIds.length) return [];
    try {
      const ordered: string[] = [], active = new Set<string>(), done = new Set<string>();
      function order(id: string) {
        if (active.has(id)) throw unknown;
        if (done.has(id)) return;
        active.add(id); dependencies.get(id)!.forEach(order);
        active.delete(id); done.add(id); ordered.push(id);
      }
      ids.forEach(order);
      // Structural membership and reviewed placements need their own actual
      // qualification evidence; a synthetic flag does not supply that evidence.
      if (ids.some(id=>!all.get(id)!.scored || all.get(id)!.inputs.some(s=>
        s.kind === "reviewed-placement" || s.kind === "reseed"))) throw unknown;
      function slots(s: SlotSource, world: World): string[] {
        if (s.kind === "entrant") {
          if (!entrants.has(s.entrantId)) throw unknown;
          return [s.entrantId];
        }
        if (s.kind !== "winner" && s.kind !== "loser") throw unknown;
        const winner = world[s.marketId];
        if (!winner || winner.length !== 1 || winner[0] === "draw") throw unknown;
        if (s.kind === "winner") return winner;
        const members = all.get(s.marketId)!.inputs.flatMap(p=>slots(p,world));
        if (members.length !== 2 || new Set(members).size !== 2) throw unknown;
        return members.filter(id=>id!==winner[0]);
      }
      function choices(id: string, world: World): string[][] {
        const m = all.get(id)!, members = m.inputs.flatMap(s=>slots(s,world));
        if (!members.length || new Set(members).size !== members.length) throw unknown;
        if (m.outcomeDomain === "nomination-winner-set") {
          if (members.length > 16 || 2 ** members.length - 1 > worldLimit) throw unknown;
          return Array.from({length:2 ** members.length - 1},(_,n)=>members.filter((_,i)=>(n+1)&(2**i)));
        }
        if (members.length !== 2) throw unknown;
        if (m.outcomeDomain === "aggregate-qualifier") {
          const legs = m.legMarketIds?.map(leg=>all.get(leg));
          if (!legs || legs.length!==2 || legs.some((leg,i)=>!leg || leg.tieId!==m.tieId ||
              leg.leg!==i+1 || leg.outcomeDomain!=="regulation-home-draw-away" ||
              !m.dependsOn.includes(leg.id))) throw unknown;
          const pairings = legs.map(leg=>leg!.inputs.flatMap(s=>slots(s,world)));
          if (pairings.some(pair=>pair.length!==2 || new Set(pair).size!==2 ||
              pair.some(entrant=>!members.includes(entrant)))) throw unknown;
          const feasible = uclTieWorlds({teamA:members[0],teamB:members[1],
            firstLeg:{home:pairings[0][0],away:pairings[0][1],score:null},
            secondLeg:{home:pairings[1][0],away:pairings[1][1],score:null},qualifier:null});
          return [...new Set(feasible!.filter(w=>w.leg1[0]===world[legs[0]!.id]?.[0] &&
            w.leg2[0]===world[legs[1]!.id]?.[0]).map(w=>w.qualifier[0]))].map(id=>[id]);
        }
        if (m.outcomeDomain === "regulation-home-draw-away") return [...members,"draw"].map(id=>[id]);
        if (m.outcomeDomain === "winner-including-overtime" || m.outcomeDomain === "series-winner")
          return members.map(id=>[id]);
        throw unknown;
      }
      const worlds: World[] = [];
      const current: World = {};
      function enumerate(index: number) {
        if (index === ordered.length) {
          if (worlds.length === worldLimit) throw unknown;
          worlds.push({...current}); return;
        }
        const id = ordered[index];
        for (const choice of choices(id,current)) {
          current[id] = choice; enumerate(index+1);
        }
        delete current[id];
      }
      enumerate(0);
      if (!worlds.length) throw unknown;
      return [{marketIds,worlds,evidence:{reviewed:true as const,graphVersion,
        reference:"original-synthetic-exhaustive-rules-v1"}}];
    } catch (error) {
      if (error !== unknown) throw error;
      return [{marketIds,worlds:null,evidence:null}];
    }
  });
}
