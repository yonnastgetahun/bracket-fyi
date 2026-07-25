export default function AboutPage() {
  return (
    <main className="bg-canvas min-h-screen">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <a
          href="/"
          className="text-sm text-secondary hover:text-primary transition-colors"
        >
          &larr; Back to bracket.fyi
        </a>

        <h1 className="font-display text-4xl font-bold text-primary mt-10 mb-4">
          Why Bracket.fyi
        </h1>

        <p className="text-secondary font-body text-base mb-12">
          You&apos;re the organizer. That&apos;s who we built for.
        </p>

        <section className="mb-10">
          <h2 className="font-display text-xl font-semibold text-primary mt-12 mb-4">
            No accounts. Ever.
          </h2>
          <p className="text-secondary font-body text-sm leading-relaxed">
            Not for you. Not for your friends. Nobody makes an account, nobody
            verifies an email, nobody enters a password. Your friends fill out
            picks with a display name and an emoji. That&apos;s it.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-display text-xl font-semibold text-primary mt-12 mb-4">
            Your data stays private
          </h2>
          <ul className="list-disc marker:text-accent list-outside pl-6 space-y-1.5 text-secondary font-body text-sm">
            <li>No emails collected — from anyone</li>
            <li>No phone numbers</li>
            <li>No cross-league profiles</li>
            <li>No tracking beyond product analytics</li>
            <li>No ads</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="font-display text-xl font-semibold text-primary mt-12 mb-4">
            Your rules, protected
          </h2>
          <p className="text-secondary font-body text-sm leading-relaxed">
            Once picks lock, they&apos;re provably immutable — we use a database
            trigger, not just a UI hide. If you change scoring rules
            mid-competition, every participant sees the change and when it
            happened.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-display text-xl font-semibold text-primary mt-12 mb-4">
            Two links, two responsibilities
          </h2>
          <p className="text-secondary font-body text-sm leading-relaxed">
            Your organizer link is your admin key — keep it private. Your join
            link is safe to share to any group chat. That&apos;s the whole security
            model — no roles, no permissions matrix, just two links.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-display text-xl font-semibold text-primary mt-12 mb-4">
            Scoring is derived, never stored
          </h2>
          <p className="text-secondary font-body text-sm leading-relaxed">
            We compute scores from picks and results every time — nothing cached,
            nothing frozen. If results change, scores update. If rules change,
            scores update. Nobody can secretly rewrite the past.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-display text-xl font-semibold text-primary mt-12 mb-4">
            Free
          </h2>
          <p className="text-secondary font-body text-sm leading-relaxed">
            We&apos;re on the free tier of everything. If we ever charge, it&apos;ll be for
            pro features (custom branding, SMS notifications, private multi-league
            dashboards) — never for the core product.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-display text-xl font-semibold text-primary mt-12 mb-4">
            Produced by BoyzIIMen
          </h2>
          <p className="text-secondary font-body text-sm leading-relaxed">
            Made by a real group of friends running our own brackets. If it
            feels like a corporate SaaS product, we&apos;ve failed.
          </p>
        </section>

        <div className="mt-16 border-t border-border pt-8">
          <a
            href="/create"
            className="inline-block rounded-lg px-4 py-3 font-semibold bg-accent text-canvas transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-canvas"
          >
            Create a bracket &rarr;
          </a>
          <p className="text-muted text-xs mt-6 italic">
            A real group of friends building the tool we wanted for our own brackets.
          </p>
        </div>
      </div>
    </main>
  );
}
