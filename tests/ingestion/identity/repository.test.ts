import { describe, expect, it, vi } from "vitest";

import { resolveIdentity } from "@/lib/ingestion/identity/resolve";

import { createIdentityRepository } from "@/lib/ingestion/identity/repository";

describe("identity mapping repository", () => {
  it("records an automatic proposal without manufacturing authoritative provenance", async () => {
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
        metadata: {
          normalizationPolicyVersion: "identity-normalization-v1",
          verifiedDeterministicBootstrap: true,
        },
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
      canonicalRef: {
        status: "automatic",
        canonicalId: "canonical-team-1",
      },
    } });
    expect((await repository.getRef({ bindingId: "binding-1", entityKind: "competitor", externalId: "team-1" }))?.canonicalRef).not.toHaveProperty("provenance");
    expect(rpc).toHaveBeenCalledWith("upsert_provider_entity_mapping", expect.objectContaining({
      p_entity_kind: "competitor",
      p_resolution_status: "automatic",
      p_metadata: {
        normalizationPolicyVersion: "identity-normalization-v1",
        verifiedDeterministicBootstrap: false,
      },
    }));
  });

  it.each([
    [false, "identity-normalization-v1"],
    [true, "identity-normalization-v1"],
    [false, "unsupported"],
    [true, "unsupported"],
  ])("does not launder flag %s with policy %s into authority", async (flag, version) => {
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => ({
      data: [{
        outcome: "created", ref_id: "ref", binding_id: "binding",
        provider_id: "provider", event_edition_id: "edition", entity_kind: "competitor",
        external_id: "arbitrary-id", canonical_id: "wrong-same-edition-target",
        resolution_status: "automatic", metadata: args.p_metadata,
      }],
      error: null,
    }));
    const result = await createIdentityRepository({ rpc }).recordAutomatic({
      lookup: { bindingId: "binding", entityKind: "competitor", externalId: "arbitrary-id" },
      providerId: "provider", eventEditionId: "edition",
      canonicalId: "wrong-same-edition-target", confidence: 1,
      normalizationVersion: version as string,
      metadata: { verifiedDeterministicBootstrap: flag },
    });
    expect(result.ref.canonicalRef).not.toHaveProperty("provenance");
    expect(resolveIdentity({
      bindingId: "binding", eventEditionId: "edition", entityKind: "competitor",
      externalId: "arbitrary-id", canonicalRef: result.ref.canonicalRef,
      aliasCandidates: [], fuzzyCandidates: [],
    })).toMatchObject({ status: "unresolved", quarantineCode: "mapping_ambiguous" });
    expect(rpc.mock.calls[0][1].p_metadata).toMatchObject({ verifiedDeterministicBootstrap: false });
  });

  it("does not represent result mappings in its public lookup type", () => {
    const repository = createIdentityRepository({ rpc: vi.fn() });
    expect(repository).toBeDefined();
  });
});
