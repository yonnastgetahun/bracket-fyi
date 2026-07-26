import CreateFlow from "@/components/CreateFlow";
import { getPublicTemplates } from "@/lib/league-data";
import { getAdminClient } from "@/lib/supabase/admin";
import type { TeamEntry, ScoringConfig } from "@/lib/types";

const PUBLIC_TEMPLATE_NAMES = [
  "Greatest Rap Albums",
  "March Madness Sweet 16 (2025)",
  "Oscars 2025 (97th Academy Awards)",
];

export interface LeaguePrefill {
  originalName: string;
  templateId: string | null;
  templateType: "bracket" | "pickem" | null;
  scoringConfig: ScoringConfig;
  competitors: Array<{ id: string; name: string }>;
  isCustomTemplate: boolean;
  isRapAlbums: boolean;
}

async function fetchLeaguePrefill(leagueId: string): Promise<LeaguePrefill | null> {
  const db = getAdminClient();

  const { data, error } = await db
    .from("leagues")
    .select("id, name, template_id, scoring_config, templates!template_id(name, type, team_registry)")
    .eq("id", leagueId)
    .single();

  if (error || !data) return null;

  const template = (data as Record<string, unknown>).templates as
    | { name: string; type: string; team_registry: TeamEntry[] }
    | null;

  const templateType = (template?.type ?? null) as "bracket" | "pickem" | null;
  const templateName = template?.name ?? null;
  const isCustomTemplate = templateName !== null && !PUBLIC_TEMPLATE_NAMES.includes(templateName);
  const isRapAlbums = templateName === "Greatest Rap Albums";

  let competitors: Array<{ id: string; name: string }> = [];
  if (isCustomTemplate && templateType === "bracket" && template?.team_registry) {
    competitors = (template.team_registry as TeamEntry[])
      .filter((t) => !t.id.startsWith("bye-"))
      .map((t) => ({ id: t.id, name: t.name }));
  }

  return {
    originalName: data.name,
    templateId: data.template_id,
    templateType,
    scoringConfig: data.scoring_config as ScoringConfig,
    competitors,
    isCustomTemplate,
    isRapAlbums,
  };
}

export default async function CreatePage({
  searchParams,
}: {
  searchParams: { from?: string };
}) {
  const templates = await getPublicTemplates();
  let prefill: LeaguePrefill | null = null;
  if (searchParams.from) {
    prefill = await fetchLeaguePrefill(searchParams.from);
  }

  return (
    <main className="min-h-screen bg-canvas">
      <div className="max-w-md mx-auto px-6 py-12">
        <a href="/" className="block mb-8 text-sm text-secondary hover:text-primary">
          bracket.fyi
        </a>
        <CreateFlow templates={templates} prefill={prefill} />
      </div>
    </main>
  );
}
