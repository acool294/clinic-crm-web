import "server-only";
import type { Db } from "@/lib/supabase/server";

/** Services that fit a visit, most specific first (doctor + department + visit type). */
export async function suggestServices(supabase: Db, visit: { doctor_id: string | null; specialty_id: string | null; visit_type: string | null }) {
  const { data } = await supabase.from("services").select("id, name, price_paise, gst_rate, doctor_id, specialty_id, visit_type, category").eq("is_active", true);
  const fits = (data ?? []).filter(
    (s) =>
      s.category === "consultation" &&
      (!s.doctor_id || s.doctor_id === visit.doctor_id) &&
      (!s.specialty_id || s.specialty_id === visit.specialty_id) &&
      (!s.visit_type || s.visit_type === visit.visit_type),
  );
  const score = (s: (typeof fits)[number]) => Number(!!s.doctor_id) * 4 + Number(!!s.specialty_id) * 2 + Number(!!s.visit_type);
  return fits.sort((a, b) => score(b) - score(a));
}

export const PAYMENT_LABELS = { cash: "Cash", upi: "UPI", card: "Card", bank_transfer: "Bank transfer", other: "Other" } as const;
