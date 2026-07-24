import type { ScoringConfig, ScoringPreset } from "./types";

// ============================================================
// Scoring preset definitions
// WC2026 "Boyz rules" = late_rounds_matter
// ============================================================
export const SCORING_PRESETS: Record<
  Exclude<ScoringPreset, "custom">,
  ScoringConfig
> = {
  flat: {
    round_points: { "1": 1, "2": 1, "3": 1, "4": 1, "5": 1, "6": 1 },
    champion_bonus: 0,
    has_third_place: false,
    tiebreakers: ["fewest_wrong"],
  },
  classic_escalating: {
    round_points: { "1": 1, "2": 2, "3": 4, "4": 8, "5": 16, "6": 32 },
    champion_bonus: 0,
    has_third_place: false,
    tiebreakers: ["fewest_wrong"],
  },
  late_rounds_matter: {
    // WC2026 "Boyz rules": R32/R16 = 1pt, QF/SF = 2pt, THIRD = 1pt, champion +2
    round_points: { "1": 1, "2": 1, "3": 2, "4": 2, "5": 1 },
    champion_bonus: 2,
    has_third_place: true,
    tiebreakers: ["champion_correct", "fewest_wrong"],
  },
  upset_hunter: {
    round_points: { "1": 1, "2": 1, "3": 2, "4": 2, "5": 1 },
    champion_bonus: 2,
    has_third_place: false,
    tiebreakers: ["champion_correct", "fewest_wrong"],
    // upset_bonus applied at app layer based on odds data
  },
};

// Points for a given round under a scoring config.
export function pointsForRound(config: ScoringConfig, round: number): number {
  return config.round_points[round.toString()] ?? 0;
}

// Perfect score: sum of all round maxima + champion bonus.
// rounds: array of [round_number, match_count] tuples for the bracket.
export function perfectScore(
  config: ScoringConfig,
  rounds: [number, number][]
): number {
  const bracketPoints = rounds.reduce(
    (sum, [round, count]) => sum + pointsForRound(config, round) * count,
    0
  );
  return bracketPoints + config.champion_bonus;
}
