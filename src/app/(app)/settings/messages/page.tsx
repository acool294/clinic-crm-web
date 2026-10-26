import { ActionForm } from "@/components/ui/action-form";
import { ActionButton } from "@/components/ui/confirm-button";
import { Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Badge, Card, PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { addRecallRule, saveTemplate, setRecallActive } from "@/modules/settings/actions";

export const metadata = { title: "Message settings" };

const KEY_LABELS: Record<string, string> = {
  appointment_booked: "Booking confirmation",
  appointment_reminder: "Appointment reminder (a day before)",
  follow_up: "Follow-up due",
  vaccination_due: "Vaccination due (3 days before)",
  birthday: "Birthday",
  receipt: "Payment receipt",
  feedback: "Feedback request (after the visit)",
  recall: "Recall (no visit for a while)",
};

export default async function MessageSettingsPage() {
  await requirePermission("messages.manage");
  const supabase = await createClient();
  const [{ data: templates }, { data: rules }, { data: specialties }] = await Promise.all([
    supabase.from("message_templates").select("*").order("key").order("channel"),
    supabase.from("recall_rules").select("*").order("created_at"),
    supabase.from("specialties").select("id, name").eq("is_active", true),
  ]);
  return (
    <>
      <PageHeader
        title="Messages"
        description="Sent only to patients who agreed to messages, and never after they opt out. Placeholders: {{patient_name}} {{clinic_name}} {{doctor_name}} {{date}} {{time}} {{vaccine}} {{amount}} {{link}}."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {(templates ?? []).map((t) => (
          <Card key={t.id} title={KEY_LABELS[t.key] ?? t.key} actions={<Badge tone={t.is_active ? "ok" : "neutral"}>{t.channel}</Badge>}>
            <ActionForm action={saveTemplate.bind(null, t.id)}>
              <Textarea name="body" defaultValue={t.body} rows={3} />
              {t.channel === "whatsapp" && (
                <Field label="Approved WhatsApp template name" hint="WhatsApp only delivers business-initiated messages through approved templates">
                  <Input name="provider_template" defaultValue={t.provider_template ?? ""} />
                </Field>
              )}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="is_active" defaultChecked={t.is_active} /> Send this message
                </label>
                <SubmitButton size="sm">Save</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        ))}
      </div>

      <Card title="Recall rules" className="mt-6">
        <ul className="mb-4 flex flex-col gap-2 text-sm">
          {(rules ?? []).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2">
              <span>
                {r.name}: {r.days_after_last_visit} days after the last visit
                {r.specialty_id && ` in ${specialties?.find((s) => s.id === r.specialty_id)?.name}`}
              </span>
              <ActionButton action={setRecallActive.bind(null, r.id, !r.is_active)} variant="ghost">
                {r.is_active ? "Pause" : "Resume"}
              </ActionButton>
            </li>
          ))}
          {!rules?.length && <li className="text-muted">No recall rules yet.</li>}
        </ul>
        <ActionForm action={addRecallRule} resetOnSuccess className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <Field label="Name"><Input name="name" placeholder="Diabetes 3-month review" required /></Field>
          <Field label="Days after last visit"><Input name="days_after_last_visit" type="number" defaultValue={90} required /></Field>
          <Field label="Department">
            <Select name="specialty_id" defaultValue="">
              <option value="">Any</option>
              {(specialties ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <SubmitButton variant="secondary">Add rule</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
