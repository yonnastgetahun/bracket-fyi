export interface PredictionWindow {
  id: string;
  state: "unopened" | "open" | "locked";
  cutoff: string | null;
  version: number;
  marketIds: readonly string[];
  pairingsReviewed: boolean;
}
const instant = (value: string) => {
  // Require an explicit UTC/offset instant; server-local dates cannot set locks.
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("Invalid UTC instant");
  return Date.parse(value);
};
export function evaluateWindow(window: PredictionWindow, now: string, frozen: boolean): PredictionWindow["state"] | "frozen" {
  const time = instant(now);
  if (window.state === "locked") return "locked";
  if (window.cutoff && time >= instant(window.cutoff)) return "locked";
  if (!window.cutoff || !window.pairingsReviewed || window.state === "unopened") return "unopened";
  return frozen ? "frozen" : "open";
}
export function canJoin(windows: readonly PredictionWindow[], now: string): boolean {
  return windows.length > 0 && windows.every(window => evaluateWindow(window,now,false) !== "locked");
}
export function tightenCutoff(window: PredictionWindow, verifiedKickoff: string): PredictionWindow {
  const proposed = instant(verifiedKickoff);
  if (window.state === "locked" || (window.cutoff && proposed >= instant(window.cutoff))) return window;
  return {...window,cutoff:verifiedKickoff,version:window.version+1};
}
export interface WindowSubmission { windowId: string; version: number; picks: Readonly<Record<string,string>> }
export function validateWindowSubmission(
  window: PredictionWindow, submission: WindowSubmission, now: string, frozen: boolean,
  eligibleChoices: Readonly<Record<string,readonly string[]>>,
): void {
  if (evaluateWindow(window,now,frozen) !== "open" || submission.windowId !== window.id || submission.version !== window.version) throw new Error("Window unavailable or stale");
  const keys = Object.keys(submission.picks);
  if (keys.length !== window.marketIds.length || new Set(window.marketIds).size !== window.marketIds.length ||
      keys.some(key=>!window.marketIds.includes(key)) ||
      window.marketIds.some(key=>!eligibleChoices[key]?.includes(submission.picks[key]))) throw new Error("Complete eligible window picks required");
}
export function publicWindowPicks(windows: readonly PredictionWindow[], picks: Readonly<Record<string,string>>, now: string): Record<string,string> {
  const revealed: Record<string,string> = {};
  for (const window of windows) if (evaluateWindow(window,now,false) === "locked") {
    for (const marketId of window.marketIds) if (Object.hasOwn(picks,marketId)) revealed[marketId] = picks[marketId];
  }
  return revealed;
}
export function cutoffLabel(window: PredictionWindow, timeZone: string, locale = "en-US"): string {
  if (!window.cutoff) return "Schedule awaiting review";
  instant(window.cutoff);
  return new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"long",timeZone}).format(new Date(window.cutoff));
}
