"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fromError, type ActionState } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_BYTES = 15 * 1024 * 1024;

const meta = z.object({
  patient_id: z.string().uuid(),
  encounter_id: z.string().uuid().optional(),
  category: z.enum(["lab_report", "imaging", "prescription", "consent", "clinical_photo", "id_proof", "referral_letter", "other"]),
  title: z.string().trim().max(120).optional(),
  taken_on: z.string().optional(),
  is_abnormal: z.literal("on").optional(),
  notes: z.string().trim().max(500).optional(),
});

/** Uploads one or more files into the private bucket and records them. */
export async function uploadDocuments(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await assertPermission("documents.write");
    const raw = Object.fromEntries([...formData.entries()].filter(([k, v]) => typeof v === "string" && v !== "" && !k.startsWith("$")));
    const parsed = meta.safeParse(raw);
    if (!parsed.success) return { ok: false, message: "Pick a patient and a document type." };
    const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) return { ok: false, message: "Choose at least one file." };
    for (const f of files) {
      if (!ALLOWED_TYPES.includes(f.type)) return { ok: false, message: `${f.name}: only PDF and photos (JPEG, PNG, WebP, HEIC) are allowed.` };
      if (f.size > MAX_BYTES) return { ok: false, message: `${f.name} is over 15 MB.` };
    }

    const supabase = await createClient();
    const v = parsed.data;
    for (const file of files) {
      const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-80);
      const path = `${session.clinicId}/${v.patient_id}/${crypto.randomUUID()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from("patient-documents").upload(path, file, { contentType: file.type });
      if (upErr) return { ok: false, message: `Upload failed: ${upErr.message}` };
      const { error } = await supabase.from("documents").insert({
        clinic_id: session.clinicId,
        patient_id: v.patient_id,
        encounter_id: v.encounter_id ?? null,
        category: v.category,
        title: v.title || file.name,
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
        taken_on: v.taken_on || null,
        is_abnormal: !!v.is_abnormal,
        notes: v.notes ?? null,
      });
      if (error) {
        await supabase.storage.from("patient-documents").remove([path]);
        return fromError(error);
      }
    }
    revalidatePath(`/patients/${v.patient_id}`);
    if (v.encounter_id) revalidatePath(`/visits/${v.encounter_id}`);
    return { ok: true, message: files.length === 1 ? "Uploaded." : `${files.length} files uploaded.` };
  } catch (e) {
    return fromError(e);
  }
}

export async function archiveDocument(id: string, patientId: string) {
  await assertPermission("documents.write");
  const supabase = await createClient();
  await supabase.from("documents").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  revalidatePath(`/patients/${patientId}`);
}
