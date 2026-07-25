import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import {
  getLeagueWithTemplate,
  getLeaderboard,
  getChampionStatus,
  getPickResults,
  getTeamRegistry,
  getTemplateMatches,
} from "@/lib/league-data";
import LeaderboardLive from "@/components/LeaderboardLive";
import PickEntry from "@/components/PickEntry";
import LockedState from "@/components/LockedState";
import JoinPrompt from "@/components/JoinPrompt";

export const dynamic = "force-dynamic";

export default async function LeaguePage({
  params,
}: {
  params: { league_id: string };
}) {
  const leagueId = params.league_id;
  const cookieStore = cookies();

  const participantCookie = cookieStore.get("bfyi_participant")?.value;
  const leagueCookie = cookieStore.get("bfyi_league")?.value;

  const hasParticipant = participantCookie?.startsWith(`${leagueId}:`);
  const hasLeagueToken = leagueCookie?.startsWith(`${leagueId}:`);

  const league = await getLeagueWithTemplate(leagueId);
  if (!league) notFound();

  const isLocked =
    !!league.locked_at && new Date(league.locked_at) <= new Date();

  // ── already submitted picks → show leaderboard ───────────────────────────
  if (hasParticipant) {
    const [rows, champions, picks, teamRegistry] = await Promise.all([
      getLeaderboard(leagueId),
      getChampionStatus(leagueId),
      getPickResults(leagueId),
      league.template_id
        ? getTeamRegistry(league.template_id)
        : Promise.resolve([]),
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

  // ── has join token, hasn't submitted yet ─────────────────────────────────
  if (hasLeagueToken) {
    if (isLocked) {
      return (
        <LockedState
          leagueName={league.name}
          lockedAt={league.locked_at!}
          leagueId={leagueId}
        />
      );
    }

    // fetch data for pick entry
    const [matches, teamRegistry] = await Promise.all([
      league.template_id
        ? getTemplateMatches(league.template_id)
        : Promise.resolve([]),
      league.template_id
        ? getTeamRegistry(league.template_id)
        : Promise.resolve([]),
    ]);

    return (
      <PickEntry league={league} matches={matches} teamRegistry={teamRegistry} />
    );
  }

  // ── no credentials ────────────────────────────────────────────────────────
  if (isLocked) {
    // Public leaderboard after lock
    const [rows, champions, picks, teamRegistry] = await Promise.all([
      getLeaderboard(leagueId),
      getChampionStatus(leagueId),
      getPickResults(leagueId),
      league.template_id
        ? getTeamRegistry(league.template_id)
        : Promise.resolve([]),
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

  // Pre-lock, no credentials → invite-only prompt
  return <JoinPrompt leagueName={league.name} />;
}
