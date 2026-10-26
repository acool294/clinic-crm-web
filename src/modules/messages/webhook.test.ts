import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isOptOut, validWhatsAppSignature } from "./webhook";

describe("WhatsApp webhook", () => {
  it("accepts only correctly signed bodies", () => {
    const body = '{"entry":[]}';
    const sig = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
    expect(validWhatsAppSignature(body, sig, "secret")).toBe(true);
    expect(validWhatsAppSignature(body, sig, "other")).toBe(false);
    expect(validWhatsAppSignature(body + " ", sig, "secret")).toBe(false);
    expect(validWhatsAppSignature(body, null, "secret")).toBe(false);
  });
  it("recognises opt-out replies", () => {
    expect(isOptOut(" STOP ")).toBe(true);
    expect(isOptOut("stop please")).toBe(false);
  });
});
