import type { JsonObject, ProviderEntityKind } from "@/lib/ingestion/contracts";

export type QuarantineIssueCode =
  | "mapping_missing"
  | "mapping_ambiguous"
  | "schema_invalid"
  | "partial_payload"
  | "illegal_regression"
  | "conflicting_terminal_result"
  | "stale_update"
  | "provider_error"
  | "unsupported_shape"
  | "other";

export type QuarantineCommand = Readonly<{
  observationId: string;
  ingestionRunId: string;
  bindingId: string;
  issueCode: QuarantineIssueCode;
  severity: "info" | "warning" | "error" | "blocking";
  externalEntityKind?: ProviderEntityKind;
  externalEntityId?: string;
  candidateIds: readonly string[];
  details: JsonObject;
}>;

export type QuarantineRecord = Readonly<QuarantineCommand & {
  id: string;
  status: "open" | "resolved" | "ignored";
}>;

export type QuarantineOutcome = Readonly<{
  outcome: "created" | "unchanged" | "already_resolved";
  record: QuarantineRecord;
}>;

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

type QuarantineRow = {
  outcome: QuarantineOutcome["outcome"];
  id: string;
  observation_id: string;
  ingestion_run_id: string;
  binding_id: string;
  issue_code: QuarantineIssueCode;
  severity: QuarantineCommand["severity"];
  status: QuarantineRecord["status"];
  external_entity_kind?: ProviderEntityKind | null;
  external_entity_id?: string | null;
  candidate_ids: string[];
  details: JsonObject;
};

export interface QuarantineRepository {
  open(input: QuarantineCommand): Promise<QuarantineOutcome>;
  getByObservationIssue(observationId: string, issueCode: QuarantineIssueCode): Promise<QuarantineRecord | null>;
}

const toRecord = (row: QuarantineRow): QuarantineRecord => ({
  id: row.id,
  observationId: row.observation_id,
  ingestionRunId: row.ingestion_run_id,
  bindingId: row.binding_id,
  issueCode: row.issue_code,
  severity: row.severity,
  status: row.status,
  ...(row.external_entity_kind ? { externalEntityKind: row.external_entity_kind } : {}),
  ...(row.external_entity_id ? { externalEntityId: row.external_entity_id } : {}),
  candidateIds: [...row.candidate_ids].sort(),
  details: row.details,
});

export function createQuarantineRepository(client: RpcClient): QuarantineRepository {
  return {
    async open(input) {
      const { data, error } = await client.rpc("open_ingestion_quarantine", {
        p_observation_id: input.observationId,
        p_ingestion_run_id: input.ingestionRunId,
        p_binding_id: input.bindingId,
        p_issue_code: input.issueCode,
        p_severity: input.severity,
        p_external_entity_kind: input.externalEntityKind ?? null,
        p_external_entity_id: input.externalEntityId ?? null,
        p_candidate_ids: [...input.candidateIds].sort(),
        p_details: input.details,
      });
      if (error) throw new Error(error.message);
      const row = (Array.isArray(data) ? data[0] : data) as QuarantineRow | undefined;
      if (!row?.id || !row.outcome) throw new Error("Quarantine RPC returned no outcome");
      return { outcome: row.outcome, record: toRecord(row) };
    },
    async getByObservationIssue(observationId, issueCode) {
      const { data, error } = await client.rpc("get_ingestion_quarantine", {
        p_observation_id: observationId,
        p_issue_code: issueCode,
      });
      if (error) throw new Error(error.message);
      const row = (Array.isArray(data) ? data[0] : data) as QuarantineRow | undefined;
      return row?.id ? toRecord(row) : null;
    },
  };
}
