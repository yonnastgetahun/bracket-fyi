import { describe, expect, it, vi } from "vitest";

import { createObservationEvidenceRepository } from "@/lib/ingestion/evidence/repository";

const command = {
  ingestionRunId: "run-1",
  bindingId: "binding-1",
  externalObjectKind: "contest" as const,
  externalObjectId: "contest-1",
  providerRevision: "revision-a",
  providerUpdatedAt: "2026-10-08T18:00:00Z",
  receivedAt: "2026-10-08T18:01:00Z",
  sanitizationVersion: 1,
  sanitizedPayload: { source: "synthetic", score: { home: 1, away: 0 } },
  snapshot: {
    contractVersion: "slice-2a-v1",
    adapterKey: "synthetic-sports",
    adapterConfigVersion: 1,
    normalizationPolicyVersion: "identity-normalization-v1",
    completeness: "full" as const,
    normalizedEntity: { entityKind: "contest", contestKey: "final" },
    semanticHash: "a".repeat(64),
  },
};

describe("observation evidence repository", () => {
  it("persists a validated snapshot through the evidence RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ outcome: "inserted", observation_id: "observation-1", conflict_id: null }],
      error: null,
    });
    const repository = createObservationEvidenceRepository({ rpc });

    await expect(repository.record(command)).resolves.toEqual({
      outcome: "inserted",
      observationId: "observation-1",
    });
    expect(rpc).toHaveBeenCalledWith("record_provider_observation", expect.objectContaining({
      p_ingestion_run_id: "run-1",
      p_binding_id: "binding-1",
      p_external_object_kind: "contest",
      p_normalized_snapshot: command.snapshot,
    }));
  });

  it("returns exact replay and preserves same-revision conflicts", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [{ outcome: "exact_replay", observation_id: "observation-1", conflict_id: null }], error: null })
      .mockResolvedValueOnce({ data: [{ outcome: "revision_conflict", observation_id: "observation-1", conflict_id: "conflict-1" }], error: null });
    const repository = createObservationEvidenceRepository({ rpc });

    await expect(repository.record(command)).resolves.toMatchObject({ outcome: "exact_replay", observationId: "observation-1" });
    await expect(repository.record({ ...command, sanitizedPayload: { changed: true } })).resolves.toEqual({
      outcome: "revision_conflict",
      observationId: "observation-1",
      conflictId: "conflict-1",
    });
  });
});
