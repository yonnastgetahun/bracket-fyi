import { createHash } from "node:crypto";
import { z } from "zod";
import type { JsonObject } from "@/lib/ingestion/contracts";
import type { ProviderFailure } from "@/lib/ingestion/errors";
import type { ObservationEvidenceRepository } from "@/lib/ingestion/evidence/repository";
import { canonicalJson } from "@/lib/ingestion/idempotency/canonical-json";
import { IDENTITY_NORMALIZATION_VERSION } from "@/lib/ingestion/identity/normalize";
import type { ClaimedIngestionRun } from "@/lib/ingestion/orchestrator/run-ledger-repository";
import type { QuarantineIssueCode, QuarantineRepository } from "./repository";

const reasons = [
  "invalid_match_id", "competition_mismatch", "season_mismatch", "outside_window",
  "unknown_stage", "unmapped_match", "unmapped_team", "conflicting_entries",
  "unknown_status", "filter_mismatch", "unsupported_award", "unknown_duration",
  "missing_score", "score_conflict",
] as const;
const sourceId = z.string().regex(/^[1-9]\d{0,19}$/);
const rejectionSchema = z.object({
  reviewRequired: z.literal(true),
  reason: z.enum(reasons),
  matchId: sourceId.optional(),
  homeTeamId: sourceId.optional(),
  awayTeamId: sourceId.optional(),
  rowIndex: z.number().int().safe().nonnegative().optional(),
  fetchedCount: z.number().int().safe().nonnegative().optional(),
}).refine(value => value.rowIndex === undefined ||
  (value.fetchedCount !== undefined && value.rowIndex < value.fetchedCount));

/** Separate evidence namespace, never a normalized contest/result or a projection input.
 * One bounded first-failure witness holds the entire batch. Unexamined rows are NOT
 * claimed as individually normalized/quarantined. Run/page identity prevents a
 * cross-run exact replay from violating quarantine's observation/run ownership.
 */
export async function quarantineAdapterRejection(input: {
  run: ClaimedIngestionRun;
  checkpointGeneration: number;
  failure: ProviderFailure;
  receivedAt: string;
  evidence: ObservationEvidenceRepository;
  quarantine?: QuarantineRepository;
}): Promise<JsonObject | null> {
  if (input.run.adapterKey !== "football-data" || input.failure.code !== "invalid_response" ||
      input.failure.details.reviewRequired !== true) return null;
  const parsed = rejectionSchema.safeParse(input.failure.details);
  if (!parsed.success) throw new Error("Invalid adapter rejection evidence");
  if (!input.quarantine) throw new Error("Missing adapter quarantine repository");
  const rejection = parsed.data;
  const details: JsonObject = {
    ...rejection, disposition: "rejected", scope: "entire_batch",
    witness: rejection.rowIndex === undefined ? "envelope" : "first_rejected_row",
  };
  const issueCode: QuarantineIssueCode = rejection.reason === "conflicting_entries"
    ? "mapping_ambiguous"
    : ["unmapped_match", "unmapped_team", "unknown_stage"].includes(rejection.reason)
      ? "mapping_missing" : "unsupported_shape";
  const externalObjectId = `${input.run.runId}:page:${input.checkpointGeneration}:row:${rejection.rowIndex ?? "envelope"}`;
  const evidence = await input.evidence.record({
    ingestionRunId: input.run.runId, bindingId: input.run.bindingId,
    externalObjectKind: "adapter_rejection", externalObjectId,
    receivedAt: input.receivedAt, sanitizationVersion: 1, sanitizedPayload: details,
    snapshot: {
      contractVersion: "adapter-rejection-v1", adapterKey: input.run.adapterKey,
      adapterConfigVersion: input.run.adapterConfigVersion,
      normalizationPolicyVersion: IDENTITY_NORMALIZATION_VERSION,
      completeness: "partial", normalizedEntity: details,
      semanticHash: createHash("sha256").update(canonicalJson(details)).digest("hex"),
    },
  });
  // A changed snapshot must not open quarantine against old evidence as if new.
  if (evidence.outcome === "revision_conflict") throw new Error("Adapter rejection evidence conflict");
  const opened = await input.quarantine.open({
    observationId: evidence.observationId, ingestionRunId: input.run.runId,
    bindingId: input.run.bindingId, issueCode, severity: "blocking",
    candidateIds: [], details,
  });
  return { observationId: evidence.observationId, quarantineId: opened.record.id,
    issueCode, status: opened.record.status, scope: "entire_batch",
    witness: details.witness };
}
