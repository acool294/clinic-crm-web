import { ActionForm } from "@/components/ui/action-form";
import { ActionButton } from "@/components/ui/confirm-button";
import { Field, Input, Select, SubmitButton } from "@/components/ui/form";
import { Badge, Card, PageHeader, Table } from "@/components/ui/layout";
import { requirePermission } from "@/lib/auth/session";
import { money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { saveService, setServiceActive } from "@/modules/settings/actions";

export const metadata = { title: "Services and prices" };

type Option = { id: string; name: string };

function ServiceFields({
  specialties,
  doctors,
  s,
}: {
  specialties: Option[];
  doctors: Option[];
  s?: { name: string; code: string | null; category: string; specialty_id: string | null; doctor_id: string | null; visit_type: string | null; price_paise: number; gst_rate: number; sac_code: string | null; sessions: number | null };
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <Field label="Name" className="sm:col-span-2"><Input name="name" defaultValue={s?.name} required /></Field>
      <Field label="Price (₹)"><Input name="price" inputMode="decimal" defaultValue={s ? s.price_paise / 100 : ""} required /></Field>
      <Field label="GST %">
        <Select name="gst_rate" defaultValue={s?.gst_rate ?? 0}>
          {[0, 5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}%</option>)}
        </Select>
      </Field>
      <Field label="Category">
        <Select name="category" defaultValue={s?.category ?? "consultation"}>
          {["consultation", "procedure", "lab", "package", "product", "other"].map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </Field>
      <Field label="Department">
        <Select name="specialty_id" defaultValue={s?.specialty_id ?? ""}>
          <option value="">Any</option>
          {specialties.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
      </Field>
      <Field label="Doctor">
        <Select name="doctor_id" defaultValue={s?.doctor_id ?? ""}>
          <option value="">Any</option>
          {doctors.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
      </Field>
      <Field label="Visit type">
        <Select name="visit_type" defaultValue={s?.visit_type ?? ""}>
          <option value="">Any</option>
          <option value="new">New</option>
          <option value="follow_up">Follow-up</option>
          <option value="procedure">Procedure</option>
        </Select>
      </Field>
      <Field label="Code"><Input name="code" defaultValue={s?.code ?? ""} /></Field>
      <Field label="SAC code"><Input name="sac_code" defaultValue={s?.sac_code ?? ""} placeholder="999312" /></Field>
      <Field label="Sessions (packages)"><Input name="sessions" type="number" min={1} defaultValue={s?.sessions ?? ""} /></Field>
    </div>
  );
}

export default async function ServicesPage() {
  await requirePermission("services.manage");
  const supabase = await createClient();
  const [{ data: services }, { data: specialties }, { data: doctors }] = await Promise.all([
    supabase.from("services").select("*").order("is_active", { ascending: false }).order("name"),
    supabase.from("specialties").select("id, name").eq("is_active", true).order("sort_order"),
    supabase.from("staff").select("id, full_name, staff_roles!inner(role)").eq("staff_roles.role", "doctor").eq("is_active", true),
  ]);
  const docs = (doctors ?? []).map((d) => ({ id: d.id, name: d.full_name }));
  const specs = specialties ?? [];

  return (
    <>
      <PageHeader
        title="Services and prices"
        description="The fee is filled in from the appointment's doctor, department and visit type, most specific match first. Most clinical services are GST-exempt; cosmetic procedures usually attract 18%."
      />
      <Card title="Add a service" className="mb-6">
        <ActionForm action={saveService.bind(null, null)} resetOnSuccess>
          <ServiceFields specialties={specs} doctors={docs} />
          <div><SubmitButton>Add service</SubmitButton></div>
        </ActionForm>
      </Card>
      <Card title="Catalogue">
        <Table>
          <thead><tr><th>Service</th><th>Department</th><th>Doctor</th><th className="text-right">Price</th><th>GST</th><th /></tr></thead>
          <tbody>
            {(services ?? []).map((s) => (
              <tr key={s.id} className={s.is_active ? "" : "opacity-50"}>
                <td>
                  <details>
                    <summary className="cursor-pointer">{s.name} {s.visit_type && <Badge>{s.visit_type.replace("_", "-")}</Badge>}</summary>
                    <ActionForm action={saveService.bind(null, s.id)} className="mt-3 min-w-[40rem]">
                      <ServiceFields specialties={specs} doctors={docs} s={s} />
                      <div><SubmitButton size="sm">Save</SubmitButton></div>
                    </ActionForm>
                  </details>
                </td>
                <td>{specs.find((x) => x.id === s.specialty_id)?.name ?? "Any"}</td>
                <td>{docs.find((x) => x.id === s.doctor_id)?.name ?? "Any"}</td>
                <td className="text-right tabular-nums">{money(s.price_paise)}</td>
                <td>{s.gst_rate}%</td>
                <td className="text-right">
                  <ActionButton action={setServiceActive.bind(null, s.id, !s.is_active)} variant="ghost">
                    {s.is_active ? "Retire" : "Restore"}
                  </ActionButton>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
