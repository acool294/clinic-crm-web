import { supabase } from '@/lib/supabase';

export interface AppointmentRow {
  id: string;
  clinic_id: string;
  clinic_patient_link_id: string;
  doctor_id: string;
  scheduled_at: string;
  duration_minutes: number;
  appointment_type: string | null;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  reminder_sent: boolean;
  follow_up_date: string | null;
  created_at: string;
}

export interface AppointmentWithDetails extends AppointmentRow {
  patient_name: string;
  patient_id: string;
  doctor_name: string;
}

/** Fetch all appointments for current staff's clinic, with patient and doctor names */
export async function fetchAppointments(): Promise<AppointmentWithDetails[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      *,
      clinic_patient_links!inner(
        patient_id,
        patients!inner(id, name)
      ),
      staff_users!doctor_id(id, name)
    `)
    .order('scheduled_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const link = r['clinic_patient_links'] as { patient_id: string; patients: { id: string; name: string } };
    const doctor = r['staff_users'] as { id: string; name: string } | null;
    return {
      ...(r as unknown as AppointmentRow),
      patient_name: link?.patients?.name ?? 'Unknown',
      patient_id: link?.patients?.id ?? '',
      doctor_name: doctor?.name ?? 'Unknown',
    };
  });
}

/** Create a new appointment */
export async function createAppointment(input: {
  clinic_patient_link_id: string;
  doctor_id: string;
  scheduled_at: string;
  duration_minutes: number;
  appointment_type?: string;
}): Promise<AppointmentRow> {
  const { data: staffData, error: staffError } = await supabase
    .from('staff_users')
    .select('clinic_id')
    .single();
  if (staffError || !staffData) throw staffError ?? new Error('Could not get clinic');

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      ...input,
      clinic_id: (staffData as { clinic_id: string }).clinic_id,
      status: 'scheduled',
    })
    .select()
    .single();
  if (error) throw error;
  return data as AppointmentRow;
}

/** Update appointment status */
export async function updateAppointmentStatus(
  id: string,
  status: AppointmentRow['status']
): Promise<void> {
  const { error } = await supabase.from('appointments').update({ status }).eq('id', id);
  if (error) throw error;
}

/** Fetch today's appointments count */
export async function fetchTodayAppointmentCount(): Promise<number> {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
  const { count, error } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .gte('scheduled_at', start)
    .lt('scheduled_at', end);
  if (error) return 0;
  return count ?? 0;
}
