import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { Badge, Card, PageHeader, Table } from "@/components/ui/layout";
import { buttonClass } from "@/components/ui/button";
import { can, requirePermission } from "@/lib/auth/session";
import { formatDate, formatDateTime, money, todayInClinic } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { closeCashDay } from "@/modules/billing/actions";
import { PAYMENT_LABELS } from "@/modules/billing/queries";

export const metadata = { title: "Day's cash" };

export default async function CashPage({ searchParams }: PageProps<"/billing/cash">) {
  const session = await requirePermission("billing.read");
  const sp = await searchParams;
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayInClinic();
  const supabase = await createClient();
  const [{ data: summary }, { data: closings }] = await Promise.all([
    supabase.rpc("cash_summary", { p_date: date }),
    supabase.from("cash_closings").select("*, staff:staff!cash_closings_closed_by_fkey(full_name)").order("closing_date", { ascending: false }).limit(30),
  ]);
  const closed = (closings ?? []).find((c) => c.closing_date === date);
  const total = (summary ?? []).reduce((s, r) => s + Number(r.net_paise), 0);
  const cash = Number((summary ?? []).find((r) => r.method === "cash")?.net_paise ?? 0);

  return (
    <>
      <PageHeader title="Day's cash" description="Money received minus refunds, by method, for one clinic day." />
      <form className="mb-4 flex gap-2">
        <Input name="date" type="date" defaultValue={date} className="h-8 w-44" />
        <button className={buttonClass("secondary", "sm")}>Show</button>
      </form>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={formatDate(date)} actions={closed ? <Badge tone="ok">Closed</Badge> : <Badge>Open</Badge>}>
          <Table>
            <thead><tr><th>Method</th><th className="text-right">Payments</th><th className="text-right">Received</th><th className="text-right">Refunded</th><th className="text-right">Net</th></tr></thead>
            <tbody>
              {(summary ?? []).map((r) => (
                <tr key={r.method} className="tabular-nums">
                  <td>{PAYMENT_LABELS[r.method]}</td><td className="text-right">{r.payments}</td>
                  <td className="text-right">{money(r.received_paise)}</td><td className="text-right">{money(r.refunded_paise)}</td>
                  <td className="text-right font-medium">{money(r.net_paise)}</td>
                </tr>
              ))}
              <tr><td colSpan={4} className="text-right font-semibold">Total</td><td className="text-right font-semibold tabular-nums">{money(total)}</td></tr>
            </tbody>
          </Table>
          {closed && (
            <p className="mt-4 text-sm">
              Closed by {closed.staff?.full_name} at {formatDateTime(closed.closed_at)}: counted {money(closed.counted_cash_paise)} cash,
              difference <span className={Number(closed.difference_paise) === 0 ? "text-ok" : "text-danger"}>{money(closed.difference_paise)}</span>.
              {closed.notes && ` ${closed.notes}`}
            </p>
          )}
          {!closed && can(session, "billing.close") && (
            <ActionForm action={closeCashDay} className="mt-4">
              <input type="hidden" name="date" value={date} />
              <Field label={`Cash counted in the drawer (expected ${money(cash)})`}><Input name="counted" inputMode="decimal" required /></Field>
              <Field label="Notes"><Textarea name="notes" rows={2} /></Field>
              <div><SubmitButton>Close the day</SubmitButton></div>
            </ActionForm>
          )}
        </Card>
        <Card title="Recent closings">
          <Table>
            <thead><tr><th>Day</th><th className="text-right">Counted</th><th className="text-right">Difference</th><th>By</th></tr></thead>
            <tbody>
              {(closings ?? []).map((c) => (
                <tr key={c.id} className="tabular-nums">
                  <td>{formatDate(c.closing_date)}</td><td className="text-right">{money(c.counted_cash_paise)}</td>
                  <td className={`text-right ${Number(c.difference_paise) === 0 ? "" : "text-danger"}`}>{money(c.difference_paise)}</td>
                  <td>{c.staff?.full_name}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
