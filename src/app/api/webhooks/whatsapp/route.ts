import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOptOut, validWhatsAppSignature } from "@/modules/messages/webhook";

// Meta's subscription check.
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const token = env().WHATSAPP_VERIFY_TOKEN;
  if (token && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === token) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

type Change = {
  value?: {
    statuses?: { id: string; status: "sent" | "delivered" | "read" | "failed"; errors?: { title?: string }[] }[];
    messages?: { from: string; type: string; text?: { body: string }; button?: { text: string } }[];
  };
};

export async function POST(request: NextRequest) {
  const secret = env().WHATSAPP_APP_SECRET;
  const raw = await request.text();
  if (!secret || !validWhatsAppSignature(raw, request.headers.get("x-hub-signature-256"), secret)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }
  const payload = JSON.parse(raw) as { entry?: { changes?: Change[] }[] };
  const admin = createAdminClient();

  for (const change of payload.entry?.flatMap((e) => e.changes ?? []) ?? []) {
    for (const s of change.value?.statuses ?? []) {
      const patch =
        s.status === "delivered"
          ? { status: "delivered" as const, delivered_at: new Date().toISOString() }
          : s.status === "read"
            ? { status: "read" as const }
            : s.status === "failed"
              ? { status: "failed" as const, last_error: s.errors?.[0]?.title ?? "Delivery failed" }
              : null;
      if (patch) await admin.from("message_queue").update(patch).eq("provider_message_id", s.id);
    }
    for (const m of change.value?.messages ?? []) {
      const text = m.text?.body ?? m.button?.text ?? "";
      if (!isOptOut(text)) continue;
      const local = m.from.startsWith("91") && m.from.length === 12 ? m.from.slice(2) : m.from;
      await admin
        .from("patients")
        .update({ consent_messaging: false, messaging_opt_out_at: new Date().toISOString() })
        .in("phone", [local, m.from]);
      await admin.from("message_queue").update({ status: "cancelled", last_error: "Patient replied STOP" }).eq("status", "queued").in("to_address", [local, m.from]);
    }
  }
  return NextResponse.json({ ok: true });
}
