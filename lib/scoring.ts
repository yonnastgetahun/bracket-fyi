import type {
  BracketScoringConfig,
  PickemScoringConfig,
  PickemCategory,
  ScoringPreset,
} from "./types";

// ============================================================
// Bracket scoring preset definitions
// WC2026 "Boyz rules" = late_rounds_matter
// ============================================================
export const SCORING_PRESETS: Record<
  Exclude<ScoringPreset, "custom">,
  BracketScoringConfig
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

// Points for a given round under a bracket scoring config.
export function pointsForRound(
  config: BracketScoringConfig,
  round: number
): number {
  return config.round_points[round.toString()] ?? 0;
}

// Perfect score: sum of all round maxima + champion bonus.
// rounds: array of [round_number, match_count] tuples for the bracket.
export function perfectScore(
  config: BracketScoringConfig,
  rounds: [number, number][]
): number {
  const bracketPoints = rounds.reduce(
    (sum, [round, count]) => sum + pointsForRound(config, round) * count,
    0
  );
  return bracketPoints + config.champion_bonus;
}

// ============================================================
// Pickem scoring presets
// ============================================================
export const PICKEM_PRESETS: Record<
  "pickem_flat" | "pickem_weighted",
  PickemScoringConfig
> = {
  pickem_flat: {
    scheme: "pickem_flat",
    other_points: 1,
    tiebreakers: ["fewest_wrong"],
  },
  pickem_weighted: {
    scheme: "pickem_weighted",
    major_categories: [
      "best-picture",
      "best-director",
      "best-actor",
      "best-actress",
      "best-supporting-actor",
      "best-supporting-actress",
    ],
    major_points: 3,
    other_points: 1,
    tiebreakers: ["fewest_wrong"],
  },
};

// Points for a single category under a pickem scoring config.
export function pointsForCategory(
  config: PickemScoringConfig,
  categoryId: string
): number {
  if (config.scheme === "pickem_flat") return config.other_points ?? 1;
  return config.major_categories?.includes(categoryId)
    ? (config.major_points ?? 3)
    : (config.other_points ?? 1);
}

// Perfect score for a pickem league (sum across all categories).
export function pickemPerfectScore(
  config: PickemScoringConfig,
  categories: PickemCategory[]
): number {
  return categories.reduce(
    (sum, cat) => sum + pointsForCategory(config, cat.id),
    0
  );
}
