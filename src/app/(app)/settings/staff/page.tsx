import { ActionForm } from "@/components/ui/action-form";
import { ActionButton } from "@/components/ui/confirm-button";
import { Field, Input, Select, SubmitButton } from "@/components/ui/form";
import { Badge, Card, PageHeader, Table } from "@/components/ui/layout";
import { can, requirePermission } from "@/lib/auth/session";
import { ROLE_LABELS, ROLES } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { addLeave, addSchedule, deleteSchedule, inviteStaff, setStaffActive, updateStaff } from "@/modules/settings/actions";
import { WEEKDAY_LABELS } from "@/modules/settings/schemas";

export const metadata = { title: "Staff" };

function RolePicker({ selected = [] }: { selected?: string[] }) {
  return (
    <fieldset className="flex flex-wrap gap-3 text-sm">
      <legend className="mb-1.5 font-medium">Roles</legend>
      {ROLES.map((r) => (
        <label key={r} className="flex items-center gap-1.5">
          <input type="checkbox" name="roles" value={r} defaultChecked={selected.includes(r)} /> {ROLE_LABELS[r]}
        </label>
      ))}
    </fieldset>
  );
}

function SpecialtyPicker({ specialties, selected = [] }: { specialties: { id: string; name: string }[]; selected?: string[] }) {
  return (
    <fieldset className="flex flex-wrap gap-3 text-sm">
      <legend className="mb-1.5 font-medium">Departments (doctors; first ticked is primary)</legend>
      {specialties.map((s) => (
        <label key={s.id} className="flex items-center gap-1.5">
          <input type="checkbox" name="specialties" value={s.id} defaultChecked={selected.includes(s.id)} /> {s.name}
        </label>
      ))}
    </fieldset>
  );
}

export default async function StaffPage() {
  const session = await requirePermission("staff.read");
  const manage = can(session, "staff.manage");
  const supabase = await createClient();
  const [{ data: staff }, { data: specialties }, { data: schedules }, { data: rooms }, { data: leaves }] = await Promise.all([
    supabase
      .from("staff")
      .select("*, staff_roles(role), doctor_specialties(specialty_id, is_primary)")
      .is("deleted_at", null)
      .order("full_name"),
    supabase.from("specialties").select("id, name").eq("is_active", true).order("sort_order"),
    supabase.from("doctor_schedules").select("*").order("weekday").order("start_time"),
    supabase.from("rooms").select("id, name").eq("is_active", true),
    supabase.from("doctor_leaves").select("*").gte("ends_on", new Date().toISOString().slice(0, 10)).order("starts_on"),
  ]);
  const specs = specialties ?? [];
  const doctors = (staff ?? []).filter((s) => s.staff_roles.some((r) => r.role === "doctor"));

  return (
    <>
      <PageHeader title="Staff" description="Who can sign in, what they can do, and when doctors see patients." />

      {manage && (
        <Card title="Invite someone" className="mb-6">
          <ActionForm action={inviteStaff} resetOnSuccess>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name"><Input name="full_name" required /></Field>
              <Field label="Email" hint="They get a link to choose a password"><Input name="email" type="email" required /></Field>
              <Field label="Phone"><Input name="phone" /></Field>
              <Field label="Qualification" hint="e.g. MBBS, MD (Paediatrics)"><Input name="title" /></Field>
              <Field label="Medical council registration no."><Input name="registration_number" /></Field>
            </div>
            <RolePicker />
            <SpecialtyPicker specialties={specs} />
            <div><SubmitButton pendingText="Sending invite…">Send invite</SubmitButton></div>
          </ActionForm>
        </Card>
      )}

      <Card title={`Team (${staff?.length ?? 0})`}>
        <ul className="divide-y divide-line">
          {(staff ?? []).map((s) => {
            const roles = s.staff_roles.map((r) => r.role);
            const specIds = [...s.doctor_specialties].sort((a, b) => Number(b.is_primary) - Number(a.is_primary)).map((d) => d.specialty_id);
            return (
              <li key={s.id} className="py-3">
                <details>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
                    <span className="font-medium">{s.full_name}</span>
                    <span className="text-sm text-muted">{s.email}</span>
                    {roles.map((r) => <Badge key={r} tone="brand">{ROLE_LABELS[r]}</Badge>)}
                    {specIds.map((id) => <Badge key={id}>{specs.find((x) => x.id === id)?.name}</Badge>)}
                    {!s.is_active && <Badge tone="danger">Deactivated</Badge>}
                    {!s.user_id && <Badge tone="warn">No login</Badge>}
                  </summary>
                  {manage && (
                    <div className="mt-4 grid gap-4 rounded-md bg-bg p-4">
                      <ActionForm action={updateStaff.bind(null, s.id)}>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Full name"><Input name="full_name" defaultValue={s.full_name} required /></Field>
                          <Field label="Phone"><Input name="phone" defaultValue={s.phone ?? ""} /></Field>
                          <Field label="Qualification"><Input name="title" defaultValue={s.title ?? ""} /></Field>
                          <Field label="Registration no."><Input name="registration_number" defaultValue={s.registration_number ?? ""} /></Field>
                        </div>
                        <RolePicker selected={roles} />
                        <SpecialtyPicker specialties={specs} selected={specIds} />
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" name="restrict_to_own_patients" defaultChecked={s.restrict_to_own_patients} />
                          Only show this doctor patients they have seen or are booked with
                        </label>
                        <div className="flex gap-2">
                          <SubmitButton size="sm">Save</SubmitButton>
                          <ActionButton
                            action={setStaffActive.bind(null, s.id, !s.is_active)}
                            confirm={s.is_active ? `Deactivate ${s.full_name}? They lose access immediately.` : undefined}
                            variant={s.is_active ? "danger" : "secondary"}
                          >
                            {s.is_active ? "Deactivate" : "Reactivate"}
                          </ActionButton>
                        </div>
                      </ActionForm>
                    </div>
                  )}
                </details>
              </li>
            );
          })}
        </ul>
      </Card>

      {doctors.length > 0 && (
        <Card title="Consulting hours" className="mt-6">
          <Table>
            <thead><tr><th>Doctor</th><th>Day</th><th>Hours</th><th>Slot</th><th>Room</th><th /></tr></thead>
            <tbody>
              {(schedules ?? []).map((h) => (
                <tr key={h.id}>
                  <td>{doctors.find((d) => d.id === h.doctor_id)?.full_name}</td>
                  <td>{WEEKDAY_LABELS[h.weekday]}</td>
                  <td>{h.start_time.slice(0, 5)}–{h.end_time.slice(0, 5)}</td>
                  <td>{h.slot_minutes} min</td>
                  <td>{rooms?.find((r) => r.id === h.room_id)?.name ?? "—"}</td>
                  <td className="text-right">{manage && <ActionButton action={deleteSchedule.bind(null, h.id)} variant="ghost">Remove</ActionButton>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          {manage && (
            <ActionForm action={addSchedule} className="mt-4 grid gap-3 sm:grid-cols-7 sm:items-end">
              <Field label="Doctor" className="sm:col-span-2">
                <Select name="doctor_id" required>{doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}</Select>
              </Field>
              <Field label="Day">
                <Select name="weekday">{WEEKDAY_LABELS.map((l, i) => <option key={l} value={i}>{l}</option>)}</Select>
              </Field>
              <Field label="From"><Input name="start_time" type="time" defaultValue="10:00" /></Field>
              <Field label="To"><Input name="end_time" type="time" defaultValue="13:00" /></Field>
              <Field label="Slot (min)"><Input name="slot_minutes" type="number" defaultValue={15} /></Field>
              <SubmitButton size="md" variant="secondary">Add</SubmitButton>
            </ActionForm>
          )}
        </Card>
      )}

      {doctors.length > 0 && (
        <Card title="Upcoming leave" className="mt-6">
          <ul className="mb-4 text-sm">
            {(leaves ?? []).map((l) => (
              <li key={l.id}>
                {doctors.find((d) => d.id === l.doctor_id)?.full_name}: {formatDate(l.starts_on)} to {formatDate(l.ends_on)}
                {l.reason && ` (${l.reason})`}
              </li>
            ))}
            {!leaves?.length && <li className="text-muted">None planned.</li>}
          </ul>
          <ActionForm action={addLeave} resetOnSuccess className="grid gap-3 sm:grid-cols-5 sm:items-end">
            <Field label="Doctor">
              <Select name="doctor_id">{doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}</Select>
            </Field>
            <Field label="From"><Input name="starts_on" type="date" required /></Field>
            <Field label="To"><Input name="ends_on" type="date" required /></Field>
            <Field label="Reason"><Input name="reason" /></Field>
            <SubmitButton variant="secondary">Add leave</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
