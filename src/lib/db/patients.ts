import { supabase } from '@/lib/supabase';

export interface PatientRow {
  id: string;
  auth_user_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  dob: string | null;
  gender: 'Male' | 'Female' | 'Other' | null;
  address: string | null;
  blood_group: string | null;
  alternate_phone: string | null;
  insurance_provider: string | null;
  is_insured: boolean;
  created_at: string;
}

export interface PatientWithLink extends PatientRow {
  clinic_patient_links: { id: string; clinic_id: string; linked_at: string }[];
}

/** Fetch all patients linked to the current staff's clinic */
export async function fetchPatients(): Promise<PatientRow[]> {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .order('name');
  if (error) throw error;
  return (data ?? []) as PatientRow[];
}

/** Create a new patient and link them to the current staff's clinic */
export async function createPatient(
  input: Omit<PatientRow, 'id' | 'auth_user_id' | 'created_at'>
): Promise<PatientRow> {
  const { data: staffData, error: staffError } = await supabase
    .from('staff_users')
    .select('clinic_id')
    .single();
  if (staffError || !staffData) throw staffError ?? new Error('Could not get clinic');

  const clinicId: string = (staffData as { clinic_id: string }).clinic_id;

  // Generate UUID client-side to avoid RLS select() blocking before link is created
  const newId = crypto.randomUUID();

  // Insert patient WITHOUT .select()
  const { error: patientError } = await supabase
    .from('patients')
    .insert({ id: newId, ...input });
  if (patientError) throw patientError;

  // Link patient to clinic
  const { error: linkError } = await supabase
    .from('clinic_patient_links')
    .insert({ patient_id: newId, clinic_id: clinicId });
  if (linkError) throw linkError;

  return {
    id: newId,
    auth_user_id: null,
    created_at: new Date().toISOString(),
    ...input
  };
}

/** Update a patient record */
export async function updatePatient(
  id: string,
  updates: Partial<Omit<PatientRow, 'id' | 'auth_user_id' | 'created_at'>>
): Promise<void> {
  const { error } = await supabase.from('patients').update(updates).eq('id', id);
  if (error) throw error;
}

/** Get a single patient by ID */
export async function fetchPatient(id: string): Promise<PatientRow | null> {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data as PatientRow;
}
