import { beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { listEventDefinitions } from "@/lib/events/catalog";
import { seedEventTemplates } from "@/lib/events/template-seeder";
import { SupabaseTemplateSeedRepository, type TemplateSeedSupabaseClient } from "@/lib/events/template-seed-repository";

const database = "bracket_seed_" + randomUUID().replaceAll("-", "").slice(0, 12);
const root = new URL("../../", import.meta.url);
function sql(statement: string, service = false): string {
  return execFileSync("docker", ["exec", "-i", "supabase_db_bracket-fyi", "psql", "-X", "-U", "postgres", "-d", database, "-Atq", "-v", "ON_ERROR_STOP=1"], {
    input: (service ? "set role service_role;\n" : "") + statement,
    encoding: "utf8", timeout: 120_000, maxBuffer: 10 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}
const literal = (value: unknown) => value === null ? "null" : "'" + String(typeof value === "object" ? JSON.stringify(value) : value).replaceAll("'", "''") + "'";
const identifier = (value: string) => {
  if (!/^[a-z_]+$/.test(value)) throw new Error("Unsafe test SQL identifier");
  return '"' + value + '"';
};
/** Only query transport is substituted: production repository and actual SQL/grants are used. */
function sqlClient(): TemplateSeedSupabaseClient {
  return {
    from(table: string) {
      if (!["templates", "event_template_configs"].includes(table)) throw new Error("Unexpected table");
      let columns = "*", filter = "", order = "", values: Record<string, unknown> | undefined;
      function run(single = false) {
        try {
          const selection = columns === "*" ? "*" : columns.split(",").map(identifier).join(",");
          const query = values
            ? "insert into " + identifier(table) + "(" + Object.keys(values).map(identifier).join(",") + ") values(" + Object.values(values).map(literal).join(",") + ") returning " + selection
            : "select " + selection + " from " + identifier(table) + filter + order;
          const rows = JSON.parse(sql("with q as (" + query + ") select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from q;", true));
          return { data: single ? rows[0] ?? null : rows, error: null };
        } catch {
          return { data: null, error: { code: "SQL", message: "Local database query rejected" } };
        }
      }
      const query = {
        select(selected = "*") { columns = selected; return query; },
        eq(column: string, value: unknown) { filter = " where " + identifier(column) + "=" + literal(value); return query; },
        order(column: string) { order = " order by " + identifier(column); return query; },
        insert(row: Record<string, unknown>) { values = row; return query; },
        maybeSingle() { return Promise.resolve(run(true)); },
        then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) { return Promise.resolve(run()).then(resolve, reject); },
      };
      return query;
    },
  } as unknown as TemplateSeedSupabaseClient;
}

describe.runIf(process.env.RUN_EVENT_TEMPLATE_DB === "1")("draft templates → real local SQL", () => {
  beforeAll(() => {
    execFileSync("docker", ["exec", "supabase_db_bracket-fyi", "createdb", "-U", "postgres", "--template=template0", database], { timeout: 30_000, stdio: "pipe" });
    sql("create schema extensions; create extension pgcrypto with schema extensions; create extension supabase_vault;" +
      "grant usage on schema public,extensions to anon,authenticated,service_role;" +
      "alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;" +
      "alter default privileges for role postgres in schema public grant all on sequences to anon,authenticated,service_role;" +
      "alter default privileges for role postgres in schema public grant all on functions to anon,authenticated,service_role;" +
      "alter database " + database + " set search_path=public,extensions;");
    const migrations = new URL("supabase/migrations/", root);
    sql(readdirSync(migrations).filter(name => name.endsWith(".sql") && name.slice(0, 14) <= "20261027000006").sort().map(name => readFileSync(new URL(name, migrations), "utf8")).join("\n"));
  }, 180_000);

  it("seeds nine exact drafts, replays unchanged and rejects drift without activating leagues", async () => {
    const repo = new SupabaseTemplateSeedRepository(sqlClient());
    const first = await seedEventTemplates(repo);
    expect(first).toHaveLength(9);
    expect(first.every(row => row.disposition === "inserted")).toBe(true);
    const snapshot = () => sql("select jsonb_agg(to_jsonb(c) order by template_id) from event_template_configs c;");
    const before = snapshot();
    expect(JSON.parse(before).map((row: { manifest: unknown }) => row.manifest)).toEqual(expect.arrayContaining([...listEventDefinitions()]));
    expect(sql("select count(*) from event_template_configs where not sealed and manifest->>'availability'='draft' and manifest->>'manualMode'='true' and manifest->>'automation'='unavailable';")).toBe("9");
    expect((await seedEventTemplates(repo)).every(row => row.disposition === "existing")).toBe(true);
    expect(snapshot()).toBe(before);
    expect(sql("select count(*) from templates;")).toBe("9");
    expect(sql("select count(*) from leagues;")).toBe("0");
    expect(() => sql("set role anon; select * from event_template_configs;")).toThrow();
    expect(() => sql("set role authenticated; select * from event_template_configs;")).toThrow();
    sql("update templates set name='Synthetic drift' where id=" + literal(first[0].templateId) + ";");
    await expect(seedEventTemplates(repo)).rejects.toThrow(/collision or drift/);
    expect(snapshot()).toBe(before);
    expect(sql("select name from templates where id=" + literal(first[0].templateId) + ";")).toBe("Synthetic drift");
    console.info("Retained local draft proof database:", database);
  }, 180_000);
});
