import "server-only";
import { after } from "next/server";
import type { Json } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Queues a message to a patient for every active channel of the template,
 * if they consented and have not opted out. Called after an action the user
 * was allowed to take; the job sends it.
 */
export async function enqueueForPatient(opts: {
  clinicId: string;
  patientId: string;
  key: "appointment_booked" | "receipt";
  context: Record<string, Json>;
  relatedEntity?: string;
  relatedId?: string;
}) {
  const admin = createAdminClient();
  const { data: patient } = await admin
    .from("patients")
    .select("full_name, first_name, phone, email, consent_messaging, messaging_opt_out_at, clinic_id")
    .eq("id", opts.patientId)
    .single();
  if (!patient || patient.clinic_id !== opts.clinicId || !patient.consent_messaging || patient.messaging_opt_out_at) return;

  const [{ data: templates }, { data: clinic }] = await Promise.all([
    admin.from("message_templates").select("channel").eq("clinic_id", opts.clinicId).eq("key", opts.key).eq("is_active", true),
    admin.from("clinics").select("name, timezone").eq("id", opts.clinicId).single(),
  ]);
  const rows = (templates ?? [])
    .map((t) => ({
      channel: t.channel,
      to: t.channel === "email" ? patient.email : patient.phone,
    }))
    .filter((r): r is { channel: typeof r.channel; to: string } => !!r.to)
    .map((r) => ({
      clinic_id: opts.clinicId,
      patient_id: opts.patientId,
      template_key: opts.key,
      channel: r.channel,
      to_address: r.to,
      context: { patient_name: patient.full_name, clinic_name: clinic?.name ?? "", timezone: clinic?.timezone ?? "Asia/Kolkata", ...opts.context },
      related_entity: opts.relatedEntity ?? null,
      related_id: opts.relatedId ?? null,
      dedupe_key: opts.relatedId ? `${opts.key}:${opts.relatedId}:${r.channel}:${Date.now()}` : null,
    }));
  if (!rows.length) return;
  await admin.from("message_queue").insert(rows);
  // send it once the response is out, instead of waiting for the daily run
  after(async () => {
    const { runMessageJob } = await import("./job");
    await runMessageJob(20).catch((e) => console.error("message send failed", e));
  });
}
