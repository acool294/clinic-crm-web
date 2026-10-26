import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { differenceInDays, differenceInMonths, differenceInYears } from "date-fns";

export const CLINIC_TZ = "Asia/Kolkata";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
const inrWhole = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** 123450 paise → "₹1,234.50" (Indian digit grouping) */
export function money(paise: number | bigint | null | undefined, opts: { whole?: boolean } = {}): string {
  const n = Number(paise ?? 0) / 100;
  return (opts.whole ? inrWhole : inr).format(n);
}

/** "1,234.5" or "1234" rupees typed in a form → paise. Returns NaN if unreadable. */
export function rupeesToPaise(value: string | number): number {
  const n = typeof value === "number" ? value : Number(String(value).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export function formatDate(value: string | Date | null | undefined, tz = CLINIC_TZ): string {
  if (!value) return "";
  // plain dates (YYYY-MM-DD) have no time zone; keep them as written
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatInTimeZone(new Date(`${value}T12:00:00Z`), "UTC", "d MMM yyyy");
  }
  return formatInTimeZone(value, tz, "d MMM yyyy");
}

export function formatTime(value: string | Date, tz = CLINIC_TZ): string {
  return formatInTimeZone(value, tz, "h:mm a");
}

export function formatDateTime(value: string | Date | null | undefined, tz = CLINIC_TZ): string {
  if (!value) return "";
  return formatInTimeZone(value, tz, "d MMM yyyy, h:mm a");
}

/** Today's date in the clinic, as YYYY-MM-DD. */
export function todayInClinic(tz = CLINIC_TZ, now = new Date()): string {
  return formatInTimeZone(now, tz, "yyyy-MM-dd");
}

/** A wall-clock date and time at the clinic ("2026-11-02", "09:30") → a UTC instant. */
export function clinicTimeToUtc(date: string, time: string, tz = CLINIC_TZ): Date {
  return fromZonedTime(`${date}T${time}:00`, tz);
}

/** Start and end of a clinic day as UTC instants. */
export function clinicDayRange(date: string, tz = CLINIC_TZ): { start: Date; end: Date } {
  const start = fromZonedTime(`${date}T00:00:00`, tz);
  return { start, end: new Date(start.getTime() + 24 * 3600 * 1000) };
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "34 y", "7 m", "12 d" */
export function age(dob: string | null | undefined, on: Date = new Date()): string {
  if (!dob) return "";
  const birth = new Date(`${dob}T00:00:00Z`);
  const years = differenceInYears(on, birth);
  if (years >= 2) return `${years} y`;
  const months = differenceInMonths(on, birth);
  if (months >= 1) return `${months} m`;
  return `${Math.max(differenceInDays(on, birth), 0)} d`;
}

export function ageInMonths(dob: string, on: string | Date): number {
  const birth = new Date(`${dob}T00:00:00Z`);
  const at = typeof on === "string" ? new Date(on) : on;
  return (at.getTime() - birth.getTime()) / (1000 * 3600 * 24 * 30.4375);
}

export const SEX_LABELS = { male: "Male", female: "Female", other: "Other", unknown: "Not recorded" } as const;
