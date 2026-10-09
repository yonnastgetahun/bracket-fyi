import { createHash } from "node:crypto";

import type {
  JsonObject,
  MappableProviderEntityKind,
  NormalizedResult,
} from "@/lib/ingestion/contracts";
import { canonicalJson } from "@/lib/ingestion/idempotency/canonical-json";

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
const key = (scope: string, value: JsonObject): string => `v1:${scope}:${sha256(canonicalJson(value))}`;

export type ObservationKeyInput = Readonly<{
  bindingId: string;
  entityKind: MappableProviderEntityKind | "result";
  externalId: string;
  providerRevision?: string;
  sanitizedPayload: JsonObject;
}>;

export function observationIdempotencyKey(input: ObservationKeyInput): string {
  return key("observation", {
    bindingId: input.bindingId,
    entityKind: input.entityKind,
    externalId: input.externalId,
    providerRevision: input.providerRevision ?? null,
    sanitizedPayload: input.sanitizedPayload,
  });
}

export type ResultKeyInput = Readonly<{
  contestId: string;
  resultStatus: NormalizedResult["resultStatus"];
  outcomeType: NormalizedResult["outcomeType"];
  winnerEventEntryId?: string;
  score?: JsonObject;
  resultData: JsonObject;
  providerEffectiveAt?: string;
  correctionReason?: string;
  orderingPolicyVersion: string;
}>;

export function resultIdempotencyKey(input: ResultKeyInput): string {
  return key("result", {
    contestId: input.contestId,
    resultStatus: input.resultStatus,
    outcomeType: input.outcomeType,
    winnerEventEntryId: input.winnerEventEntryId ?? null,
    score: input.score ?? null,
    resultData: input.resultData,
    providerEffectiveAt: input.providerEffectiveAt ?? null,
    correctionReason: input.correctionReason ?? null,
    orderingPolicyVersion: input.orderingPolicyVersion,
  });
}

export function auditIdempotencyKey(resultKey: string, eventType: string): string {
  return key("audit", { resultKey, eventType });
}

export function outboxIdempotencyKey(resultKey: string, intentType: string, audience: string): string {
  return key("outbox", { resultKey, intentType, audience });
}
