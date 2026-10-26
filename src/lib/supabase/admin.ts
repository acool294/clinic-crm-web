import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";

/**
 * Service-role client: bypasses RLS. Use only for first-run setup, staff
 * invites, login rate limiting, the message job, public feedback and webhooks.
 * Never pass data from it to a page without checking permissions first.
 */
export function createAdminClient() {
  return createClient<Database>(env().SUPABASE_URL, env().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
