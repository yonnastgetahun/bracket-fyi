import { z } from "zod";

import { isoDateTimeSchema } from "@/lib/ingestion/contracts";
import type { DueBindingInput, PollPhase } from "@/lib/ingestion/orchestrator/types";

export type PollingPolicyInput = Omit<DueBindingInput, "nextPollAt"> & {
  nextPollAt?: string | null;
  staleAfterSeconds?: number;
};

type PollingIntervalKey = "idleSeconds" | "pregameSeconds" | "liveSeconds" | "postgameSeconds";

const phaseIntervals: Readonly<Record<Exclude<PollPhase, "complete">, PollingIntervalKey>> = {
  distant: "idleSeconds",
  pregame: "pregameSeconds",
  live: "liveSeconds",
  postgame: "postgameSeconds",
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const pollingPolicySchema = z.object({
  mode: z.enum(["disabled", "shadow", "write"]),
  nextPollAt: isoDateTimeSchema.nullable().optional(),
  phase: z.enum(["distant", "pregame", "live", "postgame", "complete"]),
  idleSeconds: z.number().int().nonnegative().safe(),
  pregameSeconds: z.number().int().nonnegative().safe(),
  liveSeconds: z.number().int().nonnegative().safe(),
  postgameSeconds: z.number().int().nonnegative().safe(),
  staleAfterSeconds: z.number().int().nonnegative().safe().optional(),
}).strict();

const parseInput = (input: unknown): PollingPolicyInput | null => {
  if (!isPlainObject(input)) return null;
  const parsed = pollingPolicySchema.safeParse(input);
  return parsed.success ? parsed.data : null;
};

const parseNow = (now: unknown): number | null => {
  if (typeof now !== "string" || !isoDateTimeSchema.safeParse(now).success) return null;
  const timestamp = Date.parse(now);
  return Number.isFinite(timestamp) ? timestamp : null;
};

export function isBindingDue(input: PollingPolicyInput, now: string): boolean {
  const parsed = parseInput(input);
  const nowTimestamp = parseNow(now);
  if (parsed === null || nowTimestamp === null) return false;
  if (parsed.mode === "disabled" || parsed.phase === "complete") return false;
  if (parsed.nextPollAt === undefined || parsed.nextPollAt === null) return false;
  return Date.parse(parsed.nextPollAt) <= nowTimestamp;
}

export function nextPollAt(input: PollingPolicyInput, now: string): string | null {
  const parsed = parseInput(input);
  const nowTimestamp = parseNow(now);
  if (parsed === null || nowTimestamp === null || parsed.mode === "disabled" || parsed.phase === "complete") return null;
  const seconds = parsed[phaseIntervals[parsed.phase]];
  return new Date(nowTimestamp + seconds * 1000).toISOString();
}
