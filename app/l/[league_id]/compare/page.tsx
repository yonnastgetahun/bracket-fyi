export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import {
  getLeagueWithTemplate,
  getTeamRegistry,
  getTemplateMatches,
  getPickResults,
  getParticipants,
} from "@/lib/league-data";
import CompareLive from "@/components/CompareLive";

export default async function ComparePage({
  params,
}: {
  params: { league_id: string };
}) {
  const { league_id } = params;

  const league = await getLeagueWithTemplate(league_id);
  if (!league) notFound();

  const [participants, allPicks, teamRegistry, matches] = await Promise.all([
    getParticipants(league_id),
    getPickResults(league_id),
    league.template_id ? getTeamRegistry(league.template_id) : Promise.resolve([]),
    league.template_id ? getTemplateMatches(league.template_id) : Promise.resolve([]),
  ]);

  const teamMap: Record<string, string> = Object.fromEntries(
    teamRegistry.map((t) => [t.id, t.name])
  );

  const seedMap: Record<number, string> = Object.fromEntries(
    teamRegistry
      .filter((t) => t.seed != null)
      .map((t) => [t.seed as number, t.id])
  );

  return (
    <CompareLive
      leagueId={league_id}
      initialParticipants={participants}
      initialPicks={allPicks}
      matches={matches}
      teamMap={teamMap}
      seedMap={seedMap}
    />
  );
}
