export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  getLeagueWithTemplate,
  getPickResults,
  getTeamRegistry,
  getTemplateMatches,
} from "@/lib/league-data";
import BracketLive from "@/components/BracketLive";
import PickEmBracket from "@/components/PickEmBracket";
import type { PickemTopology } from "@/lib/types";

export default async function BracketPage({
  params,
}: {
  params: { league_id: string; magic_token: string };
}) {
  const { league_id, magic_token } = params;

  const { data: participant } = await getAdminClient()
    .from("participants")
    .select("id, display_name, emoji, league_id")
    .eq("magic_token", magic_token)
    .eq("league_id", league_id)
    .single();

  if (!participant) notFound();

  const league = await getLeagueWithTemplate(league_id);
  if (!league) notFound();

  const [picks, teamRegistry, matches] = await Promise.all([
    getPickResults(league_id, participant.id),
    league.template_id
      ? getTeamRegistry(league.template_id)
      : Promise.resolve([]),
    league.template_id
      ? getTemplateMatches(league.template_id)
      : Promise.resolve([]),
  ]);

  const teamMap: Record<string, string> = Object.fromEntries(
    teamRegistry.map((t) => [t.id, t.name])
  );

  // Pick'em format
  if (league.template_type === "pickem") {
    const categories =
      (league.template_topology as PickemTopology)?.categories ?? [];
    return (
      <PickEmBracket
        participant={participant}
        initialPicks={picks}
        teamMap={teamMap}
        league={league}
        categories={categories}
        templateMatches={matches}
      />
    );
  }

  return (
    <BracketLive
      participant={participant}
      initialPicks={picks}
      teamMap={teamMap}
      league={league}
      matches={matches}
    />
  );
}
