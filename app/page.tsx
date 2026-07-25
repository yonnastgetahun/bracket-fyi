export default function Home() {
  return (
    <main className="min-h-screen flex flex-col justify-center bg-canvas">
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

        <div className="mt-10 border-t border-border pt-6">
          <p className="text-secondary text-sm">Trusted since WC2026</p>
          <p className="text-muted text-xs mt-1">Produced by BoyzIIMen</p>
        </div>
      </div>
    </main>
  );
}
