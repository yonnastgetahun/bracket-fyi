// ============================================================
// Bracket.fyi — Core types (multi-tenant, template-agnostic)
// ============================================================

// ============================================================
// Scoring config — bracket vs pickem union
// ============================================================

// Bracket scoring: round-based points
export interface BracketScoringConfig {
  round_points: Record<string, number>; // {"1": 1, "2": 1, "3": 2, "4": 2}
  champion_bonus: number;
  has_third_place: boolean;
  tiebreakers: TiebreakerKey[];
}

// Pickem scoring: category-based points
export interface PickemScoringConfig {
  scheme: "pickem_flat" | "pickem_weighted";
  major_categories?: string[]; // for weighted mode
  major_points?: number;
  other_points?: number;
  tiebreakers?: TiebreakerKey[];
}

// ScoringConfig: bracket-centric shape that also accommodates pickem via optional fields.
// League.scoring_config is stored in the DB as either bracket or pickem JSON.
// Bracket components (PickEntry, BracketLive, LeaderboardLive) safely access
// bracket fields because they're only passed bracket leagues.
// Pickem-specific components cast via isPickemConfig().
export type ScoringConfig = BracketScoringConfig & Partial<PickemScoringConfig> | PickemScoringConfig & Partial<BracketScoringConfig>;

// Type guards
export function isPickemConfig(c: ScoringConfig): c is PickemScoringConfig {
  return "scheme" in c;
}
export function isBracketConfig(c: ScoringConfig): c is BracketScoringConfig {
  return "round_points" in c;
}

export type TiebreakerKey =
  | "champion_correct"
  | "fewest_wrong"
  | "most_correct_latest_round"
  | "closest_final_score"
  | "earliest_submission"
  | "co_champions";

// Scoring presets (organizer selects one in F4 configurator)
export type ScoringPreset =
  | "flat"
  | "classic_escalating"
  | "late_rounds_matter"
  | "upset_hunter"
  | "custom";

// ============================================================
// Template (defines tournament structure, shared across leagues)
// ============================================================
export type TemplateType = "bracket" | "pickem";

export interface TeamEntry {
  id: string;
  name: string;
  aliases: string[];
  flag_emoji?: string | null;
  seed?: number | null;
}

// Pickem category (one per Oscar category, one per pick)
export interface PickemCategory {
  id: string;
  name: string;
  nominees: string[]; // team_registry IDs
  winner?: string; // team_registry ID if resolved
}

export interface BracketTopology {
  rounds: number;
  slots_per_round: number[];
  has_third_place: boolean;
}

export interface PickemTopology {
  type: "pickem";
  categories: PickemCategory[];
}

export interface TemplateSchedule {
  lock_time: string | null; // ISO timestamp
  match_times: Record<string, string>; // template_match_id → ISO timestamp
}

export interface Template {
  id: string;
  name: string;
  type: TemplateType;
  topology: BracketTopology | PickemTopology | null;
  team_registry: TeamEntry[];
  schedule: TemplateSchedule | null;
  scoring_defaults: ScoringConfig;
  results_provider: string | null;
  created_at: string;
}

// ============================================================
// League (one friend group's run of a template)
// ============================================================
export type LeagueStatus = "active" | "locked" | "complete";

export interface League {
  id: string;
  name: string;
  template_id: string | null;
  scoring_config: ScoringConfig;
  announcement_text: string | null;
  locked_at: string | null;
  status: LeagueStatus;
  created_at: string;
}

// League with joined template info (returned by getLeagueWithTemplate)
export interface LeagueWithTemplate extends League {
  template_type: TemplateType | null;
  template_topology: BracketTopology | PickemTopology | null;
}

// ============================================================
// Participant (one person in one league)
// ============================================================
export interface Participant {
  id: string;
  league_id: string;
  display_name: string;
  emoji: string | null;
  created_at: string;
}

// ============================================================
// Template match (shared bracket schedule per template)
// ============================================================
export interface TemplateMatch {
  id: string;
  template_id: string;
  round: number;
  match_number: number;
  home_slot: string;
  away_slot: string;
  scheduled_at: string | null;
}

// ============================================================
// Derived scoring view rows (returned by Supabase queries)
// ============================================================
export interface PickResultRow {
  pick_id: string;
  league_id: string;
  participant_id: string;
  slot_id: string; // template_match_id or 'champion'
  picked_team_id: string;
  locked: boolean;
  round: number;
  template_id: string;
  scheduled_at: string | null;
  points_value: number;
  winner_team_id: string | null;
  is_correct: boolean | null;
  points_earned: number;
  still_possible: boolean;
}

export interface ChampionStatusRow {
  participant_id: string;
  league_id: string;
  champion_team_id: string;
  champion_bonus: number;
  champion_correct: boolean | null;
  champion_points: number;
}

export interface LeaderboardRow {
  participant_id: string;
  league_id: string;
  display_name: string;
  emoji: string | null;
  joined_at: string;
  points: number;
  champion_points: number;
  total_points: number;
  max_possible: number;
  correct_picks: number;
  wrong_picks: number;
  pending_picks: number;
  champion_team_id: string | null;
  champion_correct: boolean | null;
  rank: number;
}

export interface ContentionRow extends LeaderboardRow {
  eliminated_from_contention: boolean;
}
