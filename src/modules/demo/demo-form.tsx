"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { loadDemoData, type DemoState } from "./actions";

export function DemoForm() {
  const [state, action] = useActionState<DemoState, FormData>(loadDemoData, { ok: false });
  if (state.ok && state.logins) {
    return (
      <div className="flex flex-col gap-3">
        <FormMessage state={state} />
        <p className="text-sm">
          Every demo login uses this password (shown once, so copy it now):{" "}
          <code className="rounded bg-bg px-2 py-1 font-semibold select-all">{state.password}</code>
        </p>
        <ul className="text-sm">
          {state.logins.map((l) => (
            <li key={l.email}><code className="select-all">{l.email}</code> <span className="text-muted">({l.role})</span></li>
          ))}
        </ul>
        <p className="text-xs text-muted">Sign out and sign in as any of them to see what that role can do. Doctors no longer need an authenticator app; turn it back on in Settings → Clinic before real use.</p>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="confirm" /> This is a test clinic with no real patients
      </label>
      <FormMessage state={state} />
      <div><SubmitButton pendingText="Loading demo data… (up to a minute)">Load demo clinic</SubmitButton></div>
    </form>
  );
}
