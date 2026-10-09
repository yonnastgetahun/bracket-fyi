export type StructuralProjectionOutcome =
  | Readonly<{ kind: "projected"; canonicalId: string }>
  | Readonly<{ kind: "unchanged"; canonicalId: string }>
  | Readonly<{ kind: "quarantined"; quarantineId: string }>;

export type StructuralProjectionCommand = Readonly<{
  observationId: string;
}>;

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

type StructuralRow = {
  outcome: "projected" | "unchanged" | "quarantined";
  canonical_id?: string | null;
  quarantine_id?: string | null;
};

export interface StructuralRepository {
  projectObservation(input: StructuralProjectionCommand): Promise<StructuralProjectionOutcome>;
}

export function createStructuralRepository(client: RpcClient): StructuralRepository {
  return {
    async projectObservation(input) {
      const { data, error } = await client.rpc("project_structural_observation", {
        p_observation_id: input.observationId,
      });
      if (error) throw new Error(error.message);
      const row = (Array.isArray(data) ? data[0] : data) as StructuralRow | undefined;
      if (!row?.outcome) throw new Error("Structural projection RPC returned no outcome");
      if (row.outcome === "quarantined") {
        if (!row.quarantine_id) throw new Error("Structural quarantine returned no quarantine ID");
        return { kind: "quarantined", quarantineId: row.quarantine_id };
      }
      if (!row.canonical_id) throw new Error("Structural projection returned no canonical ID");
      return { kind: row.outcome, canonicalId: row.canonical_id };
    },
  };
}
