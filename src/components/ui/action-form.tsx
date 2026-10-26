"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { idle, type ActionState } from "@/lib/actions";
import { cn } from "@/lib/cn";
import { FormMessage } from "./form";

/**
 * A form posting to a server action, showing its message and field errors.
 * The inputs can be rendered on the server and passed in as children.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  redirectTo,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  /** navigate after success; "{id}" is replaced by the returned id */
  redirectTo?: string;
}) {
  const [state, formAction] = useActionState(action, idle);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!state.ok) return;
    if (resetOnSuccess) ref.current?.reset();
    if (redirectTo) router.push(redirectTo.replace("{id}", state.id ?? ""));
  }, [state, resetOnSuccess, redirectTo, router]);

  const fieldErrors = Object.entries(state.fieldErrors ?? {}).filter(([, v]) => v?.length);
  return (
    <form ref={ref} action={formAction} className={cn("flex flex-col gap-4", className)}>
      {children}
      {fieldErrors.length > 0 && (
        <ul className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {fieldErrors.map(([k, v]) => (
            <li key={k}>
              <span className="font-medium">{k.replace(/_/g, " ")}</span>: {v!.join(" ")}
            </li>
          ))}
        </ul>
      )}
      {!fieldErrors.length && <FormMessage state={state} />}
    </form>
  );
}
