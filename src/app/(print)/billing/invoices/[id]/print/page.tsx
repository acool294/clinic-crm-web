import { notFound } from "next/navigation";
import { Letterhead, LetterheadFooter } from "@/components/print/letterhead";
import { PrintButton } from "@/components/print/print-button";
import { requirePermission } from "@/lib/auth/session";
import { formatDate, formatDateTime, money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { PAYMENT_LABELS } from "@/modules/billing/queries";
import { amountInWords } from "@/modules/billing/words";

export const metadata = { title: "Invoice" };

export default async function InvoicePrint({ params, searchParams }: PageProps<"/billing/invoices/[id]/print">) {
  await requirePermission("billing.read");
  const { id } = await params;
  const { receipt } = await searchParams;
  const supabase = await createClient();
  const [{ data: inv }, { data: totals }, { data: clinic }] = await Promise.all([
    supabase.from("invoices").select("*, patient:patients(full_name, mrn, phone, address, city), doctor:staff!invoices_doctor_id_fkey(full_name), invoice_items(*), payments(*)").eq("id", id).maybeSingle(),
    supabase.from("invoice_totals").select("*").eq("invoice_id", id).maybeSingle(),
    supabase.from("clinics").select("*").single(),
  ]);
  if (!inv || !totals || !clinic) notFound();
  await supabase.rpc("log_event", { p_action: "print", p_entity: "invoices", p_entity_id: id });

  const payment = typeof receipt === "string" ? inv.payments.find((p) => p.id === receipt) : undefined;
  const items = [...inv.invoice_items].sort((a, b) => a.sort_order - b.sort_order);
  const hasGst = Number(totals.tax_paise) > 0;

  if (payment) {
    return (
      <article className="text-sm">
        <div className="no-print mb-4"><PrintButton /></div>
        <Letterhead clinic={clinic} right={<div className="text-right"><p className="text-lg font-semibold">Receipt</p>{clinic.gstin && <p className="text-xs">GSTIN {clinic.gstin}</p>}</div>} />
        <dl className="mt-6 grid grid-cols-[10rem_1fr] gap-y-2">
          <dt className="text-muted">Received from</dt><dd className="font-medium">{inv.patient?.full_name} ({inv.patient?.mrn})</dd>
          <dt className="text-muted">Amount</dt><dd className="text-lg font-semibold">{money(payment.amount_paise)}</dd>
          <dt className="text-muted">In words</dt><dd>{amountInWords(Number(payment.amount_paise))}</dd>
          <dt className="text-muted">Against invoice</dt><dd>{inv.invoice_number}</dd>
          <dt className="text-muted">Paid by</dt><dd>{PAYMENT_LABELS[payment.method]}{payment.reference && ` · ref ${payment.reference}`}</dd>
          <dt className="text-muted">Date</dt><dd>{formatDateTime(payment.received_at)}</dd>
          <dt className="text-muted">Balance due</dt><dd>{money(totals.balance_paise)}</dd>
        </dl>
        <div className="mt-16 flex justify-end"><div className="w-48 border-t border-ink pt-1 text-center text-xs">Authorised signatory</div></div>
        <LetterheadFooter clinic={clinic} />
      </article>
    );
  }

  return (
    <article className="text-sm">
      <div className="no-print mb-4"><PrintButton /></div>
      <Letterhead
        clinic={clinic}
        right={
          <div className="text-right">
            <p className="text-lg font-semibold">{hasGst ? "Tax invoice" : "Invoice"}</p>
            <p>{inv.invoice_number}</p>
            <p className="text-xs">{formatDate(inv.issued_at)}</p>
            {clinic.gstin && <p className="text-xs">GSTIN {clinic.gstin}</p>}
          </div>
        }
      />
      <section className="mt-3 flex justify-between border-b border-line pb-3">
        <div>
          <p className="text-xs text-muted">Billed to</p>
          <p className="font-medium">{inv.patient?.full_name}</p>
          <p className="text-xs">{inv.patient?.mrn} · {inv.patient?.phone}</p>
          {inv.patient?.address && <p className="text-xs">{[inv.patient.address, inv.patient.city].filter(Boolean).join(", ")}</p>}
        </div>
        {inv.doctor && <p className="text-right text-xs">Consultant<br /><span className="text-sm font-medium">{inv.doctor.full_name}</span></p>}
      </section>
      <table className="mt-3 w-full text-xs [&_td]:py-1.5 [&_th]:py-1.5 [&_th]:text-left">
        <thead className="border-b border-ink">
          <tr><th>#</th><th>Description</th>{hasGst && <th>SAC</th>}<th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Discount</th><th className="text-right">Taxable</th>{hasGst && <th className="text-right">CGST</th>}{hasGst && <th className="text-right">SGST</th>}<th className="text-right">Amount</th></tr>
        </thead>
        <tbody>
          {items.map((i, n) => {
            const tax = Number(i.tax_paise);
            const cgst = Math.floor(tax / 2);
            return (
              <tr key={i.id} className="border-b border-line tabular-nums">
                <td>{n + 1}</td><td>{i.description}</td>{hasGst && <td>{i.sac_code}</td>}
                <td className="text-right">{i.quantity}</td><td className="text-right">{money(i.unit_price_paise)}</td>
                <td className="text-right">{i.discount_paise ? money(i.discount_paise) : ""}</td>
                <td className="text-right">{money(i.taxable_paise)}</td>
                {hasGst && <td className="text-right">{i.gst_rate ? `${Number(i.gst_rate) / 2}% ${money(cgst)}` : "—"}</td>}
                {hasGst && <td className="text-right">{i.gst_rate ? `${Number(i.gst_rate) / 2}% ${money(tax - cgst)}` : "—"}</td>}
                <td className="text-right">{money(Number(i.taxable_paise) + tax)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-3 flex justify-between gap-6">
        <p className="max-w-sm text-xs">{amountInWords(Number(totals.total_paise))}</p>
        <dl className="grid w-64 grid-cols-2 gap-1 tabular-nums">
          <dt>Taxable</dt><dd className="text-right">{money(totals.taxable_paise)}</dd>
          {hasGst && <><dt>GST</dt><dd className="text-right">{money(totals.tax_paise)}</dd></>}
          <dt className="font-semibold">Total</dt><dd className="text-right font-semibold">{money(totals.total_paise)}</dd>
          <dt>Paid</dt><dd className="text-right">{money(Number(totals.paid_paise) - Number(totals.refunded_paise))}</dd>
          <dt className="font-semibold">Balance</dt><dd className="text-right font-semibold">{money(totals.balance_paise)}</dd>
        </dl>
      </div>
      {inv.status === "void" && <p className="mt-6 text-center text-2xl font-bold text-danger">VOID</p>}
      {inv.notes && <p className="mt-4 text-xs">{inv.notes}</p>}
      <div className="mt-16 flex justify-end"><div className="w-48 border-t border-ink pt-1 text-center text-xs">Authorised signatory</div></div>
      <LetterheadFooter clinic={clinic} />
    </article>
  );
}
