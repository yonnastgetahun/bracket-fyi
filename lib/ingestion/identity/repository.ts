import type { JsonObject, MappableProviderEntityKind } from "@/lib/ingestion/contracts";
import type { CanonicalRef } from "@/lib/ingestion/identity/resolve";

export type RefLookup = Readonly<{
  bindingId: string;
  entityKind: MappableProviderEntityKind;
  externalId: string;
}>;

export type ProviderEntityRef = Readonly<{
  id: string;
  bindingId: string;
  providerId: string;
  eventEditionId: string;
  entityKind: MappableProviderEntityKind;
  externalId: string;
  canonicalRef: CanonicalRef;
  confidence?: number;
  reviewedBy?: string;
  reviewedAt?: string;
  metadata: JsonObject;
}>;

export type AutomaticMapping = Readonly<{
  lookup: RefLookup;
  providerId: string;
  eventEditionId: string;
  canonicalId: string;
  confidence: number;
  normalizationVersion: string;
  metadata: JsonObject;
}>;

export type ReviewedMapping = Readonly<{
  lookup: RefLookup;
  providerId: string;
  eventEditionId: string;
  canonicalId: string;
  reviewedBy: string;
  reviewedAt: string;
  metadata: JsonObject;
}>;

export type RejectedMapping = Readonly<{
  lookup: RefLookup;
  providerId: string;
  eventEditionId: string;
  reviewedBy: string;
  reviewedAt: string;
  metadata: JsonObject;
}>;

export type MappingOutcome = Readonly<{
  outcome: "created" | "unchanged" | "conflict" | "quarantined";
  ref: ProviderEntityRef;
}>;

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

type RefRow = {
  outcome?: MappingOutcome["outcome"];
  ref_id: string;
  binding_id: string;
  provider_id: string;
  event_edition_id: string;
  entity_kind: MappableProviderEntityKind;
  external_id: string;
  canonical_id?: string | null;
  resolution_status: "unresolved" | "automatic" | "reviewed" | "rejected";
  confidence?: number | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  metadata: JsonObject;
};

const toCanonicalRef = (row: RefRow): CanonicalRef => {
  if (row.resolution_status === "automatic" || row.resolution_status === "reviewed") {
    if (!row.canonical_id) throw new Error("Resolved provider mapping did not return a canonical ID");
    return { status: row.resolution_status, canonicalId: row.canonical_id };
  }
  return { status: row.resolution_status };
};

const toProviderEntityRef = (row: RefRow): ProviderEntityRef => ({
  id: row.ref_id,
  bindingId: row.binding_id,
  providerId: row.provider_id,
  eventEditionId: row.event_edition_id,
  entityKind: row.entity_kind,
  externalId: row.external_id,
  canonicalRef: toCanonicalRef(row),
  ...(row.confidence === null || row.confidence === undefined ? {} : { confidence: row.confidence }),
  ...(row.reviewed_by ? { reviewedBy: row.reviewed_by } : {}),
  ...(row.reviewed_at ? { reviewedAt: row.reviewed_at } : {}),
  metadata: row.metadata,
});

async function callMapping(client: RpcClient, args: Record<string, unknown>): Promise<MappingOutcome> {
  const { data, error } = await client.rpc("upsert_provider_entity_mapping", args);
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as RefRow | undefined;
  if (!row?.ref_id || !row.outcome) throw new Error("Mapping RPC returned no outcome");
  return { outcome: row.outcome, ref: toProviderEntityRef(row) };
}

export interface IdentityRepository {
  getRef(input: RefLookup): Promise<ProviderEntityRef | null>;
  recordAutomatic(input: AutomaticMapping): Promise<MappingOutcome>;
  recordReviewed(input: ReviewedMapping): Promise<MappingOutcome>;
  recordRejected(input: RejectedMapping): Promise<MappingOutcome>;
}

export function createIdentityRepository(client: RpcClient): IdentityRepository {
  return {
    async getRef(input) {
      const { data, error } = await client.rpc("get_provider_entity_ref", {
        p_binding_id: input.bindingId,
        p_entity_kind: input.entityKind,
        p_external_id: input.externalId,
      });
      if (error) throw new Error(error.message);
      const row = (Array.isArray(data) ? data[0] : data) as RefRow | undefined;
      return row?.ref_id ? toProviderEntityRef(row) : null;
    },
    recordAutomatic(input) {
      return callMapping(client, {
        p_binding_id: input.lookup.bindingId,
        p_entity_kind: input.lookup.entityKind,
        p_external_id: input.lookup.externalId,
        p_canonical_id: input.canonicalId,
        p_resolution_status: "automatic",
        p_confidence: input.confidence,
        p_reviewed_by: null,
        p_reviewed_at: null,
        p_metadata: { ...input.metadata, normalizationPolicyVersion: input.normalizationVersion },
      });
    },
    recordReviewed(input) {
      return callMapping(client, {
        p_binding_id: input.lookup.bindingId,
        p_entity_kind: input.lookup.entityKind,
        p_external_id: input.lookup.externalId,
        p_canonical_id: input.canonicalId,
        p_resolution_status: "reviewed",
        p_confidence: 1,
        p_reviewed_by: input.reviewedBy,
        p_reviewed_at: input.reviewedAt,
        p_metadata: input.metadata,
      });
    },
    recordRejected(input) {
      return callMapping(client, {
        p_binding_id: input.lookup.bindingId,
        p_entity_kind: input.lookup.entityKind,
        p_external_id: input.lookup.externalId,
        p_canonical_id: null,
        p_resolution_status: "rejected",
        p_confidence: null,
        p_reviewed_by: input.reviewedBy,
        p_reviewed_at: input.reviewedAt,
        p_metadata: input.metadata,
      });
    },
  };
}
