/// <reference lib="deno.ns" />
// notify — sends Web Push notifications to all participants in a league.
// Invoked by the broadcast endpoint (app/api/admin/broadcast/route.ts) after
// an organizer writes an announcement. Fire-and-forget; push is best-effort.
import { createClient } from "npm:@supabase/supabase-js@2"
import * as webpush from "jsr:@negrel/webpush@0.5.0"

interface NotifyPayload {
  leagueId: string
  title: string
  body: string
  url?: string
}

interface PushSubscriptionShape {
  endpoint: string
  expirationTime?: number | null
  keys: {
    p256dh: string
    auth: string
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 })
  }

  // Auth: require service-role key in Authorization header
  const auth = req.headers.get("Authorization")
  if (auth !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  )

  const payload = await req.json() as NotifyPayload
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:organizer@bracket.fyi"

  // Load VAPID keys: env var first (avoids Vault round-trip), Vault fallback
  let vapidJwks: unknown = null
  const envJwk = Deno.env.get("VAPID_KEYS_JWK")
  if (envJwk) {
    try {
      vapidJwks = JSON.parse(envJwk)
    } catch {
      vapidJwks = null
    }
  }
  if (!vapidJwks) {
    const { data, error } = await supabase.rpc("get_vapid_keys")
    if (error || !data) {
      console.error("VAPID load failed:", error?.message ?? "vault empty")
      return new Response(
        JSON.stringify({ error: "VAPID not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }
    try {
      vapidJwks = JSON.parse(data as string)
    } catch {
      return new Response(
        JSON.stringify({ error: "VAPID keys malformed" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }
  }

  // Fan-out: all participants in this league with a push subscription
  const { data: subs, error: subsErr } = await supabase
    .from("participants")
    .select("id, push_subscription")
    .eq("league_id", payload.leagueId)
    .not("push_subscription", "is", null)

  const report = { sent: 0, pruned: 0, errors: [] as string[] }

  if (subsErr) {
    report.errors.push(`participants query: ${subsErr.message}`)
    return new Response(JSON.stringify(report), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (!subs || subs.length === 0) {
    return new Response(
      JSON.stringify({ ...report, reason: "no subscribers" }),
      { headers: { "Content-Type": "application/json" } }
    )
  }

  const vapidKeys = await webpush.importVapidKeys(
    vapidJwks as Parameters<typeof webpush.importVapidKeys>[0],
    { extractable: false }
  )
  const appServer = await webpush.ApplicationServer.new({
    contactInformation: subject,
    vapidKeys,
  })

  await Promise.allSettled(subs.map(async (s) => {
    const sub = s.push_subscription as PushSubscriptionShape
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      // Malformed subscription — clear it
      await supabase.from("participants").update({ push_subscription: null }).eq("id", s.id)
      report.pruned++
      return
    }

    try {
      const subscriber = appServer.subscribe({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      })
      await subscriber.pushTextMessage(
        JSON.stringify({
          title: payload.title,
          body: payload.body,
          url: payload.url ?? `/l/${payload.leagueId}`,
        }),
        { ttl: 3600 }
      )
      report.sent++
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404 || status === 410) {
        // Stale subscription — clear it
        await supabase.from("participants").update({ push_subscription: null }).eq("id", s.id)
        report.pruned++
      } else {
        report.errors.push(`participant ${s.id}: ${String(err).slice(0, 120)}`)
      }
    }
  }))

  return new Response(JSON.stringify(report), {
    headers: { "Content-Type": "application/json" },
  })
})
