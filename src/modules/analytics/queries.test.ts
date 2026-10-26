import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { nps, toCsv } = await import("./queries");

describe("analytics helpers", () => {
  it("computes NPS", () => {
    expect(nps([10, 9, 8, 3])).toBe(25);
    expect(nps([])).toBeNull();
  });
  it("writes safe CSV", () => {
    expect(toCsv([{ a: "x,y", b: "=SUM(A1)", c: null }])).toBe('a,b,c\n"x,y",\'=SUM(A1),');
  });
});
