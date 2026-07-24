import { createClient } from "@supabase/supabase-js";

// Anon-key client for Server Components.
// cache: 'no-store' prevents Next.js from serving stale Supabase responses
// cached at an earlier request — required for real-time league data.
export function getServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false },
      global: {
        fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }),
      },
    }
  );
}
