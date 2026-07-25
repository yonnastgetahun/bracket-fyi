import { notFound } from "next/navigation";
import {
  getLeagueWithTemplate,
  getLeaderboard,
  getChampionStatus,
  getPickResults,
  getTeamRegistry,
} from "@/lib/league-data";
import LeaderboardLive from "@/components/LeaderboardLive";

export const dynamic = "force-dynamic";

export default async function LeaguePage({
  params,
}: {
  params: { league_id: string };
}) {
  const leagueId = params.league_id;

  const league = await getLeagueWithTemplate(leagueId);
  if (!league) notFound();

  const [rows, champions, picks, teamRegistry] = await Promise.all([
    getLeaderboard(leagueId),
    getChampionStatus(leagueId),
    getPickResults(leagueId),
    league.template_id ? getTeamRegistry(league.template_id) : Promise.resolve([]),
  ]);

  const teamRegistryMap: Record<string, string> = {};
  for (const t of teamRegistry) {
    teamRegistryMap[t.id] = t.name;
  }

  return (
    <LeaderboardLive
      leagueId={leagueId}
      initialRows={rows}
      initialChampions={champions}
      initialPicks={picks}
      league={league}
      teamRegistry={teamRegistryMap}
    />
  );
}
