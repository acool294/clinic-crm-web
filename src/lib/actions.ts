import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { ForbiddenError } from "@/lib/auth/errors";

export interface ActionState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** e.g. the id of what was created, for a redirect or a follow-up step */
  id?: string;
}

export const idle: ActionState = { ok: false };

interface DbError {
  code?: string;
  message: string;
  details?: string | null;
}

/** Turns a Postgres/PostgREST error into a sentence for the person at the desk. */
export function dbErrorMessage(error: DbError): string {
  const msg = error.message ?? "";
  switch (error.code) {
    case "23P01":
      if (msg.includes("room")) return "That room is already booked at this time.";
      return "That time overlaps another appointment for this doctor.";
    case "23505":
      return "This already exists.";
    case "23503":
      return "Something this refers to no longer exists. Refresh and try again.";
    case "42501":
      return msg.includes("row-level security")
        ? "You do not have permission to do this."
        : msg.replace(/^permission denied.*$/, "You do not have permission to do this.");
    case "23514":
    case "P0001":
    case "P0002":
      // our own triggers raise readable messages; constraint names are not
      return msg.includes("violates check constraint") ? "Some values are not valid. Check the form and try again." : msg;
    default:
      return msg || "Something went wrong. Try again.";
  }
}

export function fromZod(error: z.ZodError): ActionState {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, message: "Check the highlighted fields.", fieldErrors };
}

export function fromError(error: unknown): ActionState {
  // let redirect() and notFound() through when they are thrown inside a try block
  unstable_rethrow(error);
  if (error instanceof ForbiddenError) return { ok: false, message: "You do not have permission to do this." };
  if (error && typeof error === "object" && "message" in error) return { ok: false, message: dbErrorMessage(error as DbError) };
  return { ok: false, message: "Something went wrong. Try again." };
}

/** FormData to a plain object; empty strings become undefined so optional fields stay optional. */
export function formObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION")) continue;
    const v = typeof value === "string" ? value.trim() : value;
    if (v === "") continue;
    if (key.endsWith("[]")) {
      const k = key.slice(0, -2);
      ((out[k] as unknown[]) ??= []).push(v);
    } else {
      out[key] = v;
    }
  }
  return out;
}
