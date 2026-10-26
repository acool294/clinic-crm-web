import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Card, PageHeader, Stat, Table } from "@/components/ui/layout";
import { requirePermission } from "@/lib/auth/session";
import { addDays, formatDate, money, todayInClinic } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { DailyBars } from "@/modules/analytics/bar-chart";
import { loadAnalytics, nps } from "@/modules/analytics/queries";

export const metadata = { title: "Analytics" };

function sumBy<T>(rows: T[], key: (r: T) => string, value: (r: T) => number) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + value(r));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export default async function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  await requirePermission("analytics.read");
  const sp = await searchParams;
  const today = todayInClinic();
  const from = typeof sp.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : addDays(today, -29);
  const to = typeof sp.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : today;
  const supabase = await createClient();
  const a = await loadAnalytics(supabase, from, to);

  const collected = a.revenue.reduce((s, r) => s + Number(r.collected_paise) - Number(r.refunded_paise), 0);
  const invoiced = a.revenue.reduce((s, r) => s + Number(r.invoiced_paise), 0);
  const booked = a.visits.reduce((s, v) => s + v.booked, 0);
  const completed = a.visits.reduce((s, v) => s + v.completed, 0);
  const noShows = a.visits.reduce((s, v) => s + v.no_shows, 0);
  const newPts = a.visits.reduce((s, v) => s + v.new_patients, 0);
  const returning = a.visits.reduce((s, v) => s + v.returning_patients, 0);
  const outstanding = a.dues.reduce((s, d) => s + Number(d.balance_paise ?? 0), 0);
  const score = nps(a.scores);

  const days: { day: string; value: number }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    days.push({ day: d, value: a.revenue.filter((r) => r.day === d).reduce((s, r) => s + Number(r.collected_paise) - Number(r.refunded_paise), 0) });
  }
  const byDept = sumBy(a.revenue, (r) => a.name(r.specialty_id), (r) => Number(r.invoiced_paise));
  const byDoctor = sumBy(a.revenue, (r) => a.name(r.doctor_id), (r) => Number(r.invoiced_paise));
  const visitsByDept = sumBy(a.visits, (v) => a.name(v.specialty_id), (v) => v.completed);
  const exportLink = (report: string) => `/api/export/${report}?from=${from}&to=${to}`;

  return (
    <>
      <PageHeader title="Analytics" description={`${formatDate(from)} to ${formatDate(to)}`} />
      <form className="mb-6 flex flex-wrap items-center gap-2">
        <Input name="from" type="date" defaultValue={from} className="h-8 w-40" />
        <Input name="to" type="date" defaultValue={to} className="h-8 w-40" />
        <button className={buttonClass("secondary", "sm")}>Show</button>
        {[7, 30, 90].map((n) => (
          <Link key={n} href={`?from=${addDays(today, -(n - 1))}&to=${today}`} className={buttonClass("ghost", "sm")}>Last {n} days</Link>
        ))}
      </form>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Collected (net)" value={money(collected, { whole: true })} hint={`${money(invoiced, { whole: true })} invoiced`} />
        <Stat label="Visits completed" value={completed} hint={`${booked} booked`} />
        <Stat label="No-show rate" value={booked ? `${Math.round((noShows / booked) * 100)}%` : "—"} hint={`${noShows} no-shows`} />
        <Stat label="New / returning" value={`${newPts} / ${returning}`} />
        <Stat label="Outstanding dues" value={money(outstanding, { whole: true })} hint={`${a.dues.length} invoices`} />
        <Stat label="NPS" value={score ?? "—"} hint={`${a.scores.length} responses`} />
      </div>

      <Card title="Money collected per day" className="mb-6" actions={<a href={exportLink("revenue")} className="text-sm text-brand hover:underline">Export CSV</a>}>
        <DailyBars days={days} title="Net collections per day" />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Revenue by department">
          <Table><tbody>{byDept.map(([k, v]) => <tr key={k}><td>{k}</td><td className="text-right tabular-nums">{money(v, { whole: true })}</td></tr>)}</tbody></Table>
        </Card>
        <Card title="Revenue by doctor">
          <Table><tbody>{byDoctor.map(([k, v]) => <tr key={k}><td>{k}</td><td className="text-right tabular-nums">{money(v, { whole: true })}</td></tr>)}</tbody></Table>
        </Card>
        <Card title="Revenue by service" actions={<a href={exportLink("services")} className="text-sm text-brand hover:underline">Export CSV</a>}>
          <Table>
            <thead><tr><th>Service</th><th className="text-right">Qty</th><th className="text-right">Amount</th></tr></thead>
            <tbody>{a.services.map((s) => <tr key={s.service_name}><td>{s.service_name}</td><td className="text-right">{s.quantity}</td><td className="text-right tabular-nums">{money(s.amount_paise, { whole: true })}</td></tr>)}</tbody>
          </Table>
        </Card>
        <Card title="Visits by department" actions={<a href={exportLink("visits")} className="text-sm text-brand hover:underline">Export CSV</a>}>
          <Table><tbody>{visitsByDept.map(([k, v]) => <tr key={k}><td>{k}</td><td className="text-right tabular-nums">{v}</td></tr>)}</tbody></Table>
        </Card>
        <Card title="Top diagnoses" actions={<a href={exportLink("diagnoses")} className="text-sm text-brand hover:underline">Export CSV</a>}>
          <Table><tbody>{a.diagnoses.map((d) => <tr key={`${d.icd10_code}-${d.description}`}><td><span className="font-mono text-xs text-muted">{d.icd10_code}</span> {d.description}</td><td className="text-right">{d.cases}</td></tr>)}</tbody></Table>
        </Card>
        <Card title="No visit in 12 months" actions={<a href={exportLink("dormant")} className="text-sm text-brand hover:underline">Export CSV</a>}>
          <Table>
            <tbody>
              {a.dormant.slice(0, 15).map((p) => (
                <tr key={p.patient_id}><td><Link href={`/patients/${p.patient_id}`} className="hover:underline">{p.full_name}</Link></td><td>{p.phone}</td><td className="text-right">{formatDate(p.last_visit)}</td></tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
