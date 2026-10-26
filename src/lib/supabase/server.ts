import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";

export type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * A Supabase client acting as the signed-in user, so every query is checked by
 * RLS. Create one per request. The client IP and user agent travel as headers
 * so the audit log can record them.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "";
  const userAgent = h.get("user-agent") ?? "";

  return createServerClient<Database>(env().SUPABASE_URL, env().SUPABASE_ANON_KEY, {
    global: { headers: { "x-client-ip": ip, "x-client-user-agent": userAgent.slice(0, 300) } },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  });
}
