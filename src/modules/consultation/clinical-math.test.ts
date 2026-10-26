import { describe, expect, it } from "vitest";
import { eddFromLmp, gestationalAge, lmsAt, percentile, trimester, valueAtZ, vaccineDueDate, zScore } from "./clinical-math";

describe("WHO growth", () => {
  it("matches the published boys weight-for-age table", () => {
    const birth = lmsAt("male", "weight", 0)!;
    expect(valueAtZ(birth, 0)).toBeCloseTo(3.3464, 3);
    expect(valueAtZ(birth, -2)).toBeCloseTo(2.4593, 3); // 2.3rd percentile column
  });

  it("round-trips z-scores and interpolates between months", () => {
    const lms = lmsAt("female", "length", 6.5)!;
    const x = valueAtZ(lms, 1.2);
    expect(zScore(lms, x)).toBeCloseTo(1.2, 6);
    expect(lmsAt("female", "length", 30)).toBeNull();
  });

  it("turns z into percentiles", () => {
    expect(percentile(0)).toBe(50);
    expect(percentile(-1.881)).toBeCloseTo(3, 0);
    expect(percentile(1.881)).toBeCloseTo(97, 0);
  });
});

describe("obstetrics", () => {
  it("computes EDD and gestational age", () => {
    expect(eddFromLmp("2026-01-01")).toBe("2026-10-08");
    expect(gestationalAge("2026-01-01", "2026-03-12")).toEqual({ weeks: 10, days: 0 });
    expect(gestationalAge("2026-01-01", "2025-12-01")).toBeNull();
    expect(trimester(20)).toBe(2);
  });
});

describe("vaccines", () => {
  it("adds the due age to the date of birth", () => {
    expect(vaccineDueDate("2026-01-01", 42)).toBe("2026-02-12");
  });
});
