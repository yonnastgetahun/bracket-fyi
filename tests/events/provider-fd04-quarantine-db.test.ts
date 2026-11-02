import { randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { FootballDataAdapter } from "@/lib/ingestion/providers/football-data";
import { createIngestionOrchestrator } from "@/lib/ingestion/orchestrator/orchestrator";
import { createRunLedgerRepository } from "@/lib/ingestion/orchestrator/run-ledger-repository";
import { createProviderBudgetRepository } from "@/lib/ingestion/rate-limit/repository";
import { createObservationEvidenceRepository } from "@/lib/ingestion/evidence/repository";
import { createQuarantineRepository } from "@/lib/ingestion/quarantine/repository";
import { quarantineAdapterRejection } from "@/lib/ingestion/quarantine/adapter-rejection";
import { createStructuralRepository } from "@/lib/ingestion/projection/structural-repository";
import { createResultRepository } from "@/lib/ingestion/projection/result-repository";
import type { EventRpcClient } from "@/lib/events/repository";
import type { ProviderFailure } from "@/lib/ingestion/errors";

function rejectedFdFixture(reason: "unmapped_match" | "conflicting_entries" = "unmapped_match") {
  const config = {
    mode: "provider", season: 2026, providerCompetitionId: "2001", providerSeasonId: "2027",
    seasonStart: "2026-07-01", seasonEnd: "2027-06-30",
    competitionExternalId: "ucl", eventEditionExternalId: "ucl-2026-27",
    stageMappings: { LEAGUE_STAGE: { externalId: "league", name: "League", kind: "league", ordinal: 1 } },
    matchMappings: { "9001": { contestExternalId: "match-9001", contestKey: "ucl-match-9001", name: "Match" } },
    teamMappings: {
      "101": { eventEntryExternalId: "entry-a", competitorExternalId: "team-a", name: "A" },
      "202": { eventEntryExternalId: "entry-b", competitorExternalId: "team-b", name: "B" },
    },
  };
  const row = {
    id: 9001, utcDate: "2026-10-10T17:30:00Z", status: "FINISHED", stage: "LEAGUE_STAGE",
    competition: { id: 2001, code: "CL" },
    season: { id: 2027, startDate: "2026-07-01", endDate: "2027-06-30" },
    homeTeam: { id: 101 }, awayTeam: { id: 202 },
    score: { winner: "DRAW", duration: "REGULAR", fullTime: { home: 1, away: 1 }, regularTime: { home: 1, away: 1 } },
  };
  const rejected = reason === "unmapped_match" ? { ...row, id: 9002 }
    : { ...row, awayTeam: { id: 101 } };
  const fetch = vi.fn(async () => new Response(JSON.stringify({
    competition: { id: 2001, code: "CL" }, matches: [row, { ...rejected, raw: "DO-NOT-RETAIN" }],
  })));
  const adapter = new FootballDataAdapter({ fetch });
  return { config, fetch, adapter };
}


// Opt-in ONLY; never creates/starts containers or enables the runtime. The caller
// must name an already disposable database. Production HTTP admission is NOT
// under test: only the in-memory synthetic transport gets a test permit.
describe.runIf(process.env.BRACKET_FD04_SQL_DB?.startsWith("bracket_"))("FD04 SQL rejection seam", () => {
  it("persists bounded rejection evidence, immutable replay and real SQL permission failure recovery", async () => {
    const database = process.env.BRACKET_FD04_SQL_DB!;
    const container = "supabase_db_bracket-fyi";
    const root = resolve(import.meta.dirname, "../..");
    const stamp = randomUUID();
    const edition = randomUUID(), organization = randomUUID(), competition = randomUUID();
    let provider: string = randomUUID();
    const binding = randomUUID();
    const quote = (v: unknown): string => v === null ? "null" :
      "'" + String(typeof v === "object" ? JSON.stringify(v) : v).replaceAll("'", "''") + "'";
    function sql(statement: string) {
      const result = spawnSync("docker", ["exec", "-i", container, "psql", "-X", "-U", "postgres",
        "-d", database, "-Atq", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"],
        { input: "set statement_timeout='10s';" + statement, encoding: "utf8", timeout: 20_000, maxBuffer: 1024 * 1024 });
      if (result.status !== 0) throw new Error(result.stderr || String(result.error));
      return result.stdout.trim();
    }
    const safety = () => sql("select global_stopped::text||':'||notifications_enabled::text||':'||real_sends_enabled::text from event_runtime_control");
    expect(safety()).toBe("true:false:false");
    const notificationBefore = sql("select count(*) from notification_attempts");
    const providerAttemptsBefore = sql("select count(*) from event_provider_attempts");
    const checkpoints: string[] = [];
    const rpcNames: string[] = [];
    const sqlFailures: { rpc: string; sqlstate: string }[] = [];
    let deny: string | null = null;
    const client: EventRpcClient = { async rpc(name, args) {
      if (!/^[a-z_]+$/.test(name) || Object.keys(args).some(k => !/^p_[a-z_]+$/.test(k))) throw new Error("Unsafe RPC identifier");
      rpcNames.push(name);
      const params = Object.entries(args).map(([key,value]) =>
        key + " => " + (key === "p_candidate_ids"
          ? "ARRAY[" + (value as string[]).map(quote).join(",") + "]::uuid[]" : quote(value))).join(",");
      try {
        const rows = sql("set role " + (deny === name ? "anon" : "service_role") +
          ";select to_jsonb(x) from " + name + "(" + params + ") x;");
        const parsed = rows ? rows.split("\n").map(line => JSON.parse(line)) : [];
        return { data: parsed.length === 1 ? parsed[0] : parsed, error: null };
      } catch (error) {
        const message = String(error);
        const code = message.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1] ?? "unknown";
        sqlFailures.push({rpc:name,sqlstate:code});
        return { data: null, error: {message} };
      }
    } };
    provider = sql("select id from data_providers where adapter_key='football-data'") || provider;
    const fd = rejectedFdFixture();
    const ledger = createRunLedgerRepository(client);
    const evidence = createObservationEvidenceRepository(client);
    const quarantine = createQuarantineRepository(client);
    const budget = createProviderBudgetRepository(client);
    sql(`insert into organizations(id,organization_key,name,kind) values('${organization}','fd04-${stamp}','Synthetic FD04','governing_body');
insert into competitions(id,organization_id,competition_key,name,domain,sport_code) values('${competition}','${organization}','fd04-${stamp}','Synthetic FD04','sport','soccer');
insert into event_editions(id,competition_id,edition_key,name,season_label) values('${edition}','${competition}','fd04-${stamp}','Synthetic FD04','2026');
insert into data_providers(id,adapter_key,display_name) values('${provider}','football-data','Synthetic FD04 ${stamp}') on conflict(adapter_key) do nothing;
insert into provider_bindings(id,provider_id,event_edition_id,binding_key,mode,health_status,credential_ref,adapter_config,poll_policy)
values('${binding}','${provider}','${edition}','fd04','write','healthy','synthetic://fd04',${quote(fd.config)},
'{"idleSeconds":300,"pregameSeconds":60,"liveSeconds":30,"postgameSeconds":60,"staleAfterSeconds":60}');
insert into provider_rate_budgets(provider_id,scope_key,configured_limit_count,configured_window_seconds,available_count,trusted_reset_at)
values('${provider}','provider',10,3600,10,clock_timestamp()+interval '1 hour') on conflict do nothing;`);
    const runtime = createIngestionOrchestrator({
      clock: { now: () => new Date() }, ledger, evidence, quarantine,
      modeReader: { async read() { return "write"; } },
      pullWindowResolver: { resolve: () => ({windowStart:"2026-10-10T17:00:00Z",windowEnd:"2026-10-10T18:00:00Z"}) },
      phaseResolver: { resolve: () => "live" },
      budget: { reserve: ({runId,leaseToken,attemptKey,cost}) => budget.reserve({runId,leaseToken,attemptKey,cost}) },
      credentials: { async resolve(reference) { return { reference, getValue: () => "SYNTHETIC-SECRET-DO-NOT-RETAIN" }; } },
      adapters: { get: () => fd.adapter },
      structural: createStructuralRepository(client), result: createResultRepository(client),
      attemptControls: {
        admit: async () => ({allowed:true,permitId:stamp,startDeadline:"2099-01-01T00:00:00Z"}),
        start: async () => true, complete: async () => {},
      },
    });
    const count = (table: string) => sql("select count(*) from " + table +
      (table === "provider_observations" || table === "ingestion_quarantine" || table === "provider_entity_refs"
        ? " where binding_id=" + quote(binding) : " where event_edition_id=" + quote(edition)));
    async function execute(label: string) {
      const run = await ledger.claimManual({bindingId:binding, requestKey:"fd04-"+stamp+"-"+label,
        now:new Date().toISOString(),workerId:"fd04-synthetic",leaseSeconds:900});
      expect(run?.leaseAcquired).toBe(true);
      if (!run) throw new Error("Run not claimed");
      expect(await runtime.execute(run)).toMatchObject({status:"failed",normalizedCount:0,projectedCount:0,quarantinedCount:0});
      return run;
    }
    const failure: ProviderFailure = {code:"invalid_response",retry:"never",message:"Synthetic rejection",
      details:{reviewRequired:true,reason:"unmapped_match",matchId:"9002",homeTeamId:"101",awayTeamId:"202",rowIndex:1,fetchedCount:2}};
    const replay = (run: Awaited<ReturnType<typeof execute>>) => quarantineAdapterRejection({
      run,checkpointGeneration:run.checkpointGeneration,failure,receivedAt:new Date().toISOString(),evidence,quarantine});
    const state = (runId: string) => JSON.parse(sql("select to_jsonb(r) from ingestion_runs r where id="+quote(runId)));
    try {
      const first = await execute("first");
      expect(count("provider_observations")).toBe("1");
      expect(count("ingestion_quarantine")).toBe("1");
      const observation = JSON.parse(sql("select to_jsonb(o) from provider_observations o where binding_id="+quote(binding)));
      const issue = JSON.parse(sql("select to_jsonb(q) from ingestion_quarantine q where binding_id="+quote(binding)));
      expect(observation.external_object_kind).toBe("adapter_rejection");
      expect(observation.sanitized_payload).toMatchObject({reason:"unmapped_match",rowIndex:1,fetchedCount:2,scope:"entire_batch",witness:"first_rejected_row"});
      expect(issue).toMatchObject({observation_id:observation.id,ingestion_run_id:first.runId,binding_id:binding,
        severity:"blocking",issue_code:"mapping_missing",external_entity_kind:null,external_entity_id:null,candidate_ids:[]});
      expect(state(first.runId)).toMatchObject({status:"failed",error_class:"provider:invalid_response"});
      checkpoints.push("real adapter → orchestrator → SQL evidence/quarantine/failed ledger");

      const immutableBefore = sql("select to_jsonb(o) from provider_observations o where id="+quote(observation.id));
      for (const mutation of ["update provider_observations set sanitized_payload='{}' where id=",
        "delete from provider_observations where id="]) {
        // postgres owns the table: this exercises the immutable trigger, not merely grants.
        expect(() => sql(mutation+quote(observation.id))).toThrow(/immutable/);
      }
      expect(sql("select to_jsonb(o) from provider_observations o where id="+quote(observation.id))).toBe(immutableBefore);
      checkpoints.push("immutable UPDATE and DELETE trigger rejects owner writes; row byte-equivalent");

      const receipt = await replay(first);
      expect(receipt).toMatchObject({observationId:observation.id,quarantineId:issue.id});
      expect(count("provider_observations")).toBe("1"); expect(count("ingestion_quarantine")).toBe("1");
      expect(sql("select to_jsonb(o) from provider_observations o where id="+quote(observation.id))).toBe(immutableBefore);
      const second = await execute("cross-run");
      expect(second.runId).not.toBe(first.runId);
      expect(count("provider_observations")).toBe("2"); expect(count("ingestion_quarantine")).toBe("2");
      checkpoints.push("same-run exact replay immutable/deduplicated; fresh run owns separate witness");

      deny = "record_provider_observation";
      const evidenceFailed = await execute("evidence-denied");
      expect(state(evidenceFailed.runId)).toMatchObject({error_class:"system:adapter_quarantine_failed",
        metadata:expect.objectContaining({reviewPersistenceFailed:true})});
      expect(count("provider_observations")).toBe("2"); expect(count("ingestion_quarantine")).toBe("2");
      deny = "open_ingestion_quarantine";
      const quarantineFailed = await execute("quarantine-denied");
      expect(state(quarantineFailed.runId)).toMatchObject({error_class:"system:adapter_quarantine_failed",
        metadata:expect.objectContaining({reviewPersistenceFailed:true})});
      expect(count("provider_observations")).toBe("3"); expect(count("ingestion_quarantine")).toBe("2");
      expect(sqlFailures).toEqual([{rpc:"record_provider_observation",sqlstate:"42501"},{rpc:"open_ingestion_quarantine",sqlstate:"42501"}]);
      deny = null;
      await replay(quarantineFailed);
      expect(count("provider_observations")).toBe("3"); expect(count("ingestion_quarantine")).toBe("3");
      checkpoints.push("actual SQL 42501 at each persistence RPC; explicit failed ledger; evidence-before-quarantine retry repaired");

      for (const table of ["contests","contest_results","provider_entity_refs"]) expect(count(table)).toBe("0");
      expect(rpcNames).not.toContain("project_structural_observation");
      expect(rpcNames).not.toContain("project_provider_result");
      expect(rpcNames).not.toContain("commit_ingestion_page");
      expect(sql("select checkpoint_generation from provider_bindings where id="+quote(binding))).toBe("0");
      const retained = ["provider_observations","ingestion_quarantine","ingestion_runs"].map(table =>
        sql("select coalesce(jsonb_agg(to_jsonb(x)),'[]') from "+table+" x where binding_id="+quote(binding))).join("\n");
      expect(retained).not.toContain("DO-NOT-RETAIN");
      expect(retained).not.toContain("permission denied");
      expect(fd.fetch).toHaveBeenCalledTimes(4);
      checkpoints.push("valid prefix never projected; zero canonical IDs/contests/results/checkpoints; raw and secret absent");
    } finally {
      deny = null;
      expect(safety()).toBe("true:false:false");
      expect(sql("select count(*) from notification_attempts")).toBe(notificationBefore);
      expect(sql("select count(*) from event_provider_attempts")).toBe(providerAttemptsBefore);
      const files = ["lib/ingestion/providers/football-data.ts","lib/ingestion/quarantine/adapter-rejection.ts",
        "lib/ingestion/quarantine/repository.ts","lib/ingestion/evidence/repository.ts",
        "lib/ingestion/orchestrator/orchestrator.ts","lib/ingestion/orchestrator/run-ledger-repository.ts",
        "tests/events/provider-fd04-quarantine-db.test.ts"];
      const hashes = Object.fromEntries(files.map(file => [file,createHash("sha256").update(readFileSync(resolve(root,file))).digest("hex")]));
      const out = resolve(root,"tmp/fd04-sql-proof");
      mkdirSync(out,{recursive:true});
      writeFileSync(resolve(out,"result-"+stamp+".json"),JSON.stringify({database,container,binding,edition,stamp,
        safety:safety(),notificationAttempts:notificationBefore,providerAttempts:providerAttemptsBefore,
        checkpoints,sqlFailures,rpcNames,hashes,
        limitation:"Synthetic in-memory fetch and admission controls; actual SQL RPCs via service-role psql, not PostgREST or production attempt admission."},null,2)+"\n");
      console.info("FD04 retained SQL evidence", JSON.stringify({database,binding,stamp,checkpoints}));
    }
  },120_000);
});
