"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fromError, fromZod, formObject, type ActionState } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { allergySchema, conditionSchema, patientSchema, type PatientInput } from "./schemas";

export interface Duplicate {
  id: string;
  mrn: string;
  full_name: string;
  phone: string | null;
  dob: string | null;
  reason: string;
}

export interface PatientFormState extends ActionState {
  duplicates?: Duplicate[];
}

function toRow(v: PatientInput, existingConsentAt?: string | null) {
  const { consent_treatment, consent_messaging, ...rest } = v;
  return {
    ...rest,
    consent_messaging: !!consent_messaging,
    consent_treatment_at: consent_treatment ? (existingConsentAt ?? new Date().toISOString()) : null,
  };
}

export async function createPatient(_: PatientFormState, formData: FormData): Promise<PatientFormState> {
  try {
    const session = await assertPermission("patients.write");
    const parsed = patientSchema.safeParse(formObject(formData));
    if (!parsed.success) return fromZod(parsed.error);
    const v = parsed.data;
    const supabase = await createClient();

    if (formData.get("confirm_new") !== "on") {
      const { data: dupes } = await supabase.rpc("find_duplicate_patients", {
        p_first_name: v.first_name,
        p_last_name: v.last_name,
        p_phone: v.phone,
        p_dob: v.dob,
      });
      if (dupes?.length) {
        return {
          ok: false,
          message: "This may be a patient who is already registered. Open the existing record, or tick the box to register anyway.",
          duplicates: dupes,
        };
      }
    }

    const { data, error } = await supabase
      .from("patients")
      .insert({ ...toRow(v), clinic_id: session.clinicId })
      .select("id")
      .single();
    if (error) return fromError(error);
    revalidatePath("/patients");
    const next = formData.get("next");
    if (typeof next === "string" && next.startsWith("/")) redirect(next.replace("{id}", data.id));
    redirect(`/patients/${data.id}`);
  } catch (e) {
    return fromError(e);
  }
}

export async function updatePatient(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await assertPermission("patients.write");
    const parsed = patientSchema.safeParse(formObject(formData));
    if (!parsed.success) return fromZod(parsed.error);
    const supabase = await createClient();
    const { data: current } = await supabase.from("patients").select("consent_treatment_at, consent_messaging").eq("id", id).single();
    const row = toRow(parsed.data, current?.consent_treatment_at);
    const { error } = await supabase
      .from("patients")
      .update({
        ...row,
        // turning messages back on clears an earlier opt-out; turning them off records it
        messaging_opt_out_at: row.consent_messaging ? null : current?.consent_messaging ? new Date().toISOString() : undefined,
      })
      .eq("id", id);
    if (error) return fromError(error);
    revalidatePath(`/patients/${id}`);
    redirect(`/patients/${id}`);
  } catch (e) {
    return fromError(e);
  }
}

export async function archivePatient(id: string): Promise<ActionState> {
  try {
    await assertPermission("patients.delete");
    const supabase = await createClient();
    const { error } = await supabase.from("patients").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) return fromError(error);
  } catch (e) {
    return fromError(e);
  }
  revalidatePath("/patients");
  redirect("/patients");
}

export async function addAllergy(patientId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await assertPermission("patients.write");
    const parsed = allergySchema.safeParse(formObject(formData));
    if (!parsed.success) return fromZod(parsed.error);
    const supabase = await createClient();
    const { error } = await supabase
      .from("patient_allergies")
      .insert({ ...parsed.data, patient_id: patientId, clinic_id: session.clinicId });
    if (error) return fromError(error);
    revalidatePath(`/patients/${patientId}`);
    return { ok: true, message: "Allergy recorded." };
  } catch (e) {
    return fromError(e);
  }
}

export async function removeAllergy(patientId: string, allergyId: string) {
  await assertPermission("patients.write");
  const supabase = await createClient();
  await supabase.from("patient_allergies").update({ deleted_at: new Date().toISOString() }).eq("id", allergyId);
  revalidatePath(`/patients/${patientId}`);
}

export async function addCondition(patientId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await assertPermission("patients.write");
    const parsed = conditionSchema.safeParse(formObject(formData));
    if (!parsed.success) return fromZod(parsed.error);
    const supabase = await createClient();
    const { error } = await supabase
      .from("patient_conditions")
      .insert({ ...parsed.data, patient_id: patientId, clinic_id: session.clinicId });
    if (error) return fromError(error);
    revalidatePath(`/patients/${patientId}`);
    return { ok: true, message: "Condition recorded." };
  } catch (e) {
    return fromError(e);
  }
}

export async function resolveCondition(patientId: string, conditionId: string) {
  await assertPermission("patients.write");
  const supabase = await createClient();
  await supabase.from("patient_conditions").update({ status: "resolved" }).eq("id", conditionId);
  revalidatePath(`/patients/${patientId}`);
}

const familySchema = z.object({ related_patient_id: z.string().uuid("Pick a patient"), relation: z.string().trim().min(2) });

export async function linkFamily(patientId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await assertPermission("patients.write");
    const parsed = familySchema.safeParse(formObject(formData));
    if (!parsed.success) return fromZod(parsed.error);
    const supabase = await createClient();
    const { error } = await supabase.from("family_links").insert({ ...parsed.data, patient_id: patientId, clinic_id: session.clinicId });
    if (error) return fromError(error);
    revalidatePath(`/patients/${patientId}`);
    return { ok: true, message: "Family member linked." };
  } catch (e) {
    return fromError(e);
  }
}

export async function mergePatients(keepId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await assertPermission("patients.merge");
    const mergeId = z.string().uuid().safeParse(formData.get("merge_id"));
    if (!mergeId.success) return { ok: false, message: "Pick the duplicate record." };
    if (formData.get("confirm") !== "on") return { ok: false, message: "Tick the box to confirm. Merging cannot be undone." };
    const supabase = await createClient();
    const { error } = await supabase.rpc("merge_patients", { p_keep: keepId, p_merge: mergeId.data });
    if (error) return fromError(error);
  } catch (e) {
    return fromError(e);
  }
  revalidatePath(`/patients/${keepId}`);
  redirect(`/patients/${keepId}`);
}

/** Patient picker search for forms (booking, family links, invoices). */
export async function searchPatientsForPicker(query: string) {
  await assertPermission("patients.read");
  const supabase = await createClient();
  const { data } = await supabase.rpc("search_patients", { p_query: query, p_limit: 8 });
  return (data ?? []).map((p) => ({ id: p.id, full_name: p.full_name ?? "", mrn: p.mrn, phone: p.phone, dob: p.dob, sex: p.sex }));
}
