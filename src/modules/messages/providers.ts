import "server-only";
import { env } from "@/lib/env";
import { toE164Digits } from "./render";

export interface SendResult {
  status: "sent" | "failed" | "skipped";
  provider: string;
  providerMessageId?: string;
  error?: string;
}

interface Outgoing {
  channel: "whatsapp" | "sms" | "email";
  to: string;
  body: string;
  /** values in placeholder order, for approved templates */
  params: string[];
  providerTemplate?: string | null;
  subject?: string;
}

async function whatsapp(m: Outgoing): Promise<SendResult> {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = env();
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) return { status: "skipped", provider: "whatsapp", error: "WhatsApp is not configured" };
  if (!m.providerTemplate) return { status: "skipped", provider: "whatsapp", error: "No approved WhatsApp template name set for this message" };
  const res = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toE164Digits(m.to),
      type: "template",
      template: {
        name: m.providerTemplate,
        language: { code: "en" },
        components: m.params.length ? [{ type: "body", parameters: m.params.map((text) => ({ type: "text", text })) }] : [],
      },
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!res.ok) return { status: "failed", provider: "whatsapp", error: json.error?.message ?? `HTTP ${res.status}` };
  return { status: "sent", provider: "whatsapp", providerMessageId: json.messages?.[0]?.id };
}

async function sms(m: Outgoing): Promise<SendResult> {
  const { MSG91_AUTH_KEY, MSG91_TEMPLATE_ID } = env();
  if (!MSG91_AUTH_KEY) return { status: "skipped", provider: "msg91", error: "SMS is not configured" };
  // DLT rules in India: SMS must use a registered template; variables are passed in order.
  const templateId = m.providerTemplate || MSG91_TEMPLATE_ID;
  if (!templateId) return { status: "skipped", provider: "msg91", error: "No DLT template id set" };
  const vars = Object.fromEntries(m.params.map((v, i) => [`var${i + 1}`, v]));
  const res = await fetch("https://control.msg91.com/api/v5/flow", {
    method: "POST",
    headers: { authkey: MSG91_AUTH_KEY, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({ template_id: templateId, short_url: "0", recipients: [{ mobiles: toE164Digits(m.to), ...vars }] }),
  });
  const json = (await res.json().catch(() => ({}))) as { type?: string; message?: string; request_id?: string };
  if (!res.ok || json.type === "error") return { status: "failed", provider: "msg91", error: json.message ?? `HTTP ${res.status}` };
  return { status: "sent", provider: "msg91", providerMessageId: json.request_id ?? json.message };
}

async function email(m: Outgoing): Promise<SendResult> {
  const { RESEND_API_KEY, EMAIL_FROM } = env();
  if (!RESEND_API_KEY || !EMAIL_FROM) return { status: "skipped", provider: "resend", error: "Email is not configured" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to: [m.to], subject: m.subject ?? "Message from your clinic", text: m.body }),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) return { status: "failed", provider: "resend", error: json.message ?? `HTTP ${res.status}` };
  return { status: "sent", provider: "resend", providerMessageId: json.id };
}

export async function send(m: Outgoing): Promise<SendResult> {
  try {
    if (m.channel === "whatsapp") return await whatsapp(m);
    if (m.channel === "sms") return await sms(m);
    return await email(m);
  } catch (e) {
    return { status: "failed", provider: m.channel, error: (e as Error).message };
  }
}
