import { describe, it, expect, vi } from "vitest";
import { quarantineAdapterRejection } from "@/lib/ingestion/quarantine/adapter-rejection";
import type { ClaimedIngestionRun } from "@/lib/ingestion/orchestrator/run-ledger-repository";
import type { ObservationEvidenceRepository } from "@/lib/ingestion/evidence/repository";
import type { QuarantineCommand } from "@/lib/ingestion/quarantine/repository";

function fixture() {
  const evidence = { record: vi.fn<ObservationEvidenceRepository["record"]>().mockResolvedValue({ outcome: "inserted", observationId: "observation-1" }) };
  const quarantine = {
    open: vi.fn(async (command: QuarantineCommand) => ({
      outcome: "created" as const, record: { ...command, id: "quarantine-1", status: "open" as const },
    })),
    getByObservationIssue: vi.fn(),
  };
  return {
    run: { runId: "run-1", bindingId: "binding-1", adapterKey: "football-data", adapterConfigVersion: 1 } as ClaimedIngestionRun,
    checkpointGeneration: 0, receivedAt: "2026-10-30T00:00:00Z", evidence, quarantine,
    failure: { code: "invalid_response" as const, retry: "never" as const, message: "unsafe-text",
      details: { reviewRequired: true, reason: "unmapped_match", matchId: "9001", rowIndex: 1, fetchedCount: 2 } },
  };
}

describe("adapter rejection immutable evidence seam", () => {
  it("retains only bounded allowlisted diagnostics and never invents canonical candidates", async () => {
    const input = fixture();
    Object.assign(input.failure.details, { raw: "SECRET", name: "SECRET", nested: { token: "SECRET" } });
    expect(await quarantineAdapterRejection(input)).toMatchObject({ quarantineId: "quarantine-1", issueCode: "mapping_missing" });
    const command = input.evidence.record.mock.calls[0][0];
    expect(command.externalObjectKind).toBe("adapter_rejection");
    expect(command.snapshot.contractVersion).toBe("adapter-rejection-v1");
    expect(command.snapshot.normalizedEntity).toEqual(command.sanitizedPayload);
    expect(command.providerRevision).toBeUndefined();
    expect(command.providerUpdatedAt).toBeUndefined();
    expect(JSON.stringify(command)).not.toContain("SECRET");
    expect(JSON.stringify(command)).not.toContain("unsafe-text");
    expect(input.quarantine.open.mock.calls[0][0]).toMatchObject({ candidateIds: [], severity: "blocking" });
    expect(input.quarantine.open.mock.calls[0][0].externalEntityKind).toBeUndefined();
  });
  it("uses run/page/witness identity; same-run replay retains evidence identity, different runs do not alias", async () => {
    const input = fixture();
    await quarantineAdapterRejection(input);
    input.evidence.record.mockResolvedValue({ outcome: "exact_replay", observationId: "observation-1" });
    await quarantineAdapterRejection(input);
    const first = input.evidence.record.mock.calls[0][0].externalObjectId;
    expect(input.evidence.record.mock.calls[1][0].externalObjectId).toBe(first);
    await quarantineAdapterRejection({ ...input, run: { ...input.run, runId: "run-2" } });
    expect(input.evidence.record.mock.calls[2][0].externalObjectId).not.toBe(first);
    await quarantineAdapterRejection({ ...input, checkpointGeneration: 1 });
    expect(input.evidence.record.mock.calls[3][0].externalObjectId).not.toBe(first);
  });
  it("repairs evidence-before-quarantine failure by replaying the same immutable witness", async () => {
    const input = fixture();
    input.quarantine.open.mockRejectedValueOnce(new Error("interrupted"));
    await expect(quarantineAdapterRejection(input)).rejects.toThrow("interrupted");
    input.evidence.record.mockResolvedValue({ outcome: "exact_replay", observationId: "observation-1" });
    expect(await quarantineAdapterRejection(input)).toMatchObject({ quarantineId: "quarantine-1" });
    expect(input.evidence.record.mock.calls[1][0]).toEqual(input.evidence.record.mock.calls[0][0]);
    expect(input.quarantine.open.mock.calls[1][0]).toEqual(input.quarantine.open.mock.calls[0][0]);
  });
  it("records an envelope rejection without fabricating a match or row ID", async () => {
    const input = fixture();
    const failure = { ...input.failure, details: { reviewRequired: true, reason: "competition_mismatch" } };
    expect(await quarantineAdapterRejection({ ...input, failure })).toMatchObject({ witness: "envelope" });
    expect(input.evidence.record.mock.calls[0][0].sanitizedPayload).toEqual({
      reviewRequired: true, reason: "competition_mismatch", disposition: "rejected",
      scope: "entire_batch", witness: "envelope",
    });
  });
  it("does not pretend a conflicting evidence replay was successfully quarantined", async () => {
    const input = fixture();
    input.evidence.record.mockResolvedValue({ outcome: "revision_conflict", observationId: "old-observation" });
    await expect(quarantineAdapterRejection(input)).rejects.toThrow("conflict");
    expect(input.quarantine.open).not.toHaveBeenCalled();
  });
  it.each([
    { matchId: "SECRET" }, { rowIndex: -1 }, { rowIndex: 2 }, { reason: "SECRET" },
  ])("rejects malformed bounded witness %j", async (patch) => {
    const input = fixture();
    Object.assign(input.failure.details, patch);
    await expect(quarantineAdapterRejection(input)).rejects.toThrow("Invalid adapter rejection");
    expect(input.evidence.record).not.toHaveBeenCalled();
  });
  it("does not reinterpret other providers or transport errors as row rejection", async () => {
    const input = fixture();
    expect(await quarantineAdapterRejection({ ...input, run: { ...input.run, adapterKey: "other" } })).toBeNull();
    expect(await quarantineAdapterRejection({ ...input, failure: { ...input.failure, code: "network", retry: "backoff" } })).toBeNull();
    expect(input.evidence.record).not.toHaveBeenCalled();
  });
});
