export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import {
  getLeagueWithTemplate,
  getParticipantByMagicToken,
  getPickResults,
  getTeamRegistry,
  getTemplateMatches,
} from "@/lib/league-data";
import BracketLive from "@/components/BracketLive";
import PickEmBracket from "@/components/PickEmBracket";
import type { PickemTopology } from "@/lib/types";

export default async function BracketPage(
  props: {
    params: Promise<{ league_id: string; magic_token: string }>;
  }
) {
  const params = await props.params;
  const { league_id, magic_token } = params;

  const participant = await getParticipantByMagicToken(league_id, magic_token);

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
