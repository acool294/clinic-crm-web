import "server-only";
import type { Db } from "@/lib/supabase/server";

export async function loadAnalytics(supabase: Db, from: string, to: string) {
  const [revenue, services, visits, diagnoses, feedback, dues, dormant, staff, specialties] = await Promise.all([
    supabase.rpc("revenue_by_day", { p_from: from, p_to: to }),
    supabase.rpc("revenue_by_service", { p_from: from, p_to: to }),
    supabase.rpc("visit_stats", { p_from: from, p_to: to }),
    supabase.rpc("top_diagnoses", { p_from: from, p_to: to, p_limit: 10 }),
    supabase.from("feedback").select("score").not("score", "is", null).gte("submitted_at", from).lte("submitted_at", `${to}T23:59:59`),
    supabase.from("outstanding_dues").select("*").order("issued_at"),
    supabase.rpc("dormant_patients", { p_months: 12, p_limit: 100 }),
    supabase.from("staff").select("id, full_name"),
    supabase.from("specialties").select("id, name"),
  ]);
  const name = new Map([...(staff.data ?? []).map((s) => [s.id, s.full_name] as const), ...(specialties.data ?? []).map((s) => [s.id, s.name] as const)]);
  return {
    revenue: revenue.data ?? [],
    services: services.data ?? [],
    visits: visits.data ?? [],
    diagnoses: diagnoses.data ?? [],
    scores: (feedback.data ?? []).map((f) => f.score as number),
    dues: dues.data ?? [],
    dormant: dormant.data ?? [],
    name: (id: string | null) => (id ? (name.get(id) ?? "Unknown") : "Not set"),
  };
}

/** Net Promoter Score from 0-10 answers: % promoters (9-10) minus % detractors (0-6). */
export function nps(scores: number[]): number | null {
  if (!scores.length) return null;
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  return Math.round(((promoters - detractors) / scores.length) * 100);
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    // guard against spreadsheet formula injection
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
}
