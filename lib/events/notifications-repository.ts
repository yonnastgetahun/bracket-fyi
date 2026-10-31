import type { NotificationKind, NotificationPermit, NotificationRepository, NotificationStart } from "./notifications";
interface RpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}
/** Server-only service client. Never expose admission/control endpoints to browsers. */
export function createNotificationRepository(client: RpcClient): NotificationRepository & {
  consent(league: string, actor: string, participant: string | null, endpoint: string, kinds: NotificationKind[], enabled: boolean): Promise<string>;
  emit(league: string, kind: NotificationKind, key: string, basis: string, expiry: string | null, organizer?: string, message?: string): Promise<number>;
  control(stop: boolean, enabled: boolean): Promise<{ stopped: boolean; outstanding: unknown[]; drained: boolean }>;
} {
  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const result = await client.rpc(name, args);
    if (result.error) throw new Error("Notification operation failed");
    return result.data as T;
  }
  return {
    scan: limit => rpc<string[]>("scan_event_notifications", { p_limit: limit }),
    admit: (outbox, worker) => rpc<NotificationPermit>("admit_event_notification", { p_outbox: outbox, p_worker: worker }),
    start: (attempt, worker) => rpc<NotificationStart>("start_event_notification", { p_attempt: attempt, p_worker: worker }),
    finish: (attempt, worker, http, uncertain) => rpc("finish_event_notification", {
      p_attempt: attempt, p_worker: worker, p_http: http, p_uncertain: uncertain,
    }),
    consent: (league, actor, participant, endpoint, kinds, enabled) => rpc<string>("set_event_notification_consent", {
      p_league: league, p_actor: actor, p_participant: participant, p_endpoint: endpoint, p_kinds: kinds, p_enabled: enabled,
    }),
    emit: (league, kind, key, basis, expiry, organizer, message) => rpc<number>("emit_event_notification", {
      p_league: league, p_kind: kind, p_key: key, p_basis: basis, p_expiry: expiry, p_organizer: organizer ?? null, p_message: message ?? null,
    }),
    control: (stop, enabled) => rpc("set_event_notification_control", { p_stop: stop, p_enabled: enabled }),
  };
}
