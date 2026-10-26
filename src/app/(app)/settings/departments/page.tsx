import { ActionForm } from "@/components/ui/action-form";
import { ActionButton } from "@/components/ui/confirm-button";
import { Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Badge, Card, PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { BUILT_IN_PANELS, panelLabel } from "@/modules/consultation/panels";
import { addFormTemplate, addRoom, addSpecialty, setPanel, setSpecialtyActive } from "@/modules/settings/actions";

export const metadata = { title: "Departments" };

export default async function DepartmentsPage() {
  await requirePermission("settings.manage");
  const supabase = await createClient();
  const [{ data: specialties }, { data: panels }, { data: rooms }, { data: templates }] = await Promise.all([
    supabase.from("specialties").select("*").is("deleted_at", null).order("sort_order"),
    supabase.from("specialty_panels").select("*").order("sort_order"),
    supabase.from("rooms").select("*").is("deleted_at", null).order("name"),
    supabase.from("form_templates").select("id, name, specialty_id").eq("is_active", true),
  ]);

  return (
    <>
      <PageHeader
        title="Departments"
        description="Every department shares one consultation page. Switch on the panels each department needs; doctors can still open any enabled panel."
      />
      <div className="grid gap-4">
        {(specialties ?? []).map((s) => {
          const mine = (panels ?? []).filter((p) => p.specialty_id === s.id);
          const keys = [...Object.keys(BUILT_IN_PANELS), ...(templates ?? []).filter((t) => t.specialty_id === s.id).map((t) => `form:${t.id}`)];
          return (
            <Card
              key={s.id}
              title={s.name}
              actions={
                <ActionButton action={setSpecialtyActive.bind(null, s.id, !s.is_active)} variant="ghost">
                  {s.is_active ? "Hide department" : "Show department"}
                </ActionButton>
              }
            >
              {!s.is_active && <Badge tone="warn" className="mb-3">Hidden from booking</Badge>}
              <p className="mb-2 text-sm text-muted">Always shown: vitals, history, examination, diagnosis (ICD-10), prescription.</p>
              <div className="flex flex-wrap gap-2">
                {keys.map((k) => {
                  const enabled = mine.some((p) => p.panel_key === k && p.enabled);
                  return (
                    <ActionButton key={k} action={setPanel.bind(null, s.id, k, !enabled)} variant={enabled ? "primary" : "secondary"}>
                      {enabled ? "✓ " : "+ "}
                      {panelLabel(k, templates ?? [])}
                    </ActionButton>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Add a department">
          <ActionForm action={addSpecialty} resetOnSuccess>
            <Field label="Name"><Input name="name" placeholder="Dental" required /></Field>
            <Field label="Code" hint="Lowercase, e.g. dental"><Input name="code" required /></Field>
            <div><SubmitButton variant="secondary">Add department</SubmitButton></div>
          </ActionForm>
        </Card>

        <Card title="Rooms">
          <ul className="mb-4 flex flex-wrap gap-2">
            {(rooms ?? []).map((r) => <Badge key={r.id}>{r.name}</Badge>)}
            {!rooms?.length && <li className="text-sm text-muted">No rooms yet.</li>}
          </ul>
          <ActionForm action={addRoom} resetOnSuccess>
            <Field label="Room name"><Input name="name" placeholder="Consultation 1" required /></Field>
            <Field label="Department (optional)">
              <Select name="specialty_id" defaultValue="">
                <option value="">Any</option>
                {(specialties ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <div><SubmitButton variant="secondary">Add room</SubmitButton></div>
          </ActionForm>
        </Card>
      </div>

      <Card title="Build a custom form" className="mt-6">
        <ActionForm action={addFormTemplate} resetOnSuccess>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Form name"><Input name="name" placeholder="Visual acuity" required /></Field>
            <Field label="Department">
              <Select name="specialty_id" required>
                {(specialties ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field
            label="Fields, one per line"
            hint="Label | type | options. Types: text, textarea, number, select, checkbox, date. Example: Right eye | select | 6/6, 6/9, 6/12"
          >
            <Textarea name="fields" rows={6} placeholder={"Right eye | select | 6/6, 6/9, 6/12, 6/18\nLeft eye | select | 6/6, 6/9, 6/12, 6/18\nIntraocular pressure (mmHg) | number\nNotes | textarea"} required />
          </Field>
          <div><SubmitButton variant="secondary">Create form</SubmitButton></div>
        </ActionForm>
      </Card>
    </>
  );
}
