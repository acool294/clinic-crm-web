"use client";

import { Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { money, rupeesToPaise } from "@/lib/format";
import { PatientPicker } from "@/modules/patients/patient-picker";
import { createInvoice } from "./actions";

export interface ServiceOption {
  id: string;
  name: string;
  price_paise: number;
  gst_rate: number;
}

interface Line {
  service_id?: string;
  description: string;
  quantity: number;
  price: string; // rupees as typed
  discount: string;
  gst_rate: number;
}

function lineTotals(l: Line) {
  const gross = l.quantity * (rupeesToPaise(l.price) || 0);
  const taxable = gross - (rupeesToPaise(l.discount) || 0);
  const tax = Math.round((taxable * l.gst_rate) / 100);
  return { gross, taxable, tax, total: taxable + tax };
}

export function InvoiceBuilder({
  services,
  patient,
  appointmentId,
  encounterId,
  suggested,
}: {
  services: ServiceOption[];
  patient?: { id: string; full_name: string; mrn: string };
  appointmentId?: string;
  encounterId?: string;
  suggested: ServiceOption[];
}) {
  const fromService = (s: ServiceOption): Line => ({
    service_id: s.id,
    description: s.name,
    quantity: 1,
    price: String(s.price_paise / 100),
    discount: "",
    gst_rate: s.gst_rate,
  });
  const [lines, setLines] = useState<Line[]>(suggested.slice(0, 1).map(fromService));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const totals = useMemo(
    () => lines.map(lineTotals).reduce((a, t) => ({ taxable: a.taxable + t.taxable, tax: a.tax + t.tax, total: a.total + t.total }), { taxable: 0, tax: 0, total: 0 }),
    [lines],
  );
  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)));

  function submit(form: HTMLFormElement, issue: boolean) {
    const patientId = new FormData(form).get("patient_id");
    if (typeof patientId !== "string" || !patientId) {
      setError("Pick a patient.");
      return;
    }
    start(async () => {
      const r = await createInvoice({
        patient_id: patientId,
        appointment_id: appointmentId,
        encounter_id: encounterId,
        notes: notes || undefined,
        issue,
        items: lines.map((l) => ({
          service_id: l.service_id,
          description: l.description,
          quantity: l.quantity,
          unit_price_paise: rupeesToPaise(l.price) || 0,
          discount_paise: rupeesToPaise(l.discount) || 0,
          gst_rate: l.gst_rate,
        })),
      });
      if (r && !r.ok) setError(r.message ?? "Could not save the invoice.");
    });
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-4">
      <Field label="Patient"><PatientPicker initial={patient} /></Field>

      <div className="flex flex-wrap items-end gap-2">
        <Field label="Add a service" className="min-w-64 flex-1">
          <Select
            value=""
            onChange={(e) => {
              const s = services.find((x) => x.id === e.target.value);
              if (s) setLines((ls) => [...ls, fromService(s)]);
            }}
          >
            <option value="">Choose…</option>
            {suggested.length > 0 && (
              <optgroup label="For this visit">
                {suggested.map((s) => <option key={`s-${s.id}`} value={s.id}>{s.name} · {money(s.price_paise)}</option>)}
              </optgroup>
            )}
            <optgroup label="All services">
              {services.map((s) => <option key={s.id} value={s.id}>{s.name} · {money(s.price_paise)}</option>)}
            </optgroup>
          </Select>
        </Field>
        <Button type="button" variant="secondary" onClick={() => setLines((ls) => [...ls, { description: "", quantity: 1, price: "", discount: "", gst_rate: 0 }])}>
          Add custom line
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr><th className="py-1">Item</th><th>Qty</th><th>Price ₹</th><th>Discount ₹</th><th>GST</th><th className="text-right">Amount</th><th /></tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const t = lineTotals(l);
              return (
                <tr key={i} className="border-t border-line">
                  <td className="py-1.5 pr-2"><Input value={l.description} onChange={(e) => update(i, { description: e.target.value })} className="h-8 min-w-56" /></td>
                  <td className="pr-2"><Input type="number" min={1} value={l.quantity} onChange={(e) => update(i, { quantity: Math.max(1, Number(e.target.value) || 1) })} className="h-8 w-16" /></td>
                  <td className="pr-2"><Input inputMode="decimal" value={l.price} onChange={(e) => update(i, { price: e.target.value })} className="h-8 w-24" /></td>
                  <td className="pr-2"><Input inputMode="decimal" value={l.discount} onChange={(e) => update(i, { discount: e.target.value })} className="h-8 w-24" /></td>
                  <td className="pr-2">
                    <Select value={l.gst_rate} onChange={(e) => update(i, { gst_rate: Number(e.target.value) })} className="h-8 w-20">
                      {[0, 5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}%</option>)}
                    </Select>
                  </td>
                  <td className="text-right tabular-nums">{money(t.total)}</td>
                  <td><button type="button" onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))} className="p-1.5 text-muted hover:text-danger" aria-label="Remove"><Trash2 className="size-4" /></button></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="text-sm">
            <tr><td colSpan={5} className="pt-3 text-right text-muted">Taxable</td><td className="pt-3 text-right tabular-nums">{money(totals.taxable)}</td><td /></tr>
            <tr><td colSpan={5} className="text-right text-muted">GST</td><td className="text-right tabular-nums">{money(totals.tax)}</td><td /></tr>
            <tr><td colSpan={5} className="text-right font-semibold">Total</td><td className="text-right font-semibold tabular-nums">{money(totals.total)}</td><td /></tr>
          </tfoot>
        </table>
      </div>

      <Field label="Notes on the invoice"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
      {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" disabled={pending || !lines.length} onClick={(e) => submit(e.currentTarget.form!, true)}>
          {pending ? "Saving…" : "Issue invoice"}
        </Button>
        <Button type="button" variant="secondary" disabled={pending || !lines.length} onClick={(e) => submit(e.currentTarget.form!, false)}>
          Save as draft
        </Button>
      </div>
    </form>
  );
}
