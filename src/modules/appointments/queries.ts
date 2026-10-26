import "server-only";
import type { Db } from "@/lib/supabase/server";

export async function loadDoctors(supabase: Db) {
  const { data } = await supabase
    .from("staff")
    .select("id, full_name, staff_roles!inner(role), doctor_specialties(specialty_id, is_primary)")
    .eq("staff_roles.role", "doctor")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("full_name");
  return (data ?? []).map((d) => ({
    id: d.id,
    name: d.full_name,
    specialties: [...d.doctor_specialties].sort((a, b) => Number(b.is_primary) - Number(a.is_primary)).map((s) => s.specialty_id),
  }));
}

export const STATUS_LABELS = {
  scheduled: "Booked",
  confirmed: "Confirmed",
  checked_in: "Waiting",
  in_consultation: "With doctor",
  completed: "Done",
  cancelled: "Cancelled",
  no_show: "No-show",
} as const;

export const STATUS_TONES = {
  scheduled: "neutral",
  confirmed: "brand",
  checked_in: "warn",
  in_consultation: "brand",
  completed: "ok",
  cancelled: "neutral",
  no_show: "danger",
} as const;
