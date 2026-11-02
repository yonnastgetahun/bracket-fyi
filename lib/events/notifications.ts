/**
 * Durable fake-only worker. A worker incarnation is fresh per process; permits
 * stay private to one invocation and are never accepted as run() input.
 */
export const notificationKinds = [
  "lock_reminder", "contest_live", "result_final", "score_change", "schedule_change",
  "result_correction", "provider_stale", "league_complete", "broadcast",
] as const;
export type NotificationKind = typeof notificationKinds[number];
export interface NotificationPermit {
  admitted: boolean; attemptId?: string; outboxId?: string;
  startDeadline?: string; reason?: string; dedupId?: string;
}
export interface NotificationStart {
  started: boolean; dedupId?: string; payload?: Record<string, unknown>;
  route?: string; timeoutMs?: number; startBudgetMs?: number;
}
export interface NotificationRepository {
  scan(limit: number): Promise<string[]>;
  admit(outbox: string, incarnation: string): Promise<NotificationPermit>;
  start(attempt: string, incarnation: string): Promise<NotificationStart>;
  finish(attempt: string, incarnation: string, http: number | null, uncertain: boolean): Promise<unknown>;
}
export interface FakeNotificationTransport {
  readonly mode: "fake";
  send(message: NotificationStart, signal: AbortSignal): Promise<number>;
}
export function createFakeNotificationTransport(statuses: number[] = [201]) {
  const calls: NotificationStart[] = [];
  return {
    mode: "fake" as const, calls,
    async send(message: NotificationStart, signal: AbortSignal) {
      if (signal.aborted) throw new Error("aborted");
      calls.push(structuredClone(message));
      return statuses[Math.min(calls.length - 1, statuses.length - 1)] ?? 201;
    },
  };
}
export function createNotificationWorker(
  repository: NotificationRepository,
  transport: FakeNotificationTransport,
) {
  if (transport.mode !== "fake") throw new Error("Real notification transport disabled");
  const incarnation = crypto.randomUUID();
  return {
    async run(limit = 100) {
      const counts = { admitted: 0, sent: 0, skipped: 0, uncertain: 0, failed: 0 };
      for (const outbox of await repository.scan(Math.max(1, Math.min(500, limit)))) {
        const permit = await repository.admit(outbox, incarnation);
        if (!permit.admitted || !permit.attemptId) { counts.skipped++; continue; }
        counts.admitted++;
        // Database immediately rechecks controls, expiry, consent, one-use permit.
        const checkStarted = performance.now();
        const started = await repository.start(permit.attemptId, incarnation);
        if (!started.started) { counts.skipped++; continue; }
        // Subtract the entire RPC round trip conservatively; no synchronized
        // client wall clock is required. A delayed response cannot revive a permit.
        if (started.startBudgetMs === undefined ||
            started.startBudgetMs <= performance.now() - checkStarted) {
          counts.skipped++;
          await repository.finish(permit.attemptId, incarnation, 408, false);
          continue;
        }
        const abort = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let http: number | null = null;
        let uncertain = false;
        try {
          http = await Promise.race([
            transport.send(started, abort.signal),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => { abort.abort(); reject(new Error("transport timeout")); }, 10_000);
            }),
          ]);
          if (http >= 200 && http < 300) counts.sent++; else counts.failed++;
        } catch { uncertain = true; counts.uncertain++; }
        finally { if (timer) clearTimeout(timer); }
        // Lost acknowledgment deliberately propagates. Restart scan recovers the
        // durable attempt as uncertain; it never retries this in-memory permit.
        await repository.finish(permit.attemptId, incarnation, http, uncertain);
      }
      return counts;
    },
  };
}
