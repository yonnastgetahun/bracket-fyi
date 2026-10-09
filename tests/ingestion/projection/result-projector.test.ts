import { describe, expect, it, vi } from "vitest";

import { projectProviderResult } from "@/lib/ingestion/projection/result-projector";
import { createResultRepository } from "@/lib/ingestion/projection/result-repository";

describe("atomic result, audit, and operator-outbox projection", () => {
  it("passes only the existing observation and optional untrusted key to SQL", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        outcome: "projected",
        contest_result_id: "result-1",
        result_version: 1,
        audit_event_id: "audit-1",
        outbox_id: "outbox-1",
        quarantine_id: null,
        prior_outcome: null,
      }],
      error: null,
    });
    const repository = createResultRepository({ rpc });

    await expect(projectProviderResult({ observationId: "observation-1", resultIdempotencyKey: "untrusted-key" }, repository)).resolves.toEqual({
      outcome: "projected",
      contestResultId: "result-1",
      resultVersion: 1,
      auditEventId: "audit-1",
      outboxId: "outbox-1",
    });
    expect(rpc).toHaveBeenCalledWith("project_provider_result", {
      p_observation_id: "observation-1",
      p_result_idempotency_key: "untrusted-key",
    });
  });

  it("returns prior IDs on duplicate and quarantine IDs on policy rejection", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [{ outcome: "duplicate", contest_result_id: "result-1", result_version: 1, audit_event_id: "audit-1", outbox_id: "outbox-1", quarantine_id: null, prior_outcome: "projected" }], error: null })
      .mockResolvedValueOnce({ data: [{ outcome: "quarantined", contest_result_id: null, result_version: null, audit_event_id: null, outbox_id: null, quarantine_id: "quarantine-1", prior_outcome: null }], error: null });
    const repository = createResultRepository({ rpc });

    await expect(projectProviderResult({ observationId: "observation-1" }, repository)).resolves.toMatchObject({ outcome: "duplicate", priorOutcome: "projected", contestResultId: "result-1", outboxId: "outbox-1" });
    await expect(projectProviderResult({ observationId: "observation-2" }, repository)).resolves.toEqual({ outcome: "quarantined", quarantineId: "quarantine-1" });
  });
});
