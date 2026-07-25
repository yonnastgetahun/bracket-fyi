import CreateFlow from "@/components/CreateFlow";
import { getPublicTemplates } from "@/lib/league-data";

export default async function CreatePage() {
  const templates = await getPublicTemplates();

  return (
    <main className="min-h-screen bg-canvas">
      <div className="max-w-md mx-auto px-6 py-12">
        <a href="/" className="block mb-8 text-sm text-secondary hover:text-primary">
          bracket.fyi
        </a>
        <CreateFlow templates={templates} />
      </div>
    </main>
  );
}
