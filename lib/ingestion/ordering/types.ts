import type {
  MappableProviderEntityKind,
  NormalizedResult,
} from "@/lib/ingestion/contracts";

export type OrderingDecision =
  | "project"
  | "no_op_duplicate"
  | "ignore_older"
  | "quarantine_stale"
  | "quarantine_regression"
  | "quarantine_terminal_conflict";

export type ResultOrderingState = Readonly<{
  normalizedResult: NormalizedResult;
  sourceObservationId: string;
  providerUpdatedAt?: string;
  providerEffectiveAt?: string;
  observedAt: string;
  receivedAt: string;
  providerRevision?: string;
  semanticKey: string;
}>;

export type OrderingInput = Readonly<{
  current?: ResultOrderingState;
  incoming: ResultOrderingState;
  explicitCorrection: boolean;
}>;

export type OrderingOutcome = Readonly<{
  decision: OrderingDecision;
  reason: string;
  correctionReasonRequired: boolean;
}>;

export type ContestLifecycleStatus =
  | "scheduled"
  | "pregame"
  | "live"
  | "suspended"
  | "postponed"
  | "final"
  | "canceled"
  | "void";

export type ContestLifecycleOrderingInput = Readonly<{
  current?: Readonly<{ status: ContestLifecycleStatus; providerUpdatedAt?: string; observedAt: string }>;
  incoming: Readonly<{ status: ContestLifecycleStatus; providerUpdatedAt?: string; observedAt: string }>;
}>;

export type ObservationKeyKind = MappableProviderEntityKind | "result";
