import { clinicTimeToUtc } from "@/lib/format";

export interface Schedule {
  weekday: number;
  start_time: string; // "10:00:00"
  end_time: string;
  slot_minutes: number;
}
export interface Busy {
  starts_at: string;
  ends_at: string;
}
export interface Leave {
  starts_on: string;
  ends_on: string;
}
export interface Slot {
  start: Date;
  end: Date;
  free: boolean;
}

/** Weekday (0 = Sunday) of a YYYY-MM-DD date, independent of the server's time zone. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/**
 * The bookable slots for one doctor on one clinic day: their consulting hours,
 * minus leave, with booked times marked busy. Past slots are left out.
 */
export function slotsForDay(
  date: string,
  schedules: Schedule[],
  busy: Busy[],
  leaves: Leave[],
  now: Date = new Date(),
): Slot[] {
  if (leaves.some((l) => l.starts_on <= date && date <= l.ends_on)) return [];
  const weekday = weekdayOf(date);
  const slots: Slot[] = [];
  for (const s of schedules.filter((x) => x.weekday === weekday)) {
    let start = clinicTimeToUtc(date, s.start_time.slice(0, 5));
    const end = clinicTimeToUtc(date, s.end_time.slice(0, 5));
    while (start.getTime() + s.slot_minutes * 60_000 <= end.getTime()) {
      const slotEnd = new Date(start.getTime() + s.slot_minutes * 60_000);
      const taken = busy.some((b) => new Date(b.starts_at) < slotEnd && new Date(b.ends_at) > start);
      if (slotEnd > now) slots.push({ start, end: slotEnd, free: !taken });
      start = slotEnd;
    }
  }
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}
