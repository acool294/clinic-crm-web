import { supabase } from '@/lib/supabase';

export interface StaffRow {
  id: string;
  clinic_id: string;
  name: string;
  role: 'admin' | 'doctor' | 'receptionist' | 'nurse';
  email: string | null;
  specialization: string | null;
  created_at: string;
}

export interface VisitRecordRow {
  id: string;
  clinic_id: string;
  appointment_id: string;
  notes: string | null;
  chief_complaint: string | null;
  diagnosis: string | null;
  treatment_plan: string | null;
  vitals: Record<string, string> | null;
  created_at: string;
}

export interface PrescriptionRow {
  id: string;
  clinic_id: string;
  visit_record_id: string;
  medication: string;
  dosage: string;
  created_at: string;
}

export interface LabReportRow {
  id: string;
  clinic_id: string;
  visit_record_id: string | null;
  patient_id: string;
  file_name: string;
  file_url: string | null;
  report_type: string | null;
  uploaded_by_staff_id: string | null;
  uploaded_at: string;
}

/** Fetch all staff for current clinic */
export async function fetchStaff(): Promise<StaffRow[]> {
  const { data, error } = await supabase
    .from('staff_users')
    .select('*')
    .order('name');
  if (error) throw error;
  return (data ?? []) as StaffRow[];
}

/** Save a full visit record with vitals, prescriptions */
export async function saveVisitRecord(input: {
  appointment_id: string;
  notes?: string;
  chief_complaint?: string;
  diagnosis?: string;
  treatment_plan?: string;
  vitals?: Record<string, string>;
  prescriptions?: { medication: string; dosage: string }[];
}): Promise<VisitRecordRow> {
  const { data: staffData, error: staffError } = await supabase
    .from('staff_users')
    .select('clinic_id')
    .single();
  if (staffError || !staffData) throw staffError ?? new Error('Could not get clinic');
  const clinicId = (staffData as { clinic_id: string }).clinic_id;

  const { data: visitData, error: visitError } = await supabase
    .from('visit_records')
    .insert({
      appointment_id: input.appointment_id,
      clinic_id: clinicId,
      notes: input.notes,
      chief_complaint: input.chief_complaint,
      diagnosis: input.diagnosis,
      treatment_plan: input.treatment_plan,
      vitals: input.vitals,
    })
    .select()
    .single();
  if (visitError || !visitData) throw visitError ?? new Error('Failed to save visit record');

  const visit = visitData as VisitRecordRow;

  // Insert prescriptions if any
  if (input.prescriptions?.length) {
    const { error: rxError } = await supabase.from('prescriptions').insert(
      input.prescriptions.map((p) => ({
        visit_record_id: visit.id,
        clinic_id: clinicId,
        medication: p.medication,
        dosage: p.dosage,
      }))
    );
    if (rxError) throw rxError;
  }

  return visit;
}

/** Fetch visit records for a patient (via their appointments) */
export async function fetchPatientVisits(patientId: string): Promise<VisitRecordRow[]> {
  const { data, error } = await supabase
    .from('visit_records')
    .select(`
      *,
      appointments!inner(
        clinic_patient_links!inner(patient_id)
      )
    `)
    .eq('appointments.clinic_patient_links.patient_id', patientId)
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data ?? []) as VisitRecordRow[];
}

/** Fetch clinic summary stats for dashboard */
export async function fetchDashboardStats(): Promise<{
  todayAppointments: number;
  pendingInvoices: number;
  outstandingAmount: number;
  newPatientsThisMonth: number;
  staffCount: number;
}> {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

  const [apptRes, invoiceRes, patientsRes, staffRes] = await Promise.all([
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .gte('scheduled_at', startOfDay)
      .lt('scheduled_at', endOfDay),
    supabase
      .from('invoices')
      .select('amount, paid')
      .neq('status', 'paid'),
    supabase
      .from('clinic_patient_links')
      .select('id', { count: 'exact', head: true })
      .gte('linked_at', startOfMonth),
    supabase
      .from('staff_users')
      .select('id', { count: 'exact', head: true }),
  ]);

  const invoices = (invoiceRes.data ?? []) as { amount: number; paid: number }[];
  const outstanding = invoices.reduce((s, i) => s + (i.amount - (i.paid ?? 0)), 0);

  return {
    todayAppointments: apptRes.count ?? 0,
    pendingInvoices: invoices.length,
    outstandingAmount: outstanding,
    newPatientsThisMonth: patientsRes.count ?? 0,
    staffCount: staffRes.count ?? 0,
  };
}
