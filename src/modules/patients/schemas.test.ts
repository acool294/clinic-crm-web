import { describe, expect, it } from "vitest";
import { normalizePhone, patientSchema } from "./schemas";

describe("patient form", () => {
  it("normalises Indian mobile numbers", () => {
    expect(normalizePhone("+91 98765 43210")).toBe("9876543210");
    expect(normalizePhone("098765-43210")).toBe("9876543210");
    expect(normalizePhone("")).toBeNull();
  });

  it("rejects a future date of birth and a bad phone", () => {
    const r = patientSchema.safeParse({ first_name: "A", dob: "2999-01-01", phone: "123" });
    expect(r.success).toBe(false);
    const keys = r.error!.issues.map((i) => i.path[0]);
    expect(keys).toContain("dob");
    expect(keys).toContain("phone");
  });

  it("cleans tags and empty fields", () => {
    const r = patientSchema.parse({ first_name: "Ravi", tags: "Diabetic, VIP,diabetic", email: "" });
    expect(r.tags).toEqual(["diabetic", "vip"]);
    expect(r.email).toBeNull();
    expect(r.last_name).toBeNull();
  });
});
