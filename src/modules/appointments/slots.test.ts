import { describe, expect, it } from "vitest";
import { slotsForDay, weekdayOf } from "./slots";

const monday = "2026-11-02";
const schedule = [{ weekday: 1, start_time: "10:00:00", end_time: "11:00:00", slot_minutes: 15 }];
const early = new Date("2026-11-01T00:00:00Z");

describe("slots", () => {
  it("knows the weekday", () => {
    expect(weekdayOf(monday)).toBe(1);
  });

  it("splits consulting hours into slots in IST", () => {
    const slots = slotsForDay(monday, schedule, [], [], early);
    expect(slots).toHaveLength(4);
    expect(slots[0].start.toISOString()).toBe("2026-11-02T04:30:00.000Z"); // 10:00 IST
  });

  it("marks booked slots busy", () => {
    const busy = [{ starts_at: "2026-11-02T04:45:00Z", ends_at: "2026-11-02T05:00:00Z" }];
    expect(slotsForDay(monday, schedule, busy, [], early).map((s) => s.free)).toEqual([true, false, true, true]);
  });

  it("returns nothing on leave or on other days", () => {
    expect(slotsForDay(monday, schedule, [], [{ starts_on: "2026-11-01", ends_on: "2026-11-03" }], early)).toEqual([]);
    expect(slotsForDay("2026-11-03", schedule, [], [], early)).toEqual([]);
  });

  it("drops slots already over", () => {
    const now = new Date("2026-11-02T05:05:00Z"); // 10:35 IST
    expect(slotsForDay(monday, schedule, [], [], now)).toHaveLength(2);
  });
});
