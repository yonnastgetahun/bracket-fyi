import CreateFlow from "@/components/CreateFlow";

export default function CreatePage() {
  return (
    <main className="min-h-screen bg-canvas">
      <div className="max-w-md mx-auto px-6 py-12">
        <a href="/" className="block mb-8 text-sm text-secondary hover:text-primary">
          bracket.fyi
        </a>
        <CreateFlow />
      </div>
    </main>
  );
}
