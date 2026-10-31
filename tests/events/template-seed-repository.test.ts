import { describe, expect, it } from "vitest";
import { listEventDefinitions } from "../../lib/events/catalog";
import { SupabaseTemplateSeedRepository, templateIdForKey, type TemplateSeedSupabaseClient } from "../../lib/events/template-seed-repository";

class FakeClient {
  templates = new Map<string, Record<string, unknown>>();
  configs: Record<string, unknown>[] = [];
  insertFailure: { message: string; code?: string } | null = null;
  queryLog: { table: string; op: string; values?: unknown }[] = [];
  from(table: "templates" | "event_template_configs") {
    let filter: [string, unknown] | null = null;
    const query = {
      select(): unknown { return query; },
      eq(column: string, value: unknown): unknown { filter = [column, value]; return query; },
      order(): unknown { return query; },
      maybeSingle: () => {
        const row = table === "templates" ? this.templates.get(String(filter?.[1])) ?? null : null;
        return Promise.resolve({ data: row, error: null });
      },
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
        const rows = table === "templates" ? [...this.templates.values()].filter(row => !filter || row[filter[0]] === filter[1]) : this.configs.filter(row => !filter || row[filter[0]] === filter[1]);
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
      insert: (values: Record<string, unknown>) => {
        this.queryLog.push({ table, op: "insert", values });
        return {
          select: () => {
            if (this.insertFailure) { const error = this.insertFailure; this.insertFailure = null; return Promise.resolve({ data: null, error }); }
            const row = { ...values };
            if (table === "templates") {
              if (this.templates.has(String(row.id))) return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate" } });
              this.templates.set(String(row.id), row);
            } else {
              if (this.configs.some(config => config.template_id === row.template_id && config.version === row.version)) return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate" } });
              this.configs.push(row);
            }
            return Promise.resolve({ data: [row], error: null });
          },
        };
      },
    };
    return query;
  }
}
const fake = (client: FakeClient) => new SupabaseTemplateSeedRepository(client as unknown as TemplateSeedSupabaseClient);
const row = (id: string, name: string, type: "bracket" | "pickem") => ({ id, name, type, topology: null, team_registry: [], schedule: null, scoring_defaults: {}, results_provider: null });

describe("SupabaseTemplateSeedRepository", () => {
  it("derives stable valid UUID identities and creates only allowlisted fields", async () => {
    const client = new FakeClient(); const repo = fake(client); const def = listEventDefinitions()[0];
    expect(templateIdForKey(def.key)).toBe(templateIdForKey(def.key));
    expect(templateIdForKey(def.key)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await repo.ensureTemplate(def.key, def.label)).toEqual({ id: templateIdForKey(def.key) });
    expect(client.queryLog[0].values).toEqual(row(templateIdForKey(def.key), def.label, "bracket"));
    const oscars = listEventDefinitions().find(item => item.key === "oscars-2027")!;
    await repo.ensureTemplate(oscars.key, oscars.label);
    expect(client.queryLog[1].values).toEqual(row(templateIdForKey(oscars.key), oscars.label, "pickem"));
  });

  it("reads by deterministic ID, accepts exact rows and rejects name-only matches or drift", async () => {
    const c = new FakeClient(), repo = fake(c), def = listEventDefinitions()[0], id = templateIdForKey(def.key);
    c.templates.set("other-id", row("other-id", def.label, "bracket"));
    await repo.ensureTemplate(def.key, def.label);
    expect(c.templates.has(id)).toBe(true);
    c.templates.set(id, row(id, "changed", "bracket"));
    await expect(repo.ensureTemplate(def.key, def.label)).rejects.toThrow(/collision or drift/);
  });

  it("preserves every config version and inserts without upsert", async () => {
    const c = new FakeClient(), repo = fake(c), def = listEventDefinitions()[0], id = templateIdForKey(def.key);
    c.configs.push({ template_id: id, version: 1, sealed: false, manifest: def }, { template_id: id, version: 2, sealed: true, manifest: def });
    expect(await repo.listConfigs(id)).toEqual([{ templateId: id, version: 1, sealed: false, manifest: def }, { templateId: id, version: 2, sealed: true, manifest: def }]);
    await expect(repo.insertConfig({ templateId: id, version: 1, sealed: false, manifest: def })).rejects.toThrow(/23505/);
    expect(c.queryLog.at(-1)?.op).toBe("insert");
  });

  it("recovers lost insert acknowledgement only from exact read-back and propagates failure otherwise", async () => {
    const c = new FakeClient(), repo = fake(c), def = listEventDefinitions()[0], id = templateIdForKey(def.key);
    c.insertFailure = { message: "connection reset" };
    // Simulate server commit before the client reports a lost acknowledgement.
    const original = c.from.bind(c);
    c.from = ((table: "templates" | "event_template_configs") => {
      const q = original(table);
      if (table !== "templates") return q;
      const insert = q.insert.bind(q);
      q.insert = (values: Record<string, unknown>) => {
        insert(values);
        return { select() { c.templates.set(id, row(id, def.label, "bracket")); return Promise.resolve({ data: null, error: { message: "connection reset" } }); } } as never;
      };
      return q;
    }) as FakeClient["from"];
    expect(await repo.ensureTemplate(def.key, def.label)).toEqual({ id });
    const noCommit = new FakeClient(); noCommit.insertFailure = { message: "offline", code: "NET" };
    await expect(fake(noCommit).ensureTemplate(def.key, def.label)).rejects.toThrow(/NET.*offline/);
  });
});
