import { describe, expect, it, vi } from "vitest";

import { projectStructuralObservation } from "@/lib/ingestion/projection/structural-projector";
import { createStructuralRepository } from "@/lib/ingestion/projection/structural-repository";

describe("atomic canonical structural projection", () => {
  it("projects through the observation-only RPC boundary", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ outcome: "projected", canonical_id: "stage-1", quarantine_id: null }],
      error: null,
    });
    const repository = createStructuralRepository({ rpc });

    await expect(projectStructuralObservation({ observationId: "observation-1" }, repository)).resolves.toEqual({
      kind: "projected",
      canonicalId: "stage-1",
    });
    expect(rpc).toHaveBeenCalledWith("project_structural_observation", {
      p_observation_id: "observation-1",
    });
  });

  it("returns quarantine without exposing partial structural writes", async () => {
    const repository = createStructuralRepository({
      rpc: vi.fn().mockResolvedValue({
        data: [{ outcome: "quarantined", canonical_id: null, quarantine_id: "quarantine-1" }],
        error: null,
      }),
    });
    await expect(projectStructuralObservation({ observationId: "child-before-parent" }, repository)).resolves.toEqual({
      kind: "quarantined",
      quarantineId: "quarantine-1",
    });
  });

  it("returns an explicit typed skip for non-write bindings", async () => {
    const repository = createStructuralRepository({
      rpc: vi.fn().mockResolvedValue({
        data: [{ outcome: "skipped_shadow", canonical_id: null, quarantine_id: null }],
        error: null,
      }),
    });
    await expect(projectStructuralObservation({ observationId: "shadow-observation" }, repository)).resolves.toEqual({
      kind: "skipped_shadow",
    });
  });
});
