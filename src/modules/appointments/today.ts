import "server-only";
import { clinicDayRange, todayInClinic } from "@/lib/format";
import type { Db } from "@/lib/supabase/server";

export async function todaysAppointments(supabase: Db, opts: { doctorId?: string; specialtyId?: string } = {}) {
  const { start, end } = clinicDayRange(todayInClinic());
  let q = supabase
    .from("appointments")
    .select("*, patient:patients(id, full_name, mrn, dob, sex), doctor:staff!appointments_doctor_id_fkey(full_name), room:rooms(name), queue_tokens(token_number), encounters(id)")
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .is("deleted_at", null)
    .order("starts_at");
  if (opts.doctorId) q = q.eq("doctor_id", opts.doctorId);
  if (opts.specialtyId) q = q.eq("specialty_id", opts.specialtyId);
  const { data } = await q;
  return data ?? [];
}

export function waitMinutes(checkedInAt: string | null, now = Date.now()) {
  return checkedInAt ? Math.max(Math.round((now - new Date(checkedInAt).getTime()) / 60_000), 0) : 0;
}
