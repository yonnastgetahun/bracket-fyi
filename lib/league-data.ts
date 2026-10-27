import { UUID_RE } from "@/lib/auth/organizer-cookie";
import { getAdminClient } from "@/lib/supabase/admin";
import type {
  LeagueWithTemplate,
  LeaderboardRow,
  PickResultRow,
  ChampionStatusRow,
  TemplateMatch,
  TeamEntry,
  Participant,
} from "@/lib/types";

const LEADERBOARD_FIELDS = "participant_id, league_id, display_name, emoji, joined_at, points, champion_points, total_points, max_possible, correct_picks, wrong_picks, pending_picks, champion_team_id, champion_correct, rank";
const CHAMPION_FIELDS = "participant_id, league_id, champion_team_id, champion_bonus, champion_correct, champion_points";
const PICK_FIELDS = "pick_id, league_id, participant_id, slot_id, picked_team_id, locked, round, template_id, scheduled_at, points_value, winner_team_id, is_correct, points_earned, still_possible";
const MATCH_FIELDS = "id, template_id, round, match_number, home_slot, away_slot, scheduled_at";

export async function getLeagueWithTemplate(
  leagueId: string
): Promise<LeagueWithTemplate | null> {
  const { data } = await getAdminClient()
    .from("leagues")
    .select("id, name, template_id, scoring_config, announcement_text, locked_at, status, created_at, templates!template_id(type, topology)")
    .eq("id", leagueId)
    .single();
  if (!data) return null;
  const template = (data as Record<string, unknown>).templates as
    | { type: string; topology: unknown }
    | null;
  return {
    id: data.id,
    name: data.name,
    template_id: data.template_id,
    scoring_config: data.scoring_config,
    announcement_text: data.announcement_text,
    locked_at: data.locked_at,
    status: data.status,
    created_at: data.created_at,
    template_type: (template?.type as LeagueWithTemplate["template_type"]) ?? null,
    template_topology:
      (template?.topology as LeagueWithTemplate["template_topology"]) ?? null,
  };
}

export async function getLeaderboard(leagueId: string): Promise<LeaderboardRow[]> {
  const { data } = await getAdminClient()
    .from("v_leaderboard")
    .select(LEADERBOARD_FIELDS)
    .eq("league_id", leagueId)
    .order("rank");
  return (data ?? []).map(row => displayDTO<LeaderboardRow>(row, LEADERBOARD_FIELDS));
}

export async function getChampionStatus(leagueId: string): Promise<ChampionStatusRow[]> {
  const { data } = await getAdminClient()
    .from("v_champion_status")
    .select(CHAMPION_FIELDS)
    .eq("league_id", leagueId);
  return (data ?? []).map(row => displayDTO<ChampionStatusRow>(row, CHAMPION_FIELDS));
}

export async function getPickResults(
  leagueId: string,
  participantId?: string
): Promise<PickResultRow[]> {
  let query = getAdminClient()
    .from("v_pick_results")
    .select(PICK_FIELDS)
    .eq("league_id", leagueId);
  if (participantId) {
    query = query.eq("participant_id", participantId);
  }
  const { data } = await query;
  return (data ?? []).map(row => displayDTO<PickResultRow>(row, PICK_FIELDS));
}

export async function getTemplateMatches(templateId: string): Promise<TemplateMatch[]> {
  const { data } = await getAdminClient()
    .from("template_matches")
    .select(MATCH_FIELDS)
    .eq("template_id", templateId)
    .order("round")
    .order("match_number");
  return (data ?? []).map(row => displayDTO<TemplateMatch>(row, MATCH_FIELDS));
}

export async function getTeamRegistry(templateId: string): Promise<TeamEntry[]> {
  const { data } = await getAdminClient()
    .from("templates")
    .select("team_registry")
    .eq("id", templateId)
    .single();
  return (data?.team_registry as TeamEntry[]) ?? [];
}

export async function getEffectiveResults(
  leagueId: string,
  templateId: string
): Promise<Array<{ template_match_id: string; winner_team_id: string | null }>> {
  const { data } = await getAdminClient()
    .from("effective_results")
    .select("template_match_id, winner_team_id")
    .eq("template_id", templateId)
    .eq("league_id", leagueId);

  // effective_results LEFT joins league overrides so rows missing league_id appear too
  // We only want rows that either have no league_id (template-level) or match ours.
  // The view includes a league_id column (from the left join) — rows without an override
  // for this league still appear but with null league_id. That's fine — we still get
  // winner_team_id from the template result column.
  return (data ?? []).map(row => ({ template_match_id: row.template_match_id, winner_team_id: row.winner_team_id }));
}

function participantDTO(row: Participant): Participant {
  return { id: row.id, league_id: row.league_id, display_name: row.display_name,
    emoji: row.emoji, created_at: row.created_at };
}

export async function getParticipants(leagueId: string): Promise<Participant[]> {
  const { data } = await getAdminClient()
    .from("participants")
    .select("id, league_id, display_name, emoji, created_at")
    .eq("league_id", leagueId)
    .order("created_at");
  return (data ?? []).map(participantDTO);
}

export async function getParticipantByMagicToken(
  leagueId: string,
  magicToken: string
): Promise<Participant | null> {
  if (!UUID_RE.test(leagueId) || !UUID_RE.test(magicToken)) return null;
  const { data, error } = await getAdminClient()
    .from("participants")
    .select("id, league_id, display_name, emoji, created_at")
    .eq("league_id", leagueId)
    .eq("magic_token", magicToken)
    .maybeSingle();
  return !error && data ? participantDTO(data) : null;
}

export interface PublicTemplate {
  id: string;
  name: string;
  type: string;
  team_registry: TeamEntry[];
  scoring_defaults: import("./types").ScoringConfig | null;
  topology: import("./types").BracketTopology | import("./types").PickemTopology | null;
}

export async function getPublicTemplates(): Promise<PublicTemplate[]> {
  const { data } = await getAdminClient()
    .from("templates")
    .select("id, name, type, team_registry, scoring_defaults, topology")
    .in("name", [
      "Greatest Rap Albums",
      "March Madness Sweet 16 (2025)",
      "Oscars 2025 (97th Academy Awards)",
    ]);
  return (data ?? []) as PublicTemplate[];
}

// A path-scoped cookie is a credential claim, not an authorization decision.
export function scopedCookieToken(leagueId: string, value?: string): string | null {
  if (!UUID_RE.test(leagueId) || !value) return null;
  const parts = value.split(":");
  return parts.length === 2 && parts[0] === leagueId && UUID_RE.test(parts[1])
    ? parts[1] : null;
}

export async function validateLeagueCredential(
  leagueId: string,
  cookie: string | undefined,
  kind: "organizer" | "join"
): Promise<boolean> {
  const token = scopedCookieToken(leagueId, cookie);
  if (!token) return false;
  const { data, error } = await getAdminClient().from("leagues")
    .select("id").eq("id", leagueId).eq(kind + "_token", token).single();
  return !error && !!data;
}

function displayDTO<T>(row: Record<string, unknown>, fields: string): T {
  return Object.fromEntries(fields.split(", ").map(key => [key, row[key]])) as T;
}
