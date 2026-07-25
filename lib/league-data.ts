import { getAdminClient } from "@/lib/supabase/admin";
import type {
  League,
  LeaderboardRow,
  PickResultRow,
  ChampionStatusRow,
  TemplateMatch,
  TeamEntry,
  Participant,
} from "@/lib/types";

export async function getLeagueWithTemplate(leagueId: string): Promise<League | null> {
  const { data } = await getAdminClient()
    .from("leagues")
    .select("*")
    .eq("id", leagueId)
    .single();
  return data as League | null;
}

export async function getLeaderboard(leagueId: string): Promise<LeaderboardRow[]> {
  const { data } = await getAdminClient()
    .from("v_leaderboard")
    .select("*")
    .eq("league_id", leagueId)
    .order("rank");
  return (data ?? []) as LeaderboardRow[];
}

export async function getChampionStatus(leagueId: string): Promise<ChampionStatusRow[]> {
  const { data } = await getAdminClient()
    .from("v_champion_status")
    .select("*")
    .eq("league_id", leagueId);
  return (data ?? []) as ChampionStatusRow[];
}

export async function getPickResults(
  leagueId: string,
  participantId?: string
): Promise<PickResultRow[]> {
  let query = getAdminClient()
    .from("v_pick_results")
    .select("*")
    .eq("league_id", leagueId);
  if (participantId) {
    query = query.eq("participant_id", participantId);
  }
  const { data } = await query;
  return (data ?? []) as PickResultRow[];
}

export async function getTemplateMatches(templateId: string): Promise<TemplateMatch[]> {
  const { data } = await getAdminClient()
    .from("template_matches")
    .select("*")
    .eq("template_id", templateId)
    .order("round")
    .order("match_number");
  return (data ?? []) as TemplateMatch[];
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
  return (data ?? []) as Array<{ template_match_id: string; winner_team_id: string | null }>;
}

export async function getParticipants(leagueId: string): Promise<Participant[]> {
  const { data } = await getAdminClient()
    .from("participants")
    .select("*")
    .eq("league_id", leagueId)
    .order("created_at");
  return (data ?? []) as Participant[];
}

export async function getParticipantByMagicToken(
  leagueId: string,
  magicToken: string
): Promise<Participant | null> {
  const { data } = await getAdminClient()
    .from("participants")
    .select("*")
    .eq("league_id", leagueId)
    .eq("magic_token", magicToken)
    .maybeSingle();
  return data as Participant | null;
}
