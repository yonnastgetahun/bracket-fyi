import type { Outcome } from "./outcomes";

export interface SeriesGame { id: string; version: number; winner: string | null }
/** Call with the reviewed, versioned series membership only. Same-ID games are
 * unique; cross-ID replacement needs a reviewed membership revision upstream. */
export function deriveSeries(entrants: readonly string[], bestOf: number, games: readonly SeriesGame[]) {
  if (entrants.length !== 2 || new Set(entrants).size !== 2 || ![3,5,7].includes(bestOf) ||
      games.length > bestOf || new Set(games.map(game => game.id)).size !== games.length ||
      games.some(game => !game.id || !Number.isInteger(game.version) || game.version < 1 || (game.winner !== null && !entrants.includes(game.winner)))) {
    throw new Error("Invalid series membership");
  }
  const target = Math.floor(bestOf / 2) + 1;
  const winners = entrants.filter(entrant => games.filter(game => game.winner === entrant).length >= target);
  if (winners.length > 1) throw new Error("Conflicting clinches");
  const outcome: Outcome = winners.length ? { kind: "winner", entrant: winners[0] } : { kind: "unresolved" };
  return { outcome, algorithm: "series-wins-v1", children: games.map(game => ({ id: game.id, version: game.version })).sort((a,b)=>a.id.localeCompare(b.id)) };
}

export type PlayInSeeds = readonly [string, string, string, string];
export interface PlayInPicks { sevenEight: string; nineTen: string; decider: string }
function validateSeeds(seeds: PlayInSeeds) {
  if (seeds.length !== 4 || new Set(seeds).size !== 4 || seeds.some(seed => !seed.trim())) throw new Error("Invalid Play-In seeds");
}
export function playInPredictions(seeds: PlayInSeeds, picks: PlayInPicks) {
  validateSeeds(seeds);
  if (!seeds.slice(0,2).includes(picks.sevenEight) || !seeds.slice(2,4).includes(picks.nineTen)) throw new Error("Invalid first-round prediction");
  const loser = seeds.slice(0,2).find(seed => seed !== picks.sevenEight)!;
  const deciderEntrants = [loser, picks.nineTen];
  if (!deciderEntrants.includes(picks.decider)) throw new Error("Impossible predicted decider");
  return { seventh: picks.sevenEight, eighth: picks.decider, deciderEntrants };
}
export function playInWorlds(seeds: PlayInSeeds): Array<Record<string, string[]>> {
  validateSeeds(seeds);
  const worlds: Array<Record<string,string[]>> = [];
  for (const sevenEight of seeds.slice(0,2)) {
    const loser = seeds.slice(0,2).find(seed => seed !== sevenEight)!;
    for (const nineTen of seeds.slice(2,4)) for (const decider of [loser,nineTen]) {
      worlds.push({ sevenEight:[sevenEight], nineTen:[nineTen], decider:[decider] });
    }
  }
  return worlds;
}
export function reseed(entrants: readonly {id:string;seed:number}[]): Array<[string,string]> {
  if (!entrants.length || entrants.length % 2 || new Set(entrants.map(e=>e.id)).size !== entrants.length ||
      new Set(entrants.map(e=>e.seed)).size !== entrants.length ||
      entrants.some(e=>!e.id || !Number.isInteger(e.seed) || e.seed < 1)) throw new Error("Invalid reseeding field");
  const ranked = [...entrants].sort((a,b)=>a.seed-b.seed);
  return ranked.slice(0,ranked.length/2).map((entrant,i)=>[entrant.id,ranked[ranked.length-i-1].id]);
}
export interface GraphNode { id: string; edition: string }
export interface GraphEdge { from: string; to: string; role: string; outcome: string }
export function validateGraph(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): void {
  const byId = new Map(nodes.map(node=>[node.id,node]));
  if (byId.size !== nodes.length || nodes.some(node=>!node.id || !node.edition)) throw new Error("Invalid graph identity");
  const destinations = new Set<string>();
  const adjacency = new Map<string,string[]>();
  for (const edge of edges) {
    const from = byId.get(edge.from), to = byId.get(edge.to);
    const destination = JSON.stringify([edge.to,edge.role]);
    if (!from || !to || from.edition !== to.edition || !edge.role ||
        !["winner","loser","qualifier","seed","placement"].includes(edge.outcome) || destinations.has(destination)) throw new Error("Invalid graph relation");
    destinations.add(destination);
    adjacency.set(edge.from,[...(adjacency.get(edge.from) ?? []),edge.to]);
  }
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error("Cyclic graph");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of adjacency.get(id) ?? []) visit(next);
    visiting.delete(id); visited.add(id);
  };
  for (const node of nodes) visit(node.id);
}
