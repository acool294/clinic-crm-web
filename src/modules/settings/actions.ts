"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fromError, fromZod, formObject, type ActionState } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { isPermission, ROLES, type Role } from "@/lib/auth/permissions";
import { env } from "@/lib/env";
import { rupeesToPaise } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  clinicSchema,
  inviteSchema,
  openingHoursFrom,
  formTemplateSchema,
  parseFieldLines,
  recallSchema,
  roomSchema,
  scheduleSchema,
  serviceSchema,
  specialtySchema,
  staffUpdateSchema,
  templateSchema,
} from "./schemas";

// ---------------------------------------------------------------------------
// Clinic profile
// ---------------------------------------------------------------------------

export async function saveClinic(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await assertPermission("settings.manage");
    const form = formObject(formData);
    const parsed = clinicSchema.safeParse(form);
    if (!parsed.success) return fromZod(parsed.error);
    const { mfa_doctors, ...values } = parsed.data;
    const supabase = await createClient();
    const { error } = await supabase
      .from("clinics")
      .update({
        ...values,
        opening_hours: openingHoursFrom(form),
        mfa_required_roles: mfa_doctors ? ["owner", "doctor"] : ["owner"],
      })
      .eq("id", session.clinicId);
    if (error) return fromError(error);
    revalidatePath("/", "layout");
    return { ok: true, message: "Clinic details saved." };
  } catch (e) {
    return fromError(e);
  }
}

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

export async function uploadClinicLogo(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await assertPermission("settings.manage");
    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose an image." };
    if (!LOGO_TYPES.includes(file.type) || file.size > 2 * 1024 * 1024) {
      return { ok: false, message: "Use a PNG, JPEG or WebP image under 2 MB." };
    }
    const supabase = await createClient();
    const path = `${session.clinicId}/logo-${Date.now()}.${file.type.split("/")[1]}`;
    const { error: upErr } = await supabase.storage.from("clinic-assets").upload(path, file, { contentType: file.type });
    if (upErr) return { ok: false, message: upErr.message };
    const { error } = await supabase.from("clinics").update({ logo_path: path }).eq("id", session.clinicId);
    if (error) return fromError(error);
    revalidatePath("/settings/clinic");
    return { ok: true, message: "Logo updated." };
  } catch (e) {
    return fromError(e);
  }
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

function staffForm(formData: FormData) {
  const form = formObject(formData);
  return { ...form, roles: formData.getAll("roles"), specialties: formData.getAll("specialties") };
}

async function sendInvite(v: z.infer<typeof inviteSchema>): Promise<ActionState> {
  const admin = createAdminClient();
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(v.email, {
    redirectTo: `${env().APP_URL}/auth/confirm?next=/set-password`,
    data: { full_name: v.full_name },
  });
  if (inviteError || !invited.user) {
    return { ok: false, message: inviteError?.message ?? "Could not send the invite." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_staff", {
    p_staff_id: null,
    p_user_id: invited.user.id,
    p_full_name: v.full_name,
    p_email: v.email,
    p_phone: v.phone,
    p_title: v.title,
    p_registration_number: v.registration_number,
    p_roles: v.roles,
    p_specialties: v.specialties,
  });
  if (error) {
    await admin.auth.admin.deleteUser(invited.user.id);
    return fromError(error);
  }
  return { ok: true, message: `Invite sent to ${v.email}.` };
}

export async function inviteStaff(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await assertPermission("staff.manage");
    const parsed = inviteSchema.safeParse(staffForm(formData));
    if (!parsed.success) return fromZod(parsed.error);
    const result = await sendInvite(parsed.data);
    if (result.ok) revalidatePath("/settings/staff");
    return result;
  } catch (e) {
    return fromError(e);
  }
}

export async function decideAccessRequest(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await assertPermission("staff.manage");
    const supabase = await createClient();
    const { data: req } = await supabase.from("access_requests").select("*").eq("id", id).eq("status", "pending").maybeSingle();
    if (!req) return { ok: false, message: "This request was already handled." };
    const decision = formData.get("decision");
    if (decision === "approve") {
      const parsed = inviteSchema.safeParse({
        full_name: req.full_name,
        email: req.email,
        phone: req.phone ?? undefined,
        roles: formData.getAll("roles"),
        specialties: formData.getAll("specialties"),
      });
      if (!parsed.success) return fromZod(parsed.error);
      const result = await sendInvite(parsed.data);
      if (!result.ok) return result;
    }
    await supabase
      .from("access_requests")
      .update({ status: decision === "approve" ? "approved" : "declined", decided_by: session.staffId, decided_at: new Date().toISOString() })
      .eq("id", id);
    revalidatePath("/settings/staff");
    return { ok: true, message: decision === "approve" ? `Invite sent to ${req.email}.` : "Request declined." };
  } catch (e) {
    return fromError(e);
  }
}

export async function updateStaff(staffId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await assertPermission("staff.manage");
    const parsed = staffUpdateSchema.safeParse(staffForm(formData));
    if (!parsed.success) return fromZod(parsed.error);
    const v = parsed.data;
    const supabase = await createClient();
    const { error } = await supabase.rpc("save_staff", {
      p_staff_id: staffId,
      p_user_id: null,
      p_full_name: v.full_name,
      p_email: "",
      p_phone: v.phone,
      p_title: v.title,
      p_registration_number: v.registration_number,
      p_roles: v.roles,
      p_specialties: v.specialties,
      p_restrict_to_own_patients: !!v.restrict_to_own_patients,
    });
    if (error) return fromError(error);
    revalidatePath("/settings/staff");
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fromError(e);
  }
}

export async function setStaffActive(staffId: string, active: boolean): Promise<ActionState> {
  try {
    const session = await assertPermission("staff.manage");
    if (staffId === session.staffId && !active) return { ok: false, message: "You cannot deactivate yourself." };
    const supabase = await createClient();
    const { error } = await supabase.from("staff").update({ is_active: active }).eq("id", staffId);
    if (error) return fromError(error);
    revalidatePath("/settings/staff");
    return { ok: true, message: active ? "Reactivated." : "Deactivated. They can no longer sign in to any data." };
  } catch (e) {
    return fromError(e);
  }
}

export async function addSchedule(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await assertPermission("staff.manage");
    const parsed = scheduleSchema.safeParse(formObject(formData));
    if (!parsed.success) return fromZod(parsed.error);
    const supabase = await createClient();
    const { error } = await supabase.from("doctor_schedules").insert({ ...parsed.data, clinic_id: session.clinicId });
    if (error) return fromError(error);
    revalidatePath("/settings/staff");
    return { ok: true, message: "Hours added." };
  } catch (e) {
    return fromError(e);
  }
}

export async function deleteSchedule(id: string) {
  await assertPermission("staff.manage");
  const supabase = await createClient();
  await supabase.from("doctor_schedules").delete().eq("id", id);
  revalidatePath("/settings/staff");
}

const leaveSchema = z.object({
  doctor_id: z.string().uuid(),
  starts_on: z.string().date(),
  ends_on: z.string().date(),
  reason: z.string().optional(),
});

export async function addLeave(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await assertPermission("appointments.read");
    const parsed = leaveSchema.safeParse(formObject(formData));
    if (!parsed.success) return fromZod(parsed.error);
    const supabase = await createClient();
    const { error } = await supabase.from("doctor_leaves").insert({ ...parsed.data, clinic_id: session.clinicId });
    if (error) return fromError(error);
    revalidatePath("/settings/staff");
    revalidatePath("/calendar");
    return { ok: true, message: "Leave added." };
  } catch (e) {
    return fromError(e);
  }
}

// ---------------------------------------------------------------------------
// Departments, panels, rooms, custom forms
// ---------------------------------------------------------------------------

export async function addSpecialty(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await assertPermission("settings.manage");
    const parsed = specialtySchema.safeParse(formObject(formData));
    if (!parsed.success) return fromZod(parsed.error);
    const supabase = await createClient();
    const { error } = await supabase.from("specialties").insert({ ...parsed.data, clinic_id: session.clinicId });
    if (error) return fromError(error);
    revalidatePath("/settings/departments");
    return { ok: true, message: "Department added." };
  } catch (e) {
    return fromError(e);
  }
}

export async function setSpecialtyActive(id: string, active: boolean) {
  await assertPermission("settings.manage");
  const supabase = await createClient();
  await supabase.from("specialties").update({ is_active: active }).eq("id", id);
  revalidatePath("/settings/departments");
}

export async function setPanel(specialtyId: string, panelKey: string, enabled: boolean) {
  const session = await assertPermission("settings.manage");
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("specialty_panels")
    .select("id")
    .eq("specialty_id", specialtyId)
    .eq("panel_key", panelKey)
    .maybeSingle();
  if (existing) {
    await supabase.from("specialty_panels").update({ enabled }).eq("id", existing.id);
  } else if (enabled) {
    await supabase
      .from("specialty_panels")
      .insert({ clinic_id: session.clinicId, specialty_id: specialtyId, panel_key: panelKey, sort_order: 50 });
  }
  revalidatePath("/settings/departments");
}

export async function addRoom(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await assertPermission("settings.manage");
    const parsed = roomSchema.safeParse(formObject(formData));
    if (!parsed.success) return fromZod(parsed.error);
    const supabase = await createClient();
    const { error } = await supabase.from("rooms").insert({ ...parsed.data, clinic_id: session.clinicId });
    if (error) return fromError(error);
    revalidatePath("/settings/departments");
    return { ok: true, message: "Room added." };
  } catch (e) {
    return fromError(e);
  }
}

export async function addFormTemplate(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await assertPermission("settings.manage");
    const parsed = formTemplateSchema.safeParse(formObject(formData));
    if (!parsed.success) return fromZod(parsed.error);
    let fields;
    try {
      fields = parseFieldLines(parsed.data.fields);
    } catch {
      return { ok: false, message: "One of the field lines could not be read." };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("form_templates")
      .insert({ clinic_id: session.clinicId, specialty_id: parsed.data.specialty_id, name: parsed.data.name, fields })
      .select("id")
      .single();
    if (error) return fromError(error);
    await supabase.from("specialty_panels").insert({
      clinic_id: session.clinicId,
      specialty_id: parsed.data.specialty_id,
      panel_key: `form:${data.id}`,
      sort_order: 90,
    });
    revalidatePath("/settings/departments");
    return { ok: true, message: "Form added to the department's consultation page." };
  } catch (e) {
    return fromError(e);
  }
}

// ---------------------------------------------------------------------------
// Services and prices
// ---------------------------------------------------------------------------

export async function saveService(serviceId: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await assertPermission("services.manage");
    const parsed = serviceSchema.safeParse(formObject(formData));
    if (!parsed.success) return fromZod(parsed.error);
    const { price, ...rest } = parsed.data;
    const price_paise = rupeesToPaise(price);
    if (!Number.isFinite(price_paise) || price_paise < 0) return { ok: false, fieldErrors: { price: ["Enter a price in rupees"] } };
    const row = {
      ...rest,
      specialty_id: rest.specialty_id ?? null,
      doctor_id: rest.doctor_id ?? null,
      visit_type: rest.visit_type ?? null,
      sessions: rest.sessions ?? null,
      price_paise,
    };
    const supabase = await createClient();
    const { error } = serviceId
      ? await supabase.from("services").update(row).eq("id", serviceId)
      : await supabase.from("services").insert({ ...row, clinic_id: session.clinicId });
    if (error) return fromError(error);
    revalidatePath("/settings/services");
    return { ok: true, message: "Service saved." };
  } catch (e) {
    return fromError(e);
  }
}

export async function setServiceActive(id: string, active: boolean) {
  await assertPermission("services.manage");
  const supabase = await createClient();
  await supabase.from("services").update({ is_active: active }).eq("id", id);
  revalidatePath("/settings/services");
}

// ---------------------------------------------------------------------------
// Role matrix
// ---------------------------------------------------------------------------

export async function saveRolePermissions(role: Role, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await assertPermission("settings.manage");
    if (!ROLES.includes(role)) return { ok: false, message: "Unknown role." };
    const permissions = formData.getAll("permissions").map(String).filter(isPermission);
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_role_permissions", { p_role: role, p_permissions: permissions });
    if (error) return fromError(error);
    revalidatePath("/settings/roles");
    return { ok: true, message: "Permissions saved. They apply on the next page load." };
  } catch (e) {
    return fromError(e);
  }
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export async function saveTemplate(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await assertPermission("messages.manage");
    const parsed = templateSchema.safeParse(formObject(formData));
    if (!parsed.success) return fromZod(parsed.error);
    const supabase = await createClient();
    const { error } = await supabase
      .from("message_templates")
      .update({ body: parsed.data.body, provider_template: parsed.data.provider_template, is_active: !!parsed.data.is_active })
      .eq("id", id);
    if (error) return fromError(error);
    revalidatePath("/settings/messages");
    return { ok: true, message: "Template saved." };
  } catch (e) {
    return fromError(e);
  }
}

export async function addRecallRule(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await assertPermission("messages.manage");
    const parsed = recallSchema.safeParse(formObject(formData));
    if (!parsed.success) return fromZod(parsed.error);
    const supabase = await createClient();
    const { error } = await supabase.from("recall_rules").insert({ ...parsed.data, clinic_id: session.clinicId });
    if (error) return fromError(error);
    revalidatePath("/settings/messages");
    return { ok: true, message: "Recall rule added." };
  } catch (e) {
    return fromError(e);
  }
}

export async function setRecallActive(id: string, active: boolean) {
  await assertPermission("messages.manage");
  const supabase = await createClient();
  await supabase.from("recall_rules").update({ is_active: active }).eq("id", id);
  revalidatePath("/settings/messages");
}
