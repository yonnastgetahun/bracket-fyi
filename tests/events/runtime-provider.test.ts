import { createEventProviderRegistry } from "@/lib/events/runtime-providers";
import { config as familyConfig, game as familyGame, response as familyResponse } from "./provider-four-family-fixture";
import { config as nflConfig, game as nflGame } from "./provider-bdl-vertical-fixture";
import { describe, expect, it, vi } from "vitest";

import type { ProviderBatch, NormalizedObservation, JsonObject } from "@/lib/ingestion/contracts";
import { type ClaimedIngestionRun, type RunLedgerRepository } from "@/lib/ingestion/orchestrator/run-ledger-repository";
import { createEventIngestionRuntime } from "@/lib/events/runtime";
import type { OrchestratorDependencies } from "@/lib/ingestion/orchestrator/ports";
import type { ProviderAdapter } from "@/lib/ingestion/providers/provider-adapter";


const RUN_ID = "40000000-0000-4000-8000-000000000001";

const runDefaults: ClaimedIngestionRun = {
  runId: RUN_ID,
  bindingId: "10000000-0000-4000-8000-000000000001",
  claimKey: "v1:schedule:binding:g1",
  claimRequestKey: `automated:v1:${RUN_ID}`,
  claimGeneration: 1,
  retryIndex: 0,
  checkpointGeneration: 0,
  leaseToken: "lease-1",
  leaseAcquired: true,
  providerId: "20000000-0000-4000-8000-000000000001",
  eventEditionId: "30000000-0000-4000-8000-000000000001",
  adapterKey: "synthetic-sports",
  bindingKey: "primary",
  mode: "write",
  credentialRef: "credential://synthetic",
  adapterConfigVersion: 1,
  adapterConfig: { fixture: "sports" },
  pollPolicy: {
    idleSeconds: 300,
    pregameSeconds: 60,
    liveSeconds: 30,
    postgameSeconds: 60,
    staleAfterSeconds: 60,
  },
  providerCursor: { page: 0 },
  providerEtag: "etag-0",
  leaseExpiresAt: "2026-10-10T18:05:00.000Z",
};

const sportsObservation: NormalizedObservation = {
  entityKind: "contest",
  externalId: "match-1",
  providerRevision: "sports-r1",
  providerUpdatedAt: "2026-10-10T17:59:00.000Z",
  observedAt: "2026-10-10T18:00:00.000Z",
  completeness: "full",
  sanitizedPayload: {
    teams: { home: "North", away: "South" },
    match: { status: "final", score: { home: 2, away: 1 } },
  },
  data: {
    eventEditionExternalId: "edition-1",
    stageExternalId: "stage-1",
    contestKey: "match-1",
    name: "North v South",
    contestKind: "match",
    status: "final",
    requiredForCompletion: true,
    entries: [],
    metadata: { sport: "synthetic" },
  },
};

const batchFor = (observations: NormalizedObservation[], overrides: Partial<ProviderBatch> = {}): ProviderBatch => ({
  observations,
  fetchedCount: observations.length,
  receivedAt: "2026-10-10T18:00:00.000Z",
  ...overrides,
});

const makeLedger = (overrides: Partial<RunLedgerRepository> = {}) => ({
  claimDue: vi.fn(),
  claimManual: vi.fn(),
  start: vi.fn().mockResolvedValue({ run_id: RUN_ID, status: "running", started_at: "2026-10-10T18:00:00.000Z" }),
  renew: vi.fn().mockResolvedValue({ run_id: RUN_ID, lease_expires_at: "2026-10-10T18:10:00.000Z" }),
  recordResponse: vi.fn().mockResolvedValue({ run_id: RUN_ID, recorded: true }),
  reclaimExpired: vi.fn(),
  commitPage: vi.fn().mockImplementation(async (input: {
    runId: string;
    expectedCheckpointGeneration: number;
    nextCursor: JsonObject;
    responseEtag?: string;
    expectedEtag?: string;
  }) => ({
    outcome: "committed",
    pageLedgerId: `page-${input.expectedCheckpointGeneration + 1}`,
    runId: input.runId,
    checkpointGeneration: input.expectedCheckpointGeneration + 1,
    cursorAfter: input.nextCursor,
    providerEtag: input.responseEtag ?? input.expectedEtag ?? null,
  })),
  finish: vi.fn().mockResolvedValue({
    run_id: RUN_ID,
    status: "succeeded",
    health_status: "healthy",
    next_poll_at: null,
    next_retry_at: null,
  }),
  ...overrides,
}) satisfies RunLedgerRepository;

const makeDependencies = (overrides: Partial<OrchestratorDependencies> = {}) => {
  const ledger = makeLedger();
  const adapter: ProviderAdapter = {
    key: "synthetic-sports",
    capabilities: new Set(),
    pull: vi.fn().mockResolvedValue(batchFor([sportsObservation])),
    classifyError: vi.fn<ProviderAdapter["classifyError"]>(() => ({ code: "permanent", retry: "never", message: "synthetic", details: {} })),
  };
  const dependencies: OrchestratorDependencies = {
    clock: { now: vi.fn(() => new Date("2026-10-10T18:00:00.000Z")) },
    ledger,
    modeReader: { read: vi.fn().mockResolvedValue("write") },
    attemptControls: {
      admit: vi.fn().mockResolvedValue({allowed:true,permitId:"synthetic-permit",startDeadline:"2099-01-01T00:00:00Z"}),
      start: vi.fn().mockResolvedValue(true), complete:vi.fn().mockResolvedValue(undefined),
    },
    pullWindowResolver: {
      resolve: vi.fn().mockReturnValue({ windowStart: "2026-10-10T17:00:00.000Z", windowEnd: "2026-10-10T18:00:00.000Z" }),
    },
    phaseResolver: { resolve: vi.fn().mockReturnValue("live") },
    budget: { reserve: vi.fn().mockResolvedValue({ allowed: true, cost: 1, reason: "available" }) },
    credentials: {
      resolve: vi.fn().mockResolvedValue({ reference: "credential://synthetic", getValue: () => "secret-sentinel" }),
    },
    adapters: { get: vi.fn().mockReturnValue(adapter) },
    evidence: {
      record: vi.fn().mockResolvedValue({ outcome: "inserted", observationId: "observation-1" }),
    },
    structural: {
      projectObservation: vi.fn().mockResolvedValue({ kind: "projected", canonicalId: "canonical-1" }),
    },
    result: {
      project: vi.fn().mockResolvedValue({ outcome: "projected", contestResultId: "result-1" }),
    },
    ...overrides,
  };
  return { dependencies, ledger, adapter };
};


describe("SQL-controlled ingestion runtime factory",()=>{
 it.each(["stopped","error","start-denied"])("blocks synthetic provider pull for %s",async(mode)=>{
  const {dependencies,adapter}=makeDependencies();
  const rpc=vi.fn(async(name:string)=>({
   data:name==="admit_event_provider_attempt"
    ? mode==="stopped"?{allowed:false}:{allowed:true,permitId:RUN_ID,startDeadline:"2099-01-01T00:00:00Z"}:false,
   error:mode==="error"?{message:"unavailable"}:null,
  }));
  // Even a legacy dependency object containing permissive controls is overridden.
  const result=await createEventIngestionRuntime({rpc},dependencies).execute(runDefaults);
  expect(result.status).toBe("canceled");
  expect(adapter.pull).not.toHaveBeenCalled();
  expect(rpc.mock.calls[0][0]).toBe("admit_event_provider_attempt");
 });
 it("uses real control RPC adapter in order before synthetic pull and after return",async()=>{
  const {dependencies,adapter}=makeDependencies();
  const calls:string[]=[];
  const rpc=vi.fn(async(name:string)=>{
   calls.push(name);
   return {data:name==="admit_event_provider_attempt"?{allowed:true,permitId:RUN_ID,startDeadline:"2099-01-01T00:00:00Z"}:true,error:null};
  });
  vi.mocked(adapter.pull).mockImplementation(async()=>{calls.push("pull");return batchFor([]);});
  const result=await createEventIngestionRuntime({rpc},dependencies).execute(runDefaults);
  expect(result.status).toBe("succeeded");
  expect(calls).toEqual(["admit_event_provider_attempt","start_event_provider_attempt","pull","complete_event_provider_attempt"]);
  expect(rpc.mock.calls).toHaveLength(3);
 });
});


// Actual orchestration registry lookup receives only providerKey; routing must wait
// until pull receives the claimed binding configuration.
describe("production BDL registry in SQL-controlled runtime",()=>{
 it.each(["nfl","playin","playoffs","mlb","ncaab","ncaaf"] as const)("executes %s binding without a test adapter",async family=>{
  const sport=family==="playin"||family==="playoffs"?"nba":family;
  const config=sport==="nfl"?nflConfig:familyConfig(sport,sport==="nba"?family:undefined);
  const fetch=vi.fn<typeof globalThis.fetch>(async()=>familyResponse(sport==="nfl"?nflGame():familyGame(sport)));
  const {dependencies}=makeDependencies({
   adapters:createEventProviderRegistry({fetch}),
   pullWindowResolver:{resolve:()=>({windowStart:"2027-01-20T00:00:00Z",windowEnd:"2027-01-20T23:59:59Z"})},
  });
  const rpc=vi.fn(async(name:string)=>({data:name==="admit_event_provider_attempt"
   ?{allowed:true,permitId:RUN_ID,startDeadline:"2099-01-01T00:00:00Z"}:true,error:null}));
  const result=await createEventIngestionRuntime({rpc},dependencies).execute({
   ...runDefaults,adapterKey:"balldontlie",adapterConfig:config,providerCursor:{},providerEtag:null,
  });
  expect(result.status).toBe("succeeded");
  expect(result.normalizedCount).toBe(2);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(dependencies.budget.reserve).toHaveBeenCalledTimes(1);
  expect(dependencies.structural.projectObservation).toHaveBeenCalledTimes(1);
  expect(dependencies.result.project).toHaveBeenCalledTimes(1);
 });
});
