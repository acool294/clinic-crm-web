import { formatInTimeZone } from "date-fns-tz";

export type Context = Record<string, unknown>;

const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** The values a template can use, derived from the queued context. */
export function templateValues(ctx: Context, appUrl: string): Record<string, string> {
  const tz = typeof ctx.timezone === "string" ? ctx.timezone : "Asia/Kolkata";
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(ctx)) if (typeof v === "string" || typeof v === "number") values[k] = String(v);
  if (typeof ctx.starts_at === "string") {
    values.date = formatInTimeZone(ctx.starts_at, tz, "EEE d MMM");
    values.time = formatInTimeZone(ctx.starts_at, tz, "h:mm a");
  } else if (typeof ctx.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ctx.date)) {
    values.date = formatInTimeZone(new Date(`${ctx.date}T12:00:00Z`), "UTC", "EEE d MMM");
  }
  if (typeof ctx.feedback_token === "string") values.link = `${appUrl.replace(/\/$/, "")}/f/${ctx.feedback_token}`;
  return values;
}

/** Fills {{placeholders}}; unknown ones become empty so nothing odd reaches a patient. */
export function render(body: string, values: Record<string, string>): string {
  return body.replace(PLACEHOLDER, (_, key: string) => values[key] ?? "").replace(/[ \t]{2,}/g, " ").trim();
}

/** Placeholder values in the order they appear, for providers with positional variables. */
export function positional(body: string, values: Record<string, string>): string[] {
  return [...body.matchAll(PLACEHOLDER)].map((m) => values[m[1]] ?? "");
}

/** Indian 10-digit mobiles get the 91 country code; others are sent as stored. */
export function toE164Digits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
}
