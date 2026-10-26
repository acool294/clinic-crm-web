import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadAnalytics, toCsv } from "@/modules/analytics/queries";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest, { params }: RouteContext<"/api/export/[report]">) {
  const session = await getSession();
  if (!session || !session.permissions.has("analytics.read")) return new NextResponse("Not allowed", { status: 403 });
  const { report } = await params;
  const from = request.nextUrl.searchParams.get("from") ?? "";
  const to = request.nextUrl.searchParams.get("to") ?? "";
  if (!DATE.test(from) || !DATE.test(to)) return new NextResponse("Bad dates", { status: 400 });

  const supabase = await createClient();
  const a = await loadAnalytics(supabase, from, to);
  const rows: Record<string, unknown>[] =
    report === "revenue"
      ? a.revenue.map((r) => ({ day: r.day, department: a.name(r.specialty_id), doctor: a.name(r.doctor_id), invoiced_rupees: Number(r.invoiced_paise) / 100, collected_rupees: Number(r.collected_paise) / 100, refunded_rupees: Number(r.refunded_paise) / 100 }))
      : report === "services"
        ? a.services.map((s) => ({ service: s.service_name, quantity: s.quantity, amount_rupees: Number(s.amount_paise) / 100 }))
        : report === "visits"
          ? a.visits.map((v) => ({ department: a.name(v.specialty_id), doctor: a.name(v.doctor_id), booked: v.booked, completed: v.completed, no_shows: v.no_shows, cancelled: v.cancelled, new_patients: v.new_patients, returning_patients: v.returning_patients }))
          : report === "diagnoses"
            ? a.diagnoses.map((d) => ({ icd10: d.icd10_code, diagnosis: d.description, cases: d.cases }))
            : report === "dormant"
              ? a.dormant.map((p) => ({ name: p.full_name, mrn: p.mrn, phone: p.phone, last_visit: p.last_visit }))
              : [];
  if (!rows.length && !["revenue", "services", "visits", "diagnoses", "dormant"].includes(report)) return new NextResponse("Unknown report", { status: 404 });

  await supabase.rpc("log_event", { p_action: "export", p_entity: "report", p_details: { report, from, to, rows: rows.length } });
  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report}-${from}-to-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
