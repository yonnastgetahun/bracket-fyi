import { createHash } from "node:crypto";

import type { JsonObject } from "@/lib/ingestion/contracts";
import { canonicalJson } from "@/lib/ingestion/idempotency/canonical-json";

export type RunLedgerRpcError = Readonly<{
  code?: string;
  message: string;
}>;

export type RunLedgerRpcClient = Readonly<{
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: RunLedgerRpcError | null;
  }>;
}>;

export type ClaimedIngestionRun = Readonly<{
  runId: string;
  bindingId: string;
  claimKey: string;
  claimRequestKey: string;
  claimGeneration: number;
  retryIndex: number;
  leaseToken: string | null;
  leaseAcquired: boolean;
  providerId: string;
  eventEditionId: string;
  adapterKey: string;
  bindingKey: string;
  mode: "disabled" | "shadow" | "write";
  credentialRef: string | null;
  adapterConfigVersion: number;
  adapterConfig: JsonObject;
  pollPolicy: JsonObject;
  providerCursor: JsonObject;
  providerEtag: string | null;
  leaseExpiresAt: string | null;
}>;

export type PageCommitInput = Readonly<{
  runId: string;
  leaseToken: string;
  bindingId: string;
  expectedCheckpointGeneration: number;
  expectedCursor: JsonObject;
  expectedEtag?: string;
  nextCursor: JsonObject;
  responseEtag?: string;
  fetchedDelta: number;
  normalizedDelta: number;
  projectedDelta: number;
  unchangedDelta: number;
  quarantinedDelta: number;
  skippedDelta: number;
  failedDelta: number;
}>;

export type PageCommitOutcome = Readonly<{
  outcome: "committed" | "replayed";
  pageLedgerId: string;
  runId: string;
  checkpointGeneration: number;
  cursorAfter: JsonObject;
  providerEtag: string | null;
}>;

export type RunLedgerErrorKind = "lease_lost" | "checkpoint_conflict" | "page_conflict" | "rpc";

export class RunLedgerRepositoryError extends Error {
  readonly kind: RunLedgerErrorKind;
  readonly sqlState?: string;

  constructor(kind: RunLedgerErrorKind, message: string, sqlState?: string) {
    super(message);
    this.name = "RunLedgerRepositoryError";
    this.kind = kind;
    this.sqlState = sqlState;
  }
}

type RunLedgerRow = {
  run_id: string;
  binding_id: string;
  claim_key: string;
  claim_request_key: string;
  claim_generation: number;
  retry_index: number;
  lease_token?: string | null;
  lease_acquired: boolean;
  provider_id: string;
  event_edition_id: string;
  adapter_key: string;
  binding_key: string;
  mode: ClaimedIngestionRun["mode"];
  credential_ref?: string | null;
  adapter_config_version: number;
  adapter_config: JsonObject;
  poll_policy: JsonObject;
  provider_cursor: JsonObject;
  provider_etag?: string | null;
  lease_expires_at?: string | null;
};

type StartRow = { run_id: string; status: string; started_at: string };
type RenewRow = { run_id: string; lease_expires_at: string };
type RecordedRow = { run_id: string; recorded: boolean };
type ReclaimedRow = { run_id: string; binding_id: string; retry_index: number; reclaimed_at: string };
type FinishRow = {
  run_id: string;
  status: string;
  health_status: string;
  next_poll_at: string | null;
  next_retry_at: string | null;
};
type PageRow = {
  outcome: PageCommitOutcome["outcome"];
  page_ledger_id: string;
  run_id: string;
  checkpoint_generation: number;
  cursor_after: JsonObject;
  provider_etag?: string | null;
};

const firstRow = <T>(data: unknown): T | undefined => (Array.isArray(data) ? (data[0] as T | undefined) : (data as T | undefined));

const mapRpcError = (error: RunLedgerRpcError): RunLedgerRepositoryError => {
  const kind: RunLedgerErrorKind =
    error.code === "P0001" || error.message.includes("lease_lost")
      ? "lease_lost"
      : error.code === "P0002" || error.message.includes("checkpoint_conflict")
        ? "checkpoint_conflict"
        : error.code === "P0003" || error.message.includes("page_conflict")
          ? "page_conflict"
          : "rpc";
  return new RunLedgerRepositoryError(kind, error.message, error.code);
};

const pageKeyMaterial = (input: Pick<PageCommitInput, "bindingId" | "expectedCheckpointGeneration" | "expectedCursor" | "expectedEtag">): string => {
  const bindingId = input.bindingId;
  const generation = String(input.expectedCheckpointGeneration);
  const cursor = canonicalJson(input.expectedCursor);
  const etag = input.expectedEtag ?? "";
  return `slice-2c-page-v1${Buffer.byteLength(bindingId, "utf8")}${bindingId}${Buffer.byteLength(generation, "utf8")}${generation}${Buffer.byteLength(cursor, "utf8")}${cursor}${Buffer.byteLength(etag, "utf8")}${etag}`;
};

export function computeIngestionPageKey(input: Pick<PageCommitInput, "bindingId" | "expectedCheckpointGeneration" | "expectedCursor" | "expectedEtag">): string {
  return createHash("sha256").update(pageKeyMaterial(input)).digest("hex");
}

const toClaimedRun = (row: RunLedgerRow): ClaimedIngestionRun => ({
  runId: row.run_id,
  bindingId: row.binding_id,
  claimKey: row.claim_key,
  claimRequestKey: row.claim_request_key,
  claimGeneration: row.claim_generation,
  retryIndex: row.retry_index,
  leaseToken: row.lease_token ?? null,
  leaseAcquired: row.lease_acquired,
  providerId: row.provider_id,
  eventEditionId: row.event_edition_id,
  adapterKey: row.adapter_key,
  bindingKey: row.binding_key,
  mode: row.mode,
  credentialRef: row.credential_ref ?? null,
  adapterConfigVersion: row.adapter_config_version,
  adapterConfig: row.adapter_config,
  pollPolicy: row.poll_policy,
  providerCursor: row.provider_cursor,
  providerEtag: row.provider_etag ?? null,
  leaseExpiresAt: row.lease_expires_at ?? null,
});

export interface RunLedgerRepository {
  claimDue(input: Readonly<{ requestKey: string; now: string; workerId: string; leaseSeconds?: number }>): Promise<ClaimedIngestionRun | null>;
  claimManual(input: Readonly<{ bindingId: string; requestKey: string; now: string; workerId: string; leaseSeconds?: number }>): Promise<ClaimedIngestionRun | null>;
  start(input: Readonly<{ runId: string; leaseToken: string; now: string }>): Promise<StartRow>;
  renew(input: Readonly<{ runId: string; leaseToken: string; now: string; leaseSeconds?: number }>): Promise<RenewRow>;
  recordResponse(input: Readonly<{
    runId: string;
    leaseToken: string;
    httpStatus?: number;
    rateLimitLimit?: number;
    rateLimitRemaining?: number;
    rateLimitResetAt?: string;
    retryAfterAt?: string;
    observedAt: string;
  }>): Promise<RecordedRow>;
  reclaimExpired(input: Readonly<{ now: string; reason: string; retryAt?: string }>): Promise<ReclaimedRow[]>;
  commitPage(input: PageCommitInput): Promise<PageCommitOutcome>;
  finish(input: Readonly<{
    runId: string;
    leaseToken: string;
    outcome: "succeeded" | "partial" | "failed" | "rate_limited" | "canceled";
    finishedAt: string;
    nextPollAt?: string;
    nextRetryAt?: string;
    dataChanged: boolean;
    failureCode?: string;
    errorMessage?: string;
    metadata?: JsonObject;
  }>): Promise<FinishRow>;
}

export function createRunLedgerRepository(client: RunLedgerRpcClient): RunLedgerRepository {
  const call = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    const response = await client.rpc(name, args);
    if (response.error) throw mapRpcError(response.error);
    const row = firstRow<T>(response.data);
    if (!row) throw new RunLedgerRepositoryError("rpc", `${name} RPC returned no outcome`);
    return row;
  };

  return {
    async claimDue(input) {
      const response = await client.rpc("claim_due_ingestion_run", {
        p_claim_request_key: input.requestKey,
        p_now: input.now,
        p_worker_id: input.workerId,
        p_lease_seconds: input.leaseSeconds ?? 300,
      });
      if (response.error) throw mapRpcError(response.error);
      const row = firstRow<RunLedgerRow>(response.data);
      return row ? toClaimedRun(row) : null;
    },

    async claimManual(input) {
      const response = await client.rpc("claim_manual_ingestion_run", {
        p_binding_id: input.bindingId,
        p_request_key: input.requestKey,
        p_worker_id: input.workerId,
        p_now: input.now,
        p_lease_seconds: input.leaseSeconds ?? 300,
      });
      if (response.error) throw mapRpcError(response.error);
      const row = firstRow<RunLedgerRow>(response.data);
      return row ? toClaimedRun(row) : null;
    },

    start(input) {
      return call<StartRow>("start_ingestion_run", {
        p_run_id: input.runId,
        p_lease_token: input.leaseToken,
        p_now: input.now,
      });
    },

    renew(input) {
      return call<RenewRow>("renew_ingestion_run", {
        p_run_id: input.runId,
        p_lease_token: input.leaseToken,
        p_now: input.now,
        p_lease_seconds: input.leaseSeconds ?? 300,
      });
    },

    recordResponse(input) {
      return call<RecordedRow>("record_ingestion_response", {
        p_run_id: input.runId,
        p_lease_token: input.leaseToken,
        p_http_status: input.httpStatus ?? null,
        p_rate_limit_limit: input.rateLimitLimit ?? null,
        p_rate_limit_remaining: input.rateLimitRemaining ?? null,
        p_rate_limit_reset_at: input.rateLimitResetAt ?? null,
        p_retry_after_at: input.retryAfterAt ?? null,
        p_observed_at: input.observedAt,
      });
    },

    async reclaimExpired(input) {
      const response = await client.rpc("reclaim_expired_ingestion_runs", {
        p_now: input.now,
        p_reason: input.reason,
        p_retry_at: input.retryAt ?? null,
      });
      if (response.error) throw mapRpcError(response.error);
      return Array.isArray(response.data) ? (response.data as ReclaimedRow[]) : [];
    },

    async commitPage(input) {
      const response = await client.rpc("commit_ingestion_page", {
        p_run_id: input.runId,
        p_lease_token: input.leaseToken,
        p_page_key: computeIngestionPageKey(input),
        p_expected_checkpoint_generation: input.expectedCheckpointGeneration,
        p_expected_cursor: input.expectedCursor,
        p_expected_etag: input.expectedEtag ?? null,
        p_next_cursor: input.nextCursor,
        p_response_etag: input.responseEtag ?? null,
        p_fetched_delta: input.fetchedDelta,
        p_normalized_delta: input.normalizedDelta,
        p_projected_delta: input.projectedDelta,
        p_unchanged_delta: input.unchangedDelta,
        p_quarantined_delta: input.quarantinedDelta,
        p_skipped_delta: input.skippedDelta,
        p_failed_delta: input.failedDelta,
      });
      if (response.error) throw mapRpcError(response.error);
      const row = firstRow<PageRow>(response.data);
      if (!row?.page_ledger_id || !row.outcome) throw new RunLedgerRepositoryError("rpc", "commit_ingestion_page RPC returned no outcome");
      return {
        outcome: row.outcome,
        pageLedgerId: row.page_ledger_id,
        runId: row.run_id,
        checkpointGeneration: row.checkpoint_generation,
        cursorAfter: row.cursor_after,
        providerEtag: row.provider_etag ?? null,
      };
    },

    finish(input) {
      return call<FinishRow>("finish_ingestion_run", {
        p_run_id: input.runId,
        p_lease_token: input.leaseToken,
        p_outcome: input.outcome,
        p_finished_at: input.finishedAt,
        p_next_poll_at: input.nextPollAt ?? null,
        p_next_retry_at: input.nextRetryAt ?? null,
        p_data_changed: input.dataChanged,
        p_failure_code: input.failureCode ?? null,
        p_error_message: input.errorMessage ?? null,
        p_metadata: input.metadata ?? {},
      });
    },
  };
}
