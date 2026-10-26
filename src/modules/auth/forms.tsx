"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { PasswordInput, StrengthMeter } from "@/components/ui/password-input";
import { idle } from "@/lib/actions";
import { cn } from "@/lib/cn";
import {
  login,
  requestAccess,
  requestPasswordReset,
  sendSignInLink,
  setPassword,
  setupClinic,
  startTotpEnrollment,
  verifyTotp,
  type EnrollState,
} from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<"password" | "link">("password");
  const [state, action] = useActionState(login, idle);
  const [linkState, linkAction] = useActionState(sendSignInLink, idle);
  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" className="grid grid-cols-2 rounded-lg bg-bg p-1 text-sm">
        {(["password", "link"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn("rounded-md py-1.5", mode === m ? "bg-surface font-medium shadow-sm" : "text-muted")}
          >
            {m === "password" ? "Password" : "Email me a link"}
          </button>
        ))}
      </div>

      {mode === "password" ? (
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next ?? "/"} />
          <Field label="Email" name="email" state={state}>
            <Input name="email" type="email" autoComplete="username" required autoFocus />
          </Field>
          <Field label="Password" name="password" state={state}>
            <PasswordInput name="password" autoComplete="current-password" required />
          </Field>
          <div className="-mt-2 text-right">
            <Link href="/forgot-password" className="text-sm text-brand hover:underline">Forgot password?</Link>
          </div>
          <FormMessage state={state} />
          <SubmitButton pendingText="Signing in…" size="lg">Sign in</SubmitButton>
        </form>
      ) : (
        <form action={linkAction} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next ?? "/"} />
          <Field label="Email" name="email" state={linkState} hint="We email you a one-time link. No password needed.">
            <Input name="email" type="email" autoComplete="username" required autoFocus />
          </Field>
          <FormMessage state={linkState} />
          <SubmitButton pendingText="Sending…" size="lg">Send sign-in link</SubmitButton>
        </form>
      )}

      <p className="text-center text-sm text-muted">
        New to the clinic? <Link href="/request-access" className="font-medium text-brand hover:underline">Request access</Link>
      </p>
    </div>
  );
}

export function TotpVerifyForm({ factorId, next }: { factorId: string; next?: string }) {
  const [state, action] = useActionState(verifyTotp, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="factorId" value={factorId} />
      <input type="hidden" name="next" value={next ?? "/"} />
      <Field label="6-digit code" name="code" state={state}>
        <Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" required autoFocus className="text-center text-lg tracking-[0.5em]" />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingText="Checking…" size="lg">Verify</SubmitButton>
    </form>
  );
}

export function TotpEnroll({ next }: { next?: string }) {
  const [enrolment, setEnrolment] = useState<EnrollState | null>(null);
  const [pending, start] = useTransition();
  if (!enrolment?.factorId) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Owners and doctors need a second step at sign-in. Install an authenticator app (Google Authenticator,
          Microsoft Authenticator or similar) on your phone, then continue.
        </p>
        {enrolment?.message && <FormMessage state={enrolment} />}
        <Button size="lg" disabled={pending} onClick={() => start(async () => setEnrolment(await startTotpEnrollment()))}>
          {pending ? "Preparing…" : "Set up authenticator"}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <ol className="list-decimal pl-5 text-sm text-muted">
        <li>Open your authenticator app and add an account.</li>
        <li>Scan this code, then type the 6 digits it shows.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element -- data URI from Supabase */}
      <img src={enrolment.qrCode} alt="QR code for your authenticator app" className="mx-auto size-44 rounded-lg border border-line p-2" />
      <p className="text-center text-xs text-muted">
        Can&apos;t scan? Enter this key: <code className="break-all select-all">{enrolment.secret}</code>
      </p>
      <TotpVerifyForm factorId={enrolment.factorId} next={next} />
    </div>
  );
}

export function SetupForm() {
  const [state, action] = useActionState(setupClinic, idle);
  const [pw, setPw] = useState("");
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Clinic name" name="clinicName" state={state}><Input name="clinicName" required autoFocus /></Field>
      <Field label="Your name" name="ownerName" state={state}><Input name="ownerName" required /></Field>
      <Field label="Your email" name="email" state={state}><Input name="email" type="email" autoComplete="username" required /></Field>
      <Field label="Password" name="password" state={state}>
        <PasswordInput name="password" autoComplete="new-password" required minLength={10} value={pw} onChange={(e) => setPw(e.target.value)} />
        <StrengthMeter password={pw} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingText="Setting up…" size="lg">Create clinic</SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Email" name="email" state={state}><Input name="email" type="email" required autoFocus /></Field>
      <FormMessage state={state} />
      <SubmitButton pendingText="Sending…" size="lg">Send reset link</SubmitButton>
    </form>
  );
}

export function SetPasswordForm() {
  const [state, action] = useActionState(setPassword, idle);
  const [pw, setPw] = useState("");
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="New password" name="password" state={state} hint="At least 10 characters">
        <PasswordInput name="password" autoComplete="new-password" required minLength={10} autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
        <StrengthMeter password={pw} />
      </Field>
      <Field label="Confirm password" name="confirm" state={state}>
        <PasswordInput name="confirm" autoComplete="new-password" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton size="lg">Save password</SubmitButton>
    </form>
  );
}

export function RequestAccessForm() {
  const [state, action] = useActionState(requestAccess, idle);
  if (state.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Full name" name="full_name" state={state}><Input name="full_name" required autoFocus /></Field>
      <Field label="Work email" name="email" state={state}><Input name="email" type="email" required /></Field>
      <Field label="Mobile" name="phone" state={state}><Input name="phone" type="tel" /></Field>
      <Field label="Your role" name="role" state={state}>
        <Select name="role" defaultValue="">
          <option value="">Choose…</option>
          <option value="doctor">Doctor</option>
          <option value="nurse">Nurse</option>
          <option value="receptionist">Front desk</option>
          <option value="billing">Billing / accounts</option>
        </Select>
      </Field>
      <Field label="Note for the owner (optional)" name="message" state={state}><Textarea name="message" rows={2} /></Field>
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <FormMessage state={state} />
      <SubmitButton pendingText="Sending…" size="lg">Request access</SubmitButton>
    </form>
  );
}
