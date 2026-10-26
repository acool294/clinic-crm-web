import "server-only";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { send } from "./providers";
import { positional, render, templateValues } from "./render";

const RETRY_MINUTES = [5, 15, 60, 240];

/** Enqueue what is due, then send up to `limit` queued messages. Safe to run every few minutes. */
export async function runMessageJob(limit = 50) {
  const admin = createAdminClient();
  const { data: enqueued, error: enqueueError } = await admin.rpc("enqueue_due_messages", {});
  if (enqueueError) throw new Error(`enqueue failed: ${enqueueError.message}`);

  const { data: batch, error } = await admin.rpc("claim_messages", { p_limit: limit });
  if (error) throw new Error(`claim failed: ${error.message}`);

  const counts = { sent: 0, failed: 0, skipped: 0 };
  for (const m of batch ?? []) {
    const [{ data: template }, { data: patient }] = await Promise.all([
      admin.from("message_templates").select("body, provider_template, is_active").eq("clinic_id", m.clinic_id).eq("key", m.template_key).eq("channel", m.channel).maybeSingle(),
      m.patient_id
        ? admin.from("patients").select("consent_messaging, messaging_opt_out_at, deleted_at").eq("id", m.patient_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // consent is checked again at send time: the patient may have opted out since it was queued
    if (patient && (!patient.consent_messaging || patient.messaging_opt_out_at || patient.deleted_at)) {
      await admin.from("message_queue").update({ status: "skipped", last_error: "Patient opted out" }).eq("id", m.id);
      counts.skipped++;
      continue;
    }
    if (!template?.is_active) {
      await admin.from("message_queue").update({ status: "skipped", last_error: "Template switched off" }).eq("id", m.id);
      counts.skipped++;
      continue;
    }

    const values = templateValues(m.context as Record<string, unknown>, env().APP_URL);
    const body = render(template.body, values);
    const result = await send({
      channel: m.channel,
      to: m.to_address,
      body,
      params: positional(template.body, values),
      providerTemplate: template.provider_template,
      subject: values.clinic_name ? `Message from ${values.clinic_name}` : undefined,
    });

    if (result.status === "failed" && m.attempts < 5) {
      const wait = RETRY_MINUTES[Math.min(m.attempts - 1, RETRY_MINUTES.length - 1)];
      await admin
        .from("message_queue")
        .update({ status: "queued", body, provider: result.provider, last_error: result.error ?? null, scheduled_for: new Date(Date.now() + wait * 60_000).toISOString() })
        .eq("id", m.id);
    } else {
      await admin
        .from("message_queue")
        .update({
          status: result.status,
          body,
          provider: result.provider,
          provider_message_id: result.providerMessageId ?? null,
          last_error: result.error ?? null,
          sent_at: result.status === "sent" ? new Date().toISOString() : null,
        })
        .eq("id", m.id);
    }
    counts[result.status]++;
  }
  return { enqueued: enqueued ?? 0, processed: batch?.length ?? 0, ...counts };
}
