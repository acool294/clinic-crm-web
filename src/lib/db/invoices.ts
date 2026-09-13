import { supabase } from '@/lib/supabase';

export interface InvoiceRow {
  id: string;
  clinic_id: string;
  clinic_patient_link_id: string;
  subtotal: number | null;
  discount_percent: number;
  discount_amount: number;
  amount: number;
  paid: number;
  status: 'pending' | 'partial' | 'paid';
  notes: string | null;
  created_at: string;
}

export interface InvoiceWithPatient extends InvoiceRow {
  patient_name: string;
  patient_id: string;
}

export interface PaymentRow {
  id: string;
  clinic_id: string;
  invoice_id: string;
  amount: number;
  method: string;
  recorded_by_staff_id: string;
  created_at: string;
}

/** Fetch all invoices with patient names */
export async function fetchInvoices(): Promise<InvoiceWithPatient[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select(`
      *,
      clinic_patient_links!inner(
        patients!inner(id, name)
      )
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const link = r['clinic_patient_links'] as { patients: { id: string; name: string } };
    return {
      ...(r as unknown as InvoiceRow),
      patient_name: link?.patients?.name ?? 'Unknown',
      patient_id: link?.patients?.id ?? '',
    };
  });
}

/** Create a new invoice */
export async function createInvoice(input: {
  clinic_patient_link_id: string;
  subtotal: number;
  discount_percent: number;
  discount_amount: number;
  amount: number;
  notes?: string;
}): Promise<InvoiceRow> {
  const { data: staffData, error: staffError } = await supabase
    .from('staff_users')
    .select('clinic_id')
    .single();
  if (staffError || !staffData) throw staffError ?? new Error('Could not get clinic');

  const { data, error } = await supabase
    .from('invoices')
    .insert({
      ...input,
      clinic_id: (staffData as { clinic_id: string }).clinic_id,
      paid: 0,
      status: 'pending',
    })
    .select()
    .single();
  if (error) throw error;
  return data as InvoiceRow;
}

/** Record a payment against an invoice */
export async function recordPayment(input: {
  invoice_id: string;
  amount: number;
  method: string;
  staff_id: string;
}): Promise<void> {
  const { data: staffData, error: staffError } = await supabase
    .from('staff_users')
    .select('clinic_id')
    .single();
  if (staffError || !staffData) throw staffError ?? new Error('Could not get clinic');

  const clinicId = (staffData as { clinic_id: string }).clinic_id;

  // Insert payment record
  const { error: payError } = await supabase.from('payments').insert({
    invoice_id: input.invoice_id,
    clinic_id: clinicId,
    amount: input.amount,
    method: input.method,
    recorded_by_staff_id: input.staff_id,
  });
  if (payError) throw payError;

  // Fetch current invoice to compute new paid amount and status
  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .select('amount, paid')
    .eq('id', input.invoice_id)
    .single();
  if (invError || !invoice) throw invError ?? new Error('Invoice not found');

  const inv = invoice as { amount: number; paid: number };
  const newPaid = (inv.paid ?? 0) + input.amount;
  const newStatus = newPaid >= inv.amount ? 'paid' : newPaid > 0 ? 'partial' : 'pending';

  const { error: updateError } = await supabase
    .from('invoices')
    .update({ paid: newPaid, status: newStatus })
    .eq('id', input.invoice_id);
  if (updateError) throw updateError;
}

/** Fetch pending invoice count and total outstanding */
export async function fetchInvoiceSummary(): Promise<{ pendingCount: number; outstanding: number }> {
  const { data, error } = await supabase
    .from('invoices')
    .select('amount, paid, status')
    .neq('status', 'paid');
  if (error) return { pendingCount: 0, outstanding: 0 };
  const rows = (data ?? []) as { amount: number; paid: number; status: string }[];
  return {
    pendingCount: rows.length,
    outstanding: rows.reduce((sum, r) => sum + (r.amount - (r.paid ?? 0)), 0),
  };
}
