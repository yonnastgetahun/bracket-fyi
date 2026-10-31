/** Draft logical templates, not official future fixtures. Synthetic builds use a separate namespace. */
export type EventKey = "ucl-2026-27" | "nfl-2026-postseason" | "ncaa-men-2027" | "nba-2027" | "nba-play-in-2027" | "wwc-2027" | "mlb-2027" | "cfp-2026-27" | "oscars-2027";
export type MarketKind = "result" | "qualifier" | "series" | "champion" | "structural" | "nomination";
export type SlotSource =
  | Readonly<{ kind: "entrant"; entrantId: string }>
  | Readonly<{ kind: "winner" | "loser"; marketId: string }>
  | Readonly<{ kind: "reviewed-placement"; placement: string; marketIds: readonly string[] }>
  | Readonly<{ kind: "reseed"; rank: number; order: "ascending-seed"; pool: readonly SlotSource[] }>;
export type EventWindow = Readonly<{
  id: string; label: string;
  opensWhen: "reviewed-membership" | "qualification-resolved" | "official-seeds-resolved" | "reviewed-pairings" | "categories-sealed";
  prerequisiteMarketIds: readonly string[];
  cutoff: "first-scored-start" | "ceremony-start";
}>;
export type EventMarket = Readonly<{
  id: string; kind: MarketKind; scored: boolean; windowId: string;
  stage: string; role: "game" | "leg" | "qualifier" | "champion" | "bronze" | "category";
  outcomeDomain: "regulation-home-draw-away" | "winner-including-overtime" | "aggregate-qualifier" | "series-winner" | "nomination-winner-set";
  inputs: readonly SlotSource[]; dependsOn: readonly string[];
  tieId?: string; leg?: 1 | 2; legMarketIds?: readonly string[];
  series?: Readonly<{ id: string; membershipVersion: 1; bestOf: 3 | 5 | 7; winsRequired: number; stopAtClinch: true }>;
  categoryId?: string; qualificationSeed?: number;
}>;
export type EntrantSlot = Readonly<{ id: string; seed?: number; group?: string; bye?: boolean }>;
export type GraphEdge = Readonly<{ from: string; to: string; relation: "winner" | "loser" | "reviewed-placement" | "reseed" | "leg-result" }>;
export type EventDefinition = Readonly<{
  key: EventKey; label: string; availability: "draft"; manualMode: true; automation: "unavailable";
  lockMode: "whole-bracket" | "per-window"; windows: readonly EventWindow[];
  markets: readonly EventMarket[]; entrants: readonly EntrantSlot[]; edges: readonly GraphEdge[];
  championMarketId: string | null;
}>;
export type SyntheticEntrant = Readonly<EntrantSlot & { name: string; categoryId?: string; credits?: readonly string[] }>;
export type SyntheticMarket = Readonly<EventMarket & {
  startAt: string; entrants: readonly SyntheticEntrant[];
  /** Empty until all participant slots are resolved; dependencies remain available for hypothetical paths. */
  choices: readonly string[];
}>;
export type SyntheticManifest = Readonly<{
  version: 1; editionKey: EventKey; synthetic: true; lockMode: EventDefinition["lockMode"];
  windows: readonly EventWindow[]; markets: readonly SyntheticMarket[]; entrants: readonly SyntheticEntrant[];
  edges: readonly GraphEdge[]; championMarketId: string | null;
}>;
export type SyntheticOptions = Readonly<{ startsAt: string; categories?: readonly string[] }>;

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const win = (marketId: string): SlotSource => ({ kind: "winner", marketId });
const lose = (marketId: string): SlotSource => ({ kind: "loser", marketId });
const reviewed = (placement: string, marketIds: readonly string[]): SlotSource => ({ kind: "reviewed-placement", placement, marketIds });
function sourceEdges(source: SlotSource, to: string, reseed = false): GraphEdge[] {
  if (source.kind === "entrant") return [];
  if (source.kind === "reseed") return source.pool.flatMap(s => sourceEdges(s, to, true));
  if (source.kind === "reviewed-placement") return source.marketIds.map(from => ({ from, to, relation: "reviewed-placement" }));
  return [{ from: source.marketId, to, relation: reseed ? "reseed" : source.kind }];
}
class Template {
  windows: EventWindow[] = [];
  markets: EventMarket[] = [];
  entrants: EntrantSlot[] = [];
  constructor(readonly key: EventKey, readonly label: string, readonly lockMode: EventDefinition["lockMode"] = "whole-bracket") {}
  window(slot: string, label: string, opensWhen: EventWindow["opensWhen"] = "reviewed-membership", prerequisiteMarketIds: string[] = []) {
    const id = `${this.key}:window:${slot}`;
    this.windows.push({ id, label, opensWhen, prerequisiteMarketIds, cutoff: this.key === "oscars-2027" ? "ceremony-start" : "first-scored-start" });
    return id;
  }
  entrant(slot: string, extra: Omit<EntrantSlot, "id"> = {}): SlotSource {
    const id = `${this.key}:entrant:${slot}`;
    this.entrants.push({ id, ...extra });
    return { kind: "entrant", entrantId: id };
  }
  market(slot: string, stage: string, windowId: string, inputs: SlotSource[], extra: Partial<EventMarket> = {}) {
    const id = `${this.key}:market:${slot}`;
    this.markets.push({ id, stage, windowId, inputs, kind: "result", scored: true, role: "game", outcomeDomain: "winner-including-overtime", dependsOn: [], ...extra });
    return id;
  }
  series(slot: string, stage: string, window: string, inputs: SlotSource[], bestOf: 3 | 5 | 7, champion = false) {
    return this.market(slot, stage, window, inputs, {
      kind: champion ? "champion" : "series", role: champion ? "champion" : "game", outcomeDomain: "series-winner",
      series: { id: `${this.key}:series:${slot}`, membershipVersion: 1, bestOf, winsRequired: (bestOf + 1) / 2, stopAtClinch: true },
    });
  }
  finish(): EventDefinition {
    const edges = this.markets.flatMap(m => [
      ...m.inputs.flatMap(s => sourceEdges(s, m.id)),
      ...m.dependsOn.map(from => ({ from, to: m.id, relation: "leg-result" as const })),
    ]);
    // A reseed pool is referenced by both input slots; retain each logical dependency once.
    const uniqueEdges = [...new Map(edges.map(e => [`${e.from}|${e.to}|${e.relation}`, e])).values()];
    return freeze({ key: this.key, label: this.label, availability: "draft", manualMode: true, automation: "unavailable",
      lockMode: this.lockMode, windows: this.windows, markets: this.markets, entrants: this.entrants, edges: uniqueEdges,
      championMarketId: this.markets.find(m => m.role === "champion")?.id ?? null });
  }
}

function ucl() {
  const t = new Template("ucl-2026-27", "UEFA Champions League 2026/27", "per-window");
  const entrants = Array.from({ length: 36 }, (_, i) => t.entrant(`team-${i + 1}`));
  // Original round-robin construction supplies eight distinct opponents per synthetic team.
  const rotation = [...entrants]; const league: string[] = [];
  for (let day = 1; day <= 8; day++) {
    const w = t.window(`league-${day}`, `League matchday ${day}`);
    for (let i = 0; i < 18; i++) league.push(t.market(`league-${day}.game-${i + 1}`, "league", w, [rotation[i], rotation[35 - i]], { outcomeDomain: "regulation-home-draw-away" }));
    rotation.splice(1, 0, rotation.pop()!);
  }
  let previous: string[] = [];
  for (const [stage, count] of [["play-off", 8], ["round-of-16", 8], ["quarter-final", 4], ["semi-final", 2]] as const) {
    const prerequisites = stage === "play-off" ? league : previous;
    const w = t.window(stage, stage, "reviewed-pairings", prerequisites);
    const next: string[] = [];
    for (let i = 0; i < count; i++) {
      const slot = `${stage}.tie-${i + 1}`, tieId = `${t.key}:tie:${slot}`;
      const inputs = stage === "play-off" || stage === "round-of-16"
        ? [reviewed(`${slot}.home`, stage === "play-off" ? league : [...league, ...previous]), reviewed(`${slot}.away`, stage === "play-off" ? league : [...league, ...previous])]
        : [win(previous[2 * i]), win(previous[2 * i + 1])];
      const l1 = t.market(`${slot}.leg-1`, stage, w, inputs, { role: "leg", tieId, leg: 1, outcomeDomain: "regulation-home-draw-away" });
      const l2 = t.market(`${slot}.leg-2`, stage, w, [...inputs].reverse(), { role: "leg", tieId, leg: 2, outcomeDomain: "regulation-home-draw-away" });
      next.push(t.market(`${slot}.qualifier`, stage, w, inputs, { kind: "qualifier", role: "qualifier", outcomeDomain: "aggregate-qualifier", tieId, legMarketIds: [l1, l2], dependsOn: [l1, l2] }));
    }
    previous = next;
  }
  const w = t.window("final", "Final", "reviewed-pairings", previous);
  t.market("final", "final", w, previous.map(win), { kind: "champion", role: "champion" });
  return t.finish();
}
function ncaa() {
  const t = new Template("ncaa-men-2027", "NCAA men’s tournament 2027");
  const w = t.window("bracket", "Whole scored bracket", "qualification-resolved");
  const opening: string[] = [], regionWinners: string[] = [];
  const seedOrder = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];
  for (const region of ["east", "west", "south", "midwest"]) {
    const seeds: Record<number, SlotSource> = {};
    for (let seed = 1; seed <= 16; seed++) {
      if ([11, 12, 16].includes(seed)) {
        const id = t.market(`${region}.opening-${seed}`, "opening-round", w,
          ["a", "b"].map(side => t.entrant(`${region}.seed-${seed}.${side}`, { seed, group: region })),
          { kind: "structural", scored: false, role: "qualifier" });
        opening.push(id); seeds[seed] = win(id);
      } else seeds[seed] = t.entrant(`${region}.seed-${seed}`, { seed, group: region });
    }
    let slots = seedOrder.map(seed => seeds[seed]);
    for (const stage of ["round-of-64", "round-of-32", "sweet-16", "elite-8"]) {
      const next: SlotSource[] = [];
      for (let i = 0; i < slots.length; i += 2) next.push(win(t.market(`${region}.${stage}.${i / 2 + 1}`, stage, w, slots.slice(i, i + 2))));
      slots = next;
    }
    regionWinners.push((slots[0] as { marketId: string }).marketId);
  }
  const semis = [0, 2].map((i) => t.market(`semi-final.${i / 2 + 1}`, "semi-final", w, regionWinners.slice(i, i + 2).map(win)));
  t.market("final", "final", w, semis.map(win), { kind: "champion", role: "champion" });
  t.windows[0] = { ...t.windows[0], prerequisiteMarketIds: opening };
  return t.finish();
}
function nba() {
  const t = new Template("nba-2027", "NBA playoffs 2027");
  const w = t.window("bracket", "Whole playoff bracket", "official-seeds-resolved");
  const conferenceWinners: string[] = [];
  for (const conference of ["east", "west"]) {
    const seeds = Array.from({ length: 8 }, (_, i) => t.entrant(`${conference}.seed-${i + 1}`, { seed: i + 1, group: conference }));
    let slots = [0, 7, 3, 4, 2, 5, 1, 6].map(i => seeds[i]);
    for (const stage of ["first-round", "conference-semi-final", "conference-final"]) {
      const next: SlotSource[] = [];
      for (let i = 0; i < slots.length; i += 2) next.push(win(t.series(`${conference}.${stage}.${i / 2 + 1}`, stage, w, slots.slice(i, i + 2), 7)));
      slots = next;
    }
    conferenceWinners.push((slots[0] as { marketId: string }).marketId);
  }
  t.series("finals", "finals", w, conferenceWinners.map(win), 7, true);
  return t.finish();
}
function playIn() {
  const t = new Template("nba-play-in-2027", "NBA Play-In 2027");
  const w = t.window("bracket", "Whole Play-In bracket");
  for (const conference of ["east", "west"]) {
    const seeds = [7, 8, 9, 10].map(seed => t.entrant(`${conference}.seed-${seed}`, { seed, group: conference }));
    const seven = t.market(`${conference}.seven-eight`, "play-in", w, seeds.slice(0, 2), { qualificationSeed: 7 });
    const nine = t.market(`${conference}.nine-ten`, "play-in", w, seeds.slice(2));
    t.market(`${conference}.eighth-seed-decider`, "play-in", w, [lose(seven), win(nine)], { qualificationSeed: 8 });
  }
  return t.finish();
}
function wwc() {
  const t = new Template("wwc-2027", "Women’s World Cup 2027", "per-window");
  const groups: Record<string, SlotSource[]> = {}, games: Record<string, string[]> = {};
  for (const group of "ABCDEFGH") {
    groups[group] = [1, 2, 3, 4].map(seed => t.entrant(`${group}.${seed}`, { group, seed })); games[group] = [];
  }
  const rounds = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
  rounds.forEach((pairs, i) => {
    const w = t.window(`group-${i + 1}`, `Group matchday ${i + 1}`);
    for (const group of "ABCDEFGH") pairs.forEach(([a, b], j) => games[group].push(t.market(`group-${group}.day-${i + 1}.game-${j + 1}`, "group", w, [groups[group][a], groups[group][b]], { outcomeDomain: "regulation-home-draw-away" })));
  });
  // Original synthetic pairing arrangement; actual placement requires a reviewed manifest.
  let slots = ["A1", "C2", "B1", "D2", "C1", "A2", "D1", "B2", "E1", "G2", "F1", "H2", "G1", "E2", "H1", "F2"].map(p => reviewed(p, games[p[0]]));
  let previous = Object.values(games).flat();
  for (const stage of ["round-of-16", "quarter-final", "semi-final"]) {
    const w = t.window(stage, stage, "reviewed-pairings", previous);
    const next: string[] = [];
    for (let i = 0; i < slots.length; i += 2) next.push(t.market(`${stage}.${i / 2 + 1}`, stage, w, slots.slice(i, i + 2)));
    previous = next; slots = next.map(win);
  }
  const w = t.window("medals", "Final and bronze", "reviewed-pairings", previous);
  t.market("final", "medals", w, previous.map(win), { kind: "champion", role: "champion" });
  t.market("bronze", "medals", w, previous.map(lose), { role: "bronze" });
  return t.finish();
}
function nfl() {
  const t = new Template("nfl-2026-postseason", "NFL 2026 postseason");
  const w = t.window("bracket", "Whole postseason bracket");
  const finals: string[] = [];
  for (const conference of ["afc", "nfc"]) {
    const seeds = Array.from({ length: 7 }, (_, i) => t.entrant(`${conference}.seed-${i + 1}`, { seed: i + 1, group: conference, bye: i === 0 }));
    const wild = [[1, 6], [2, 5], [3, 4]].map(([a, b], i) => t.market(`${conference}.wild-card.${i + 1}`, "wild-card", w, [seeds[a], seeds[b]]));
    const pool = [seeds[0], ...wild.map(win)];
    const rank = (n: number): SlotSource => ({ kind: "reseed", rank: n, order: "ascending-seed", pool });
    const divisional = [[0, 3], [1, 2]].map(([a, b], i) => t.market(`${conference}.divisional.${i + 1}`, "divisional", w, [rank(a), rank(b)]));
    finals.push(t.market(`${conference}.conference-final`, "conference-final", w, divisional.map(win)));
  }
  t.market("super-bowl", "super-bowl", w, finals.map(win), { kind: "champion", role: "champion" });
  return t.finish();
}
function mlb() {
  const t = new Template("mlb-2027", "MLB postseason 2027");
  const w = t.window("bracket", "Whole postseason bracket");
  const finals: string[] = [];
  for (const league of ["al", "nl"]) {
    const seeds = Array.from({ length: 6 }, (_, i) => t.entrant(`${league}.seed-${i + 1}`, { seed: i + 1, group: league, bye: i < 2 }));
    const a = t.series(`${league}.wild-card.1`, "wild-card", w, [seeds[2], seeds[5]], 3);
    const b = t.series(`${league}.wild-card.2`, "wild-card", w, [seeds[3], seeds[4]], 3);
    const d1 = t.series(`${league}.division.1`, "division", w, [seeds[0], win(b)], 5);
    const d2 = t.series(`${league}.division.2`, "division", w, [seeds[1], win(a)], 5);
    finals.push(t.series(`${league}.championship`, "championship", w, [win(d1), win(d2)], 7));
  }
  t.series("world-series", "world-series", w, finals.map(win), 7, true);
  return t.finish();
}
function cfp() {
  const t = new Template("cfp-2026-27", "College Football Playoff 2026/27");
  const w = t.window("bracket", "Whole playoff bracket");
  const seeds = Array.from({ length: 12 }, (_, i) => t.entrant(`seed-${i + 1}`, { seed: i + 1, bye: i < 4 }));
  // Fixed 1-(8/9), 4-(5/12), 2-(7/10), 3-(6/11) paths; never reseed.
  const quarters = [[1, 8, 9], [4, 5, 12], [2, 7, 10], [3, 6, 11]].map(([bye, a, b], i) => {
    const first = t.market(`first-round.${i + 1}`, "first-round", w, [seeds[a - 1], seeds[b - 1]]);
    return t.market(`quarter-final.${i + 1}`, "quarter-final", w, [seeds[bye - 1], win(first)]);
  });
  const semis = [0, 2].map((i) => t.market(`semi-final.${i / 2 + 1}`, "semi-final", w, quarters.slice(i, i + 2).map(win)));
  t.market("final", "final", w, semis.map(win), { kind: "champion", role: "champion" });
  return t.finish();
}
function oscars() {
  const t = new Template("oscars-2027", "Oscars 2027");
  t.window("ceremony", "Ceremony", "categories-sealed");
  return t.finish();
}
const definitions = freeze([ucl(), nfl(), ncaa(), nba(), playIn(), wwc(), mlb(), cfp(), oscars()]);
export function getEventDefinition(key: string): EventDefinition | null { return definitions.find(d => d.key === key) ?? null; }
export function listEventDefinitions(): readonly EventDefinition[] { return definitions; }

export function buildSyntheticManifest(key: string, options: SyntheticOptions): SyntheticManifest {
  const d = getEventDefinition(key);
  if (!d) throw new Error(`Unknown event edition: ${key}`);
  const startAt = new Date(options.startsAt);
  if (!Number.isFinite(startAt.getTime())) throw new Error("startsAt must be a valid fixed timestamp");
  const sid = (id: string) => `synthetic-${id}`;
  const source = (s: SlotSource): SlotSource => {
    switch (s.kind) {
      case "entrant": return { ...s, entrantId: sid(s.entrantId) };
      case "winner": case "loser": return { ...s, marketId: sid(s.marketId) };
      case "reviewed-placement": return { ...s, marketIds: s.marketIds.map(sid) };
      case "reseed": return { ...s, pool: s.pool.map(source) };
    }
  };
  const entrants: SyntheticEntrant[] = d.entrants.map(e => ({ ...e, id: sid(e.id), name: `Synthetic ${e.id.split(":entrant:")[1]}` }));
  let templates = [...d.markets];
  if (d.key === "oscars-2027") {
    const categories = options.categories?.map(c => c.trim().normalize("NFC")) ?? [];
    if (!categories.length || categories.some(c => !c) || new Set(categories).size !== categories.length) throw new Error("Selected categories must be nonblank and unique");
    templates = categories.map(category => {
      const categoryId = `${d.key}:category:${encodeURIComponent(category)}`;
      const nominations = [1, 2, 3, 4].map(i => {
        const id = `${categoryId}:nomination:${i}`;
        // Shared credits intentionally do not define nomination identity or create extra markets.
        entrants.push({ id: sid(id), name: `Synthetic nomination ${i} (${category})`, categoryId: sid(categoryId), credits: ["Synthetic shared credit"] });
        return { kind: "entrant" as const, entrantId: id };
      });
      return { id: `${categoryId}:market`, categoryId, kind: "nomination", scored: true, role: "category", stage: "ceremony", outcomeDomain: "nomination-winner-set", windowId: d.windows[0].id, inputs: nominations, dependsOn: [] };
    });
  }
  const byId = new Map(entrants.map(e => [e.id, e]));
  const markets = templates.map(t => {
    const inputs = t.inputs.map(source);
    const resolved = inputs.every(s => s.kind === "entrant");
    const participants = resolved ? inputs.map(s => byId.get((s as { entrantId: string }).entrantId)!) : [];
    return { ...t, id: sid(t.id), windowId: sid(t.windowId), inputs,
      dependsOn: t.dependsOn.map(sid),
      ...(t.tieId ? { tieId: sid(t.tieId) } : {}),
      ...(t.legMarketIds ? { legMarketIds: t.legMarketIds.map(sid) } : {}),
      ...(t.series ? { series: { ...t.series, id: sid(t.series.id) } } : {}),
      ...(t.categoryId ? { categoryId: sid(t.categoryId) } : {}),
      startAt: startAt.toISOString(), entrants: participants,
      choices: resolved ? (t.outcomeDomain === "regulation-home-draw-away" ? ["home", "draw", "away"] : participants.map(e => e.id)) : [],
    };
  });
  return freeze({ version: 1, editionKey: d.key, synthetic: true, lockMode: d.lockMode,
    windows: d.windows.map(w => ({ ...w, id: sid(w.id), prerequisiteMarketIds: w.prerequisiteMarketIds.map(sid) })),
    markets, entrants, edges: d.edges.map(e => ({ ...e, from: sid(e.from), to: sid(e.to) })),
    championMarketId: d.championMarketId ? sid(d.championMarketId) : null });
}
