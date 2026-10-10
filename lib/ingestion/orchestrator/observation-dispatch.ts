import { createHash } from "node:crypto";

import {
  normalizedObservationSchema,
  type NormalizedObservation,
  type JsonObject,
} from "@/lib/ingestion/contracts";
import { IDENTITY_NORMALIZATION_VERSION } from "@/lib/ingestion/identity/normalize";
import { canonicalJson } from "@/lib/ingestion/idempotency/canonical-json";
import type { ObservationEvidenceCommand, ObservationEvidenceRepository } from "@/lib/ingestion/evidence/repository";
import type { ResultRepository } from "@/lib/ingestion/projection/result-repository";
import type { StructuralRepository } from "@/lib/ingestion/projection/structural-repository";
import type { ClaimedIngestionRun } from "@/lib/ingestion/orchestrator/run-ledger-repository";
import type {
  CurrentBindingMode,
  ObservationDispatchResult,
  ObservationDispatcherPort,
} from "@/lib/ingestion/orchestrator/ports";

type ObservationDispatcherDependencies = Readonly<{
  evidence: ObservationEvidenceRepository;
  structural: StructuralRepository;
  result: ResultRepository;
}>;

export type ObservationDispatchInput = Readonly<{
  run: ClaimedIngestionRun;
  observation: NormalizedObservation;
  receivedAt: string;
  mode: CurrentBindingMode;
}>;

const semanticHash = (data: JsonObject): string =>
  createHash("sha256").update(canonicalJson(data)).digest("hex");

const evidenceCommand = (input: ObservationDispatchInput): ObservationEvidenceCommand => ({
  ingestionRunId: input.run.runId,
  bindingId: input.run.bindingId,
  externalObjectKind: input.observation.entityKind,
  externalObjectId: input.observation.externalId,
  ...(input.observation.providerRevision === undefined ? {} : { providerRevision: input.observation.providerRevision }),
  ...(input.observation.providerUpdatedAt === undefined ? {} : { providerUpdatedAt: input.observation.providerUpdatedAt }),
  receivedAt: input.receivedAt,
  sanitizationVersion: 1,
  sanitizedPayload: input.observation.sanitizedPayload,
  snapshot: {
    contractVersion: "slice-2a-v1",
    adapterKey: input.run.adapterKey,
    adapterConfigVersion: input.run.adapterConfigVersion,
    normalizationPolicyVersion: IDENTITY_NORMALIZATION_VERSION,
    completeness: input.observation.completeness,
    normalizedEntity: input.observation.data as JsonObject,
    semanticHash: semanticHash(input.observation.data as JsonObject),
  },
});

export function createObservationDispatcher(
  dependencies: ObservationDispatcherDependencies,
): ObservationDispatcherPort {
  return {
    async dispatch(input): Promise<ObservationDispatchResult> {
      const observation = normalizedObservationSchema.parse(input.observation);
      const evidence = await dependencies.evidence.record(evidenceCommand({ ...input, observation }));

      if (evidence.outcome === "revision_conflict") {
        return { disposition: "quarantined", dataChanged: false };
      }
      if (input.mode === "shadow") {
        return { disposition: "skipped", dataChanged: false };
      }

      if (observation.entityKind === "result") {
        const outcome = await dependencies.result.project({ observationId: evidence.observationId });
        if (outcome.outcome === "projected") return { disposition: "projected", dataChanged: true };
        if (outcome.outcome === "quarantined") return { disposition: "quarantined", dataChanged: false };
        if (outcome.outcome === "skipped_non_write") return { disposition: "skipped", dataChanged: false };
        return { disposition: "unchanged", dataChanged: false };
      }

      const outcome = await dependencies.structural.projectObservation({ observationId: evidence.observationId });
      if (outcome.kind === "projected") return { disposition: "projected", dataChanged: true };
      if (outcome.kind === "quarantined") return { disposition: "quarantined", dataChanged: false };
      if (outcome.kind === "skipped_non_write") return { disposition: "skipped", dataChanged: false };
      return { disposition: "unchanged", dataChanged: false };
    },
  };
}
