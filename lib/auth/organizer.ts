import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  organizerApiCookieName,
  UUID_RE,
} from "@/lib/auth/organizer-cookie";

type AdminClient = ReturnType<typeof getAdminClient>;

export interface AuthorizedLeague {
  id: string;
  template_id: string | null;
  status: "active" | "locked" | "complete";
  name: string;
}

export type OrganizerAuthorization =
  | { ok: true; supabase: AdminClient; league: AuthorizedLeague }
  | { ok: false; response: NextResponse };

function forbidden(): OrganizerAuthorization {
  return {
    ok: false,
    response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  };
}

export async function authorizeOrganizer(
  request: NextRequest,
  leagueId: string
): Promise<OrganizerAuthorization> {
  if (!UUID_RE.test(leagueId)) return forbidden();

  const token = request.cookies.get(organizerApiCookieName(leagueId))?.value;
  if (!token || !UUID_RE.test(token)) return forbidden();

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("leagues")
    .select("id, template_id, status, name")
    .eq("id", leagueId)
    .eq("organizer_token", token)
    .single();

  if (error || !data) return forbidden();

  return { ok: true, supabase, league: data as AuthorizedLeague };
}
