import { createHash } from "node:crypto";
import { z } from "zod";

const id = z.string().trim().min(1);
const outcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unresolved") }).strict(),
  z.object({ kind: z.literal("winner"), entrant: id }).strict(),
  z.object({ kind: z.literal("draw") }).strict(),
  z.object({ kind: z.literal("winner-set"), entrants: z.array(id).min(1) }).strict(),
  z.object({ kind: z.literal("no-contest") }).strict(),
]);
export type Outcome = z.infer<typeof outcomeSchema>;
export type OutcomeKind = Outcome["kind"];

export function parseOutcome(value: unknown, eligible: readonly string[], allowed: readonly OutcomeKind[]): Outcome {
  const outcome = outcomeSchema.parse(value);
  if (outcome.kind !== "unresolved" && outcome.kind !== "no-contest" && !allowed.includes(outcome.kind)) {
    throw new Error("Unsupported market outcome");
  }
  const winners = outcome.kind === "winner" ? [outcome.entrant] : outcome.kind === "winner-set" ? outcome.entrants : [];
  if (new Set(winners).size !== winners.length || winners.some((winner) => !eligible.includes(winner))) {
    throw new Error("Invalid outcome membership");
  }
  return outcome.kind === "winner-set" ? { ...outcome, entrants: [...outcome.entrants].sort() } : outcome;
}

export function winningChoices(outcome: Outcome): readonly string[] | null {
  switch (outcome.kind) {
    case "winner": return [outcome.entrant];
    case "draw": return ["draw"];
    case "winner-set": return outcome.entrants;
    default: return null;
  }
}
export interface CanonicalOutcome { id: string; version: number; outcome: Outcome; derivation?: { algorithm: string; children: readonly string[] } }
export interface OverrideOutcome { id: string; revision: number; outcome: Outcome; status: "active" | "released"; expiresAt: string | null }
export interface ConfigurationBasis { graph: number; requiredSet: number; scoring: number }
const token = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function resolveEffective(
  canonical: CanonicalOutcome | null, override: OverrideOutcome | null,
  basis: ConfigurationBasis, now: string,
) {
  if (!Number.isFinite(Date.parse(now))) throw new Error("Invalid evaluation time");
  if (override?.expiresAt !== null && override?.expiresAt !== undefined && !Number.isFinite(Date.parse(override.expiresAt))) throw new Error("Invalid expiry");
  const active = override?.status === "active" && (override.expiresAt === null || Date.parse(override.expiresAt) > Date.parse(now)) ? override : null;
  const outcome: Outcome = active?.outcome ?? canonical?.outcome ?? { kind: "unresolved" };
  const effectiveIdentity = active
    ? ["override", active.id, active.revision, active.expiresAt, active.outcome]
    : ["canonical", canonical?.id ?? null, canonical?.version ?? null, outcome];
  return {
    outcome, source: active ? "override" as const : "canonical" as const,
    canonical, override: active, basis,
    effectiveToken: token([basis, effectiveIdentity]),
    provenanceToken: token([basis, canonical, override]),
  };
}

export interface ScoredMarket {
  id: string;
  weight: number;
  locked: boolean;
  result: Outcome;
  removed?: boolean;
}
/** Each component is an independently feasible factor. Worlds enumerate jointly
 * possible winners, not independently optimistic market domains. An absent or
 * unknown factor makes the maximum unverified; callers never guess domains. */
export interface FeasibleComponent {
  marketIds: readonly string[];
  worlds: readonly Readonly<Record<string, readonly string[]>>[] | null;
}
export function scoreParticipant(
  markets: readonly ScoredMarket[],
  picks: Readonly<Record<string, string>>,
  components: readonly FeasibleComponent[],
): { earned: number; maximum: number | null; wrong: number; pending: number } {
  if (new Set(markets.map((market) => market.id)).size !== markets.length ||
      markets.some((market) => !Number.isFinite(market.weight) || market.weight < 0)) throw new Error("Invalid scored set");
  let earned = 0, wrong = 0, pending = 0;
  const active = markets.filter((market) => !market.removed);
  const byId = new Map(active.map((market) => [market.id, market]));
  for (const market of active) {
    const winners = winningChoices(market.result);
    if (market.locked && !picks[market.id]) { wrong++; continue; }
    if (winners) {
      if (picks[market.id] && winners.includes(picks[market.id])) earned += market.weight;
      else if (market.locked) wrong++;
    } else pending++;
  }
  let maximum = 0;
  const covered = new Set<string>();
  for (const component of components) {
    if (!component.marketIds.length || new Set(component.marketIds).size !== component.marketIds.length) throw new Error("Invalid feasibility component");
    for (const marketId of component.marketIds) {
      if (!byId.has(marketId) || covered.has(marketId)) throw new Error("Overlapping or unknown feasibility component");
      covered.add(marketId);
    }
    // A fully forfeited component contributes zero under every completion;
    // unknown outcome feasibility cannot restore those locked missing picks.
    if (component.marketIds.every(marketId => byId.get(marketId)!.locked && !picks[marketId])) continue;
    if (!component.worlds?.length) return { earned, maximum: null, wrong, pending };
    const viable = component.worlds.filter((world) => component.marketIds.every((marketId) => {
      const choices = world[marketId];
      if (!choices?.length || new Set(choices).size !== choices.length) return false;
      const result = byId.get(marketId)!.result;
      const actual = winningChoices(result);
      // A world must preserve the entire settled winner set, not just overlap it.
      return result.kind !== "no-contest" && (!actual || (actual.length === choices.length && actual.every((choice) => choices.includes(choice))));
    }));
    if (!viable.length) return { earned, maximum: null, wrong, pending };
    maximum += Math.max(...viable.map((world) => component.marketIds.reduce((sum, marketId) => {
      const market = byId.get(marketId)!;
      return sum + (!market.locked || (picks[marketId] && world[marketId].includes(picks[marketId])) ? market.weight : 0);
    }, 0)));
  }
  for (const market of active) {
    if (covered.has(market.id)) continue;
    const winners = winningChoices(market.result);
    if (!winners) {
      // A missing locked submission is a settled forfeit even without a domain.
      if (market.locked && !picks[market.id]) continue;
      return { earned, maximum: null, wrong, pending };
    }
    maximum += !market.locked || (picks[market.id] && winners.includes(picks[market.id])) ? market.weight : 0;
  }
  return { earned, maximum, wrong, pending };
}

export function competitionRanks<T extends { earned: number; wrong: number }>(rows: readonly T[]): Array<T & { rank: number }> {
  const sorted = [...rows].sort((a, b) => b.earned - a.earned || a.wrong - b.wrong);
  let rank = 1;
  return sorted.map((row, index) => {
    if (index && (row.earned !== sorted[index - 1].earned || row.wrong !== sorted[index - 1].wrong)) rank = index + 1;
    return { ...row, rank };
  });
}
