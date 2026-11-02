import { createHash } from "node:crypto";
import { listEventDefinitions, type EventDefinition, type EventKey } from "./catalog";
import type { SeedConfig, TemplateSeedRepository } from "./template-seeder";

const UUID_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type DbResult<T> = { data: T | null; error: { message?: string; code?: string } | null };
type Query<T> = PromiseLike<DbResult<T>>;
type FilterQuery<T> = Query<T> & { eq(column: string, value: unknown): FilterQuery<T>; order(column: string, options?: { ascending?: boolean }): FilterQuery<T>; maybeSingle(): Query<T> };
type InsertQuery<T> = Query<T> & { select(columns?: string): Query<T> };
export interface TemplateSeedSupabaseClient {
  from(table: "templates"): { select(columns: string): FilterQuery<TemplateRow[]>; insert(values: TemplateInsert): InsertQuery<TemplateRow[]> };
  from(table: "event_template_configs"): { select(columns: string): FilterQuery<ConfigRow[]>; insert(values: ConfigInsert): InsertQuery<ConfigRow[]> };
}
type TemplateRow = { id: string; name: string; type: "bracket" | "pickem"; topology: unknown; team_registry: unknown; schedule: unknown; scoring_defaults: unknown; results_provider: string | null };
type TemplateInsert = Pick<TemplateRow, "id" | "name" | "type" | "topology" | "team_registry" | "schedule" | "scoring_defaults" | "results_provider">;
type ConfigRow = { template_id: string; version: number; sealed: boolean; manifest: EventDefinition };
type ConfigInsert = ConfigRow;

/** UUIDv5-style SHA-1 identity; namespace is fixed and input is the exact catalog key. */
export function templateIdForKey(key: EventKey): string {
  const ns = UUID_NAMESPACE.replaceAll("-", "");
  const namespaceBytes = Buffer.from(ns, "hex");
  const bytes = createHash("sha1").update(namespaceBytes).update(key, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function dbError(error: { message?: string; code?: string } | null): Error | null {
  return error ? new Error(`Supabase template seed operation failed${error.code ? ` (${error.code})` : ""}${error.message ? `: ${error.message}` : ""}`) : null;
}
function assertTemplate(row: TemplateRow, id: string, name: string, type: TemplateRow["type"]): void {
  if (row.id !== id || row.name !== name || row.type !== type || row.topology !== null || row.schedule !== null || JSON.stringify(row.team_registry) !== "[]" || JSON.stringify(row.scoring_defaults) !== "{}" || row.results_provider !== null) {
    throw new Error(`Template identity collision or drift for deterministic id ${id}`);
  }
}

export class SupabaseTemplateSeedRepository implements TemplateSeedRepository {
  constructor(private readonly client: TemplateSeedSupabaseClient) {}

  async ensureTemplate(key: EventKey, label: string): Promise<{ id: string }> {
    const id = templateIdForKey(key);
    if (!UUID_RE.test(id)) throw new Error("Derived template identity is not a valid UUID");
    const definition = listEventDefinitions().find(item => item.key === key);
    if (!definition || definition.label !== label) throw new Error(`Unknown catalog template key or label: ${key}`);
    const type = key === "oscars-2027" ? "pickem" : "bracket";
    const read = async (): Promise<TemplateRow | null> => {
      const result = await this.client.from("templates").select("id,name,type,topology,team_registry,schedule,scoring_defaults,results_provider").eq("id", id).maybeSingle() as unknown as DbResult<TemplateRow>;
      const failure = dbError(result.error); if (failure) throw failure;
      return result.data;
    };
    const current = await read();
    if (current) { assertTemplate(current, id, label, type); return { id }; }
    const values: TemplateInsert = { id, name: label, type, topology: null, team_registry: [], schedule: null, scoring_defaults: {}, results_provider: null };
    const inserted = await this.client.from("templates").insert(values).select("id,name,type,topology,team_registry,schedule,scoring_defaults,results_provider") as DbResult<TemplateRow[]>;
    if (!inserted.error) {
      const row = inserted.data?.[0];
      if (!row) throw new Error(`Supabase inserted template ${id} without returning its row`);
      assertTemplate(row, id, label, type);
      return { id };
    }
    // Conflict, transport failure, or lost acknowledgement: accept only exact read-back.
    let recovered: TemplateRow | null;
    try { recovered = await read(); } catch { throw dbError(inserted.error)!; }
    if (recovered) { assertTemplate(recovered, id, label, type); return { id }; }
    throw dbError(inserted.error)!;
  }

  async listConfigs(templateId: string): Promise<readonly SeedConfig[]> {
    const result = await this.client.from("event_template_configs").select("template_id,version,sealed,manifest").eq("template_id", templateId).order("version", { ascending: true }) as DbResult<ConfigRow[]>;
    const failure = dbError(result.error); if (failure) throw failure;
    return (result.data ?? []).map(row => ({ templateId: row.template_id, version: row.version, sealed: row.sealed, manifest: row.manifest }));
  }

  async insertConfig(config: SeedConfig): Promise<void> {
    const values: ConfigInsert = { template_id: config.templateId, version: config.version, sealed: config.sealed, manifest: config.manifest };
    const result = await this.client.from("event_template_configs").insert(values).select("template_id") as DbResult<unknown>;
    const failure = dbError(result.error); if (failure) throw failure;
  }
}
