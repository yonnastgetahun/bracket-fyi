import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { buildSyntheticManifest } from "@/lib/events/catalog";
import { createEventIngestionRuntime } from "@/lib/events/runtime";
import { createLifecycleRepository } from "@/lib/events/lifecycle-repository";
import { evaluateLifecycle, reconcileEventLifecycle, type LifecycleCapture } from "@/lib/events/lifecycle";
import { createOperatorRepository } from "@/lib/events/operator-repository";
import type { EventRpcClient } from "@/lib/events/repository";
import { BdlNbaAdapter } from "@/lib/ingestion/providers/balldontlie-nba";
import { BdlMlbAdapter } from "@/lib/ingestion/providers/balldontlie-mlb";
import { BdlNcaabAdapter } from "@/lib/ingestion/providers/balldontlie-ncaab";
import { BdlNcaafAdapter } from "@/lib/ingestion/providers/balldontlie-ncaaf";
import type { Family } from "./provider-four-family-fixture";
import { config as makeConfig, game as makeGame, request as makeRequest, response } from "./provider-four-family-fixture";
const secretSentinel = "SYNTHETIC-SECRET", rawSentinel = "RAW-SENTINEL";
const cases = [
 { sport: "nba", phase: "playoffs", key: "nba-2027", child: true },
 { sport: "nba", phase: "playin", key: "nba-play-in-2027", child: false },
 { sport: "mlb", phase: "postseason", key: "mlb-2027", child: true },
 { sport: "ncaab", phase: "tournament", key: "ncaa-men-2027", child: false },
 { sport: "ncaaf", phase: "cfp", key: "cfp-2026-27", child: false },
] as const;
const adapters = { nba: BdlNbaAdapter, mlb: BdlMlbAdapter, ncaab: BdlNcaabAdapter, ncaaf: BdlNcaafAdapter };
import { createRunLedgerRepository } from "@/lib/ingestion/orchestrator/run-ledger-repository";
import { createProviderBudgetRepository } from "@/lib/ingestion/rate-limit/repository";
import { createObservationEvidenceRepository } from "@/lib/ingestion/evidence/repository";
import { createStructuralRepository } from "@/lib/ingestion/projection/structural-repository";
import { createResultRepository } from "@/lib/ingestion/projection/result-repository";

const id = (n: number) => "b4400000-0000-4000-8000-" + String(n).padStart(12, "0");
const quote = (v: unknown): string => v === null ? "null" :
  "'" + String(typeof v === "object" ? JSON.stringify(v) : v).replaceAll("'", "''") + "'";
const root = resolve(import.meta.dirname, "../..");
// Each opt-in scenario owns a separate disposable DB. No runtime is started by ordinary test execution.
describe.each(cases)("$sport/$phase bounded production vertical", ({ sport, phase, key, child }) => {
const config = makeConfig(sport, phase);
const context = () => makeRequest(sport, { adapterConfig: config });
const game = (home = 24, away = 17, gameId = 7701) => makeGame(sport, home, away, gameId);
const Adapter = adapters[sport as Family];
function manifest() {
  const base = buildSyntheticManifest(key, { startsAt: "2027-01-20T18:00:00Z" });
  const entrantIds: [string, string] = [id(7), id(8)];
  const entrants = base.entrants.slice(0, 2).map((e, i) => ({ ...e, id: entrantIds[i] }));
  const inputs = entrantIds.map(entrantId => ({ kind: "entrant" as const, entrantId }));
  return { ...base, entrants, markets: [{ ...base.markets[0], id: "m", windowId: "w", contestId: id(4), entrants, inputs, choices: entrantIds, kind: "result" as const, series: undefined, scored: !child, outcomeDomain: "winner-including-overtime" as const }],
    windows: [{ ...base.windows[0], id: "w" }], edges: [], championMarketId: null,
    lifecycle: { binding: { reviewed: true as const, graphVersion: 1,
      markets: [{ marketId: "m", inputs, eligibleEntrantIds: entrantIds, orientation: entrantIds }] }, components: [] } };
}
function fixtureSql() {
  // Reuse only the original synthetic SQL entity skeleton, not its hand-computed scorer.
  const source = readFileSync(resolve(root, "supabase/tests/database/DB33_event_notifications_test.sql"), "utf8");
  const begin = source.indexOf("insert into organizations");
  const end = source.indexOf("-- FIXTURE_END", begin);
  if (begin < 0 || end < 0) throw new Error("Synthetic fixture boundary missing");
  const fixture = source.slice(begin, end).replaceAll("a3300000", "b4400000")
    .replaceAll("'soccer'", quote(sport)).replaceAll("'db33-match'", "'family-game'")
    .replaceAll("'match'", "'game'").replaceAll("'2026'", "'2026/27'")
    .replaceAll("Synthetic DB32", "Synthetic family bounded game");
  const configStart = fixture.indexOf("insert into event_template_configs");
  const leagueStart = fixture.indexOf("insert into leagues", configStart);
  if (configStart < 0 || leagueStart < 0) throw new Error("Synthetic manifest boundary missing");
  return fixture.slice(0, configStart) +
    "insert into event_template_configs(template_id,version,sealed,manifest) values(" + quote(id(10)) + ",1,true," + quote(manifest()) + ");\n" +
    fixture.slice(leagueStart) +
    "insert into participants(id,league_id,display_name) values(" + quote(id(102)) + "," + quote(id(11)) + ",'Synthetic away picker');\n" +
    (child ? "" : "insert into picks(league_id,participant_id,slot_id,team_id,locked,event_configuration_version) values(" +
    [quote(id(11)), quote(id(101)), "'m'", quote(id(7)), "true", "1"].join(",") + "),(" +
    [quote(id(11)), quote(id(102)), "'m'", quote(id(8)), "true", "1"].join(",") + ");");
}
function captureForWinner(): LifecycleCapture {
  const token = "a".repeat(64);
  return { leagueId: id(11), generation: 1, basisToken: token, basis: {
    configurationVersion: 1, manifest: manifest(), windows: [{ id: "w", version: 1, state: "locked" }],
    participants: [{ id: id(101), graphVersion: 1, picks: child ? {} : { m: id(7) } }, { id: id(102), graphVersion: 1, picks: child ? {} : { m: id(8) } }],
    holds: [], quarantines: [], locked: true, frozen: false, disabled: false,
    effective: { m: { outcome: { kind: "winner", entrant: id(7) }, source: "canonical", canonicalResultId: id(30), canonicalVersion: 1,
      canonicalToken: token, overrideId: null, overrideRevision: 0, expiresAt: null, derivedProvenance: null,
      held: false, excluded: false, effectiveToken: token, provenanceToken: token } },
  } };
}
// Independent oracle: child games never score series points; Play-In/college winner scores exactly once.
const expectedBoard = () => child ? [
 { id: id(101), earned: 0, maximum: 0, wrong: 0, pending: 0, rank: 1 },
 { id: id(102), earned: 0, maximum: 0, wrong: 0, pending: 0, rank: 1 },
] : [
 { id: id(101), earned: 1, maximum: 1, wrong: 0, pending: 0, rank: 1 },
 { id: id(102), earned: 0, maximum: 0, wrong: 1, pending: 0, rank: 2 },
];

describe("Four-family vertical fixture contracts (no DB)", () => {
  it("has a reviewed bounded game manifest with an independent winner oracle", () => {
    expect(evaluateLifecycle(captureForWinner())).toEqual(expectedBoard());
    expect(fixtureSql()).not.toContain("pg_temp.reconcile");
    expect(fixtureSql()).toContain(quote(manifest()));
    expect(manifest().markets[0].outcomeDomain).toBe("winner-including-overtime");
    expect(manifest().markets[0].choices).toEqual([id(7), id(8)]);
    expect(fixtureSql()).not.toContain("'draw'");
  });
  it("original synthetic HTTP is accepted without manufacturing correction authority", async () => {
    const adapter = new Adapter({ fetch: async () => response(game()) });
    const batch = await adapter.pull(context());
    expect(batch.observations.map(o => o.entityKind)).toEqual(["contest", "result"]);
    const result = batch.observations[1];
    expect(result.data).toMatchObject({ contestExternalId: "synthetic-family-game", outcomeType: "winner", winnerEventEntryExternalId: "family-entry-home" });
    expect(result.providerRevision).toBeUndefined();
    expect(result.providerUpdatedAt).toBeUndefined();
    expect(result.data).not.toHaveProperty("correctionReason");
    expect(JSON.stringify(batch)).not.toContain(rawSentinel);
    expect(JSON.stringify(batch)).not.toContain(secretSentinel);
  });
});

// Never load dotenv. Ordinary npm test neither creates nor connects to a database.
// The parent is the sole DB owner; every opt-in invocation creates and RETAINS its own DB.
describe.runIf(process.env.BRACKET_FOUR_FAMILY_VERTICAL_DB_TEST === "1")("Four-family → SQL → real scorer bounded game proof", () => {
  it("stops, ingests reviewed synthetic HTTP, scores, replays, quarantines untrusted correction and rejects unmapped IDs", async () => {
    const database = "bracket_family_vertical_" + randomUUID().replaceAll("-", "").slice(0, 12);
    const container = "supabase_db_bracket-fyi";
    function command(args: string[], input?: string) {
      const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
      if (result.status !== 0) throw new Error("Disposable DB subprocess failed: status=" + result.status +
        " signal=" + result.signal + " " + (result.error?.message ?? "") + " " + result.stderr);
      return result.stdout.trim();
    }
    const sql = (statement: string) => command(["exec", "-i", container, "psql", "-X", "-U", "postgres",
      "-d", database, "-Atq", "-v", "ON_ERROR_STOP=1"], statement);
    console.info("Retained provider vertical proof DB:", database);
    command(["exec", container, "createdb", "-U", "postgres", "--template=template0", database]);
    sql("create schema extensions;create extension pgcrypto with schema extensions;create extension pgtap with schema extensions;" +
      "create extension supabase_vault;grant usage on schema public,extensions to anon,authenticated,service_role;" +
      "alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;" +
      "alter default privileges for role postgres in schema public grant all on sequences to anon,authenticated,service_role;" +
      "alter default privileges for role postgres in schema public grant all on functions to anon,authenticated,service_role;" +
      'alter database "' + database + '" set search_path=public,extensions;');
    for (const name of readdirSync(resolve(root, "supabase/migrations")).sort()) {
      if (name.endsWith(".sql")) sql(readFileSync(resolve(root, "supabase/migrations", name), "utf8"));
    }
    expect(sql("select global_stopped and not notifications_enabled and not real_sends_enabled from event_runtime_control")).toBe("t");
    sql(fixtureSql());
    const poll = { idleSeconds: 300, pregameSeconds: 60, liveSeconds: 30, postgameSeconds: 60, staleAfterSeconds: 60 };
    sql(`insert into data_providers(id,adapter_key,display_name) values('${id(401)}','balldontlie','Synthetic vertical only');
insert into provider_bindings(id,provider_id,event_edition_id,binding_key,mode,health_status,credential_ref,adapter_config,poll_policy)
values('${id(402)}','${id(401)}','${id(3)}','synthetic','write','healthy','synthetic://vertical',${quote(config)},${quote(poll)});
insert into provider_rate_budgets(provider_id,scope_key,configured_limit_count,configured_window_seconds,available_count,trusted_reset_at)
values('${id(401)}','provider',6,60,6,clock_timestamp()+interval '1 minute');
insert into event_operator_principals(id) values('${id(501)}');
insert into event_operator_credentials values(encode(extensions.digest('synthetic-vertical-operator','sha256'),'hex'),'${id(501)}',true,now()+interval '1 hour');
insert into event_operator_grants(principal_id,environment,action) values('${id(501)}','local','global.stop');`);
    const refs: [string, string, number][] = [
      ["event_edition", "synthetic-family-edition", 3], ["stage", "synthetic-postseason", 9],
      ["contest", "synthetic-family-game", 4], ["event_entry", "family-entry-home", 7], ["event_entry", "family-entry-away", 8],
    ];
    for (const [kind, external, canonical] of refs) sql(`insert into provider_entity_refs
(binding_id,provider_id,event_edition_id,entity_kind,external_id,canonical_id,resolution_status,reviewed_by,reviewed_at)
values('${id(402)}','${id(401)}','${id(3)}',${quote(kind)},${quote(external)},'${id(canonical)}','reviewed','synthetic-fixture-review',now());`);

    const rpcNames: string[] = [];
    const client: EventRpcClient = { async rpc(name, args) {
      if (!/^[a-z_]+$/.test(name) || Object.keys(args).some(k => !/^p_[a-z_]+$/.test(k))) throw new Error("Invalid SQL RPC identifier");
      rpcNames.push(name);
      try {
        const call = name + "(" + Object.entries(args).map(([k, v]) => k + " => " + quote(v)).join(",") + ")";
        // SELECT to_jsonb(x) handles composite/set-returning ingestion RPCs and scalar event RPCs alike.
        const rows = sql("set role service_role;select to_jsonb(x) from " + call + " x;");
        const parsed = rows ? rows.split("\n").map(line => JSON.parse(line)) : [];
        return { data: parsed.length === 1 ? parsed[0] : parsed, error: null };
      } catch (error) {
        throw new Error("Provider vertical RPC failed (" + name + "): " + String(error));
      }
    } };
    const ledger = createRunLedgerRepository(client);
    const budget = createProviderBudgetRepository(client);
    let calls = 0;
    let body = game();
    let httpStatus = 200;
    const adapter = new Adapter({ fetch: async (url, init) => {
      calls++;
      expect(new URL(String(url)).origin).toBe("https://api.balldontlie.io");
      expect(init?.redirect).toBe("error");
      expect(new Headers(init?.headers).get("Authorization")).toBe(secretSentinel);
      return response(body, httpStatus);
    } });
    const runtime = createEventIngestionRuntime(client, {
      clock: { now: () => new Date() }, ledger,
      modeReader: { async read(bindingId) {
        const mode = sql("set role service_role;select mode from provider_bindings where id=" + quote(bindingId));
        if (mode !== "write" && mode !== "disabled" && mode !== "shadow") throw new Error("Invalid persisted mode");
        return mode;
      } },
      pullWindowResolver: { resolve: () => ({ windowStart: context().windowStart, windowEnd: context().windowEnd }) },
      phaseResolver: { resolve: () => "postgame" },
      budget: { reserve: ({ runId, leaseToken, attemptKey, cost }) => budget.reserve({ runId, leaseToken, attemptKey, cost }) },
      credentials: { async resolve(reference) {
        expect(reference).toBe("synthetic://vertical");
        return { reference, getValue: () => secretSentinel };
      } },
      adapters: { get: key => key === adapter.key ? adapter : undefined },
      evidence: createObservationEvidenceRepository(client),
      structural: createStructuralRepository(client), result: createResultRepository(client),
    });
    async function execute(label: string) {
      const run = await ledger.claimManual({ bindingId: id(402), requestKey: "vertical-" + label,
        now: new Date().toISOString(), workerId: "synthetic-vertical", leaseSeconds: 900 });
      expect(run?.leaseAcquired).toBe(true);
      if (!run) throw new Error("No run claimed");
      return runtime.execute(run);
    }
    const operator = createOperatorRepository(client);
    async function stop(stopped: boolean) {
      await operator.execute("synthetic-vertical-operator", { action: "global.stop", eventId: null,
        expectedVersion: Number(sql("select version from event_runtime_control")), reason: "Isolated synthetic vertical proof",
        payload: { stopped } });
    }
    try {
      expect((await execute("stopped")).status).toBe("canceled");
      expect(calls).toBe(0);
      expect(sql("select count(*) from provider_observations")).toBe("0");
      // Budget reservation precedes stop admission: six reservations permit five HTTP attempts.
      expect(sql("select available_count from provider_rate_budgets")).toBe("5");
      await stop(false);
      const first = await execute("first");
      expect(first).toMatchObject({ status: "succeeded", normalizedCount: 2, failedCount: 0, quarantinedCount: 0 });
      expect(calls).toBe(1);
      expect(sql("select count(*) from contest_results where source_type='provider'")).toBe("1");
      expect(sql("select outcome_type::text || ':' || winner_event_entry_id::text from contest_results")).toBe("winner:" + id(7));
      expect(sql("select count(*) from contest_results r join provider_observations o on o.id=r.source_observation_id where r.contest_id=" + quote(id(4)))).toBe("1");
      expect(sql("select count(*) from provider_entity_refs where resolution_status='reviewed'")).toBe(String(refs.length));
      const lifecycle = createLifecycleRepository(client);
      // An unscored child-only manifest has no required market and cannot coronate.
      expect((await reconcileEventLifecycle(lifecycle, id(11))).state).toBe(child ? "locked" : "complete");
      expect((await lifecycle.read(id(11))).leaderboard).toEqual(expectedBoard());
      const resultIdentity = sql("select id::text || ':' || version::text from contest_results");
      const before = sql("select count(*) from provider_observations");
      expect((await execute("replay")).status).toBe("succeeded");
      expect(sql("select count(*) from provider_observations")).toBe(before);
      expect(sql("select id::text || ':' || version::text from contest_results")).toBe(resultIdentity);
      expect((await reconcileEventLifecycle(lifecycle, id(11))).replayed).toBe(true);

      body = game(17, 24); // A later fetch is not correction authority.
      const correction = await execute("untrusted-correction");
      expect(correction.quarantinedCount).toBeGreaterThan(0);
      expect(correction.failedCount).toBe(0);
      expect(sql("select id::text || ':' || version::text from contest_results")).toBe(resultIdentity);
      expect(sql("select count(*) from ingestion_quarantine")).not.toBe("0");

      body = game(24, 17, 9999); // Not in the reviewed ID map: reject whole batch.
      const evidenceBeforeError = sql("select count(*) from provider_observations");
      expect((await execute("unmapped")).status).toBe("failed");
      expect(sql("select count(*) from provider_observations")).toBe(evidenceBeforeError);
      httpStatus = 401;
      expect((await execute("auth-error")).status).toBe("failed");
      expect(sql("select count(*) from provider_observations")).toBe(evidenceBeforeError);
      const retained = sql("select coalesce(jsonb_agg(to_jsonb(o)), '[]') from provider_observations o;") +
        sql("select coalesce(jsonb_agg(to_jsonb(r)), '[]') from ingestion_runs r;");
      expect(retained).not.toContain(rawSentinel);
      expect(retained).not.toContain(secretSentinel);
      expect(calls).toBe(5); // first + replay + correction + unmapped + auth failure; stopped = zero.
      expect(sql("select count(*) from event_provider_attempts")).toBe("5");
      expect(sql("select count(*) from notification_attempts")).toBe("0");
      for (const name of ["reserve_provider_budget", "admit_event_provider_attempt", "start_event_provider_attempt",
        "complete_event_provider_attempt", "record_provider_observation", "project_structural_observation",
        "project_provider_result", "commit_ingestion_page", "commit_event_lifecycle"]) expect(rpcNames).toContain(name);
    } finally {
      // Retain evidence, but leave even the disposable proof database stopped on assertion failure.
      await stop(true);
      expect(sql("select global_stopped and not notifications_enabled and not real_sends_enabled from event_runtime_control")).toBe("t");
    }
  }, 300_000);
});

});
