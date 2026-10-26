import { describe, expect, it } from "vitest";
import { amountInWords } from "./words";

describe("amount in words", () => {
  it("uses lakh and crore", () => {
    expect(amountInWords(12345600)).toBe("Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six Only");
    expect(amountInWords(1234567800)).toBe("Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only");
  });
  it("adds paise", () => {
    expect(amountInWords(50050)).toBe("Rupees Five Hundred and Fifty Paise Only");
    expect(amountInWords(0)).toBe("Rupees Zero Only");
  });
});
