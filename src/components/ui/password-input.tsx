"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { Input } from "./form";

/** Password field with a show/hide toggle and a Caps Lock warning. */
export function PasswordInput(props: ComponentProps<"input">) {
  const [visible, setVisible] = useState(false);
  const [caps, setCaps] = useState(false);
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.("CapsLock") ?? false);
  return (
    <span className="flex flex-col gap-1">
      <span className="relative">
        <Input {...props} type={visible ? "text" : "password"} className="pr-10" onKeyDown={onKey} onKeyUp={onKey} />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted hover:text-ink"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </span>
      {caps && <span className="text-xs text-warn">Caps Lock is on</span>}
    </span>
  );
}

/** 0-4 rough strength score for the meter (length and variety; not a policy). */
export function passwordScore(pw: string): number {
  let score = 0;
  if (pw.length >= 10) score++;
  if (pw.length >= 14) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return pw.length < 10 ? Math.min(score, 1) : score;
}

export function StrengthMeter({ password }: { password: string }) {
  const score = passwordScore(password);
  const labels = ["Too short", "Weak", "Fair", "Good", "Strong"];
  const colors = ["bg-danger", "bg-danger", "bg-warn", "bg-ok", "bg-ok"];
  if (!password) return null;
  return (
    <span className="flex items-center gap-2 text-xs text-muted">
      <span className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => <span key={i} className={`h-1 flex-1 rounded-full ${i < score ? colors[score] : "bg-line"}`} />)}
      </span>
      {labels[score]}
    </span>
  );
}
