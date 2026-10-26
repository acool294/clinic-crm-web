"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fromError, fromZod, formObject, type ActionState } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import type { Json } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import { isBuiltInPanel } from "./panels";
import {
  customFormSchema,
  diagnosisSchema,
  encounterSchema,
  noteSchema,
  panelSchemas,
  prescriptionSchema,
  referralSchema,
  vitalsSchema,
  type RxItem,
} from "./schemas";

async function encounterContext(encounterId: string) {
  const supabase = await createClient();
  const { data: enc, error } = await supabase
    .from("encounters")
    .select("id, clinic_id, patient_id, appointment_id, specialty_id")
    .eq("id", encounterId)
    .single();
  if (error || !enc) throw new Error("Visit not found");
  return { supabase, enc };
}

/** Autosave of the consultation text. Saves only the fields sent. */
export async function saveEncounter(encounterId: string, values: Record<string, string>): Promise<ActionState> {
  try {
    await assertPermission("clinical.write");
    const parsed = encounterSchema.partial().safeParse(values);
    if (!parsed.success) return fromZod(parsed.error);
    const patch = Object.fromEntries(Object.entries(parsed.data).filter(([k]) => k in values)) as z.infer<typeof encounterSchema>;
    const { supabase } = await encounterContext(encounterId);
    const { error } = await supabase.from("encounters").update(patch).eq("id", encounterId);
    if (error) return fromError(error);
    return { ok: true, message: "Saved" };
  } catch (e) {
    return fromError(e);
  }
}

export async function recordVitals(encounterId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await assertPermission("vitals.write");
    const parsed = vitalsSchema.safeParse(formObject(formData));
    if (!parsed.success) return fromZod(parsed.error);
    const { supabase, enc } = await encounterContext(encounterId);
    const { error } = await supabase
      .from("vitals")
      .insert({ ...parsed.data, clinic_id: enc.clinic_id, patient_id: enc.patient_id, encounter_id: encounterId });
    if (error) return fromError(error);
    revalidatePath(`/visits/${encounterId}`);
    return { ok: true, message: "Vitals recorded." };
  } catch (e) {
    return fromError(e);
  }
}

/** Vitals before the doctor opens a visit (nurse at triage), from the queue or chart. */
export async function recordPatientVitals(patientId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await assertPermission("vitals.write");
    const parsed = vitalsSchema.safeParse(formObject(formData));
    if (!parsed.success) return fromZod(parsed.error);
    const supabase = await createClient();
    const { error } = await supabase.from("vitals").insert({ ...parsed.data, clinic_id: session.clinicId, patient_id: patientId });
    if (error) return fromError(error);
    revalidatePath(`/patients/${patientId}`);
    return { ok: true, message: "Vitals recorded." };
  } catch (e) {
    return fromError(e);
  }
}

export async function addDiagnosis(encounterId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await assertPermission("clinical.write");
    const parsed = diagnosisSchema.safeParse(formObject(formData));
    if (!parsed.success) return fromZod(parsed.error);
    const { supabase, enc } = await encounterContext(encounterId);
    const { error } = await supabase
      .from("diagnoses")
      .insert({ ...parsed.data, clinic_id: enc.clinic_id, patient_id: enc.patient_id, encounter_id: encounterId });
    if (error) return fromError(error);
    revalidatePath(`/visits/${encounterId}`);
    return { ok: true };
  } catch (e) {
    return fromError(e);
  }
}

export async function removeDiagnosis(encounterId: string, diagnosisId: string): Promise<ActionState> {
  try {
    await assertPermission("clinical.write");
    const supabase = await createClient();
    const { error } = await supabase.from("diagnoses").delete().eq("id", diagnosisId);
    if (error) return fromError(error);
    revalidatePath(`/visits/${encounterId}`);
    return { ok: true };
  } catch (e) {
    return fromError(e);
  }
}

export async function searchIcd10(query: string) {
  await assertPermission("clinical.read");
  const q = query.trim();
  if (q.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("icd10_codes")
    .select("code, title")
    .or(`code.ilike.${q.replace(/[,()]/g, "")}%,title.ilike.%${q.replace(/[,()%]/g, "")}%`)
    .limit(12);
  return data ?? [];
}

export async function searchMedications(query: string) {
  const session = await assertPermission("prescriptions.write");
  const q = query.trim().replace(/[,()%]/g, "");
  if (q.length < 2) return [];
  const supabase = await createClient();
  const [{ data: meds }, { data: favs }] = await Promise.all([
    supabase
      .from("medications")
      .select("*")
      .eq("is_active", true)
      .or(`generic_name.ilike.%${q}%,brand_name.ilike.%${q}%`)
      .limit(15),
    supabase.from("medication_favourites").select("medication_id").eq("staff_id", session.staffId),
  ]);
  const favSet = new Set((favs ?? []).map((f) => f.medication_id));
  return (meds ?? [])
    .map((m) => ({ ...m, favourite: favSet.has(m.id) }))
    .sort((a, b) => Number(b.favourite) - Number(a.favourite));
}

export async function toggleFavourite(medicationId: string, on: boolean) {
  const session = await assertPermission("prescriptions.write");
  const supabase = await createClient();
  if (on) await supabase.from("medication_favourites").insert({ staff_id: session.staffId, medication_id: medicationId });
  else await supabase.from("medication_favourites").delete().eq("staff_id", session.staffId).eq("medication_id", medicationId);
}

export async function checkPrescription(encounterId: string, items: RxItem[]) {
  await assertPermission("prescriptions.write");
  const { supabase, enc } = await encounterContext(encounterId);
  const { data } = await supabase.rpc("prescription_warnings", { p_patient: enc.patient_id, p_drugs: items });
  return data ?? [];
}

export async function savePrescription(
  encounterId: string,
  input: { items: RxItem[]; notes?: string; override_reason?: string },
): Promise<ActionState & { warnings?: { drug: string; warning: string; severity: string }[] }> {
  try {
    await assertPermission("prescriptions.write");
    const parsed = prescriptionSchema.safeParse(input);
    if (!parsed.success) return fromZod(parsed.error);
    const { supabase, enc } = await encounterContext(encounterId);
    const { error } = await supabase.rpc("save_prescription", {
      p_encounter: encounterId,
      p_items: parsed.data.items,
      p_notes: parsed.data.notes ?? null,
      p_override_reason: parsed.data.override_reason ?? null,
    });
    if (error) {
      if (error.message.includes("Allergy conflict")) {
        const { data } = await supabase.rpc("prescription_warnings", { p_patient: enc.patient_id, p_drugs: parsed.data.items });
        return { ok: false, message: "This conflicts with a recorded allergy. Give a reason to prescribe anyway.", warnings: data ?? [] };
      }
      return fromError(error);
    }
    revalidatePath(`/visits/${encounterId}`);
    return { ok: true, message: "Prescription saved." };
  } catch (e) {
    return fromError(e);
  }
}

export async function addNote(encounterId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await assertPermission("clinical.write");
    const parsed = noteSchema.safeParse(formObject(formData));
    if (!parsed.success) return fromZod(parsed.error);
    const { supabase, enc } = await encounterContext(encounterId);
    const { data: locked } = await supabase.from("encounters").select("signed_at, created_at").eq("id", encounterId).single();
    const isLocked = !!locked?.signed_at || Date.now() - new Date(locked?.created_at ?? 0).getTime() > 24 * 3600_000;
    const { error } = await supabase.from("clinical_notes").insert({
      ...parsed.data,
      clinic_id: enc.clinic_id,
      patient_id: enc.patient_id,
      encounter_id: encounterId,
      specialty_id: enc.specialty_id,
      author_id: session.staffId,
      kind: isLocked ? "addendum" : "note",
    });
    if (error) return fromError(error);
    revalidatePath(`/visits/${encounterId}`);
    return { ok: true, message: isLocked ? "Addendum added." : "Note added." };
  } catch (e) {
    return fromError(e);
  }
}

export async function savePanel(
  encounterId: string,
  panelKey: string,
  data: Record<string, unknown>,
): Promise<ActionState> {
  try {
    await assertPermission("clinical.write");
    const { supabase, enc } = await encounterContext(encounterId);
    let schema: z.ZodTypeAny;
    if (isBuiltInPanel(panelKey)) {
      schema = panelSchemas[panelKey];
    } else if (panelKey.startsWith("form:")) {
      const { data: tpl } = await supabase.from("form_templates").select("fields").eq("id", panelKey.slice(5)).single();
      if (!tpl) return { ok: false, message: "That form no longer exists." };
      schema = customFormSchema(tpl.fields as { key: string; type: string; options?: string[] }[]);
    } else {
      return { ok: false, message: "Unknown panel." };
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) return fromZod(parsed.error);

    const { data: existing } = await supabase
      .from("encounter_forms")
      .select("id")
      .eq("encounter_id", encounterId)
      .eq("panel_key", panelKey)
      .maybeSingle();
    const { error } = existing
      ? await supabase.from("encounter_forms").update({ data: parsed.data as Json }).eq("id", existing.id)
      : await supabase.from("encounter_forms").insert({
          clinic_id: enc.clinic_id,
          patient_id: enc.patient_id,
          encounter_id: encounterId,
          panel_key: panelKey,
          data: parsed.data as Json,
        });
    if (error) return fromError(error);
    revalidatePath(`/visits/${encounterId}`);
    return { ok: true, message: "Saved" };
  } catch (e) {
    return fromError(e);
  }
}

const vaccineSchema = z.object({
  vaccine_code: z.string().min(2),
  given_on: z.string().date(),
  batch_number: z.string().trim().max(60).optional(),
});

export async function recordVaccination(encounterId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await assertPermission("clinical.write");
    const parsed = vaccineSchema.safeParse(formObject(formData));
    if (!parsed.success) return fromZod(parsed.error);
    const { supabase, enc } = await encounterContext(encounterId);
    const { error } = await supabase.from("patient_vaccinations").insert({
      ...parsed.data,
      clinic_id: enc.clinic_id,
      patient_id: enc.patient_id,
      encounter_id: encounterId,
    });
    if (error) return fromError(error);
    revalidatePath(`/visits/${encounterId}`);
    return { ok: true, message: "Vaccination recorded." };
  } catch (e) {
    return fromError(e);
  }
}

export async function addReferral(encounterId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await assertPermission("clinical.write");
    const parsed = referralSchema.safeParse(formObject(formData));
    if (!parsed.success) return fromZod(parsed.error);
    const { supabase, enc } = await encounterContext(encounterId);
    const { error } = await supabase.from("referrals").insert({
      ...parsed.data,
      to_doctor_id: parsed.data.to_doctor_id ?? null,
      clinic_id: enc.clinic_id,
      patient_id: enc.patient_id,
      from_encounter_id: encounterId,
    });
    if (error) return fromError(error);
    revalidatePath(`/visits/${encounterId}`);
    return { ok: true, message: "Referral sent. It shows on the receiving doctor's Today page." };
  } catch (e) {
    return fromError(e);
  }
}

export async function orderLabs(encounterId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await assertPermission("lab.write");
    const tests = formData.getAll("tests").map(String).filter((t) => z.string().uuid().safeParse(t).success);
    if (!tests.length) return { ok: false, message: "Pick at least one test." };
    const { supabase, enc } = await encounterContext(encounterId);
    const { error } = await supabase.rpc("create_lab_order", {
      p_patient: enc.patient_id,
      p_encounter: encounterId,
      p_test_ids: tests,
      p_notes: String(formData.get("notes") ?? "") || null,
    });
    if (error) return fromError(error);
    revalidatePath(`/visits/${encounterId}`);
    return { ok: true, message: "Tests ordered." };
  } catch (e) {
    return fromError(e);
  }
}

/** Sign the visit (locks it) and mark the appointment done. */
export async function signEncounter(encounterId: string): Promise<ActionState> {
  try {
    await assertPermission("clinical.write");
    const { supabase, enc } = await encounterContext(encounterId);
    const { error } = await supabase.from("encounters").update({ signed_at: new Date().toISOString() }).eq("id", encounterId);
    if (error) return fromError(error);
    if (enc.appointment_id) {
      await supabase.from("appointments").update({ status: "completed" }).eq("id", enc.appointment_id).in("status", ["checked_in", "in_consultation"]);
    }
    revalidatePath(`/visits/${encounterId}`);
    revalidatePath("/queue");
    return { ok: true, message: "Visit signed and locked." };
  } catch (e) {
    return fromError(e);
  }
}

/** Unscheduled visit from the patient chart (e.g. a quick review). */
export async function startWalkInVisit(patientId: string, specialtyId: string | null) {
  const session = await assertPermission("clinical.write");
  const supabase = await createClient();
  let specialty = specialtyId;
  if (!specialty) {
    const { data: primary } = await supabase
      .from("doctor_specialties")
      .select("specialty_id")
      .eq("staff_id", session.staffId)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle();
    specialty = primary?.specialty_id ?? null;
  }
  const { data, error } = await supabase
    .from("encounters")
    .insert({ clinic_id: session.clinicId, patient_id: patientId, doctor_id: session.staffId, specialty_id: specialty })
    .select("id")
    .single();
  if (error) return fromError(error);
  redirect(`/visits/${data.id}`);
}
