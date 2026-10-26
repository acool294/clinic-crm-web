import { describe, expect, it } from "vitest";
import { addDays, age, clinicDayRange, clinicTimeToUtc, formatTime, money, rupeesToPaise, todayInClinic } from "./format";

describe("money", () => {
  it("uses Indian grouping", () => {
    expect(money(12345678)).toBe("₹1,23,456.78");
    expect(money(50000, { whole: true })).toBe("₹500");
  });
  it("parses typed rupees", () => {
    expect(rupeesToPaise("1,234.50")).toBe(123450);
    expect(rupeesToPaise("₹ 500")).toBe(50000);
    expect(Number.isNaN(rupeesToPaise("abc"))).toBe(true);
  });
});

describe("clinic time", () => {
  it("shows 9:00 IST as 9:00, not 03:30", () => {
    const utc = clinicTimeToUtc("2026-11-02", "09:00");
    expect(utc.toISOString()).toBe("2026-11-02T03:30:00.000Z");
    expect(formatTime(utc)).toBe("9:00 AM");
  });
  it("uses the clinic's day, not the server's", () => {
    // 20:00 UTC on 1 Nov is already 2 Nov in India
    expect(todayInClinic(undefined, new Date("2026-11-01T20:00:00Z"))).toBe("2026-11-02");
    const { start } = clinicDayRange("2026-11-02");
    expect(start.toISOString()).toBe("2026-11-01T18:30:00.000Z");
  });
  it("adds days across months", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
  });
  it("formats ages", () => {
    expect(age("2000-01-01", new Date("2026-10-26"))).toBe("26 y");
    expect(age("2026-03-01", new Date("2026-10-26"))).toBe("7 m");
  });
});
