import { describe, expect, it } from "vitest";
import { listEventDefinitions } from "../../lib/events/catalog";
import { seedEventTemplates, TemplateSeedConflictError, type SeedConfig, type TemplateSeedRepository } from "../../lib/events/template-seeder";

class MemoryRepository implements TemplateSeedRepository {
  templates = new Map<string, string>();
  configs: SeedConfig[] = [];
  failAfterInsertions: number | null = null;
  async ensureTemplate(key: string, _label: string) {
    if (!this.templates.has(key)) this.templates.set(key, `stable:${key}`);
    return { id: this.templates.get(key)! };
  }
  async listConfigs(id: string) { return this.configs.filter(config => config.templateId === id); }
  async insertConfig(config: SeedConfig) {
    if (this.configs.some(row => row.templateId === config.templateId && row.version === config.version)) throw new Error("unique violation");
    this.configs.push(config);
    if (this.failAfterInsertions === this.configs.length) { this.failAfterInsertions = null; throw new Error("simulated interrupted acknowledgement"); }
  }
}

describe("seedEventTemplates", () => {
  it("rejects lost-ack read-back under another template and preserves the insertion error", async () => {
    const insertionError = new Error("insert acknowledgement lost");
    const definition = listEventDefinitions()[0];
    let reads = 0, inserts = 0, ensures = 0;
    const repo: TemplateSeedRepository = {
      async ensureTemplate() { ensures++; return {id:"expected-template"}; },
      async listConfigs() {
        reads++;
        return reads === 1 ? [] : [{templateId:"other-template",version:1,sealed:false,manifest:definition}];
      },
      async insertConfig() { inserts++; throw insertionError; },
    };
    await expect(seedEventTemplates(repo)).rejects.toBe(insertionError);
    expect({reads,inserts,ensures}).toEqual({reads:2,inserts:1,ensures:1});
  });

  it("seeds exactly the nine catalog ids and replays without writes", async () => {
    const repo = new MemoryRepository();
    const first = await seedEventTemplates(repo);
    const count = repo.configs.length;
    const second = await seedEventTemplates(repo);
    expect(first.map(row => row.key)).toEqual(listEventDefinitions().map(row => row.key));
    expect(first).toHaveLength(9);
    expect(repo.configs).toHaveLength(9);
    expect(second.every(row => row.disposition === "existing")).toBe(true);
    expect(repo.configs).toHaveLength(count);
    expect(repo.configs.every(row => !row.sealed && row.manifest.availability === "draft" && row.manifest.manualMode && row.manifest.automation === "unavailable")).toBe(true);
  });

  it("recovers an insert whose acknowledgement was lost and replays idempotently", async () => {
    const repo = new MemoryRepository();
    repo.failAfterInsertions = 3;
    const first = await seedEventTemplates(repo);
    expect(first).toHaveLength(9);
    expect(first[2].disposition).toBe("existing");
    expect(await seedEventTemplates(repo)).toHaveLength(9);
    expect(repo.configs).toHaveLength(9);
  });

  it("rejects drift and sealed configs without modifying them", async () => {
    const repo = new MemoryRepository();
    const definition = listEventDefinitions()[0];
    const { id } = await repo.ensureTemplate(definition.key, definition.label);
    const drift = { ...definition, label: "Drifted label" } as typeof definition;
    const config: SeedConfig = { templateId: id, version: 1, sealed: false, manifest: drift };
    repo.configs.push(config);
    await expect(seedEventTemplates(repo)).rejects.toBeInstanceOf(TemplateSeedConflictError);
    expect(repo.configs).toEqual([config]);
    repo.configs[0] = { ...config, manifest: definition, sealed: true };
    await expect(seedEventTemplates(repo)).rejects.toBeInstanceOf(TemplateSeedConflictError);
    expect(repo.configs[0].sealed).toBe(true);
  });
});
