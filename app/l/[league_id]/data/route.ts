import { NextRequest, NextResponse } from "next/server";
import { UUID_RE } from "@/lib/auth/organizer-cookie";
import {
  getLeagueWithTemplate, getParticipantByMagicToken, scopedCookieToken,
  validateLeagueCredential, getPickResults, getLeaderboard, getChampionStatus,
  getEffectiveResults,
} from "@/lib/league-data";

export const dynamic = "force-dynamic";

// Under /l so the existing HTTP-only, league-path-scoped cookies reach this read.
export async function GET(request: NextRequest, props: {
  params: Promise<{ league_id: string }>;
}) {
  const { league_id: id } = await props.params;
  const json = (body: unknown, status = 200) => NextResponse.json(body, {
    status, headers: { "Cache-Control": "no-store" },
  });
  if (!UUID_RE.test(id)) return json({ error: "Not found" }, 404);
  const league = await getLeagueWithTemplate(id);
  if (!league) return json({ error: "Not found" }, 404);
  const participantId = request.nextUrl.searchParams.get("participantId");
  if (participantId && !UUID_RE.test(participantId)) return json({ error: "Invalid participant" }, 400);
  const publicResults = !!league.locked_at && new Date(league.locked_at) <= new Date();
  const resultsOnly = request.nextUrl.searchParams.get("view") === "results";

  if (!publicResults) {
    const token = scopedCookieToken(id, request.cookies.get("bfyi_participant")?.value);
    const participant = token ? await getParticipantByMagicToken(id, token) : null;
    if (resultsOnly) {
      const allowed = participant ||
        await validateLeagueCredential(id, request.cookies.get("bfyi_league")?.value, "join") ||
        await validateLeagueCredential(id, request.cookies.get("bfyi_organizer")?.value, "organizer");
      if (!allowed) return json({ error: "Forbidden" }, 403);
    } else if (!participant || participant.id !== participantId) {
      return json({ error: "Forbidden" }, 403);
    }
  }

  if (resultsOnly) {
    return json({ results: league.template_id ? await getEffectiveResults(id, league.template_id) : [] });
  }
  if (participantId) return json({ picks: await getPickResults(id, participantId) });
  const [rows, champions, picks] = await Promise.all([
    getLeaderboard(id), getChampionStatus(id), getPickResults(id),
  ]);
  return json({ rows, champions, picks });
}
