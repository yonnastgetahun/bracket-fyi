import { describe, expect, it, vi } from "vitest";

import { createQuarantineRepository } from "@/lib/ingestion/quarantine/repository";

describe("quarantine repository", () => {
  it("opens a deterministic quarantine through the atomic RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        outcome: "created",
        id: "quarantine-1",
        observation_id: "observation-1",
        ingestion_run_id: "run-1",
        binding_id: "binding-1",
        issue_code: "mapping_ambiguous",
        severity: "blocking",
        status: "open",
        external_entity_kind: "competitor",
        external_entity_id: "team-1",
        candidate_ids: ["canonical-1", "canonical-2"],
        details: { synthetic: true },
      }],
      error: null,
    });
    const repository = createQuarantineRepository({ rpc });

    await expect(repository.open({
      observationId: "observation-1",
      ingestionRunId: "run-1",
      bindingId: "binding-1",
      issueCode: "mapping_ambiguous",
      severity: "blocking",
      externalEntityKind: "competitor",
      externalEntityId: "team-1",
      candidateIds: ["canonical-2", "canonical-1"],
      details: { synthetic: true },
    })).resolves.toMatchObject({ outcome: "created", record: { id: "quarantine-1" } });
    expect(rpc).toHaveBeenCalledWith("open_ingestion_quarantine", expect.objectContaining({
      p_candidate_ids: ["canonical-1", "canonical-2"],
    }));
  });
});
