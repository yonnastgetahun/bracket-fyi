import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  getLeagueWithTemplate,
  validateLeagueCredential,
  getParticipants,
  getTemplateMatches,
  getTeamRegistry,
  getEffectiveResults,
} from "@/lib/league-data";
import { AdminConsole } from "@/components/AdminConsole";
import type { PickemTopology } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPage(
  props: {
    params: Promise<{ league_id: string }>;
  }
) {
  const params = await props.params;
  const { league_id } = params;
  const cookieStore = await cookies();
  if (!await validateLeagueCredential(
    league_id, cookieStore.get("bfyi_organizer")?.value, "organizer"
  )) notFound();

  const league = await getLeagueWithTemplate(league_id);
  if (!league) notFound();

  const [participants, matches, teamRegistry] = await Promise.all([
    getParticipants(league_id),
    league.template_id
      ? getTemplateMatches(league.template_id)
      : Promise.resolve([]),
    league.template_id
      ? getTeamRegistry(league.template_id, league.id)
      : Promise.resolve([]),
  ]);

  const results =
    league.template_id
      ? await getEffectiveResults(league_id, league.template_id)
      : [];

  const { count: pickCount } = await getAdminClient()
    .from("picks")
    .select("*", { count: "exact", head: true })
    .eq("league_id", league_id);

  const templateType = league.template_type ?? null;
  const categories =
    league.template_type === "pickem"
      ? ((league.template_topology as PickemTopology)?.categories ?? [])
      : [];

  return (
    <AdminConsole
      league={league}
      participants={participants}
      matches={matches}
      teamRegistry={teamRegistry}
      initialResults={results}
      hasPicks={(pickCount ?? 0) > 0}
      templateType={templateType}
      categories={categories}
    />
  );
}
