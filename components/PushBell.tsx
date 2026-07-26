"use client"

import { useEffect, useState } from "react"

type PushState =
  | "loading"
  | "unsupported"
  | "needs-install" // iOS Safari, not installed to home screen
  | "off"
  | "on"
  | "denied"

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
  const [submitting, setSubmitting] = useState(false)
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

    if (!("PushManager" in window) || !("Notification" in window)) {
      return setState("unsupported")
    }
    if (Notification.permission === "denied") return setState("denied")

    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription()
      setState(sub ? "on" : "off")
    })
  }, [vapidKey, magicToken])

  async function enable() {
    if (!vapidKey || !magicToken || submitting) return
    setSubmitting(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off")
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      })
      const res = await fetch("/api/participant/subscribe", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leagueId,
          magicToken,
          subscription: sub.toJSON(),
        }),
      })
      if (res.ok) {
        setState("on")
      } else {
        // Server rejected — roll back the browser subscription
        await sub.unsubscribe()
        setState("off")
      }
    } catch {
      setState("off")
    } finally {
      setSubmitting(false)
    }
  }

  async function disable() {
    if (!magicToken || submitting) return
    setSubmitting(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      // Clear server record first, then browser sub
      await fetch("/api/participant/subscribe", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId, magicToken, subscription: null }),
      })
      if (sub) await sub.unsubscribe()
      setState("off")
    } catch {
      // Leave state as-is on error
    } finally {
      setSubmitting(false)
    }
  }

  if (state === "loading" || state === "unsupported") return null

  const bellClass =
    state === "on"
      ? "text-accent"
      : state === "denied"
        ? "text-secondary opacity-50"
        : "text-secondary"

  return (
    <div className="relative">
      <button
        aria-label={
          state === "on" ? "Notifications on — tap to disable" : "Enable notifications"
        }
        disabled={submitting}
        onClick={() => {
          if (state === "on") return disable()
          if (state === "off") return enable()
          setShowHelp((s) => !s)
        }}
        className="rounded-lg border border-border bg-surface p-1.5 transition-colors hover:bg-surface-raised disabled:opacity-50"
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
          {state === "on" && (
            <circle cx="18" cy="6" r="3" fill="currentColor" stroke="none" />
          )}
        </svg>
      </button>

      {showHelp && (state === "needs-install" || state === "denied") && (
        <div className="absolute right-0 top-10 z-40 w-64 rounded-xl border border-border bg-surface p-3 text-xs text-secondary shadow-xl">
          {state === "needs-install" ? (
            <>
              <p className="font-semibold text-primary">
                Install first for notifications
              </p>
              <p className="mt-1">
                On iPhone: tap{" "}
                <span className="text-primary">Share</span> then{" "}
                <span className="text-primary">Add to Home Screen</span>, then
                open the app and tap the bell again.
              </p>
            </>
          ) : (
            <p>
              Notifications are blocked in your browser settings. Re-enable
              them and tap the bell again.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
