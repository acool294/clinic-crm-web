"use client";

import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/actions";
import { cn } from "@/lib/cn";
import { Button } from "./button";

const control =
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm placeholder:text-muted/70 " +
  "focus:outline-2 focus:outline-brand focus:border-brand disabled:bg-bg aria-[invalid=true]:border-danger";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-20", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(control, "h-10", className)} {...props} />;
}

export function Field({
  label,
  name,
  state,
  hint,
  children,
  className,
}: {
  label: string;
  name?: string;
  state?: ActionState;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  const errors = name ? state?.fieldErrors?.[name] : undefined;
  return (
    <label className={cn("flex flex-col gap-1.5 text-sm", className)}>
      <span className="font-medium">{label}</span>
      {children}
      {hint && !errors && <span className="text-xs text-muted">{hint}</span>}
      {errors && <span className="text-xs text-danger">{errors.join(" ")}</span>}
    </label>
  );
}

export function SubmitButton({ children, pendingText, ...props }: ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? (pendingText ?? "Saving…") : children}
    </Button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={cn(
        "rounded-md px-3 py-2 text-sm",
        state.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger",
      )}
    >
      {state.message}
    </p>
  );
}
