import { notFound } from "next/navigation";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  getLeagueWithTemplate,
  getTemplateMatches,
  getTeamRegistry,
  getEffectiveResults,
} from "@/lib/league-data";
import { AdminConsole } from "@/components/AdminConsole";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  params,
}: {
  params: { league_id: string };
}) {
  const { league_id } = params;
  const supabase = getAdminClient();

  const league = await getLeagueWithTemplate(league_id);
  if (!league) notFound();

  const [participants, matches, teamRegistry] = await Promise.all([
    supabase
      .from("participants")
      .select("id, display_name, emoji, magic_token, created_at")
      .eq("league_id", league_id)
      .order("created_at"),
    league.template_id
      ? getTemplateMatches(league.template_id)
      : Promise.resolve([]),
    league.template_id
      ? getTeamRegistry(league.template_id)
      : Promise.resolve([]),
  ]);

  const results =
    league.template_id
      ? await getEffectiveResults(league_id, league.template_id)
      : [];

  return (
    <AdminConsole
      league={league}
      participants={participants.data ?? []}
      matches={matches}
      teamRegistry={teamRegistry}
      initialResults={results}
    />
  );
}
