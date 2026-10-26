"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fromError, fromZod, formObject, type ActionState } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { clinicTimeToUtc } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { enqueueForPatient } from "@/modules/messages/enqueue";
import { slotsForDay } from "./slots";

const bookSchema = z.object({
  patient_id: z.string().uuid("Pick a patient"),
  doctor_id: z.string().uuid("Pick a doctor"),
  specialty_id: z.string().uuid().optional(),
  room_id: z.string().uuid().optional(),
  date: z.string().date("Pick a date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Pick a time"),
  duration: z.coerce.number().int().min(5).max(480).default(15),
  visit_type: z.enum(["new", "follow_up", "procedure"]).default("new"),
  source: z.enum(["front_desk", "phone", "walk_in", "online", "patient_app"]).default("front_desk"),
  reason: z.string().trim().max(500).optional(),
  check_in_now: z.literal("on").optional(),
});

export async function bookAppointment(_: ActionState, formData: FormData): Promise<ActionState> {
  let id: string;
  try {
    const session = await assertPermission("appointments.write");
    const parsed = bookSchema.safeParse(formObject(formData));
    if (!parsed.success) return fromZod(parsed.error);
    const v = parsed.data;
    const starts = clinicTimeToUtc(v.date, v.time);
    const ends = new Date(starts.getTime() + v.duration * 60_000);
    const supabase = await createClient();

    const { data: onLeave } = await supabase
      .from("doctor_leaves")
      .select("id")
      .eq("doctor_id", v.doctor_id)
      .lte("starts_on", v.date)
      .gte("ends_on", v.date)
      .limit(1);
    if (onLeave?.length) return { ok: false, message: "The doctor is on leave that day." };

    const { data, error } = await supabase
      .from("appointments")
      .insert({
        clinic_id: session.clinicId,
        patient_id: v.patient_id,
        doctor_id: v.doctor_id,
        specialty_id: v.specialty_id ?? null,
        room_id: v.room_id ?? null,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        visit_type: v.visit_type,
        source: v.check_in_now ? "walk_in" : v.source,
        reason: v.reason ?? null,
      })
      .select("id, doctor:staff!appointments_doctor_id_fkey(full_name)")
      .single();
    if (error) return fromError(error);
    id = data.id;

    if (v.check_in_now) {
      const { error: ciError } = await supabase.rpc("check_in", { p_appointment: id });
      if (ciError) return fromError(ciError);
    } else {
      await enqueueForPatient({
        clinicId: session.clinicId,
        patientId: v.patient_id,
        key: "appointment_booked",
        context: { doctor_name: data.doctor?.full_name ?? "", starts_at: starts.toISOString() },
        relatedEntity: "appointment",
        relatedId: id,
      });
    }
    revalidatePath("/calendar");
    revalidatePath("/queue");
    if (v.check_in_now) redirect("/queue");
  } catch (e) {
    return fromError(e);
  }
  redirect(`/calendar?date=${formData.get("date")}&appointment=${id}`);
}

const rescheduleSchema = z.object({
  date: z.string().date(),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  duration: z.coerce.number().int().min(5).max(480),
  doctor_id: z.string().uuid(),
  room_id: z.string().uuid().optional(),
});

export async function rescheduleAppointment(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await assertPermission("appointments.write");
    const parsed = rescheduleSchema.safeParse(formObject(formData));
    if (!parsed.success) return fromZod(parsed.error);
    const v = parsed.data;
    const starts = clinicTimeToUtc(v.date, v.time);
    const supabase = await createClient();
    const { error } = await supabase
      .from("appointments")
      .update({
        starts_at: starts.toISOString(),
        ends_at: new Date(starts.getTime() + v.duration * 60_000).toISOString(),
        doctor_id: v.doctor_id,
        room_id: v.room_id ?? null,
      })
      .eq("id", id);
    if (error) return fromError(error);
    revalidatePath("/calendar");
    return { ok: true, message: "Moved." };
  } catch (e) {
    return fromError(e);
  }
}

export async function cancelAppointment(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await assertPermission("appointments.write");
    const reason = String(formData.get("reason") ?? "").trim();
    if (!reason) return { ok: false, message: "Give a reason." };
    const supabase = await createClient();
    const { error } = await supabase.from("appointments").update({ status: "cancelled", cancel_reason: reason }).eq("id", id);
    if (error) return fromError(error);
    revalidatePath("/calendar");
    revalidatePath("/queue");
    return { ok: true, message: "Cancelled." };
  } catch (e) {
    return fromError(e);
  }
}

type Status = "scheduled" | "confirmed" | "checked_in" | "in_consultation" | "completed" | "no_show";

export async function setAppointmentStatus(id: string, status: Status): Promise<ActionState> {
  try {
    await assertPermission("queue.manage");
    const supabase = await createClient();
    const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
    if (error) return fromError(error);
    revalidatePath("/calendar");
    revalidatePath("/queue");
    return { ok: true };
  } catch (e) {
    return fromError(e);
  }
}

export async function checkIn(id: string): Promise<ActionState> {
  try {
    await assertPermission("queue.manage");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("check_in", { p_appointment: id });
    if (error) return fromError(error);
    revalidatePath("/queue");
    revalidatePath("/calendar");
    return { ok: true, message: `Token ${data?.[0]?.token_number}` };
  } catch (e) {
    return fromError(e);
  }
}

/** Doctor opens the consultation for an appointment. */
export async function startConsultation(appointmentId: string) {
  let encounterId: string;
  try {
    await assertPermission("clinical.write");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("start_encounter", { p_appointment: appointmentId });
    if (error || !data) return fromError(error ?? new Error("Could not start the visit"));
    encounterId = data;
    revalidatePath("/queue");
  } catch (e) {
    return fromError(e);
  }
  redirect(`/visits/${encounterId}`);
}

/** Free slots for the booking form. */
export async function findSlots(doctorId: string, date: string) {
  await assertPermission("appointments.read");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const supabase = await createClient();
  const dayStart = clinicTimeToUtc(date, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600_000);
  const [{ data: schedules }, { data: busy }, { data: leaves }] = await Promise.all([
    supabase.from("doctor_schedules").select("weekday, start_time, end_time, slot_minutes").eq("doctor_id", doctorId),
    supabase
      .from("appointments")
      .select("starts_at, ends_at")
      .eq("doctor_id", doctorId)
      .gte("starts_at", dayStart.toISOString())
      .lt("starts_at", dayEnd.toISOString())
      .not("status", "in", "(cancelled,no_show)")
      .is("deleted_at", null),
    supabase.from("doctor_leaves").select("starts_on, ends_on").eq("doctor_id", doctorId).lte("starts_on", date).gte("ends_on", date),
  ]);
  return slotsForDay(date, schedules ?? [], busy ?? [], leaves ?? []).map((s) => ({
    start: s.start.toISOString(),
    minutes: Math.round((s.end.getTime() - s.start.getTime()) / 60_000),
    free: s.free,
  }));
}
