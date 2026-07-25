import { Card } from "@/components/ui/Card";

const differentiators = [
  {
    title: "No accounts — not even for you.",
    body: "Your friends never enter an email, phone, or password. They fill out picks with a display name and an emoji. That's it.",
  },
  {
    title: "Your rules, protected.",
    body: "Locked picks stay locked — enforced at the database, not the UI. Once picks lock, scoring rules are frozen too.",
  },
  {
    title: "Private by link.",
    body: "No discovery, no public leaderboards, no ads. Your league lives at a link you control.",
  },
  {
    title: "Free. And 2 minutes to set up.",
    body: "We're on the free tier of everything. The core product stays free.",
  },
];

export default function Home() {
  return (
    <main className="bg-canvas">
      {/* ── Top fold ── */}
      <section className="min-h-screen flex flex-col justify-center">
        <div className="max-w-md mx-auto px-6 w-full">
          <p className="font-body text-sm text-secondary mb-8">bracket.fyi</p>

          <h1 className="font-display text-4xl font-bold text-primary leading-tight mb-8">
            Run your bracket.
            <br />
            Share one link.
            <br />
            Nobody makes an account.
          </h1>

          <a
            href="/create"
            className="block w-full rounded-lg px-4 py-3 font-semibold text-center bg-accent text-canvas transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-canvas"
          >
            Create a bracket &rarr;
          </a>

          <div className="mt-6 text-center">
            <a
              href="/about"
              className="text-sm text-accent underline underline-offset-4 hover:text-accent-dim"
            >
              Learn more
            </a>
          </div>
        </div>
      </section>

      {/* ── Differentiators ── */}
      <section className="border-t border-border py-20">
        <div className="max-w-md mx-auto px-6 w-full">
          <p className="text-xs uppercase tracking-widest text-secondary mb-10">
            What makes Bracket.fyi
            <br />
            different
          </p>

          <div className="space-y-4">
            {differentiators.map((d) => (
              <Card key={d.title}>
                <div className="flex gap-3 items-start">
                  <span className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full bg-accent" />
                  <div>
                    <p className="font-display font-semibold text-sm text-primary mb-1">
                      {d.title}
                    </p>
                    <p className="text-sm text-secondary font-body">{d.body}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="mt-10">
            <a
              href="/about"
              className="text-sm text-accent underline underline-offset-4 hover:text-accent-dim"
            >
              Read the full manifesto &rarr;
            </a>
          </div>

          <div className="mt-10 border-t border-border pt-6">
            <p className="text-secondary text-sm">Trusted since WC2026</p>
            <details className="mt-1">
              <summary className="text-muted text-xs cursor-pointer list-none hover:text-secondary transition-colors">
                Produced by BoyzIIMen
              </summary>
              <p className="text-xs text-muted italic mt-1">
                A real group of friends building the tool we wanted for our own brackets.
              </p>
            </details>
          </div>
        </div>
      </section>
    </main>
  );
}
