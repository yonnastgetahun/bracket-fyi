import { isDeepStrictEqual } from "node:util";
import type { EventDefinition, SlotSource, SyntheticManifest } from "./catalog";
import { competitionRanks, parseOutcome, scoreParticipant, type Outcome, type OutcomeKind, type FeasibleComponent } from "./outcomes";

/** Catalog IDs are canonical IDs, never provider IDs. Version is persisted with picks. */
export interface EventEdition {
  catalog: EventDefinition | SyntheticManifest;
  graphVersion: number;
}
export interface ReviewedMarketBinding {
  marketId: string;
  /** Exact catalog source slots reviewed at graphVersion. */
  inputs: readonly SlotSource[];
  /** All possible canonical entrants, not just today's actual opponents. */
  eligibleEntrantIds: readonly string[];
  /** Actual home/away order; null while pairing is unresolved. Never a prediction. */
  orientation: readonly [string, string] | null;
}
export interface ReviewedGraphBinding {
  reviewed: true;
  graphVersion: number;
  markets: readonly ReviewedMarketBinding[];
}
export interface TrustedFeasibleComponent extends FeasibleComponent {
  /** Attests exhaustive, jointly consistent worlds AND independence from other factors.
   * Only trusted rule/manifest services may construct this; not a client DTO. */
  evidence: { reviewed: true; graphVersion: number; reference: string } | null;
}
export interface EventScoreInput {
  edition: EventEdition;
  binding: ReviewedGraphBinding;
  /** Effective typed outcomes after canonical/override resolution; absence is unresolved. */
  outcomes: Readonly<Record<string, Outcome>>;
  windows: Readonly<Record<string, "unopened" | "open" | "locked">>;
  participants: readonly { id: string; graphVersion: number; picks: Readonly<Record<string, string>> }[];
  components: readonly TrustedFeasibleComponent[];
  /** Complete assignment if provided; default one per scored market, never a bonus. */
  weights?: Readonly<Record<string, number>>;
}
const validId = (id: string) => typeof id === "string" && id.length > 0 && id.trim() === id;
function requireValid(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
function unique(ids: readonly string[]) {
  return ids.every(validId) && new Set(ids).size === ids.length;
}
function validate(input: EventScoreInput) {
  const { catalog, graphVersion } = input.edition;
  const all = new Map(catalog.markets.map(m => [m.id,m]));
  const bindings = new Map(input.binding.markets.map(b => [b.marketId,b]));
  const entrants = new Set(catalog.entrants.map(e => e.id));
  const windows = new Set(catalog.windows.map(w => w.id));
  requireValid(Number.isSafeInteger(graphVersion) && graphVersion > 0 &&
    input.binding.reviewed === true && input.binding.graphVersion === graphVersion, "Unreviewed or stale graph binding");
  requireValid(unique(catalog.markets.map(m=>m.id)) && unique(catalog.entrants.map(e=>e.id)) &&
    unique(catalog.windows.map(w=>w.id)) && unique(input.binding.markets.map(b=>b.marketId)) &&
    bindings.size === all.size && [...bindings.keys()].every(id=>all.has(id)), "Invalid catalog/binding identity");
  requireValid(Object.keys(input.windows).length === windows.size &&
    Object.entries(input.windows).every(([id,state])=>windows.has(id) && ["unopened","open","locked"].includes(state)), "Invalid window state");
  requireValid(Object.keys(input.outcomes).every(id=>all.has(id)), "Unknown outcome market");
  const dependencies = new Map<string,string[]>();
  const expectedEdges = new Set<string>();
  const edgeKey = (from:string,to:string,relation:string) => JSON.stringify([from,to,relation]);
  function source(s:SlotSource,to:string,reseed=false): void {
    if (s.kind === "entrant") { requireValid(entrants.has(s.entrantId),"Unknown entrant source"); return; }
    if (s.kind === "reseed") {
      requireValid(Number.isInteger(s.rank) && s.rank >= 0 && s.rank < s.pool.length && s.order === "ascending-seed","Invalid reseed");
      s.pool.forEach(p=>source(p,to,true)); return;
    }
    const ids = s.kind === "reviewed-placement" ? s.marketIds : [s.marketId];
    requireValid(unique(ids) && ids.every(id=>all.has(id)), "Unknown source market");
    for (const id of ids) {
      dependencies.set(to,[...(dependencies.get(to) ?? []),id]);
      expectedEdges.add(edgeKey(id,to,s.kind === "reviewed-placement" ? s.kind : reseed ? "reseed" : s.kind));
    }
  }
  const parsed = new Map<string,Outcome>();
  for (const m of catalog.markets) {
    const b = bindings.get(m.id)!;
    requireValid(windows.has(m.windowId) && isDeepStrictEqual(b.inputs, m.inputs), "Inconsistent graph binding");
    requireValid(unique(b.eligibleEntrantIds) && b.eligibleEntrantIds.every(id=>entrants.has(id)), "Invalid eligible membership");
    requireValid(b.orientation === null || (b.orientation.length === 2 && unique(b.orientation) &&
      b.orientation.every(id=>b.eligibleEntrantIds.includes(id))), "Invalid home/away orientation");
    m.inputs.forEach(s=>source(s,m.id));
    for (const id of m.dependsOn) {
      requireValid(all.has(id),"Unknown dependency");
      dependencies.set(m.id,[...(dependencies.get(m.id) ?? []),id]);
      expectedEdges.add(edgeKey(id,m.id,"leg-result"));
    }
    const allowed: readonly OutcomeKind[] = m.outcomeDomain === "regulation-home-draw-away" ? ["winner","draw"]
      : m.outcomeDomain === "nomination-winner-set" ? ["winner-set"] : ["winner"];
    requireValid(["regulation-home-draw-away","nomination-winner-set","winner-including-overtime","aggregate-qualifier","series-winner"].includes(m.outcomeDomain),"Unknown outcome domain");
    const raw = input.outcomes[m.id];
    if (raw?.kind === "winner") requireValid(validId(raw.entrant),"Noncanonical winner identity");
    if (raw?.kind === "winner-set") requireValid(Array.isArray(raw.entrants) && raw.entrants.every(validId),"Noncanonical nomination identity");
    const outcome = parseOutcome(Object.prototype.hasOwnProperty.call(input.outcomes,m.id) ? raw : {kind:"unresolved"},b.eligibleEntrantIds,allowed);
    if (outcome.kind === "winner" && b.orientation) requireValid(b.orientation.includes(outcome.entrant),"Winner absent from actual pairing");
    parsed.set(m.id,outcome);
  }
  const actualEdges = catalog.edges.map(e=>edgeKey(e.from,e.to,e.relation));
  requireValid(new Set(actualEdges).size === actualEdges.length && actualEdges.length === expectedEdges.size &&
    actualEdges.every(e=>expectedEdges.has(e)), "Inconsistent catalog edges");
  const visiting = new Set<string>(), visited = new Set<string>();
  function visit(id:string) {
    requireValid(!visiting.has(id),"Cyclic catalog");
    if (visited.has(id)) return;
    visiting.add(id); (dependencies.get(id) ?? []).forEach(visit); visiting.delete(id); visited.add(id);
  }
  catalog.markets.forEach(m=>visit(m.id));
  function pool(s:SlotSource): readonly string[] {
    if (s.kind === "entrant") return [s.entrantId];
    if (s.kind === "reviewed-placement") return [...entrants];
    if (s.kind === "reseed") return [...new Set(s.pool.flatMap(p=>pool(p)))];
    return bindings.get(s.marketId)!.eligibleEntrantIds;
  }
  for (const m of catalog.markets) {
    const b = bindings.get(m.id)!;
    const possible = m.inputs.flatMap(s=>pool(s));
    requireValid(b.eligibleEntrantIds.every(id=>possible.includes(id)), "Binding escapes graph membership");
    const hasPlacement = (s:SlotSource):boolean => s.kind === "reviewed-placement" ||
      (s.kind === "reseed" && s.pool.some(hasPlacement));
    if (!m.inputs.some(hasPlacement)) requireValid(possible.every(id=>b.eligibleEntrantIds.includes(id)), "Incomplete graph membership");
    if (b.orientation) m.inputs.forEach((s,i)=>{
      requireValid(i < 2 && pool(s).includes(b.orientation![i]),"Orientation conflicts with source slot");
      if (s.kind === "winner" || s.kind === "loser") {
        const result = parsed.get(s.marketId)!;
        if (result.kind === "winner") {
          requireValid(s.kind === "winner" ? b.orientation![i] === result.entrant : b.orientation![i] !== result.entrant,"Pairing conflicts with effective graph result");
          const upstream=bindings.get(s.marketId)!.orientation;
          if (s.kind === "loser" && upstream) requireValid(upstream.includes(b.orientation![i]),"Loser absent from actual upstream pairing");
        }
      }
    });
    if (m.tieId && m.legMarketIds) {
      requireValid(m.legMarketIds.length === 2 && new Set(m.legMarketIds).size === 2 &&
        m.legMarketIds.every((id,i)=>all.get(id)?.tieId === m.tieId && all.get(id)?.leg === i+1 &&
          m.dependsOn.includes(id)), "Inconsistent tie association");
    }
  }
  const scored = catalog.markets.filter(m=>m.scored);
  if (input.weights) requireValid(Object.keys(input.weights).length === scored.length &&
    Object.entries(input.weights).every(([id,w])=>all.get(id)?.scored && Number.isFinite(w) && w >= 0), "Invalid complete weight assignment");
  requireValid(unique(input.participants.map(p=>p.id)), "Duplicate participant identity");
  requireValid(input.participants.every(p=>p.graphVersion === graphVersion), "Picks require their reviewed graph version");
  for (const p of input.participants) for (const [id,choice] of Object.entries(p.picks)) {
    const m = all.get(id), b = bindings.get(id);
    requireValid(m?.scored && b && validId(choice), "Unknown pick market or choice");
    requireValid(m.outcomeDomain === "regulation-home-draw-away"
      ? ["home","draw","away"].includes(choice) && b.orientation !== null
      : b.eligibleEntrantIds.includes(choice), "Invalid pick membership/orientation");
  }
  // A predicted route is evaluated from saved picks, never from actual winners.
  function path(s:SlotSource, winners:Readonly<Record<string,string>>): readonly string[] {
    if (s.kind === "entrant") return [s.entrantId];
    if (s.kind === "reviewed-placement" || s.kind === "reseed") return pool(s);
    const winner=winners[s.marketId];
    if (s.kind === "winner" && winner) return [winner];
    const slots=all.get(s.marketId)!.inputs.map(p=>path(p,winners));
    return slots.flat().filter(id=>s.kind !== "loser" || id!==winner);
  }
  function checkPaths(winners:Readonly<Record<string,string>>) {
    for (const m of catalog.markets) {
      if (!winners[m.id] || m.outcomeDomain === "regulation-home-draw-away") continue;
      const slots=m.inputs.map(s=>path(s,winners));
      requireValid(slots.flat().includes(winners[m.id]),"Impossible advancement path");
    }
  }
  input.participants.forEach(p=>{
    // Round-window picks are made against reviewed actual pairings, not the
    // participant's (possibly losing) predictions from an earlier round.
    if (catalog.lockMode === "per-window") {
      for (const [id,choice] of Object.entries(p.picks)) {
        const m=all.get(id)!, b=bindings.get(id)!;
        requireValid(b.orientation !== null &&
          (m.outcomeDomain === "regulation-home-draw-away" || b.orientation.includes(choice)),
          "Pick outside reviewed round pairing");
      }
    } else checkPaths(p.picks);
  });
  checkPaths(Object.fromEntries([...parsed].flatMap(([id,r])=>r.kind==="winner"?[[id,r.entrant]]:[])));
  return parsed;
}
function feasible(input: EventScoreInput): FeasibleComponent[] {
  const all = new Map(input.edition.catalog.markets.map(m=>[m.id,m]));
  const bindings = new Map(input.binding.markets.map(b=>[b.marketId,b]));
  const owner = new Map<string,number>();
  const components = input.components.map((c,index)=>{
    requireValid(c.marketIds.length > 0 && unique(c.marketIds),"Invalid component identity");
    for (const id of c.marketIds) {
      requireValid(all.get(id)?.scored && !owner.has(id),"Overlapping or unknown component market");
      owner.set(id,index);
    }
    if (c.evidence) requireValid(c.evidence.reviewed === true && c.evidence.graphVersion === input.edition.graphVersion &&
      validId(c.evidence.reference),"Stale/unreviewed feasible evidence");
    for (const world of c.worlds ?? []) {
      requireValid(Object.keys(world).length === c.marketIds.length && Object.keys(world).every(id=>c.marketIds.includes(id)),"Incomplete or extraneous world market");
      for (const id of c.marketIds) {
        const choices=world[id], m=all.get(id)!, b=bindings.get(id)!;
        requireValid(Array.isArray(choices) && choices.length > 0 && unique(choices) &&
          (m.outcomeDomain === "nomination-winner-set" || choices.length === 1) &&
          choices.every(choice=>b.eligibleEntrantIds.includes(choice) ||
            (choice==="draw" && m.outcomeDomain==="regulation-home-draw-away")),"Invalid canonical world choice");
      }
    }
    // Pairings are observed facts, independent of a participant's hypothetical route.
    const worlds = c.worlds?.filter(world => {
      function possible(s: SlotSource): readonly string[] {
        if (s.kind === "entrant") return [s.entrantId];
        if (s.kind === "reviewed-placement") return input.edition.catalog.entrants.map(e=>e.id);
        if (s.kind === "reseed") return s.pool.flatMap(possible);
        const result = input.outcomes[s.marketId];
        const winners = world[s.marketId] ?? (result?.kind === "winner" ? [result.entrant] : []);
        if (s.kind === "winner" && winners.length) return winners;
        const members = bindings.get(s.marketId)!.orientation ?? all.get(s.marketId)!.inputs.flatMap(possible);
        return members.filter(id=>s.kind !== "loser" || !winners.includes(id));
      }
      // Structural (unscored) results constrain advancement even before pairing resolves.
      if (!c.marketIds.every(id=>{
        const members=all.get(id)!.inputs.flatMap(possible);
        return world[id].every(choice=>choice === "draw" || members.includes(choice));
      })) return false;
      return input.binding.markets.every(b=>!b.orientation || (
        (!world[b.marketId] || world[b.marketId].every(id=>id === "draw" || b.orientation!.includes(id))) &&
        b.inputs.every((s,i)=>possible(s).includes(b.orientation![i]))
      ));
    }) ?? null;
    return {marketIds:c.marketIds,worlds:c.evidence ? worlds : null};
  });
  // Known advancement/tie dependencies cannot be independently maximized.
  // Reviewed placements have a separate evidence boundary; independence is attested above.
  for (const edge of input.edition.catalog.edges) {
    if (edge.relation === "reviewed-placement" || !all.get(edge.from)?.scored || !all.get(edge.to)?.scored) continue;
    const left=owner.get(edge.from), right=owner.get(edge.to);
    if (left !== undefined || right !== undefined) {
      requireValid(left !== undefined && left === right,"Coupled graph split across feasibility factors");
    }
  }
  return components;
}
export interface EventScoreRow { id: string; earned: number; maximum: number | null; wrong: number; pending: number; rank: number }
export function scoreEvent(input: EventScoreInput): EventScoreRow[] {
  const outcomes = validate(input);
  const components = feasible(input);
  const markets = input.edition.catalog.markets.filter(m => m.scored).map(m => ({
    id: m.id, weight: input.weights?.[m.id] ?? 1, locked: input.windows[m.windowId] === "locked",
    result: outcomes.get(m.id)!,
  }));
  return competitionRanks(input.participants.map(p => {
    const picks = Object.fromEntries(Object.entries(p.picks).map(([id, choice]) => {
      const market = input.edition.catalog.markets.find(m => m.id === id)!;
      const binding = input.binding.markets.find(m => m.marketId === id)!;
      return [id, market.outcomeDomain === "regulation-home-draw-away" && choice !== "draw"
        ? binding.orientation![choice === "home" ? 0 : 1] : choice];
    }));
    return { id: p.id, ...scoreParticipant(markets, picks, components) };
  }));
}
