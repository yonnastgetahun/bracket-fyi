import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { ClaimedIngestionRun } from "@/lib/ingestion/orchestrator/run-ledger-repository";
import { createObservationDispatcher } from "@/lib/ingestion/orchestrator/observation-dispatch";
import { canonicalJson } from "@/lib/ingestion/idempotency/canonical-json";

const run: ClaimedIngestionRun = {
  runId: "run-sports",
  bindingId: "10000000-0000-4000-8000-000000000001",
  claimKey: "v1:schedule:binding:g1",
  claimRequestKey: "automated:v1:sports",
  claimGeneration: 1,
  retryIndex: 0,
  checkpointGeneration: 0,
  leaseToken: "lease-sports",
  leaseAcquired: true,
  providerId: "20000000-0000-4000-8000-000000000001",
  eventEditionId: "30000000-0000-4000-8000-000000000001",
  adapterKey: "synthetic-sports",
  bindingKey: "sports",
  mode: "write",
  credentialRef: "credential://sports",
  adapterConfigVersion: 1,
  adapterConfig: { fixture: "sports" },
  pollPolicy: {
    idleSeconds: 300,
    pregameSeconds: 60,
    liveSeconds: 30,
    postgameSeconds: 60,
    staleAfterSeconds: 60,
  },
  providerCursor: { page: 0 },
  providerEtag: null,
  leaseExpiresAt: "2026-10-10T18:05:00.000Z",
};

const observation = {
  entityKind: "organization" as const,
  externalId: "sports-org",
  observedAt: "2026-10-10T18:00:00.000Z",
  completeness: "full" as const,
  sanitizedPayload: { source: "synthetic-sports" },
  data: {
    organizationKind: "league" as const,
    name: "Synthetic Sports",
    metadata: { season: "2026" },
  },
};

describe("observation dispatcher", () => {
  it("records evidence before projecting a structural observation", async () => {
    const order: string[] = [];
    const evidence = {
      record: vi.fn(async (input: Record<string, unknown>) => {
        order.push("evidence");
        expect(input).toMatchObject({
          ingestionRunId: run.runId,
          bindingId: run.bindingId,
          externalObjectKind: "organization",
          externalObjectId: "sports-org",
          sanitizationVersion: 1,
          receivedAt: "2026-10-10T18:00:00.000Z",
          snapshot: {
            contractVersion: "slice-2a-v1",
            adapterKey: run.adapterKey,
            adapterConfigVersion: 1,
            normalizationPolicyVersion: "identity-normalization-v1",
            completeness: "full",
            normalizedEntity: observation.data,
          },
        });
        return { outcome: "inserted" as const, observationId: "observation-1" };
      }),
    };
    const structural = {
      projectObservation: vi.fn(async () => {
        order.push("structural");
        return { kind: "projected" as const, canonicalId: "canonical-org-1" };
      }),
    };
    const result = {
      project: vi.fn(),
    };
    const dispatcher = createObservationDispatcher({ evidence, structural, result });

    await expect(dispatcher.dispatch({ run, observation, receivedAt: observation.observedAt, mode: "write" })).resolves.toEqual({
      disposition: "projected",
      dataChanged: true,
    });
    expect(order).toEqual(["evidence", "structural"]);
    expect(result.project).not.toHaveBeenCalled();
    const command = evidence.record.mock.calls[0][0] as { snapshot: { semanticHash: string }; providerRevision?: string };
    expect(command.providerRevision).toBeUndefined();
    expect(command.snapshot.semanticHash).toBe(createHash("sha256").update(canonicalJson(observation.data)).digest("hex"));
  });

  it("retains evidence but never projects in shadow mode", async () => {
    const evidence = { record: vi.fn().mockResolvedValue({ outcome: "inserted" as const, observationId: "observation-shadow" }) };
    const structural = { projectObservation: vi.fn() };
    const result = { project: vi.fn() };
    const dispatcher = createObservationDispatcher({ evidence, structural, result });

    await expect(dispatcher.dispatch({ run, observation, receivedAt: observation.observedAt, mode: "shadow" })).resolves.toEqual({
      disposition: "skipped",
      dataChanged: false,
    });
    expect(evidence.record).toHaveBeenCalledTimes(1);
    expect(structural.projectObservation).not.toHaveBeenCalled();
    expect(result.project).not.toHaveBeenCalled();
  });

  it.each([
    ["inserted", "projected"],
    ["exact_replay", "projected"],
    ["revision_conflict", "quarantined"],
  ] as const)("maps evidence outcome %s to %s", async (evidenceOutcome, expected) => {
    const evidence = { record: vi.fn().mockResolvedValue({ outcome: evidenceOutcome, observationId: "observation-result" }) };
    const structural = { projectObservation: vi.fn().mockResolvedValue({ kind: "projected" as const, canonicalId: "canonical-1" }) };
    const result = { project: vi.fn() };
    const dispatcher = createObservationDispatcher({ evidence, structural, result });

    await expect(dispatcher.dispatch({ run, observation, receivedAt: observation.observedAt, mode: "write" })).resolves.toMatchObject({
      disposition: expected,
    });
    if (evidenceOutcome === "revision_conflict") expect(structural.projectObservation).not.toHaveBeenCalled();
    else expect(structural.projectObservation).toHaveBeenCalledWith({ observationId: "observation-result" });
  });

  it.each([
    [{ kind: "projected", canonicalId: "canonical-1" }, "projected", true],
    [{ kind: "unchanged", canonicalId: "canonical-1" }, "unchanged", false],
    [{ kind: "quarantined", quarantineId: "quarantine-1" }, "quarantined", false],
    [{ kind: "skipped_non_write" }, "skipped", false],
  ] as const)("maps structural disposition", async (projection, disposition, dataChanged) => {
    const evidence = { record: vi.fn().mockResolvedValue({ outcome: "exact_replay" as const, observationId: "observation-structural" }) };
    const structural = { projectObservation: vi.fn().mockResolvedValue(projection) };
    const result = { project: vi.fn() };
    const dispatcher = createObservationDispatcher({ evidence, structural, result });

    await expect(dispatcher.dispatch({ run, observation, receivedAt: observation.observedAt, mode: "write" })).resolves.toEqual({ disposition, dataChanged });
  });

  it("maps result projector outcomes without inventing an idempotency key", async () => {
    const resultObservation = {
      ...observation,
      entityKind: "result" as const,
      externalId: "result-1",
      data: {
        eventEditionExternalId: "edition-1",
        contestExternalId: "contest-1",
        resultStatus: "final" as const,
        outcomeType: "draw" as const,
        resultData: { score: "1-1" },
      },
    };
    const evidence = { record: vi.fn().mockResolvedValue({ outcome: "inserted" as const, observationId: "observation-result" }) };
    const structural = { projectObservation: vi.fn() };
    const result = { project: vi.fn().mockResolvedValue({ outcome: "duplicate" as const }) };
    const dispatcher = createObservationDispatcher({ evidence, structural, result });

    await expect(dispatcher.dispatch({ run, observation: resultObservation, receivedAt: observation.observedAt, mode: "write" })).resolves.toEqual({
      disposition: "unchanged",
      dataChanged: false,
    });
    expect(result.project).toHaveBeenCalledWith({ observationId: "observation-result" });
  });

  it.each([
    ["projected", "projected", true],
    ["duplicate", "unchanged", false],
    ["ignored_stale", "unchanged", false],
    ["no_op", "unchanged", false],
    ["quarantined", "quarantined", false],
    ["skipped_non_write", "skipped", false],
  ] as const)("maps result disposition %s", async (outcome, disposition, dataChanged) => {
    const resultObservation = {
      ...observation,
      entityKind: "result" as const,
      externalId: "result-matrix",
      data: {
        eventEditionExternalId: "edition-1",
        contestExternalId: "contest-1",
        resultStatus: "final" as const,
        outcomeType: "draw" as const,
        resultData: { score: "1-1" },
      },
    };
    const evidence = { record: vi.fn().mockResolvedValue({ outcome: "inserted" as const, observationId: "observation-result-matrix" }) };
    const structural = { projectObservation: vi.fn() };
    const result = { project: vi.fn().mockResolvedValue({ outcome }) };
    const dispatcher = createObservationDispatcher({ evidence, structural, result });

    await expect(dispatcher.dispatch({ run, observation: resultObservation, receivedAt: observation.observedAt, mode: "write" })).resolves.toEqual({ disposition, dataChanged });
    expect(result.project).toHaveBeenCalledWith({ observationId: "observation-result-matrix" });
  });
});
