"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fromError, fromZod, formObject, type ActionState } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { money, rupeesToPaise } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { enqueueForPatient } from "@/modules/messages/enqueue";

const itemSchema = z.object({
  service_id: z.string().uuid().optional(),
  description: z.string().trim().min(1, "Describe the item").max(200),
  quantity: z.number().int().min(1).max(1000),
  unit_price_paise: z.number().int().min(0),
  discount_paise: z.number().int().min(0),
  gst_rate: z.number().refine((v) => [0, 5, 12, 18, 28].includes(v)),
});

const invoiceSchema = z.object({
  patient_id: z.string().uuid("Pick a patient"),
  appointment_id: z.string().uuid().optional(),
  encounter_id: z.string().uuid().optional(),
  notes: z.string().trim().max(500).optional(),
  issue: z.boolean(),
  items: z
    .array(itemSchema)
    .min(1, "Add at least one item")
    .refine((items) => items.every((i) => i.discount_paise <= i.quantity * i.unit_price_paise), "A discount is larger than its line"),
});

export type InvoiceInput = z.infer<typeof invoiceSchema>;

export async function createInvoice(input: InvoiceInput): Promise<ActionState> {
  let id: string;
  try {
    await assertPermission("billing.write");
    const parsed = invoiceSchema.safeParse(input);
    if (!parsed.success) return fromZod(parsed.error);
    const v = parsed.data;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_invoice", {
      p_patient: v.patient_id,
      p_items: v.items,
      p_issue: v.issue,
      p_encounter: v.encounter_id ?? null,
      p_appointment: v.appointment_id ?? null,
      p_notes: v.notes ?? null,
    });
    if (error || !data) return fromError(error);
    id = data;
    revalidatePath("/billing");
  } catch (e) {
    return fromError(e);
  }
  redirect(`/billing/invoices/${id}`);
}

export async function issueInvoice(id: string): Promise<ActionState> {
  try {
    await assertPermission("billing.write");
    const supabase = await createClient();
    const { error } = await supabase.from("invoices").update({ status: "issued" }).eq("id", id);
    if (error) return fromError(error);
    revalidatePath(`/billing/invoices/${id}`);
    return { ok: true };
  } catch (e) {
    return fromError(e);
  }
}

export async function deleteDraft(id: string): Promise<ActionState> {
  try {
    await assertPermission("billing.write");
    const supabase = await createClient();
    const { error } = await supabase.from("invoices").update({ status: "void", void_reason: "Draft discarded" }).eq("id", id).eq("status", "draft");
    if (error) return fromError(error);
  } catch (e) {
    return fromError(e);
  }
  revalidatePath("/billing");
  redirect("/billing");
}

const paymentSchema = z.object({
  amount: z.string().min(1, "Enter the amount"),
  method: z.enum(["cash", "upi", "card", "bank_transfer", "other"]),
  reference: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(300).optional(),
});

export async function recordPayment(invoiceId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await assertPermission("billing.write");
    const parsed = paymentSchema.safeParse(formObject(formData));
    if (!parsed.success) return fromZod(parsed.error);
    const amount = rupeesToPaise(parsed.data.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, fieldErrors: { amount: ["Enter an amount in rupees"] } };
    if (parsed.data.method !== "cash" && parsed.data.method !== "other" && !parsed.data.reference) {
      return { ok: false, fieldErrors: { reference: ["Enter the UPI / card / transfer reference"] } };
    }
    const supabase = await createClient();
    const { data: inv } = await supabase.from("invoices").select("patient_id, invoice_number").eq("id", invoiceId).single();
    const { data: payment, error } = await supabase
      .from("payments")
      .insert({
        clinic_id: session.clinicId,
        invoice_id: invoiceId,
        amount_paise: amount,
        method: parsed.data.method,
        reference: parsed.data.reference ?? null,
        notes: parsed.data.notes ?? null,
      })
      .select("id")
      .single();
    if (error) return fromError(error);
    if (inv) {
      await enqueueForPatient({
        clinicId: session.clinicId,
        patientId: inv.patient_id,
        key: "receipt",
        context: { amount: money(amount), invoice_number: inv.invoice_number },
        relatedEntity: "payment",
        relatedId: payment.id,
      });
    }
    revalidatePath(`/billing/invoices/${invoiceId}`);
    return { ok: true, message: `Received ${money(amount)}.` };
  } catch (e) {
    return fromError(e);
  }
}

const refundSchema = paymentSchema.extend({ reason: z.string().trim().min(3, "Give a reason").max(300) });

export async function recordRefund(invoiceId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await assertPermission("billing.refund");
    const parsed = refundSchema.safeParse(formObject(formData));
    if (!parsed.success) return fromZod(parsed.error);
    const amount = rupeesToPaise(parsed.data.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, fieldErrors: { amount: ["Enter an amount in rupees"] } };
    const supabase = await createClient();
    const { error } = await supabase.from("refunds").insert({
      clinic_id: session.clinicId,
      invoice_id: invoiceId,
      amount_paise: amount,
      method: parsed.data.method,
      reference: parsed.data.reference ?? null,
      reason: parsed.data.reason,
    });
    if (error) return fromError(error);
    revalidatePath(`/billing/invoices/${invoiceId}`);
    return { ok: true, message: `Refunded ${money(amount)}.` };
  } catch (e) {
    return fromError(e);
  }
}

export async function voidInvoice(invoiceId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await assertPermission("billing.refund");
    const reason = String(formData.get("reason") ?? "").trim();
    if (reason.length < 3) return { ok: false, message: "Give a reason for voiding." };
    const supabase = await createClient();
    const { error } = await supabase.from("invoices").update({ status: "void", void_reason: reason }).eq("id", invoiceId);
    if (error) return fromError(error);
    revalidatePath(`/billing/invoices/${invoiceId}`);
    return { ok: true, message: "Invoice voided." };
  } catch (e) {
    return fromError(e);
  }
}

export async function closeCashDay(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await assertPermission("billing.close");
    const date = z.string().date().safeParse(formData.get("date"));
    const counted = rupeesToPaise(String(formData.get("counted") ?? ""));
    if (!date.success) return { ok: false, message: "Pick the date." };
    if (!Number.isFinite(counted) || counted < 0) return { ok: false, message: "Enter the cash you counted." };
    const supabase = await createClient();
    const { error } = await supabase.rpc("close_cash_day", {
      p_date: date.data,
      p_counted_cash_paise: counted,
      p_notes: String(formData.get("notes") ?? "") || null,
    });
    if (error) return fromError(error.code === "23505" ? { ...error, message: "This day is already closed." } : error);
    revalidatePath("/billing/cash");
    return { ok: true, message: "Day closed." };
  } catch (e) {
    return fromError(e);
  }
}
