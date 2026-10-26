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

/** "fetch failed" means the server cannot reach Supabase at all; say where to look. */
function unreachable(message: string): string {
  if (/fetch failed|ENOTFOUND|ECONNREFUSED/i.test(message)) {
    return "The app cannot reach the database. Open /api/health on this site to see which setting is wrong (usually SUPABASE_URL on Vercel).";
  }
  if (/function .* does not exist|PGRST202|Could not find the function/i.test(message)) {
    return "The database is reachable but the migrations have not been applied. Run the files in supabase/migrations.";
  }
  return message;
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

  const { data: allowed, error: limitError } = await admin.rpc("login_allowed", { p_email: email, p_ip: ip });
  if (limitError) return { ok: false, message: unreachable(limitError.message) };
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

  const { data: done, error: checkError } = await admin.rpc("clinic_is_set_up");
  if (checkError) return { ok: false, message: unreachable(checkError.message) };
  if (done) return { ok: false, message: "The clinic is already set up. Sign in instead." };

  const { clinicName, ownerName, email, password } = parsed.data;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created.user) return { ok: false, message: unreachable(error?.message ?? "Could not create the account.") };

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
  redirect("/settings/clinic");
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

// ---------------------------------------------------------------------------
// Email sign-in link (staff only; never creates accounts)
// ---------------------------------------------------------------------------

export async function sendSignInLink(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!email.success) return { ok: false, fieldErrors: { email: ["Enter a valid email"] } };
  const ip = await clientIp();
  const admin = createAdminClient();
  const { data: allowed } = await admin.rpc("login_allowed", { p_email: email.data, p_ip: ip });
  if (allowed === false) return { ok: false, message: "Too many attempts. Wait 15 minutes and try again." };
  const supabase = await createClient();
  const next = safeNext(formData.get("next"));
  await supabase.auth.signInWithOtp({
    email: email.data,
    options: { shouldCreateUser: false, emailRedirectTo: `${env().APP_URL}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  // same answer whether or not the account exists
  return { ok: true, message: "If that email belongs to a staff account, a sign-in link is on its way. It works once, for one hour." };
}

// ---------------------------------------------------------------------------
// Request access (no account is created; the owner approves with an invite)
// ---------------------------------------------------------------------------

const requestSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: z.string().trim().max(20).optional(),
  role: z.enum(["doctor", "nurse", "receptionist", "billing"]).optional(),
  message: z.string().trim().max(1000).optional(),
  website: z.string().max(0).optional(), // honeypot: people leave it empty
});

export async function requestAccess(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = requestSchema.safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return fromZod(parsed.error);
  const v = parsed.data;
  const { error } = await createAdminClient().rpc("submit_access_request", {
    p_full_name: v.full_name,
    p_email: v.email,
    p_phone: v.phone ?? null,
    p_role: v.role ?? null,
    p_message: v.message ?? null,
    p_ip: await clientIp(),
  });
  if (error) return { ok: false, message: unreachable(error.message.replace(/^.*Too many/, "Too many")) };
  return { ok: true, message: "Thanks. The clinic owner will review your request and email you an invite." };
}
