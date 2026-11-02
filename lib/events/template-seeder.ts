import { listEventDefinitions, type EventDefinition } from "./catalog";

/** Mirrors event_template_configs identity; manifests stay unsealed until explicit review. */
export type SeedConfig = Readonly<{
  templateId: string;
  version: number;
  sealed: boolean;
  manifest: EventDefinition;
}>;

export interface TemplateSeedRepository {
  /** Resolve/create the stable template row by key. Must be safe to retry. */
  ensureTemplate(key: EventDefinition["key"], label: string): Promise<{ id: string }>;
  /** Read every version for this template; never silently update an existing config. */
  listConfigs(templateId: string): Promise<readonly SeedConfig[]>;
  /** Insert only; unique(template_id, version) conflicts must be surfaced/read back. */
  insertConfig(config: SeedConfig): Promise<void>;
}

export type SeedResult = Readonly<{ key: EventDefinition["key"]; templateId: string; version: number; disposition: "inserted" | "existing" }>;

export class TemplateSeedConflictError extends Error {
  constructor(message: string) { super(message); this.name = "TemplateSeedConflictError"; }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Seed exactly the nine catalog editions as draft/manual, unavailable for automation. */
export async function seedEventTemplates(repository: TemplateSeedRepository): Promise<readonly SeedResult[]> {
  const results: SeedResult[] = [];
  for (const definition of listEventDefinitions()) {
    if (definition.availability !== "draft" || definition.manualMode !== true || definition.automation !== "unavailable") {
      throw new TemplateSeedConflictError(`Unsafe availability metadata for ${definition.key}`);
    }
    const { id: templateId } = await repository.ensureTemplate(definition.key, definition.label);
    const configs = await repository.listConfigs(templateId);
    const sameVersion = configs.find(config => config.version === 1);
    if (sameVersion) {
      if (sameVersion.templateId !== templateId || sameVersion.sealed || stable(sameVersion.manifest) !== stable(definition)) {
        throw new TemplateSeedConflictError(`Existing version 1 config conflicts with catalog for ${definition.key}; no mutation attempted`);
      }
      results.push({ key: definition.key, templateId, version: 1, disposition: "existing" });
      continue;
    }
    if (configs.length) throw new TemplateSeedConflictError(`Version collision for ${definition.key}; refusing to create version 1 beside existing versions`);
    const candidate: SeedConfig = { templateId, version: 1, sealed: false, manifest: definition };
    try {
      await repository.insertConfig(candidate);
      results.push({ key: definition.key, templateId, version: 1, disposition: "inserted" });
    } catch (error) {
      // A concurrent/retried insert is accepted only after exact read-back; never update it.
      const raced = (await repository.listConfigs(templateId)).find(config => config.version === 1);
      if (!raced || raced.templateId !== templateId || raced.sealed || stable(raced.manifest) !== stable(definition)) throw error;
      results.push({ key: definition.key, templateId, version: 1, disposition: "existing" });
    }
  }
  return results;
}
