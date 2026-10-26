import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, PageHeader, Stat } from "@/components/ui/layout";
import { can, requireSession } from "@/lib/auth/session";
import { formatDate, formatTime, money, todayInClinic } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABELS, STATUS_TONES } from "@/modules/appointments/queries";
import { todaysAppointments } from "@/modules/appointments/today";

export const metadata = { title: "Today" };

export default async function TodayPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const today = todayInClinic();
  const isDoctor = session.roles.includes("doctor");

  const appts = can(session, "appointments.read") ? await todaysAppointments(supabase, { doctorId: isDoctor && !can(session, "settings.manage") ? session.staffId : undefined }) : [];
  const [cash, dues, labs, referrals] = await Promise.all([
    can(session, "billing.read") ? supabase.rpc("cash_summary", { p_date: today }).then((r) => r.data ?? []) : Promise.resolve([]),
    can(session, "billing.read") ? supabase.from("outstanding_dues").select("balance_paise").then((r) => r.data ?? []) : Promise.resolve([]),
    can(session, "lab.read") ? supabase.from("lab_orders").select("id", { count: "exact", head: true }).in("status", ["ordered", "sample_collected"]).then((r) => r.count ?? 0) : Promise.resolve(0),
    isDoctor ? supabase.from("referrals").select("id, reason, patient:patients(id, full_name)").eq("status", "open").or(`to_doctor_id.eq.${session.staffId},to_doctor_id.is.null`).limit(5).then((r) => r.data ?? []) : Promise.resolve([]),
  ]);

  const count = (s: string[]) => appts.filter((a) => s.includes(a.status)).length;
  const collected = cash.reduce((s, r) => s + Number(r.net_paise), 0);
  const outstanding = dues.reduce((s, r) => s + Number(r.balance_paise ?? 0), 0);

  return (
    <>
      <PageHeader title={`Good ${new Date().getHours() < 12 ? "morning" : "day"}, ${session.fullName.split(" ")[0]}`} description={formatDate(today)} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {can(session, "appointments.read") && <Stat label="Booked today" value={appts.filter((a) => a.status !== "cancelled").length} hint={`${count(["completed"])} done, ${count(["no_show"])} no-show`} />}
        {can(session, "appointments.read") && <Stat label="Waiting now" value={count(["checked_in"])} hint={`${count(["in_consultation"])} with a doctor`} />}
        {can(session, "billing.read") && <Stat label="Collected today" value={money(collected, { whole: true })} hint={cash.filter((c) => Number(c.net_paise) !== 0).map((c) => `${c.method} ${money(c.net_paise, { whole: true })}`).join(" · ") || "No payments yet"} />}
        {can(session, "billing.read") && <Stat label="Outstanding dues" value={money(outstanding, { whole: true })} hint={`${dues.length} invoices`} />}
        {can(session, "lab.read") && <Stat label="Lab orders pending" value={labs} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        {can(session, "appointments.read") && (
          <Card title={isDoctor ? "My appointments today" : "Appointments today"} actions={<Link href="/queue" className={buttonClass("ghost", "sm")}>Open queue</Link>}>
            {appts.length ? (
              <ul className="divide-y divide-line">
                {appts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="w-20 shrink-0 tabular-nums text-muted">{formatTime(a.starts_at)}</span>
                    <Link href={`/patients/${a.patient_id}`} className="flex-1 truncate hover:underline">{a.patient?.full_name}</Link>
                    <span className="hidden text-muted sm:inline">{a.doctor?.full_name}</span>
                    <Badge tone={STATUS_TONES[a.status]}>{STATUS_LABELS[a.status]}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nothing booked today.</p>
            )}
          </Card>
        )}
        {referrals.length > 0 && (
          <Card title="Referrals to you">
            <ul className="flex flex-col gap-2 text-sm">
              {referrals.map((r) => (
                <li key={r.id}><Link href={`/patients/${r.patient?.id}`} className="font-medium hover:underline">{r.patient?.full_name}</Link> <span className="text-muted">{r.reason}</span></li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
