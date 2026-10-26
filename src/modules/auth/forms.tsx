"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { idle } from "@/lib/actions";
import {
  login,
  requestPasswordReset,
  setPassword,
  setupClinic,
  startTotpEnrollment,
  verifyTotp,
  type EnrollState,
} from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(login, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? "/"} />
      <Field label="Email" name="email" state={state}>
        <Input name="email" type="email" autoComplete="username" required autoFocus />
      </Field>
      <Field label="Password" name="password" state={state}>
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
      <Link href="/forgot-password" className="text-center text-sm text-muted hover:underline">
        Forgot password?
      </Link>
    </form>
  );
}

export function TotpVerifyForm({ factorId, next }: { factorId: string; next?: string }) {
  const [state, action] = useActionState(verifyTotp, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="factorId" value={factorId} />
      <input type="hidden" name="next" value={next ?? "/"} />
      <Field label="6-digit code" name="code" state={state}>
        <Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingText="Checking…">Verify</SubmitButton>
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
        <Button disabled={pending} onClick={() => start(async () => setEnrolment(await startTotpEnrollment()))}>
          {pending ? "Preparing…" : "Set up authenticator"}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">Scan this code with your authenticator app, then enter the code it shows.</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- data URI from Supabase */}
      <img src={enrolment.qrCode} alt="QR code for your authenticator app" className="mx-auto size-44" />
      <p className="text-center text-xs text-muted">
        Can&apos;t scan? Enter this key: <code className="break-all">{enrolment.secret}</code>
      </p>
      <TotpVerifyForm factorId={enrolment.factorId} next={next} />
    </div>
  );
}

export function SetupForm() {
  const [state, action] = useActionState(setupClinic, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Clinic name" name="clinicName" state={state}>
        <Input name="clinicName" required autoFocus />
      </Field>
      <Field label="Your name" name="ownerName" state={state}>
        <Input name="ownerName" required />
      </Field>
      <Field label="Your email" name="email" state={state}>
        <Input name="email" type="email" autoComplete="username" required />
      </Field>
      <Field label="Password" name="password" state={state} hint="At least 10 characters">
        <Input name="password" type="password" autoComplete="new-password" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingText="Setting up…">Create clinic</SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Email" name="email" state={state}>
        <Input name="email" type="email" required autoFocus />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingText="Sending…">Send reset link</SubmitButton>
    </form>
  );
}

export function SetPasswordForm() {
  const [state, action] = useActionState(setPassword, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="New password" name="password" state={state} hint="At least 10 characters">
        <Input name="password" type="password" autoComplete="new-password" required autoFocus />
      </Field>
      <Field label="Confirm password" name="confirm" state={state}>
        <Input name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton>Save password</SubmitButton>
    </form>
  );
}
