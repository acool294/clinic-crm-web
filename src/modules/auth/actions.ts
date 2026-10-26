"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fromZod, type ActionState } from "@/lib/actions";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export async function login(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const { email, password, next } = parsed.data;
  const ip = await clientIp();
  const admin = createAdminClient();

  const { data: allowed } = await admin.rpc("login_allowed", { p_email: email, p_ip: ip });
  if (allowed === false) {
    return { ok: false, message: "Too many failed attempts. Wait 15 minutes and try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    await admin.rpc("log_login_failure", { p_email: email, p_ip: ip });
    return { ok: false, message: "That email and password do not match." };
  }

  const { data: access } = await supabase.rpc("my_access");
  if (!access?.[0]) {
    await supabase.auth.signOut();
    return { ok: false, message: "This account is not an active staff member of the clinic." };
  }
  await supabase.rpc("log_event", { p_action: "login", p_entity: "auth" });

  if (access[0].mfa_required) redirect(`/mfa?next=${encodeURIComponent(safeNext(next))}`);
  redirect(safeNext(next));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.rpc("log_event", { p_action: "logout", p_entity: "auth" });
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Two-factor (TOTP)
// ---------------------------------------------------------------------------

export interface EnrollState extends ActionState {
  factorId?: string;
  qrCode?: string;
  secret?: string;
}

export async function startTotpEnrollment(): Promise<EnrollState> {
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  // clear half-finished enrolments so each attempt starts clean
  for (const f of factors?.all ?? []) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${Date.now()}` });
  if (error || !data) return { ok: false, message: error?.message ?? "Could not start setup." };
  return { ok: true, factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

const codeSchema = z.object({
  factorId: z.string().min(1),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
  next: z.string().optional(),
});

export async function verifyTotp(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = codeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: parsed.data.factorId, code: parsed.data.code });
  if (error) return { ok: false, message: "That code did not work. Check the time on your phone and try again." };
  redirect(safeNext(parsed.data.next));
}

// ---------------------------------------------------------------------------
// First-run setup: creates the clinic and its owner, once.
// ---------------------------------------------------------------------------

const setupSchema = z.object({
  clinicName: z.string().trim().min(2, "Enter the clinic's name"),
  ownerName: z.string().trim().min(2, "Enter your name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(10, "Use at least 10 characters"),
});

export async function setupClinic(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = setupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const admin = createAdminClient();

  const { data: done } = await admin.rpc("clinic_is_set_up");
  if (done) return { ok: false, message: "The clinic is already set up. Sign in instead." };

  const { clinicName, ownerName, email, password } = parsed.data;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created.user) return { ok: false, message: error?.message ?? "Could not create the account." };

  const { error: bootError } = await admin.rpc("bootstrap_clinic", {
    p_clinic_name: clinicName,
    p_owner_user_id: created.user.id,
    p_owner_name: ownerName,
    p_owner_email: email,
  });
  if (bootError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, message: bootError.message };
  }

  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email, password });
  redirect("/mfa?next=/settings/clinic");
}

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

export async function requestPasswordReset(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!email.success) return { ok: false, message: "Enter a valid email" };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${env().APP_URL}/auth/confirm?next=/set-password`,
  });
  // same answer whether or not the account exists
  return { ok: true, message: "If that email belongs to a staff account, a reset link is on its way." };
}

const passwordSchema = z
  .object({ password: z.string().min(10, "Use at least 10 characters"), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "The passwords do not match", path: ["confirm"] });

export async function setPassword(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, message: error.message };
  redirect("/");
}
