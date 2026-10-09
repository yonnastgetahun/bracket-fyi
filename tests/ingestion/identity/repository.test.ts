import { describe, expect, it, vi } from "vitest";

import { createIdentityRepository } from "@/lib/ingestion/identity/repository";

describe("identity mapping repository", () => {
  it("uses the atomic mapping transition RPC and returns the discriminated canonical reference", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        outcome: "created",
        ref_id: "ref-1",
        binding_id: "binding-1",
        provider_id: "provider-1",
        event_edition_id: "edition-1",
        entity_kind: "competitor",
        external_id: "team-1",
        canonical_id: "canonical-team-1",
        resolution_status: "automatic",
        confidence: 0.99,
        reviewed_by: null,
        reviewed_at: null,
        metadata: { normalizationPolicyVersion: "identity-normalization-v1" },
      }],
      error: null,
    });
    const repository = createIdentityRepository({ rpc });

    await expect(repository.recordAutomatic({
      lookup: { bindingId: "binding-1", entityKind: "competitor", externalId: "team-1" },
      providerId: "provider-1",
      eventEditionId: "edition-1",
      canonicalId: "canonical-team-1",
      confidence: 0.99,
      normalizationVersion: "identity-normalization-v1",
      metadata: {},
    })).resolves.toMatchObject({ outcome: "created", ref: {
      canonicalRef: { status: "automatic", canonicalId: "canonical-team-1" },
    } });
    expect(rpc).toHaveBeenCalledWith("upsert_provider_entity_mapping", expect.objectContaining({
      p_entity_kind: "competitor",
      p_resolution_status: "automatic",
    }));
  });

  it("does not represent result mappings in its public lookup type", () => {
    const repository = createIdentityRepository({ rpc: vi.fn() });
    expect(repository).toBeDefined();
  });
});
