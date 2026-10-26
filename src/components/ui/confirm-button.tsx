"use client";

import { useTransition, type ReactNode } from "react";
import { Button } from "./button";

/** A small button that runs a server action, optionally after a confirm prompt. */
export function ActionButton({
  action,
  children,
  confirm,
  variant = "secondary",
}: {
  action: () => Promise<unknown>;
  children: ReactNode;
  confirm?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      disabled={pending}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          const result = (await action()) as { ok?: boolean; message?: string } | undefined;
          if (result && result.ok === false && result.message) window.alert(result.message);
        });
      }}
    >
      {pending ? "…" : children}
    </Button>
  );
}
