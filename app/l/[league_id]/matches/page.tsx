export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import {
  getLeagueWithTemplate,
  getTeamRegistry,
  getTemplateMatches,
  getEffectiveResults,
} from "@/lib/league-data";
import MatchesLive from "@/components/MatchesLive";

export default async function MatchesPage({
  params,
}: {
  params: { league_id: string };
}) {
  const { league_id } = params;

  const league = await getLeagueWithTemplate(league_id);
  if (!league) notFound();

  const [teamRegistry, matches, effectiveResults] = await Promise.all([
    league.template_id ? getTeamRegistry(league.template_id) : Promise.resolve([]),
    league.template_id ? getTemplateMatches(league.template_id) : Promise.resolve([]),
    league.template_id
      ? getEffectiveResults(league_id, league.template_id)
      : Promise.resolve([]),
  ]);

  const teamMap: Record<string, string> = Object.fromEntries(
    teamRegistry.map((t) => [t.id, t.name])
  );

  // seed -> team id map (for resolving round-1 slots like "s1", "s2")
  const seedMap: Record<number, string> = Object.fromEntries(
    teamRegistry
      .filter((t) => t.seed != null)
      .map((t) => [t.seed as number, t.id])
  );

  return (
    <MatchesLive
      leagueId={league_id}
      templateId={league.template_id ?? ""}
      initialMatches={matches}
      teamMap={teamMap}
      seedMap={seedMap}
      initialResults={effectiveResults}
    />
  );
}
