import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import type { TeamEntry } from "@/lib/types";

// Public GET — returns safe league metadata (no tokens, no picks).
// Anyone with a league ID may query this; tokens are not exposed.

// The 3 seeded public template names (used to detect custom vs seeded)
const PUBLIC_TEMPLATE_NAMES = [
  "Greatest Rap Albums",
  "March Madness Sweet 16 (2025)",
  "Oscars 2025 (97th Academy Awards)",
];

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const db = getAdminClient();

  const { data, error } = await db
    .from("leagues")
    .select("id, name, template_id, scoring_config, templates!template_id(name, type, team_registry)")
    .eq("id", params.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "League not found" }, { status: 404 });
  }

  const template = (data as Record<string, unknown>).templates as
    | { name: string; type: string; team_registry: TeamEntry[] }
    | null;

  const templateType = (template?.type ?? null) as "bracket" | "pickem" | null;
  const templateName = template?.name ?? null;
  const isCustomTemplate = templateName !== null && !PUBLIC_TEMPLATE_NAMES.includes(templateName);

  // Return competitors only for custom bracket templates (not pickem, not seeded)
  let competitors: Array<{ id: string; name: string }> = [];
  if (isCustomTemplate && templateType === "bracket" && template?.team_registry) {
    competitors = (template.team_registry as TeamEntry[])
      .filter((t) => !t.id.startsWith("bye-"))
      .map((t) => ({ id: t.id, name: t.name }));
  }

  return NextResponse.json({
    id: data.id,
    name: data.name,
    template_id: data.template_id,
    template_type: templateType,
    scoring_config: data.scoring_config,
    competitors,
    is_custom_template: isCustomTemplate,
  });
}
