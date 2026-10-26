import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { ButtonLink } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/confirm-button";
import { Field, Input, Select, SubmitButton } from "@/components/ui/form";
import { Badge, Card, PageHeader, Table } from "@/components/ui/layout";
import { can, requirePermission } from "@/lib/auth/session";
import { formatDateTime, money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { deleteDraft, issueInvoice, recordPayment, recordRefund, voidInvoice } from "@/modules/billing/actions";
import { PAYMENT_LABELS } from "@/modules/billing/queries";

export const metadata = { title: "Invoice" };

const statusTone = { paid: "ok", partial: "warn", unpaid: "danger", draft: "neutral", void: "neutral" } as const;

function MethodFields({ amount }: { amount?: number }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <Field label="Amount (₹)"><Input name="amount" inputMode="decimal" defaultValue={amount ? amount / 100 : ""} required /></Field>
      <Field label="Method">
        <Select name="method" defaultValue="cash">
          {Object.entries(PAYMENT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </Field>
      <Field label="Reference" hint="UPI ref / card slip / UTR"><Input name="reference" /></Field>
    </div>
  );
}

export default async function InvoicePage({ params }: PageProps<"/billing/invoices/[id]">) {
  const session = await requirePermission("billing.read");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: inv }, { data: totals }] = await Promise.all([
    supabase
      .from("invoices")
      .select("*, patient:patients(id, full_name, mrn, phone), invoice_items(*), payments(*, staff:staff!payments_received_by_fkey(full_name)), refunds(*)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("invoice_totals").select("*").eq("invoice_id", id).maybeSingle(),
  ]);
  if (!inv || !totals) notFound();
  const balance = Number(totals.balance_paise ?? 0);
  const netPaid = Number(totals.paid_paise ?? 0) - Number(totals.refunded_paise ?? 0);
  const status = (totals.payment_status ?? "draft") as keyof typeof statusTone;

  return (
    <>
      <PageHeader
        title={inv.invoice_number ?? "Draft invoice"}
        description={
          <>
            <Link href={`/patients/${inv.patient?.id}`} className="text-brand hover:underline">{inv.patient?.full_name}</Link> · {inv.patient?.mrn}
            {inv.issued_at && <> · issued {formatDateTime(inv.issued_at)}</>}
          </>
        }
        actions={
          <>
            <Badge tone={statusTone[status]}>{status}</Badge>
            {inv.status !== "draft" && <ButtonLink href={`/billing/invoices/${id}/print`} target="_blank" variant="secondary">Print invoice</ButtonLink>}
            {inv.status === "draft" && can(session, "billing.write") && (
              <>
                <ActionButton action={issueInvoice.bind(null, id)} variant="primary">Issue</ActionButton>
                <ActionButton action={deleteDraft.bind(null, id)} confirm="Discard this draft?">Discard</ActionButton>
              </>
            )}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <Table>
            <thead><tr><th>Item</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Discount</th><th className="text-right">GST</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {[...inv.invoice_items].sort((a, b) => a.sort_order - b.sort_order).map((i) => (
                <tr key={i.id} className="tabular-nums">
                  <td>{i.description}</td>
                  <td className="text-right">{i.quantity}</td>
                  <td className="text-right">{money(i.unit_price_paise)}</td>
                  <td className="text-right">{i.discount_paise ? money(i.discount_paise) : ""}</td>
                  <td className="text-right">{i.gst_rate ? `${i.gst_rate}% · ${money(i.tax_paise)}` : "—"}</td>
                  <td className="text-right">{money(Number(i.taxable_paise) + Number(i.tax_paise))}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <dl className="mt-4 ml-auto grid w-64 grid-cols-2 gap-1 text-sm tabular-nums">
            <dt className="text-muted">Taxable</dt><dd className="text-right">{money(totals.taxable_paise)}</dd>
            <dt className="text-muted">GST</dt><dd className="text-right">{money(totals.tax_paise)}</dd>
            <dt className="font-semibold">Total</dt><dd className="text-right font-semibold">{money(totals.total_paise)}</dd>
            <dt className="text-muted">Paid</dt><dd className="text-right">{money(netPaid)}</dd>
            <dt className="font-semibold">Balance</dt><dd className="text-right font-semibold">{money(balance)}</dd>
          </dl>
          {inv.notes && <p className="mt-4 text-sm">{inv.notes}</p>}
          {inv.void_reason && inv.status === "void" && <p className="mt-4 text-sm text-danger">Voided: {inv.void_reason}</p>}

          <h2 className="mt-6 mb-2 text-sm font-semibold">Payments and refunds</h2>
          <Table>
            <thead><tr><th>When</th><th>Method</th><th>Reference</th><th>By</th><th className="text-right">Amount</th><th /></tr></thead>
            <tbody>
              {inv.payments.map((p) => (
                <tr key={p.id}>
                  <td>{formatDateTime(p.received_at)}</td><td>{PAYMENT_LABELS[p.method]}</td><td>{p.reference}</td><td>{p.staff?.full_name}</td>
                  <td className="text-right tabular-nums">{money(p.amount_paise)}</td>
                  <td className="text-right"><Link href={`/billing/invoices/${id}/print?receipt=${p.id}`} target="_blank" className="text-sm text-brand hover:underline">Receipt</Link></td>
                </tr>
              ))}
              {inv.refunds.map((r) => (
                <tr key={r.id} className="text-danger">
                  <td>{formatDateTime(r.refunded_at)}</td><td>Refund · {PAYMENT_LABELS[r.method]}</td><td>{r.reason}</td><td />
                  <td className="text-right tabular-nums">−{money(r.amount_paise)}</td><td />
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <div className="flex flex-col gap-4">
          {inv.status === "issued" && balance > 0 && can(session, "billing.write") && (
            <Card title="Record payment">
              <ActionForm action={recordPayment.bind(null, id)} resetOnSuccess>
                <MethodFields amount={balance} />
                <SubmitButton>Record payment</SubmitButton>
              </ActionForm>
            </Card>
          )}
          {inv.status === "issued" && netPaid > 0 && can(session, "billing.refund") && (
            <Card title="Refund">
              <ActionForm action={recordRefund.bind(null, id)} resetOnSuccess>
                <MethodFields />
                <Field label="Reason"><Input name="reason" required /></Field>
                <SubmitButton variant="danger">Record refund</SubmitButton>
              </ActionForm>
            </Card>
          )}
          {inv.status === "issued" && netPaid === 0 && can(session, "billing.refund") && (
            <Card title="Void invoice">
              <ActionForm action={voidInvoice.bind(null, id)}>
                <Field label="Reason"><Input name="reason" required /></Field>
                <SubmitButton variant="danger">Void</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
