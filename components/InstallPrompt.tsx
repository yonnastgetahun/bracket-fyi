"use client"

import { useEffect, useState } from "react"

interface InstallPromptProps {
  leagueId: string
}

export default function InstallPrompt({ leagueId }: InstallPromptProps) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    const dismissKey = `bfyi_ios_install_dismissed:${leagueId}`
    const dismissed = localStorage.getItem(dismissKey) === "true"

    if (isIOS && !isStandalone && !dismissed) {
      setShow(true)
    }
  }, [leagueId])

  function dismiss() {
    localStorage.setItem(`bfyi_ios_install_dismissed:${leagueId}`, "true")
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed bottom-14 left-0 right-0 z-40 mx-4 mb-2 rounded-xl border border-border bg-surface p-4 shadow-xl">
      <p className="text-sm font-medium text-primary">
        Add Bracket.fyi to your home screen to get bracket updates on your
        phone.
      </p>
      <p className="mt-1 text-xs text-secondary">
        Tap the Share icon then &ldquo;Add to Home Screen&rdquo;
      </p>
      <button
        onClick={dismiss}
        className="mt-3 text-xs font-medium text-accent transition-colors hover:text-accent/80"
      >
        Dismiss
      </button>
    </div>
  )
}
