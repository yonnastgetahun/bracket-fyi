import {
  providerEntityKinds,
  type MappableProviderEntityKind,
} from "@/lib/ingestion/contracts";

export type IdentityResolutionStatus = "reviewed" | "automatic" | "unresolved" | "rejected";

export type IdentityCandidate = Readonly<{
  canonicalId: string;
  source: "reviewed" | "automatic" | "exact_alias" | "fuzzy_advisory";
  score?: number;
  explanation: string;
}>;

export type CanonicalRef =
  | Readonly<{ status: "automatic"; canonicalId: string; provenance?: Readonly<{ kind: "deterministic_bootstrap"; policyVersion: string }> }>
  | Readonly<{ status: "reviewed"; canonicalId: string }>
  | Readonly<{ status: "rejected" | "unresolved" }>;

export type IdentityResolutionInput = Readonly<{
  bindingId: string;
  eventEditionId: string;
  entityKind: MappableProviderEntityKind;
  externalId: string;
  canonicalRef?: CanonicalRef;
  normalizedName?: string;
  aliasCandidates: readonly IdentityCandidate[];
  fuzzyCandidates: readonly IdentityCandidate[];
}>;

export type IdentityDecision = Readonly<{
  status: IdentityResolutionStatus;
  canonicalId?: string;
  candidates: readonly IdentityCandidate[];
  quarantineCode?: "mapping_missing" | "mapping_ambiguous";
  reason: string;
}>;

const uniqueCandidates = (candidates: readonly IdentityCandidate[]): IdentityCandidate[] => {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.canonicalId)) return false;
    seen.add(candidate.canonicalId);
    return true;
  });
};

const isMappableKind = (value: string): value is MappableProviderEntityKind =>
  providerEntityKinds.includes(value as (typeof providerEntityKinds)[number]) && value !== "result";

export function resolveIdentity(input: IdentityResolutionInput): IdentityDecision {
  if (!isMappableKind(input.entityKind)) {
    return {
      status: "unresolved",
      candidates: [],
      quarantineCode: "mapping_ambiguous",
      reason: "Human league participants and result identities are not mappable provider entities",
    };
  }

  const exactCandidates = uniqueCandidates(input.aliasCandidates);
  const fuzzyCandidates = uniqueCandidates(input.fuzzyCandidates);

  if (input.canonicalRef?.status === "reviewed") {
    return {
      status: "reviewed",
      canonicalId: input.canonicalRef.canonicalId,
      candidates: [{
        canonicalId: input.canonicalRef.canonicalId,
        source: "reviewed",
        explanation: "Reviewed provider mapping is authoritative",
      }],
      reason: "Reviewed provider mapping is authoritative",
    };
  }

  if (input.canonicalRef?.status === "rejected") {
    return {
      status: "rejected",
      candidates: [],
      reason: "Provider mapping was rejected and requires a new reviewed decision",
    };
  }

  if (input.canonicalRef?.status === "automatic") {
    // No trusted bootstrap verifier exists yet. Keep legacy proposals fail-closed.
    return {
      status: "unresolved",
      candidates: uniqueCandidates([...exactCandidates, ...fuzzyCandidates]),
      quarantineCode: "mapping_ambiguous",
      reason: "Automatic provider mappings require review; caller provenance is not authoritative",
    };
  }

  if (exactCandidates.length > 0 || fuzzyCandidates.length > 0) {
    return {
      status: "unresolved",
      candidates: [...exactCandidates, ...fuzzyCandidates],
      quarantineCode: "mapping_ambiguous",
      reason: "Exact and fuzzy name candidates are advisory and require review",
    };
  }

  return {
    status: "unresolved",
    candidates: [],
    quarantineCode: "mapping_missing",
    reason: "No reviewed mapping or normalized alias candidate exists",
  };
}

export type ResultIdentityResolutionInput = Readonly<{
  contest: IdentityResolutionInput;
  winnerEntry?: IdentityResolutionInput;
}>;

export type ResultIdentityDecision = Readonly<{
  status: "resolved" | "quarantined";
  contestId?: string;
  winnerEntryId?: string;
  reason: string;
}>;

export function resolveResultIdentities(input: ResultIdentityResolutionInput): ResultIdentityDecision {
  const contest = resolveIdentity(input.contest);
  if (contest.status !== "reviewed" && contest.status !== "automatic") {
    return { status: "quarantined", reason: "Result contest identity is not resolved" };
  }

  if (!input.winnerEntry) {
    return { status: "resolved", contestId: contest.canonicalId, reason: "Contest identity is resolved" };
  }

  const winnerEntry = resolveIdentity(input.winnerEntry);
  if (winnerEntry.status !== "reviewed" && winnerEntry.status !== "automatic") {
    return { status: "quarantined", reason: "Result winner-entry identity is not resolved" };
  }

  return {
    status: "resolved",
    contestId: contest.canonicalId,
    winnerEntryId: winnerEntry.canonicalId,
    reason: "Contest and winner-entry identities are resolved",
  };
}
