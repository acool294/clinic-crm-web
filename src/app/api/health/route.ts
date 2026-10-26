import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function cause(e: unknown): string {
  const err = e as { message?: string; cause?: { code?: string; message?: string } };
  return err?.cause?.code ?? err?.cause?.message ?? err?.message ?? "unknown error";
}

/**
 * Deployment check: which settings are present, whether Supabase answers and
 * whether the migrations are applied. Shows no keys and no data.
 */
export async function GET() {
  const url = process.env.SUPABASE_URL ?? "";
  const anon = process.env.SUPABASE_ANON_KEY ?? "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {}

  const report: Record<string, unknown> = {
    settings: {
      SUPABASE_URL: url ? (parsed ? "set" : "set but not a valid URL") : "missing",
      SUPABASE_URL_looks_like_project_api:
        !!parsed && parsed.protocol === "https:" && parsed.hostname.endsWith(".supabase.co") && (parsed.pathname === "/" || parsed.pathname === ""),
      SUPABASE_ANON_KEY: anon ? "set" : "missing",
      SUPABASE_SERVICE_ROLE_KEY: service ? "set" : "missing",
      APP_URL: process.env.APP_URL ? "set" : "missing (defaults to localhost; email links will be wrong)",
      CRON_SECRET: process.env.CRON_SECRET ? "set" : "missing (daily messages will not run)",
      old_NEXT_PUBLIC_names_present: !!(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    },
  };

  if (parsed && anon) {
    try {
      const res = await fetch(new URL("/auth/v1/health", parsed), { headers: { apikey: anon }, cache: "no-store" });
      report.supabase_reachable = res.ok ? true : `HTTP ${res.status}${res.status === 401 ? " (anon key does not match this project)" : ""}`;
    } catch (e) {
      report.supabase_reachable = `no: ${cause(e)} (wrong URL, or the project is paused)`;
    }
  }

  if (parsed && service && report.supabase_reachable === true) {
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data, error } = await admin.rpc("clinic_is_set_up");
    report.migrations_applied = error
      ? error.code === "PGRST202" || /function/i.test(error.message)
        ? "no (run the files in supabase/migrations)"
        : error.message.includes("Invalid API key") ? "unknown: service role key does not match this project" : `unknown: ${error.message}`
      : true;
    if (!error) report.clinic_set_up = data;
  }

  const ok = report.supabase_reachable === true && report.migrations_applied === true;
  return NextResponse.json({ ok, ...report }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
