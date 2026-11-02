import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { organizerApiCookieName } from "@/lib/auth/organizer-cookie";

const { getAdminClient } = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ getAdminClient }));

import {
  DELETE as removeParticipant,
  PATCH as renameParticipant,
} from "@/app/api/admin/participant/route";

const LEAGUE_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZER_TOKEN = "22222222-2222-4222-8222-222222222222";
const PARTICIPANT_ID = "33333333-3333-4333-8333-333333333333";

let mutationResult: { data: unknown; error: unknown };

function participantRequest(method: "PATCH" | "DELETE") {
  return new NextRequest("http://localhost/api/admin/participant", {
    method,
    headers: {
      "content-type": "application/json",
      cookie: `${organizerApiCookieName(LEAGUE_ID)}=${ORGANIZER_TOKEN}`,
    },
    body: JSON.stringify({
      leagueId: LEAGUE_ID,
      participantId: PARTICIPANT_ID,
      ...(method === "PATCH" ? { displayName: "Renamed Player" } : {}),
    }),
  });
}

function selectChain(result: unknown) {
  const chain = {
    eq: vi.fn(() => chain),
    single: vi.fn(async () => result),
  };
  return { select: vi.fn(() => chain) };
}

function emptyMutation() {
  const chain: Record<string, unknown> & PromiseLike<unknown> = {
    eq: vi.fn(() => chain),
    select: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => mutationResult),
    then: (resolve) => Promise.resolve(mutationResult).then(resolve),
  };
  return chain;
}

describe("/api/admin/participant", () => {
  beforeEach(() => {
    mutationResult = { data: null, error: null };
    getAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "leagues") {
          return selectChain({
            data: {
              id: LEAGUE_ID,
              template_id: null,
              status: "active",
              name: "Test League",
            },
            error: null,
          });
        }

        return {
          update: vi.fn(() => emptyMutation()),
          delete: vi.fn(() => emptyMutation()),
        };
      }),
    });
  });

  it("does not rename a participant outside the organizer's league", async () => {
    const response = await renameParticipant(participantRequest("PATCH"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Participant not found in league",
    });
  });

  it("does not remove a participant outside the organizer's league", async () => {
    const response = await removeParticipant(participantRequest("DELETE"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Participant not found in league",
    });
  });

  it("renames a participant in the organizer's league", async () => {
    mutationResult = { data: { id: PARTICIPANT_ID }, error: null };

    const response = await renameParticipant(participantRequest("PATCH"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("removes a participant in the organizer's league", async () => {
    mutationResult = { data: { id: PARTICIPANT_ID }, error: null };

    const response = await removeParticipant(participantRequest("DELETE"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});
