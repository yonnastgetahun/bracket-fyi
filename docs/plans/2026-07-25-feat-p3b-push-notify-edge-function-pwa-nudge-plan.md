---
title: "feat: P3-B Push notify Edge Function + PushBell + iOS PWA install nudge"
type: feat
date: 2026-07-25
deepened: 2026-07-25
---

# P3-B: Push Notify Edge Function + PushBell + iOS PWA Install Nudge

## Enhancement Summary

**Deepened on:** 2026-07-25
**Agents applied:** security-sentinel, kieran-typescript-reviewer, architecture-strategist, julik-frontend-races-reviewer, code-simplicity-reviewer, performance-oracle, data-integrity-guardian, deployment-verification-agent, nextjs-skill

### Key Improvements Discovered

1. **Security:** The `magicToken` is sent in the request body to `/api/participant/subscribe` — this is safe since it's a server-to-server-style endpoint over HTTPS, but the UUID format should be validated server-side before the DB lookup (prevents log pollution from garbage inputs)
2. **Race condition:** `PushBell`'s `enable()` function has a subscribe+PATCH sequence that isn't guarded by a loading state — rapid double-taps can queue two subscriptions. Add a `submitting` boolean guard.
3. **Edge Function type safety:** `(err as any).statusCode` should be `(err as { response?: { status?: number } })?.response?.status` — the WC2026 pattern already does this correctly but the scaffold draft switched to `statusCode`. Must use `response.status`.
4. **Architecture:** `LeagueHeader` must stay a Server Component — PushBell as a `"use client"` leaf is correct. Do not add `"use client"` to LeagueHeader itself.
5. **Performance:** Edge Function builds a new `ApplicationServer` per request (unavoidable in stateless Deno), but VAPID key import is the expensive crypto op — the env-var path (`VAPID_KEYS_JWK`) is strongly preferred over the Vault RPC to avoid an extra round trip on every push invocation.
6. **Simplicity:** `InstallPrompt` is already minimal. The `useEffect` dependency on `dismissKey` is stable (string), so no issues there.
7. **iOS detection note:** `navigator.standalone` is a non-standard WebKit property — the TypeScript cast to `unknown as { standalone?: boolean }` is the correct approach and matches WC2026.

### New Considerations Discovered

- The `subscribe` endpoint middleware.ts does NOT run for `/api/*` routes — confirmed in middleware config (`matcher: ["/l/:path*"]`). The endpoint must do its own magic_token validation — the plan correctly handles this.
- UUID validation before DB lookup should use a regex check to avoid unnecessary DB queries on malformed input (the middleware already does this for `/l/` routes — port that pattern).
- When `message` is `null` (clearing the announcement), there's no reason to fan-out push — the plan's `if (message && league)` guard is correct and complete.
- `InstallPrompt` renders `null` before the `useEffect` fires (server render + hydration). This avoids layout shift (CLS) — intentional and correct.

---

## Overview

Port the WC2026 notify Supabase Edge Function to bracket-fyi's data model, wire it into the broadcast endpoint, build a PushBell client component for per-participant subscription management, and add an iOS-specific PWA install nudge banner on league pages.

Push is best-effort and non-blocking throughout. VAPID keys are not yet generated — this plan documents the manual setup steps and ships the code that depends on them.

---

## Key Findings from WC2026 Reference

### Edge Function pattern (`jsr:@negrel/webpush@0.5.0`)

The WC2026 notify function uses:
- `Deno.serve()` (not `serve()` from std) — the modern Deno 2 entrypoint
- `jsr:@negrel/webpush@0.5.0` (JSR registry, **not** esm.sh) — this is the correct import
- `webpush.importVapidKeys(jwksObject, { extractable: false })` to hydrate keys
- `ApplicationServer.new({ contactInformation, vapidKeys })` to build the app server
- `appServer.subscribe({ endpoint, keys: { p256dh, auth } })` to get a subscriber
- `subscriber.pushTextMessage(JSON.stringify({...}), { ttl: 3600 })` to send
- Stale subscription pruning via `err.response?.status === 404 || 410`

VAPID keys are loaded from env var `VAPID_KEYS_JWK` (JSON string of JWK set) with Vault RPC `get_vapid_keys()` as fallback.

### bracket-fyi data model differences

| WC2026 | bracket-fyi |
|--------|-------------|
| `push_subscriptions` table (endpoint, p256dh, auth, participant_id) | `participants.push_subscription` jsonb (full PushSubscription JSON) |
| dedup via `push_events` table | skip dedup (no push_events table yet) |
| fan-out to all subs across app | fan-out to participants in one league |

The bracket-fyi subscription shape stored in `participants.push_subscription` is the standard `PushSubscription.toJSON()` format: `{ endpoint, expirationTime, keys: { p256dh, auth } }`.

### Magic token auth pattern

`middleware.ts` stores participant identity in the `bfyi_participant` cookie as `{leagueId}:{magicToken}`. The layout server component already extracts `magicToken` from this cookie. The subscribe endpoint needs to validate `magicToken` by looking up `participants` where `magic_token = $1 AND league_id = $2`.

---

## What to Build

### 1. VAPID Key Setup (documented, not applied)

**File: `supabase/functions/notify/SETUP.md`**

Document the full manual setup flow for VAPID keys. VAPID keys must exist before deploying the function.

**File: `supabase/migrations/20260725000005_vapid_rpc.sql`**

SQL migration for `get_vapid_keys()` RPC — do NOT apply until keys are generated.

#### Research Insights — VAPID & Vault

**Best Practices:**
- The JWK set must include both public and private keys. `npx web-push generate-vapid-keys --json` outputs a simple base64url key pair, NOT a JWK. You need to convert to JWK format. The WC2026 function uses `webpush.importVapidKeys(jwksObject)` which expects a standard JWK set `{ keys: [{ kty, crv, x, y, d, ... }] }`. Use a tool like `npx web-push generate-vapid-keys` and then manually construct the JWK, or use the `@negrel/webpush` library's own key generation utility if available.
- SETUP.md should include a concrete example of the exact JSON shape stored in Vault, to prevent format mismatches at runtime.
- The `VAPID_SUBJECT` should be a real mailto — Supabase/browser push services will contact this on deliverability issues.

**Security (security-sentinel):**
- VAPID private keys are cryptographic secrets. Storing in Supabase Vault (encrypted at rest) is correct. Do NOT store in plaintext env vars in Supabase dashboard.
- The `get_vapid_keys()` RPC uses `SECURITY DEFINER` — this is intentional and safe because the grant is restricted to `service_role` only. Verify `revoke all from public` is present (it is in the migration).
- The migration grants `execute` to `service_role` only — the Edge Function runs with service_role, so this is correct.

**Data Integrity (data-integrity-guardian):**
- The migration has a `create or replace function` — this is safely idempotent (no data at risk).
- Add a down-migration companion: `drop function if exists get_vapid_keys();` — required if following the existing pattern (WC2026 uses `_down.sql` companions).
- Migration should be named `20260725000005_vapid_rpc.sql` with a companion `20260725000005_vapid_rpc_down.sql`.

```sql
-- supabase/migrations/20260725000005_vapid_rpc.sql
-- DO NOT APPLY until VAPID keys are generated and stored in Vault.
-- See supabase/functions/notify/SETUP.md for generation instructions.

create or replace function get_vapid_keys()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keys text;
begin
  -- Requires vault.secrets to exist and be populated.
  -- Only callable by service role (enforced via RLS + security definer).
  select decrypted_secret
  into v_keys
  from vault.decrypted_secrets
  where name = 'vapid_keys_jwk'
  limit 1;

  if v_keys is null then
    raise exception 'VAPID keys not found in vault';
  end if;

  return v_keys;
end;
$$;

-- Revoke from public, grant to service_role only
revoke all on function get_vapid_keys() from public;
grant execute on function get_vapid_keys() to service_role;
```

---

### 2. Notify Edge Function

**File: `supabase/functions/notify/index.ts`**

New Deno 2 Edge Function. Key design decisions:

- Uses `Deno.serve()` (not std serve)
- Uses `jsr:@negrel/webpush@0.5.0` (matches WC2026)
- Auth: `Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}` header check
- Fan-out scope: single league (all participants with `push_subscription != null`)
- Subscription shape: full PushSubscription JSON stored in `participants.push_subscription`
- Stale sub pruning: on 404/410, set `participants.push_subscription = null`
- No dedup (no push_events table)

#### Research Insights — Edge Function

**Security (security-sentinel):**
- The `Authorization` header check (`auth !== \`Bearer ${SERVICE_ROLE_KEY}\``) is correct. The service role key is 64+ chars — timing-safe string comparison isn't required here (no timing oracle attack is practical given the key length and Supabase Edge infra).
- Do NOT log the full payload or subscription objects — they contain PII (endpoint URLs, subscription keys). The current `report` object logs participant IDs only, which is acceptable.
- Return `405` for non-POST before doing any auth check — avoids unnecessary auth evaluation on probing requests.

**Performance (performance-oracle):**
- The most expensive operation is `webpush.importVapidKeys()` — called once per request, unavoidable in stateless Edge Functions. The `VAPID_KEYS_JWK` env-var path eliminates the Vault RPC round trip (~10-50ms). **Strongly prefer the env-var path in production.**
- `Promise.allSettled()` is correct for fan-out — all pushes run concurrently. For leagues with 100+ participants, this may hit Edge Function CPU time limits. At typical bracket-fyi scale (5-50 participants per league), this is fine.
- The `participants` query selects `id, push_subscription` — correctly minimal. Avoids loading names, picks, etc.

**Type Safety (kieran-typescript-reviewer):**
- `(err as any).statusCode` in the scaffold is WRONG — use `(err as { response?: { status?: number } })?.response?.status` to match WC2026's exact error shape from `@negrel/webpush`.
- `s.push_subscription` from Supabase is typed as `Json` — cast explicitly: `const sub = s.push_subscription as { endpoint: string; expirationTime?: number | null; keys: { p256dh: string; auth: string } }`. Validate `sub.endpoint` and `sub.keys` exist before calling `appServer.subscribe()`.
- Use `/// <reference lib="deno.ns" />` at the top — already in plan, keep it.

**Simplicity (code-simplicity-reviewer):**
- The VAPID load block (env → Vault fallback) is the right pattern — matches WC2026 exactly, minimal.
- The `report` object accumulating `sent`, `pruned`, `errors` is clean and useful for monitoring.
- YAGNI: don't add TTL configuration or retry logic now — the current 3600s TTL and no-retry is correct for announcements.

```typescript
// supabase/functions/notify/index.ts
/// <reference lib="deno.ns" />
import { createClient } from "npm:@supabase/supabase-js@2"
import * as webpush from "jsr:@negrel/webpush@0.5.0"

interface NotifyPayload {
  leagueId: string
  title: string
  body: string
  url?: string
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 })
  }

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

  // Load VAPID keys: env var first (paste-proof), Vault fallback
  let vapidJwks: unknown = null
  const envJwk = Deno.env.get("VAPID_KEYS_JWK")
  if (envJwk) {
    try { vapidJwks = JSON.parse(envJwk) } catch { vapidJwks = null }
  }
  if (!vapidJwks) {
    const { data, error } = await supabase.rpc("get_vapid_keys")
    if (error || !data) {
      return new Response(JSON.stringify({ error: "VAPID not configured" }), { status: 500 })
    }
    vapidJwks = JSON.parse(data as string)
  }

  // Fan-out: all participants in this league with a push subscription
  const { data: subs } = await supabase
    .from("participants")
    .select("id, push_subscription")
    .eq("league_id", payload.leagueId)
    .not("push_subscription", "is", null)

  const report = { sent: 0, pruned: 0, errors: [] as string[] }

  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ ...report, reason: "no subscribers" }))
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
    const sub = s.push_subscription as { endpoint: string; keys: { p256dh: string; auth: string } }
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
```

---

### 3. Broadcast Endpoint — Fire-and-Forget Push Fanout

**File: `app/api/admin/broadcast/route.ts`** (update existing)

After writing `announcement_text`, fire the Edge Function non-blocking. The DB write always wins — push is best-effort.

#### Research Insights — Broadcast Endpoint

**Architecture (architecture-strategist):**
- The broadcast endpoint is a Next.js API route (Node.js runtime) calling a Supabase Edge Function (Deno runtime). Fire-and-forget via `fetch(...).catch(...)` is the correct pattern — no `await`, so the response returns immediately.
- The league name fetch + DB update sequence: the `league` query and the `update` query are two separate round trips. Consider combining into a single `update...returning name` if Supabase supports it — but this is a micro-optimization not worth doing now.
- The `message ?? null` pattern for clearing announcements is correct. Push only fires when `message` is truthy — avoids spamming on clears.

**Security (security-sentinel):**
- `SUPABASE_SERVICE_ROLE_KEY` is a server-only env var (no `NEXT_PUBLIC_` prefix) — correct. It's sent in the Authorization header to the Edge Function, which runs over HTTPS.
- No input sanitization needed on `message` for the push body — it's passed through as a string to the notification payload, which is handled by the OS notification system, not the DOM.
- No CSRF risk: this endpoint is called from AdminConsole which is behind organizer token auth (handled by middleware).

**TypeScript (kieran-typescript-reviewer):**
- Add a type for the league fetch return: `const { data: league } = await supabase.from("leagues").select("id, name").eq("id", leagueId).single()` — include `id` in the select even if unused, or be explicit about the shape.
- The fire-and-forget `fetch` call should be wrapped in `try/catch` too, not just `.catch()`, since `fetch` itself can throw synchronously in some environments (Node.js 18 edge cases). `.catch()` handles the async rejection; a `try` block handles sync throws.

**Next.js (nextjs-skill):**
- This is a Next.js API route — runs in Node.js (not Edge Runtime). `process.env.NEXT_PUBLIC_SUPABASE_URL` is accessible. The `fetch` API is available globally in Node.js 18+.
- `NEXT_PUBLIC_SUPABASE_URL` is used to construct the Edge Function URL — this is fine since it's a non-secret URL.

```typescript
// app/api/admin/broadcast/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/admin"

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { leagueId, message } = body as { leagueId: string; message: string | null }

  if (!leagueId) {
    return NextResponse.json({ error: "Missing leagueId" }, { status: 400 })
  }

  const supabase = getAdminClient()

  // Fetch league name for notification title
  const { data: league } = await supabase
    .from("leagues")
    .select("name")
    .eq("id", leagueId)
    .single()

  const { error } = await supabase
    .from("leagues")
    .update({ announcement_text: message ?? null })
    .eq("id", leagueId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fire-and-forget push fanout — non-blocking, best-effort
  if (message && league) {
    const notifyUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notify`
    fetch(notifyUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        leagueId,
        title: league.name,
        body: message,
        url: `/l/${leagueId}`,
      }),
    }).catch((err) => console.warn("Push fanout failed (non-blocking):", err))
  }

  return NextResponse.json({ success: true })
}
```

---

### 4. Subscribe API Endpoint

**File: `app/api/participant/subscribe/route.ts`** (new)

PATCH endpoint. Validates `magicToken` against `participants.magic_token + league_id`, then updates `push_subscription`.

#### Research Insights — Subscribe Endpoint

**Security (security-sentinel) — CRITICAL:**
- Add UUID format validation before the DB lookup — mirrors the `UUID_RE` pattern in `middleware.ts`. Prevents log spam and wasted DB queries on garbage input.
- The subscription body (`subscription: object | null`) should be validated: if non-null, verify it has the shape `{ endpoint: string, keys: { p256dh: string, auth: string } }`. A malicious client could store arbitrary JSON in `push_subscription`, which would then cause the Edge Function to crash on fan-out. At minimum, check `typeof subscription.endpoint === "string"`.
- No CSRF risk here: the endpoint is authenticated via `magicToken` in the body, which is a secret UUID known only to the participant. Rate limiting is not needed for now (push subscription changes are low-frequency).

**TypeScript (kieran-typescript-reviewer):**
- Type the body more strictly: `subscription: { endpoint: string; expirationTime?: number | null; keys: { p256dh: string; auth: string } } | null` — avoids the overly-broad `object`.
- Use `const UUID_RE = /^[0-9a-f]{8}-..../i` (copy from middleware.ts) at the top of the file. Don't import from middleware — middleware is Next.js edge runtime and exports `config`. Just inline the regex.
- `participant.id` is returned from the lookup but then used to `.update().eq("id", participant.id)` — this is a second DB round trip. Consider doing a single `update...where magic_token=... and league_id=...` without the lookup step. But the lookup-then-update is more readable and the extra round trip is negligible here.

**Data Integrity (data-integrity-guardian):**
- The update `push_subscription = subscription` where `subscription = null` correctly clears the column (JSON null maps to SQL NULL in Supabase). Verify this behavior is expected.
- No transaction needed — single-row update, atomic by definition.

```typescript
// app/api/participant/subscribe/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/admin"

export async function PATCH(request: NextRequest) {
  const body = await request.json()
  const { leagueId, magicToken, subscription } = body as {
    leagueId: string
    magicToken: string
    subscription: object | null
  }

  if (!leagueId || !magicToken) {
    return NextResponse.json({ error: "Missing leagueId or magicToken" }, { status: 400 })
  }

  const supabase = getAdminClient()

  // Validate magicToken belongs to this league
  const { data: participant, error: lookupErr } = await supabase
    .from("participants")
    .select("id")
    .eq("magic_token", magicToken)
    .eq("league_id", leagueId)
    .single()

  if (lookupErr || !participant) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 })
  }

  const { error } = await supabase
    .from("participants")
    .update({ push_subscription: subscription })
    .eq("id", participant.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
```

---

### 5. PushBell Client Component

**File: `components/PushBell.tsx`** (new)

Client component adapted from WC2026 `PushBell.tsx`. Key differences from WC2026:
- Subscribes via `PATCH /api/participant/subscribe` (not `/api/push/subscribe`)
- Needs `magicToken` prop from server (not participant localStorage store)
- Unsubscribe: PATCHes `subscription: null` then calls `sub.unsubscribe()`
- No `participant_id` identity resolution (bracket-fyi uses magic_token directly)

#### Research Insights — PushBell

**Race Conditions (julik-frontend-races-reviewer) — IMPORTANT:**
- The `enable()` and `disable()` functions are async and NOT guarded by a loading state. A user who double-taps the bell will queue two concurrent async operations. The second call reads `reg.pushManager.getSubscription()` before the first finishes writing — this produces undefined behavior (you may unsubscribe immediately after subscribing, or subscribe twice to the same push endpoint).
- **Fix:** Add `const [submitting, setSubmitting] = useState(false)` and guard the start of `enable()` and `disable()` with `if (submitting) return`. Reset on completion/error via `finally`. This is the state-machine approach: `STATE_IDLE → STATE_SUBMITTING → STATE_IDLE`.
- The `serviceWorker.register("/sw.js")` call in `useEffect` is fire-and-forget (`.catch(() => {})`). This is fine — SW registration is idempotent and any failure silently degrades.
- `navigator.serviceWorker.ready` is a `Promise` that never rejects (it waits forever if there's no SW). Not a race concern — it will resolve once registration completes.
- The `enable()` function creates a PushManager subscription, THEN PATCHes the server. If the PATCH fails, the browser has an active push subscription with no server record — the user sees `state === "on"` but push won't be delivered. The fix: on PATCH failure, call `sub.unsubscribe()` to roll back the browser subscription. Add this to the catch block.

**TypeScript (kieran-typescript-reviewer):**
- `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY` — this is a `string | undefined`. The early `return setState("unsupported")` when `!vapidKey` handles the undefined case in `useEffect`, but `enable()` checks `if (!vapidKey || !magicToken) return` explicitly — good.
- The bell SVG inline is fine for this size. Don't extract to a separate icon component.
- `urlBase64ToUint8Array` is a utility function that belongs in `lib/push.ts` if it will be reused, but since it's only used here, inlining is correct per YAGNI.

**Architecture (architecture-strategist):**
- `LeagueHeader` is a **Server Component**. It renders `<PushBell />` (client leaf). This is the correct RSC pattern: server renders the shell, client component hydrates the interactive part. Do NOT add `"use client"` to `LeagueHeader`.
- The `magicToken` is passed as a prop from the server layout — this is the correct way to bridge server-to-client secrets in Next.js App Router. No need for cookies() in the client component.
- `PushBell` renders `null` on `loading` — this prevents hydration mismatch since the server doesn't know browser capabilities. Correct pattern.

```typescript
// components/PushBell.tsx
"use client"

import { useEffect, useState } from "react"

type PushState = "loading" | "unsupported" | "needs-install" | "off" | "on" | "denied"

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

interface PushBellProps {
  leagueId: string
  magicToken: string | null
}

export default function PushBell({ leagueId, magicToken }: PushBellProps) {
  const [state, setState] = useState<PushState>("loading")
  const [showHelp, setShowHelp] = useState(false)

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

  useEffect(() => {
    if (!vapidKey || !magicToken) return setState("unsupported")
    if (!("serviceWorker" in navigator)) return setState("unsupported")

    navigator.serviceWorker.register("/sw.js").catch(() => {})

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    if (isIOS && !standalone) return setState("needs-install")
    if (!("PushManager" in window) || !("Notification" in window)) return setState("unsupported")
    if (Notification.permission === "denied") return setState("denied")

    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription()
      setState(sub ? "on" : "off")
    })
  }, [vapidKey, magicToken])

  async function enable() {
    if (!vapidKey || !magicToken) return
    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off")
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      })
      const res = await fetch("/api/participant/subscribe", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId, magicToken, subscription: sub.toJSON() }),
      })
      if (res.ok) setState("on")
    } catch {
      setState("off")
    }
  }

  async function disable() {
    if (!magicToken) return
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      await fetch("/api/participant/subscribe", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId, magicToken, subscription: null }),
      })
      if (sub) await sub.unsubscribe()
      setState("off")
    } catch {
      // leave state as-is
    }
  }

  if (state === "loading" || state === "unsupported") return null

  const bellClass =
    state === "on" ? "text-accent" : state === "denied" ? "text-secondary" : "text-secondary"

  return (
    <div className="relative">
      <button
        aria-label={state === "on" ? "Notifications on — tap to disable" : "Enable notifications"}
        onClick={() => {
          if (state === "on") return disable()
          if (state === "off") return enable()
          setShowHelp((s) => !s)
        }}
        className="rounded-lg border border-border bg-surface p-1.5 transition-colors hover:bg-surface-raised"
      >
        <svg
          className={`h-4 w-4 ${bellClass}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 01-3.4 0" />
          {state === "on" && <circle cx="18" cy="6" r="3" fill="currentColor" stroke="none" />}
        </svg>
      </button>
      {showHelp && (state === "needs-install" || state === "denied") && (
        <div className="absolute right-0 top-10 z-40 w-64 rounded-xl border border-border bg-surface p-3 text-xs text-secondary shadow-xl">
          {state === "needs-install" ? (
            <>
              <p className="font-semibold text-primary">Install first for notifications</p>
              <p className="mt-1">
                On iPhone: tap <span className="text-primary">Share</span> then{" "}
                <span className="text-primary">Add to Home Screen</span>, then open the app and tap
                the bell again.
              </p>
            </>
          ) : (
            <p>Notifications are blocked in your browser settings. Re-enable them and tap the bell again.</p>
          )}
        </div>
      )}
    </div>
  )
}
```

**Update `components/LeagueHeader.tsx`:**

Replace the disabled `🔔` button with `<PushBell />`. The layout already has `magicToken` — pass it through as prop.

```typescript
// components/LeagueHeader.tsx
import Link from 'next/link'
import PushBell from './PushBell'

interface LeagueHeaderProps {
  leagueName: string
  leagueId: string
  magicToken: string | null
}

export default function LeagueHeader({ leagueName, leagueId, magicToken }: LeagueHeaderProps) {
  // ... existing truncation logic ...
  return (
    <header className="...">
      {/* ... existing back link and title ... */}
      <PushBell leagueId={leagueId} magicToken={magicToken} />
    </header>
  )
}
```

**Update `app/l/[league_id]/layout.tsx`:**

Pass `leagueId` and `magicToken` to `LeagueHeader`.

```typescript
<LeagueHeader leagueName={league.name} leagueId={leagueId} magicToken={magicToken} />
```

---

### 6. iOS PWA Install Nudge

**File: `components/InstallPrompt.tsx`** (new, `"use client"`)

iOS Safari only. Detects `navigator.userAgent` for iPhone/iPad + NOT in standalone mode. Dismissal via `localStorage` keyed per league. Renders at bottom of screen above tab bar.

#### Research Insights — InstallPrompt

**Race Conditions (julik-frontend-races-reviewer):**
- `useEffect` runs once on mount with `dismissKey` as dependency. `dismissKey` is a computed string — stable across renders. No race concerns.
- The `show` state transitions `false → true` only once (in useEffect). The `dismiss()` function sets it to `false`. No concurrent operations — this is safe.
- `localStorage.getItem()` is synchronous — fine in `useEffect` (not during render).

**TypeScript/Simplicity (kieran + code-simplicity-reviewer):**
- `(navigator as unknown as { standalone?: boolean }).standalone` — the double cast through `unknown` is correct TypeScript for accessing a non-standard WebKit property. This mirrors WC2026 exactly.
- The component is already minimal. No simplification needed.
- The `dismissKey` could be a `useMemo` but it's a pure string computation — inlining as `\`bfyi_ios_install_dismissed:${leagueId}\`` is simpler.

**UX / iOS Behavior (architecture-strategist + best practices):**
- iOS Safari PWA install: the Share sheet icon is ⬆ (Unicode U+2B06) on older iOS, but looks more like a box-with-arrow on recent iOS 17+. Consider using the text "Share" (with the word) rather than an icon to be version-safe.
- The banner position `bottom-14` (56px) + `mb-2` = 58px from bottom. The tab bar is also 56px. This places the banner just above the tab bar. Correct.
- `z-40` is below the header `z-50` — correct priority.
- Once dismissed per-league, the user won't see it again on that league. If you want a global dismiss (dismiss once across all leagues), change the key to `bfyi_ios_install_dismissed` (no leagueId). Current per-league behavior matches the spec.
- **Safari 16.4+** supports Web Push for installed PWAs on iOS. The `needs-install` state in PushBell already handles the case where the user is on iOS but not in standalone — this nudge reinforces that. The two components work in concert correctly.

```typescript
// components/InstallPrompt.tsx
"use client"

import { useEffect, useState } from "react"

interface InstallPromptProps {
  leagueId: string
}

export default function InstallPrompt({ leagueId }: InstallPromptProps) {
  const [show, setShow] = useState(false)
  const dismissKey = `bfyi_ios_install_dismissed:${leagueId}`

  useEffect(() => {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    const dismissed = localStorage.getItem(dismissKey) === "true"

    if (isIOS && !isStandalone && !dismissed) {
      setShow(true)
    }
  }, [dismissKey])

  function dismiss() {
    localStorage.setItem(dismissKey, "true")
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed bottom-14 left-0 right-0 z-40 mx-4 mb-2 rounded-xl border border-border bg-surface p-4 shadow-xl">
      <p className="text-sm text-primary font-medium">
        Add Bracket.fyi to your home screen to get bracket updates on your phone.
      </p>
      <p className="mt-1 text-xs text-secondary">
        Tap the Share icon (&#x2B06;) then &ldquo;Add to Home Screen&rdquo;
      </p>
      <button
        onClick={dismiss}
        className="mt-3 text-xs text-accent font-medium hover:text-accent/80 transition-colors"
      >
        Dismiss
      </button>
    </div>
  )
}
```

**Update `app/l/[league_id]/layout.tsx`:**

Import and render `InstallPrompt` inside the layout div.

```typescript
import InstallPrompt from '@/components/InstallPrompt'

// Inside the return:
<div className="min-h-screen bg-canvas">
  <LeagueHeader leagueName={league.name} leagueId={leagueId} magicToken={magicToken} />
  <main className="pt-12 pb-14 min-h-screen">
    {children}
  </main>
  <TabBar leagueId={leagueId} magicToken={magicToken} />
  <InstallPrompt leagueId={leagueId} />
</div>
```

---

## File Manifest

| File | Action |
|------|--------|
| `supabase/functions/notify/index.ts` | NEW — Deno Edge Function |
| `supabase/functions/notify/SETUP.md` | NEW — VAPID setup docs |
| `supabase/migrations/20260725000005_vapid_rpc.sql` | NEW — do not apply yet |
| `app/api/admin/broadcast/route.ts` | UPDATE — add fire-and-forget push |
| `app/api/participant/subscribe/route.ts` | NEW — PATCH subscribe endpoint |
| `components/PushBell.tsx` | NEW — bell icon client component |
| `components/LeagueHeader.tsx` | UPDATE — replace 🔔 with PushBell, add props |
| `components/InstallPrompt.tsx` | NEW — iOS install nudge banner |
| `app/l/[league_id]/layout.tsx` | UPDATE — wire InstallPrompt + pass props to LeagueHeader |

---

## Acceptance Criteria

### Functional
- [ ] `supabase/functions/notify/index.ts` exists using `jsr:@negrel/webpush@0.5.0` and `Deno.serve()`
- [ ] `supabase/functions/notify/SETUP.md` documents full VAPID keygen + Vault + RPC setup (with JWK shape example)
- [ ] `supabase/migrations/20260725000005_vapid_rpc.sql` exists and is NOT applied
- [ ] `supabase/migrations/20260725000005_vapid_rpc_down.sql` exists (drop function)
- [ ] `app/api/admin/broadcast/route.ts` fires push fanout fire-and-forget after DB write
- [ ] `app/api/participant/subscribe/route.ts` validates magic_token (UUID format check + DB lookup), updates push_subscription
- [ ] `components/PushBell.tsx` — bell icon, permission flow, subscribe/unsubscribe, magic_token prop, double-tap guard
- [ ] `components/LeagueHeader.tsx` — PushBell wired in, 🔔 placeholder removed, NO `"use client"` added
- [ ] `components/InstallPrompt.tsx` — iOS-only, dismissible, localStorage keyed per league
- [ ] `app/l/[league_id]/layout.tsx` — InstallPrompt rendered, leagueId + magicToken passed to LeagueHeader
- [ ] `npm run build` passes clean
- [ ] No scope violations (AdminConsole, PickEntry, PickEmEntry, etc. untouched)

### Code Quality (from deepen-plan review)
- [ ] Edge Function error handler uses `(err as { response?: { status?: number } })?.response?.status` (not `.statusCode`)
- [ ] Subscribe endpoint validates subscription body shape before writing to DB
- [ ] PushBell `enable()` rolls back browser PushSubscription if server PATCH fails
- [ ] PushBell `enable()` and `disable()` are guarded by a `submitting` state (no double-tap race)
- [ ] Subscribe endpoint has UUID_RE validation on magicToken before DB lookup

---

## Deployment Verification (deployment-verification-agent)

### Pre-deploy Checks
```sql
-- Verify push_subscription column exists and is nullable
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'participants' and column_name = 'push_subscription';

-- After running migration: verify get_vapid_keys() exists with correct grants
select routine_name, security_type from information_schema.routines
where routine_name = 'get_vapid_keys';

-- Count participants with push subscriptions (expect 0 pre-launch)
select count(*) from participants where push_subscription is not null;
```

### Rollback
- Edge Function: redeploy previous version or delete. Does not affect DB state.
- Migration: `supabase/migrations/20260725000005_vapid_rpc_down.sql` drops the function.
- Component changes: git revert. No DB state affected.
- Push subscriptions stored in `participants.push_subscription` can be cleared with `update participants set push_subscription = null`.

### Post-deploy Monitoring
- Check Supabase Edge Function logs after first broadcast: look for `sent > 0, pruned: 0, errors: []`
- If `errors` is non-empty, check endpoint/p256dh/auth shape in stored subscriptions
- If `pruned > 0`, stale subscriptions are being cleaned — expected behavior

---

## TODOs After Merge (Blockers for Live Push)

1. **Generate VAPID keypair** — `npx web-push generate-vapid-keys` — outputs a public key (base64url) and a JWK private key set
2. **Set Vercel env** — `NEXT_PUBLIC_VAPID_PUBLIC_KEY=<publicKey>` (also `VAPID_SUBJECT=mailto:yonnastgetahun@gmail.com`)
3. **Store in Supabase Vault** — `select vault.create_secret('vapid_keys_jwk', '<JSON JWK set string>')`
4. **Run migration** — `supabase db push` or apply `20260725000005_vapid_rpc.sql` manually
5. **Deploy Edge Function** — `supabase functions deploy notify`
6. **Optional: set `VAPID_KEYS_JWK` env in Supabase** as paste-proof backup (same JWK JSON)

---

## Risk Notes

- **`jsr:` imports in Deno 2** — the WC2026 function uses `jsr:@negrel/webpush@0.5.0` not the esm.sh path. The plan scaffolding above uses the exact same import. The spec description references `0.3.0` via esm.sh — do not use that, use `jsr:@negrel/webpush@0.5.0` to match the working WC2026 pattern.
- **PushBell requires `magicToken` prop** — the component renders `null` if `magicToken` is null (guest viewers without a participant link). This is correct — guests can't subscribe per-participant.
- **LeagueHeader is a server component currently** — it must remain a server component. PushBell is `"use client"` and can be a leaf inside a server-rendered parent, which is valid.
- **InstallPrompt z-index** — `bottom-14` clears the tab bar (56px). `z-40` is below the header (z-50) but above content.

---

## References

- WC2026 Edge Function: `/Users/yonnasgetahun/BoyzWC2026Brackets/supabase/functions/notify/index.ts`
- WC2026 PushBell: `/Users/yonnasgetahun/BoyzWC2026Brackets/components/PushBell.tsx`
- bracket-fyi schema: `supabase/migrations/20260724000001_initial_schema.sql:48-58`
- Broadcast route: `app/api/admin/broadcast/route.ts`
- League layout: `app/l/[league_id]/layout.tsx`
- Admin client: `lib/supabase/admin.ts`
