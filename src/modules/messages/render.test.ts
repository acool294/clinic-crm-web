import { describe, expect, it } from "vitest";
import { positional, render, templateValues, toE164Digits } from "./render";

describe("message templates", () => {
  const ctx = { patient_name: "Ravi Kumar", doctor_name: "Dr Mehta", clinic_name: "Asha Clinic", starts_at: "2026-11-02T04:30:00Z", timezone: "Asia/Kolkata" };

  it("fills placeholders with clinic-time dates", () => {
    const v = templateValues(ctx, "https://crm.example.in");
    expect(render("Hi {{patient_name}}, {{doctor_name}} on {{date}} at {{time}}.", v)).toBe("Hi Ravi Kumar, Dr Mehta on Mon 2 Nov at 10:00 AM.");
  });

  it("drops unknown placeholders and builds feedback links", () => {
    const v = templateValues({ feedback_token: "abc" }, "https://crm.example.in/");
    expect(render("Rate us: {{link}} {{nope}}", v)).toBe("Rate us: https://crm.example.in/f/abc");
  });

  it("lists positional variables in order", () => {
    expect(positional("{{a_b}} and {{c}}", { a_b: "1", c: "2" })).toEqual(["1", "2"]);
  });

  it("adds the Indian country code", () => {
    expect(toE164Digits("98765 43210")).toBe("919876543210");
    expect(toE164Digits("447700900123")).toBe("447700900123");
  });
});
