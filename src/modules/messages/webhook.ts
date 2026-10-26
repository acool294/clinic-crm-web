import { createHmac, timingSafeEqual } from "node:crypto";

/** Meta signs webhook bodies with the app secret: X-Hub-Signature-256: sha256=<hex>. */
export function validWhatsAppSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const given = header.slice(7);
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

const STOP_WORDS = ["stop", "unsubscribe", "stop all", "band karo"];

export function isOptOut(text: string): boolean {
  return STOP_WORDS.includes(text.trim().toLowerCase());
}
