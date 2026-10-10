import type { NormalizedObservation } from "@/lib/ingestion/contracts";
import type { ObservationEvidenceRepository } from "@/lib/ingestion/evidence/repository";
import type { ProviderCredential, ProviderAdapter } from "@/lib/ingestion/providers/provider-adapter";
import type { ResultRepository } from "@/lib/ingestion/projection/result-repository";
import type { StructuralRepository } from "@/lib/ingestion/projection/structural-repository";
import type {
  ClaimedIngestionRun,
  RunLedgerRepository,
} from "@/lib/ingestion/orchestrator/run-ledger-repository";
import type { PollPhase, RateBudgetDecision } from "@/lib/ingestion/orchestrator/types";

export type PullWindow = Readonly<{
  windowStart: string;
  windowEnd: string;
}>;

export interface PullWindowResolver {
  resolve(input: Readonly<{ run: ClaimedIngestionRun; requestedAt: string }>): PullWindow;
}
export type CurrentBindingMode = "disabled" | "shadow" | "write";

export interface BindingModeReader {
  read(bindingId: string): Promise<CurrentBindingMode>;
}
export interface PollPhaseResolver {
  resolve(input: Readonly<{ run: ClaimedIngestionRun; evaluatedAt: string }>): PollPhase;
}

export interface CredentialResolver {
  resolve(reference: string): Promise<ProviderCredential>;
}

export interface AdapterRegistry {
  get(providerKey: string): ProviderAdapter | undefined;
}

export type BudgetReservation = Readonly<{
  runId: string;
  leaseToken: string;
  requestedAt: string;
  cost: number;
}>;

export interface RateBudgetRepository {
  reserve(input: BudgetReservation): Promise<RateBudgetDecision>;
}

export type ObservationDispatcherPort = Readonly<{
  dispatch(input: Readonly<{
    run: ClaimedIngestionRun;
    observation: NormalizedObservation;
    receivedAt: string;
    mode: CurrentBindingMode;
  }>): Promise<ObservationDispatchResult>;
}>;

export type ObservationDispatchResult = Readonly<{
  disposition: "projected" | "unchanged" | "quarantined" | "skipped";
  dataChanged: boolean;
}>;

export type OrchestratorDependencies = Readonly<{
  clock: { now(): Date };
  ledger: RunLedgerRepository;
  modeReader: BindingModeReader;
  pullWindowResolver: PullWindowResolver;
  phaseResolver: PollPhaseResolver;
  budget: RateBudgetRepository;
  credentials: CredentialResolver;
  adapters: AdapterRegistry;
  evidence: ObservationEvidenceRepository;
  structural: StructuralRepository;
  result: ResultRepository;
  dispatcher?: ObservationDispatcherPort;
}>;

export type RunExecutionOutcome = Readonly<{
  runId: string;
  status: "succeeded" | "partial" | "failed" | "rate_limited" | "canceled";
  fetchedCount: number;
  normalizedCount: number;
  projectedCount: number;
  unchangedCount: number;
  quarantinedCount: number;
  skippedCount: number;
  failedCount: number;
}>;

export interface IngestionOrchestrator {
  execute(run: ClaimedIngestionRun): Promise<RunExecutionOutcome>;
}

export type OrchestrationErrorCode =
  | "unowned_run"
  | "invalid_request"
  | "invalid_batch"
  | "adapter_mismatch"
  | "missing_credential";

export class OrchestrationError extends Error {
  readonly code: OrchestrationErrorCode;

  constructor(code: OrchestrationErrorCode, message: string) {
    super(message);
    this.name = "OrchestrationError";
    this.code = code;
  }
}
