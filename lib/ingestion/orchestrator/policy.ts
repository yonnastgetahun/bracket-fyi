import type { DueBindingInput, PollPhase } from "@/lib/ingestion/orchestrator/types";

type PollingIntervalKey = "idleSeconds" | "pregameSeconds" | "liveSeconds" | "postgameSeconds";

const phaseIntervals: Readonly<Record<Exclude<PollPhase, "complete">, PollingIntervalKey>> = {
  distant: "idleSeconds",
  pregame: "pregameSeconds",
  live: "liveSeconds",
  postgame: "postgameSeconds",
};

const parseTimestamp = (value: string, label: string): number => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new RangeError(`${label} must be a valid timestamp`);
  }
  return timestamp;
};

const phaseSeconds = (input: DueBindingInput): number => {
  if (input.phase === "complete") return 0;
  const seconds = input[phaseIntervals[input.phase]];
  if (!Number.isSafeInteger(seconds) || seconds < 0) {
    throw new RangeError("Polling interval must be a nonnegative safe integer");
  }
  return seconds;
};

export function isBindingDue(input: DueBindingInput, now: string): boolean {
  if (input.mode === "disabled" || input.phase === "complete") return false;
  const nowTimestamp = parseTimestamp(now, "now");
  if (input.nextPollAt === undefined) return true;
  return parseTimestamp(input.nextPollAt, "nextPollAt") <= nowTimestamp;
}

export function nextPollAt(input: DueBindingInput, now: string): string | null {
  if (input.mode === "disabled" || input.phase === "complete") return null;
  const nowTimestamp = parseTimestamp(now, "now");
  return new Date(nowTimestamp + phaseSeconds(input) * 1000).toISOString();
}
