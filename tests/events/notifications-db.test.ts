import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createNotificationRepository } from "@/lib/events/notifications-repository";
import { createFakeNotificationTransport, createNotificationWorker } from "@/lib/events/notifications";
const database = process.env.NOTIFICATION_TEST_DATABASE;
const quote = (v: unknown): string => v === null ? "null" :
  "'" + String(Array.isArray(v) ? "{" + v.join(",") + "}" : typeof v === "object" ? JSON.stringify(v) : v).replaceAll("'", "''") + "'";
function sql(statement: string) {
  if (!database || !/^bracket_notifications_[a-f0-9]{12}$/.test(database)) throw new Error("Disposable notification database required");
  return execFileSync("docker", ["exec", "-i", "supabase_db_bracket-fyi", "psql", "-X", "-U", "postgres", "-d", database, "-Atq", "-v", "ON_ERROR_STOP=1"],
    { input: statement, encoding: "utf8", timeout: 30_000, stdio: ["pipe", "pipe", "pipe"] }).trim();
}
describe.runIf(!!database)("real SQL notification repository → fake worker", () => {
  it("exact disabled/success/retry/prune counts; persisted stable dedup, never real transport", async () => {
    const prefix = randomUUID().slice(0, 8), id = (n: number) => prefix + "-0000-4000-8000-" + String(n).padStart(12, "0");
    let fixture = readFileSync(new URL("../../supabase/tests/database/DB33_event_notifications_test.sql", import.meta.url), "utf8");
    fixture = fixture.slice(fixture.indexOf("insert into organizations"), fixture.indexOf("-- FIXTURE_END"));
    fixture = fixture.replaceAll("a3300000", prefix).replaceAll("db33", "notification-" + prefix);
    sql("begin;" + fixture + "commit;");
    const board = [{ id: id(101), earned: 0, maximum: 1, wrong: 0, pending: 1, rank: 1 }];
    const capture = JSON.parse(sql("set role service_role; select capture_event_lifecycle(" + quote(id(11)) + ");"));
    sql("set role service_role; select commit_event_lifecycle(" + [id(11), capture.generation, capture.basisToken, board].map(v =>
      typeof v === "object" ? quote(JSON.stringify(v)) : quote(v)).join(",") + ");");
    const repo = createNotificationRepository({ rpc: async (name, args) => {
      try {
        const call = name + "(" + Object.values(args).map(quote).join(",") + ")";
        const query = name === "scan_event_notifications" ? "select coalesce(jsonb_agg(x),'[]') from " + call + " x" : "select to_jsonb(" + call + ")";
        return { data: JSON.parse(sql("set role service_role;" + query + ";")), error: null };
      } catch { return { data: null, error: { code: "DB_REJECTED" } }; }
    } });
    await repo.consent(id(11), id(201), id(101), "fake://integration-" + prefix, ["broadcast"], true);
    const emit = (key: string) => repo.emit(id(11), "broadcast", prefix + key, capture.basisToken, null, id(21));
    await emit("first");
    await repo.control(true, false);
    const transport = createFakeNotificationTransport();
    // Shared test DB contains no outstanding fixture notices: DB33 rolls back.
    expect((await createNotificationWorker(repo, transport).run()).sent).toBe(0);
    expect(transport.calls).toHaveLength(0);
    await repo.control(false, true);
    expect((await createNotificationWorker(repo, transport).run()).sent).toBe(1);
    expect(transport.calls).toHaveLength(1);
    await emit("first");
    expect((await createNotificationWorker(repo, transport).run()).sent).toBe(0);
    await emit("retry");
    const retry = createFakeNotificationTransport([503, 503, 201]);
    for (let i = 0; i < 3; i++) {
      sql("update notification_outbox set available_at=clock_timestamp() where league_id=" + quote(id(11)) + " and status='pending';");
      await createNotificationWorker(repo, retry).run();
    }
    expect(retry.calls).toHaveLength(3);
    expect(new Set(retry.calls.map(c => c.dedupId)).size).toBe(1);
    expect(sql("select count(*) from notification_attempts a join notification_outbox o on o.id=a.outbox_id where o.league_id=" + quote(id(11)) + ";")).toBe("4");
    await emit("prune");
    const prune = createFakeNotificationTransport([404]);
    expect((await createNotificationWorker(repo, prune).run()).failed).toBe(1);
    expect(prune.calls).toHaveLength(1);
    expect(await emit("after-prune")).toBe(0);
    expect(sql("select enabled from event_notification_subscriptions where league_id=" + quote(id(11)) + ";")).toBe("f");
  }, 30_000);
});
