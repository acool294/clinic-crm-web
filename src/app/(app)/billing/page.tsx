import Link from "next/link";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Badge, Card, EmptyState, PageHeader, Table } from "@/components/ui/layout";
import { can, requirePermission } from "@/lib/auth/session";
import { addDays, clinicDayRange, formatDateTime, money, todayInClinic } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Billing" };
const tone = { paid: "ok", partial: "warn", unpaid: "danger", draft: "neutral", void: "neutral" } as const;

export default async function BillingPage({ searchParams }: PageProps<"/billing">) {
  const session = await requirePermission("billing.read");
  const sp = await searchParams;
  const today = todayInClinic();
  const from = typeof sp.from === "string" ? sp.from : addDays(today, -6);
  const to = typeof sp.to === "string" ? sp.to : today;
  const status = typeof sp.status === "string" ? sp.status : "";
  const supabase = await createClient();

  const [{ data: invoices }, { data: dues }] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, invoice_number, status, issued_at, created_at, patient:patients(full_name, mrn)")
      .gte("created_at", clinicDayRange(from).start.toISOString())
      .lt("created_at", clinicDayRange(to).end.toISOString())
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("outstanding_dues").select("*").order("issued_at").limit(50),
  ]);
  const ids = (invoices ?? []).map((i) => i.id);
  const { data: totals } = ids.length ? await supabase.from("invoice_totals").select("*").in("invoice_id", ids) : { data: [] };
  const t = new Map((totals ?? []).map((x) => [x.invoice_id, x]));
  const rows = (invoices ?? []).filter((i) => !status || t.get(i.id)?.payment_status === status);

  return (
    <>
      <PageHeader
        title="Billing"
        actions={
          <>
            {can(session, "billing.write") && <ButtonLink href="/billing/invoices/new">New invoice</ButtonLink>}
            <ButtonLink href="/billing/cash" variant="secondary">Day&apos;s cash</ButtonLink>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <Card>
          <form className="mb-4 flex flex-wrap gap-2">
            <Input name="from" type="date" defaultValue={from} className="h-8 w-40" />
            <Input name="to" type="date" defaultValue={to} className="h-8 w-40" />
            <Select name="status" defaultValue={status} className="h-8 w-40">
              <option value="">All</option>
              {Object.keys(tone).map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <button className={buttonClass("secondary", "sm")}>Show</button>
          </form>
          {rows.length ? (
            <Table>
              <thead><tr><th>Invoice</th><th>Patient</th><th>Date</th><th className="text-right">Total</th><th className="text-right">Balance</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((i) => {
                  const x = t.get(i.id);
                  return (
                    <tr key={i.id}>
                      <td><Link href={`/billing/invoices/${i.id}`} className="text-brand hover:underline">{i.invoice_number ?? "Draft"}</Link></td>
                      <td>{i.patient?.full_name} <span className="text-muted">{i.patient?.mrn}</span></td>
                      <td className="whitespace-nowrap">{formatDateTime(i.issued_at ?? i.created_at)}</td>
                      <td className="text-right tabular-nums">{money(x?.total_paise)}</td>
                      <td className="text-right tabular-nums">{money(x?.balance_paise)}</td>
                      <td><Badge tone={tone[(x?.payment_status ?? "draft") as keyof typeof tone]}>{x?.payment_status}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="No invoices in this range" />
          )}
        </Card>
        <Card title="Outstanding dues">
          <ul className="flex flex-col gap-2 text-sm">
            {(dues ?? []).map((d) => (
              <li key={d.invoice_id} className="flex justify-between gap-2">
                <Link href={`/billing/invoices/${d.invoice_id}`} className="truncate hover:underline">{d.full_name} <span className="text-muted">{d.invoice_number}</span></Link>
                <span className="tabular-nums">{money(d.balance_paise)}</span>
              </li>
            ))}
            {!dues?.length && <li className="text-muted">Nothing outstanding.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
