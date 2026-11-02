import { describe, expect, it } from "vitest";

import {
  resolveIdentity,
  resolveResultIdentities,
  type IdentityCandidate,
  type IdentityResolutionInput,
} from "@/lib/ingestion/identity/resolve";

const candidate = (
  canonicalId: string,
  source: IdentityCandidate["source"],
): IdentityCandidate => ({ canonicalId, source, explanation: `${source}:${canonicalId}` });

const baseInput = (overrides: Partial<IdentityResolutionInput> = {}): IdentityResolutionInput => ({
  bindingId: "binding-1",
  eventEditionId: "edition-1",
  entityKind: "competitor",
  externalId: "provider-team-1",
  aliasCandidates: [],
  fuzzyCandidates: [],
  ...overrides,
});

describe("provider-neutral identity resolution", () => {
  it("keeps a reviewed mapping authoritative", () => {
    expect(resolveIdentity(baseInput({
      canonicalRef: { status: "reviewed", canonicalId: "canonical-1" },
      aliasCandidates: [candidate("canonical-2", "exact_alias")],
    }))).toMatchObject({ status: "reviewed", canonicalId: "canonical-1" });
  });

  it("fails closed when an existing automatic mapping lacks deterministic provenance", () => {
    expect(resolveIdentity(baseInput({
      canonicalRef: { status: "automatic", canonicalId: "canonical-1" },
    }))).toMatchObject({ status: "unresolved", quarantineCode: "mapping_ambiguous" });
  });

  it("rejects caller-asserted bootstrap provenance until a trusted bootstrap exists", () => {
    expect(resolveIdentity(baseInput({
      canonicalRef: {
        status: "automatic",
        canonicalId: "canonical-1",
        provenance: { kind: "deterministic_bootstrap", policyVersion: "bootstrap-v1" },
      },
    }))).toMatchObject({ status: "unresolved", quarantineCode: "mapping_ambiguous" });
  });

  it("keeps even a sole exact alias candidate advisory", () => {
    expect(resolveIdentity(baseInput({
      aliasCandidates: [candidate("canonical-1", "exact_alias")],
    }))).toMatchObject({
      status: "unresolved",
      quarantineCode: "mapping_ambiguous",
      candidates: [{ canonicalId: "canonical-1", source: "exact_alias" }],
    });
  });

  it("quarantines missing, ambiguous, and fuzzy-only identity", () => {
    expect(resolveIdentity(baseInput())).toMatchObject({ status: "unresolved", quarantineCode: "mapping_missing" });
    expect(resolveIdentity(baseInput({
      aliasCandidates: [candidate("canonical-1", "exact_alias"), candidate("canonical-2", "exact_alias")],
    }))).toMatchObject({ status: "unresolved", quarantineCode: "mapping_ambiguous" });
    expect(resolveIdentity(baseInput({
      fuzzyCandidates: [candidate("canonical-1", "fuzzy_advisory")],
    }))).toMatchObject({ status: "unresolved", quarantineCode: "mapping_ambiguous" });
  });

  it("keeps rejected and conflicting reviewed mappings out of automatic resolution", () => {
    expect(resolveIdentity(baseInput({
      canonicalRef: { status: "rejected" },
      aliasCandidates: [candidate("canonical-1", "exact_alias")],
    })).status).toBe("rejected");
    expect(resolveIdentity(baseInput({
      canonicalRef: { status: "reviewed", canonicalId: "canonical-1" },
      aliasCandidates: [candidate("canonical-2", "exact_alias")],
    })).canonicalId).toBe("canonical-1");
  });

  it("resolves result identity only through contest and winner-entry mappings", () => {
    expect(resolveResultIdentities({
      contest: baseInput({ entityKind: "contest", canonicalRef: { status: "reviewed", canonicalId: "contest-1" } }),
      winnerEntry: baseInput({ entityKind: "event_entry", canonicalRef: {
        status: "automatic",
        canonicalId: "entry-1",
        provenance: { kind: "deterministic_bootstrap", policyVersion: "bootstrap-v1" },
      } }),
    })).toMatchObject({ status: "quarantined" });
    expect(resolveResultIdentities({
      contest: baseInput({ entityKind: "contest", canonicalRef: { status: "reviewed", canonicalId: "contest-1" } }),
      winnerEntry: baseInput({ entityKind: "event_entry", canonicalRef: { status: "reviewed", canonicalId: "entry-1" } }),
    })).toMatchObject({ status: "resolved", contestId: "contest-1", winnerEntryId: "entry-1" });
    expect(resolveResultIdentities({
      contest: baseInput({ entityKind: "contest", canonicalRef: { status: "reviewed", canonicalId: "contest-1" } }),
    })).toMatchObject({ status: "resolved", contestId: "contest-1" });
  });
});
