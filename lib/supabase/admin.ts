import { createClient } from "@supabase/supabase-js";

// Service-role client. Server-side ONLY (Server Actions, API routes).
// Never import this in client components or expose to the browser.
export function getAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("Admin client must never be used in the browser");
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}
