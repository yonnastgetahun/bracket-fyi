import { describe, expect, it } from "vitest";

import {
  providerBatchSchema,
  type ProviderBatch,
  type ProviderCapability,
} from "@/lib/ingestion/contracts";
import {
  providerPullRequestSchema,
  type ProviderAdapter,
  type PullContext,
} from "@/lib/ingestion/providers/provider-adapter";
import { providerFailureSchema } from "@/lib/ingestion/errors";

const request = providerPullRequestSchema.parse({
  bindingId: "00000000-0000-4000-8000-000000000001",
  providerKey: "synthetic",
  eventEditionId: "00000000-0000-4000-8000-000000000002",
  bindingKey: "synthetic-edition",
  adapterConfigVersion: 1,
  adapterConfig: { fixture: true },
  windowStart: "2026-10-08T17:00:00-07:00",
  windowEnd: "2026-10-08T18:00:00-07:00",
  requestedAt: "2026-10-08T17:01:00-07:00",
  cursor: { page: 1 },
  etag: "synthetic-etag",
});

type SportsSourcePage = {
  readonly teams: readonly [{ id: string; name: string }, { id: string; name: string }];
  readonly match: { id: string; status: "FINISHED"; score: { winner: "HOME_TEAM" } };
};

type CeremonySourcePage = {
  readonly category: { id: string; title: string };
  readonly nominees: readonly { id: string; title: string }[];
  readonly awardedWinner: string;
};

const commonPullContext = (adapterKey: string): PullContext => ({
  ...request,
  providerKey: adapterKey,
  credential: {
    reference: "vault:synthetic/credential",
    getValue: () => "credential-secret-sentinel",
  },
});

class FakeSportsAdapter implements ProviderAdapter {
  readonly key = "synthetic-sports";
  readonly capabilities: ReadonlySet<ProviderCapability> = new Set(["schedule", "final_results"]);
  private readonly sourcePage: SportsSourcePage = {
    teams: [
      { id: "team-a", name: "Synthetic A" },
      { id: "team-b", name: "Synthetic B" },
    ],
    match: { id: "match-1", status: "FINISHED", score: { winner: "HOME_TEAM" } },
  };

  async pull(context: PullContext): Promise<ProviderBatch> {
    void context.credential.getValue;
    const observations = [
      {
        entityKind: "contest" as const,
        externalId: this.sourcePage.match.id,
        observedAt: request.requestedAt,
        completeness: "full" as const,
        sanitizedPayload: { source: "synthetic-sports", status: this.sourcePage.match.status },
        data: {
          eventEditionExternalId: context.eventEditionId,
          stageExternalId: "synthetic-stage",
          contestKey: "match-1",
          name: "Synthetic Match",
          contestKind: "match" as const,
          status: "final" as const,
          requiredForCompletion: true,
          entries: this.sourcePage.teams.map((team, ordinal) => ({
            eventEntryExternalId: team.id,
            role: ordinal === 0 ? "home" : "away",
            ordinal: ordinal + 1,
            metadata: { sourceName: team.name },
          })),
          metadata: {},
        },
      },
      {
        entityKind: "result" as const,
        externalId: "match-result-1",
        observedAt: request.requestedAt,
        completeness: "full" as const,
        sanitizedPayload: { source: "synthetic-sports" },
        data: {
          eventEditionExternalId: context.eventEditionId,
          contestExternalId: this.sourcePage.match.id,
          resultStatus: "final" as const,
          outcomeType: "winner" as const,
          winnerEventEntryExternalId: this.sourcePage.teams[0].id,
          resultData: { winner: this.sourcePage.match.score.winner },
        },
      },
    ];
    return providerBatchSchema.parse({ observations, fetchedCount: 1, receivedAt: request.requestedAt });
  }

  classifyError(error: unknown) {
    void error;
    return {
      code: "invalid_response" as const,
      retry: "never" as const,
      message: "Synthetic sports response was invalid",
      details: { adapter: this.key },
    };
  }
}

class FakeCeremonyAdapter implements ProviderAdapter {
  readonly key = "synthetic-ceremony";
  readonly capabilities: ReadonlySet<ProviderCapability> = new Set(["nominations", "ceremony_results"]);
  private readonly sourcePage: CeremonySourcePage = {
    category: { id: "category-1", title: "Best Synthetic Picture" },
    nominees: [
      { id: "film-a", title: "Synthetic Film A" },
      { id: "film-b", title: "Synthetic Film B" },
    ],
    awardedWinner: "film-a",
  };

  async pull(context: PullContext): Promise<ProviderBatch> {
    const contest = {
      entityKind: "contest" as const,
      externalId: this.sourcePage.category.id,
      observedAt: request.requestedAt,
      completeness: "full" as const,
      sanitizedPayload: { source: "synthetic-ceremony" },
      data: {
        eventEditionExternalId: context.eventEditionId,
        stageExternalId: "ceremony-stage",
        contestKey: "category-1",
        name: this.sourcePage.category.title,
        contestKind: "category" as const,
        status: "final" as const,
        requiredForCompletion: true,
        entries: this.sourcePage.nominees.map((nominee, ordinal) => ({
          eventEntryExternalId: nominee.id,
          role: "nominee",
          ordinal: ordinal + 1,
          metadata: { title: nominee.title },
        })),
        metadata: {},
      },
    };
    const result = {
      entityKind: "result" as const,
      externalId: "category-result-1",
      observedAt: request.requestedAt,
      completeness: "full" as const,
      sanitizedPayload: { source: "synthetic-ceremony" },
      data: {
        eventEditionExternalId: context.eventEditionId,
        contestExternalId: this.sourcePage.category.id,
        resultStatus: "awarded" as const,
        outcomeType: "winner" as const,
        winnerEventEntryExternalId: this.sourcePage.awardedWinner,
        resultData: { awarded: true },
      },
    };
    return providerBatchSchema.parse({ observations: [contest, result], fetchedCount: 1, receivedAt: request.requestedAt });
  }

  classifyError(error: unknown) {
    void error;
    return {
      code: "unsupported_shape" as const,
      retry: "never" as const,
      message: "Synthetic ceremony response shape was unsupported",
      details: { adapter: this.key },
    };
  }
}

async function exerciseAdapter(adapter: ProviderAdapter): Promise<ProviderBatch> {
  const batch = await adapter.pull(commonPullContext(adapter.key));
  return providerBatchSchema.parse(batch);
}

describe("provider adapter seam", () => {
  it("validates pull requests and keeps credentials outside serialization", () => {
    expect(JSON.stringify(request)).not.toContain("credential-secret-sentinel");
    expect(() => providerPullRequestSchema.parse({ ...request, bindingId: "not-a-uuid" })).toThrow();
    expect(() => providerPullRequestSchema.parse({
      ...request,
      windowStart: "2026-10-08T18:00:00-07:00",
      windowEnd: "2026-10-08T17:00:00-07:00",
    })).toThrow();
  });

  it("consumes sports and ceremony adapters through one public interface", async () => {
    const adapters: ProviderAdapter[] = [new FakeSportsAdapter(), new FakeCeremonyAdapter()];
    const batches = await Promise.all(adapters.map(exerciseAdapter));
    expect(batches).toHaveLength(2);
    expect(batches.every((batch) => batch.observations.length === 2)).toBe(true);
    expect(batches.flatMap((batch) => batch.observations).some((observation) => observation.entityKind === "result")).toBe(true);
  });

  it("classifies synthetic errors into sanitized schema-valid failures", () => {
    const sentinel = "credential-secret-sentinel";
    for (const adapter of [new FakeSportsAdapter(), new FakeCeremonyAdapter()] satisfies ProviderAdapter[]) {
      const failure = adapter.classifyError({ authorization: sentinel, payload: sentinel });
      expect(JSON.stringify(failure)).not.toContain(sentinel);
      expect(providerFailureSchema.parse(failure).details).toBeTruthy();
    }
  });
});
