import type { JsonObject } from "@/lib/ingestion/contracts";

export type NormalizedSnapshot = Readonly<{
  contractVersion: string;
  adapterKey: string;
  adapterConfigVersion: number;
  normalizationPolicyVersion: string;
  completeness: "full" | "partial";
  normalizedEntity: JsonObject;
  semanticHash: string;
  correctionProvenance?: string;
}>;

export type ObservationEvidenceCommand = Readonly<{
  ingestionRunId: string;
  bindingId: string;
  externalObjectKind: string;
  externalObjectId: string;
  providerRevision?: string;
  providerUpdatedAt?: string;
  receivedAt: string;
  sanitizationVersion: number;
  sanitizedPayload: JsonObject;
  snapshot: NormalizedSnapshot;
}>;

export type ObservationEvidenceOutcome = Readonly<{
  outcome: "inserted" | "exact_replay" | "revision_conflict";
  observationId: string;
  conflictId?: string;
}>;

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

type EvidenceRow = {
  outcome: ObservationEvidenceOutcome["outcome"];
  observation_id: string;
  conflict_id?: string | null;
};

export interface ObservationEvidenceRepository {
  record(input: ObservationEvidenceCommand): Promise<ObservationEvidenceOutcome>;
}

export function createObservationEvidenceRepository(client: RpcClient): ObservationEvidenceRepository {
  return {
    async record(input) {
      const { data, error } = await client.rpc("record_provider_observation", {
        p_ingestion_run_id: input.ingestionRunId,
        p_binding_id: input.bindingId,
        p_external_object_kind: input.externalObjectKind,
        p_external_object_id: input.externalObjectId,
        p_provider_revision: input.providerRevision ?? null,
        p_provider_updated_at: input.providerUpdatedAt ?? null,
        p_received_at: input.receivedAt,
        p_sanitization_version: input.sanitizationVersion,
        p_sanitized_payload: input.sanitizedPayload,
        p_normalized_snapshot: input.snapshot,
      });
      if (error) throw new Error(error.message);
      const row = (Array.isArray(data) ? data[0] : data) as EvidenceRow | undefined;
      if (!row?.observation_id || !row.outcome) throw new Error("Evidence RPC returned no outcome");
      return {
        outcome: row.outcome,
        observationId: row.observation_id,
        ...(row.conflict_id ? { conflictId: row.conflict_id } : {}),
      };
    },
  };
}
