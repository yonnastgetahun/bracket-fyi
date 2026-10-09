export type ResultProjectionCommand = Readonly<{
  observationId: string;
  resultIdempotencyKey?: string;
}>;

export type ResultProjectionOutcome = Readonly<{
  outcome: "projected" | "duplicate" | "quarantined" | "ignored_stale" | "no_op" | "skipped_non_write";
  contestResultId?: string;
  resultVersion?: number;
  auditEventId?: string;
  outboxId?: string;
  quarantineId?: string;
  priorOutcome?: "projected" | "duplicate" | "quarantined" | "ignored_stale" | "no_op" | "skipped_non_write";
}>;

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

type ResultRow = {
  outcome: ResultProjectionOutcome["outcome"];
  contest_result_id?: string | null;
  result_version?: number | null;
  audit_event_id?: string | null;
  outbox_id?: string | null;
  quarantine_id?: string | null;
  prior_outcome?: ResultProjectionOutcome["priorOutcome"] | null;
};

export interface ResultRepository {
  project(input: ResultProjectionCommand): Promise<ResultProjectionOutcome>;
}

export function createResultRepository(client: RpcClient): ResultRepository {
  return {
    async project(input) {
      const { data, error } = await client.rpc("project_provider_result", {
        p_observation_id: input.observationId,
        p_result_idempotency_key: input.resultIdempotencyKey ?? null,
      });
      if (error) throw new Error(error.message);
      const row = (Array.isArray(data) ? data[0] : data) as ResultRow | undefined;
      if (!row?.outcome) throw new Error("Result projection RPC returned no outcome");
      return {
        outcome: row.outcome,
        ...(row.contest_result_id ? { contestResultId: row.contest_result_id } : {}),
        ...(row.result_version === null || row.result_version === undefined ? {} : { resultVersion: row.result_version }),
        ...(row.audit_event_id ? { auditEventId: row.audit_event_id } : {}),
        ...(row.outbox_id ? { outboxId: row.outbox_id } : {}),
        ...(row.quarantine_id ? { quarantineId: row.quarantine_id } : {}),
        ...(row.prior_outcome ? { priorOutcome: row.prior_outcome as ResultProjectionOutcome["priorOutcome"] } : {}),
      };
    },
  };
}
