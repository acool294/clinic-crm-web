import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/confirm-button";
import { Field, Input, Select, SubmitButton } from "@/components/ui/form";
import { Badge, Card, PageHeader } from "@/components/ui/layout";
import { cn } from "@/lib/cn";
import { can, requirePermission } from "@/lib/auth/session";
import { addDays, clinicDayRange, formatDate, formatTime, todayInClinic } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cancelAppointment, checkIn, rescheduleAppointment, setAppointmentStatus } from "@/modules/appointments/actions";
import { loadDoctors, STATUS_LABELS, STATUS_TONES } from "@/modules/appointments/queries";
import { weekdayOf } from "@/modules/appointments/slots";

export const metadata = { title: "Calendar" };

const START_HOUR = 8;
const END_HOUR = 21;
const PX_PER_MIN = 1.2;

function minutesIntoDay(iso: string) {
  const t = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date(iso));
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function hhmm(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date(iso));
}

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const session = await requirePermission("appointments.read");
  const sp = await searchParams;
  const today = todayInClinic();
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const view = sp.view === "week" ? "week" : "day";
  const specialty = typeof sp.specialty === "string" ? sp.specialty : "";
  const selectedId = typeof sp.appointment === "string" ? sp.appointment : "";

  const supabase = await createClient();
  const [allDoctors, { data: specialties }, { data: rooms }] = await Promise.all([
    loadDoctors(supabase),
    supabase.from("specialties").select("id, name").eq("is_active", true).order("sort_order"),
    supabase.from("rooms").select("id, name").eq("is_active", true),
  ]);
  const doctors = specialty ? allDoctors.filter((d) => d.specialties.includes(specialty)) : allDoctors;
  const doctorId = typeof sp.doctor === "string" && doctors.some((d) => d.id === sp.doctor) ? sp.doctor : doctors[0]?.id;

  // week starts Monday
  const weekStart = addDays(date, -((weekdayOf(date) + 6) % 7));
  const days = view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : [date];
  const rangeStart = clinicDayRange(days[0]).start;
  const rangeEnd = clinicDayRange(days[days.length - 1]).end;

  let q = supabase
    .from("appointments")
    .select("*, patient:patients(id, full_name, mrn, phone), queue_tokens(token_number)")
    .gte("starts_at", rangeStart.toISOString())
    .lt("starts_at", rangeEnd.toISOString())
    .is("deleted_at", null)
    .order("starts_at");
  if (view === "week" && doctorId) q = q.eq("doctor_id", doctorId);
  const { data: appts } = await q;
  const { data: leaves } = await supabase.from("doctor_leaves").select("*").lte("starts_on", days[days.length - 1]).gte("ends_on", days[0]);

  const columns =
    view === "week"
      ? days.map((d) => ({ key: d, label: formatDate(d), items: (appts ?? []).filter((a) => hhDate(a.starts_at) === d), leave: leaves?.some((l) => l.doctor_id === doctorId && l.starts_on <= d && d <= l.ends_on) }))
      : doctors.map((d) => ({ key: d.id, label: d.name, items: (appts ?? []).filter((a) => a.doctor_id === d.id), leave: leaves?.some((l) => l.doctor_id === d.id && l.starts_on <= date && date <= l.ends_on) }));

  const selected = (appts ?? []).find((a) => a.id === selectedId);
  const link = (patch: Record<string, string>) => {
    const params = new URLSearchParams({ date, view, ...(specialty ? { specialty } : {}), ...(doctorId ? { doctor: doctorId } : {}), ...patch });
    return `/calendar?${params}`;
  };
  const step = view === "week" ? 7 : 1;

  return (
    <>
      <PageHeader
        title="Calendar"
        description={view === "week" ? `Week of ${formatDate(weekStart)}` : formatDate(date)}
        actions={can(session, "appointments.write") && <ButtonLink href="/calendar/new">Book appointment</ButtonLink>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={link({ date: addDays(date, -step) })} className={buttonClass("secondary", "sm")}>←</Link>
        <Link href={link({ date: today })} className={buttonClass("secondary", "sm")}>Today</Link>
        <Link href={link({ date: addDays(date, step) })} className={buttonClass("secondary", "sm")}>→</Link>
        <form className="flex flex-wrap gap-2">
          <input type="hidden" name="view" value={view} />
          <Input name="date" type="date" defaultValue={date} className="h-8 w-40" />
          <Select name="specialty" defaultValue={specialty} className="h-8 w-48">
            <option value="">All departments</option>
            {(specialties ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          {view === "week" && (
            <Select name="doctor" defaultValue={doctorId} className="h-8 w-48">
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          )}
          <button className={buttonClass("secondary", "sm")}>Show</button>
        </form>
        <div className="ml-auto flex gap-1">
          <Link href={link({ view: "day" })} className={buttonClass(view === "day" ? "primary" : "secondary", "sm")}>Day</Link>
          <Link href={link({ view: "week" })} className={buttonClass(view === "week" ? "primary" : "secondary", "sm")}>Week</Link>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <div className="flex min-w-max">
            <div className="w-14 shrink-0 border-r border-line pt-10">
              {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                <div key={i} style={{ height: 60 * PX_PER_MIN }} className="pr-1 text-right text-xs text-muted">
                  {((START_HOUR + i - 1) % 12) + 1}{START_HOUR + i < 12 ? "am" : "pm"}
                </div>
              ))}
            </div>
            {columns.map((col) => (
              <div key={col.key} className="w-48 shrink-0 border-r border-line">
                <div className="sticky top-0 flex h-10 items-center justify-between border-b border-line bg-surface px-2 text-sm font-medium">
                  <span className="truncate">{col.label}</span>
                  {col.leave && <Badge tone="warn">Leave</Badge>}
                </div>
                <div className="relative" style={{ height: (END_HOUR - START_HOUR) * 60 * PX_PER_MIN }}>
                  {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                    <div key={i} className="absolute inset-x-0 border-t border-line/60" style={{ top: i * 60 * PX_PER_MIN }} />
                  ))}
                  {col.items.map((a) => {
                    const top = (minutesIntoDay(a.starts_at) - START_HOUR * 60) * PX_PER_MIN;
                    const height = Math.max(((new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60_000) * PX_PER_MIN, 18);
                    const off = a.status === "cancelled" || a.status === "no_show";
                    return (
                      <Link
                        key={a.id}
                        href={link({ appointment: a.id })}
                        className={cn(
                          "absolute inset-x-1 overflow-hidden rounded border px-1.5 py-0.5 text-xs",
                          off ? "border-line bg-bg text-muted line-through" : a.status === "completed" ? "border-ok/30 bg-ok-soft" : a.status === "checked_in" || a.status === "in_consultation" ? "border-warn/40 bg-warn-soft" : "border-brand/30 bg-brand-soft",
                          a.id === selectedId && "ring-2 ring-brand",
                        )}
                        style={{ top: Math.max(top, 0), height }}
                      >
                        <span className="font-medium">{formatTime(a.starts_at)}</span> {a.patient?.full_name}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
            {!columns.length && <p className="p-6 text-sm text-muted">No doctors in this department yet.</p>}
          </div>
        </div>

        <div>
          {selected ? (
            <Card title={selected.patient?.full_name ?? "Appointment"} actions={<Badge tone={STATUS_TONES[selected.status]}>{STATUS_LABELS[selected.status]}</Badge>}>
              <p className="text-sm">
                {formatDate(selected.starts_at)}, {formatTime(selected.starts_at)}–{formatTime(selected.ends_at)}
              </p>
              <p className="text-sm text-muted">
                {allDoctors.find((d) => d.id === selected.doctor_id)?.name} · {selected.visit_type.replace("_", "-")} · {selected.patient?.mrn} · {selected.patient?.phone}
              </p>
              {selected.reason && <p className="mt-2 text-sm">{selected.reason}</p>}
              {selected.queue_tokens && <p className="mt-2 text-sm font-medium">Token {selected.queue_tokens.token_number}</p>}
              {selected.cancel_reason && <p className="mt-2 text-sm text-muted">Cancelled: {selected.cancel_reason}</p>}

              <div className="mt-4 flex flex-wrap gap-2">
                <ButtonLink href={`/patients/${selected.patient_id}`} variant="secondary" size="sm">Open patient</ButtonLink>
                {can(session, "queue.manage") && ["scheduled", "confirmed"].includes(selected.status) && (
                  <>
                    <ActionButton action={checkIn.bind(null, selected.id)} variant="primary">Check in</ActionButton>
                    {selected.status === "scheduled" && <ActionButton action={setAppointmentStatus.bind(null, selected.id, "confirmed")}>Confirmed</ActionButton>}
                    <ActionButton action={setAppointmentStatus.bind(null, selected.id, "no_show")} confirm="Mark as no-show?">No-show</ActionButton>
                  </>
                )}
                {can(session, "queue.manage") && ["no_show"].includes(selected.status) && (
                  <ActionButton action={setAppointmentStatus.bind(null, selected.id, "scheduled")}>Undo no-show</ActionButton>
                )}
              </div>

              {can(session, "appointments.write") && ["scheduled", "confirmed"].includes(selected.status) && (
                <>
                  <h3 className="mt-5 mb-2 text-sm font-semibold">Reschedule</h3>
                  <ActionForm action={rescheduleAppointment.bind(null, selected.id)} className="gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Input name="date" type="date" defaultValue={hhDate(selected.starts_at)} />
                      <Input name="time" type="time" defaultValue={hhmm(selected.starts_at)} />
                      <Select name="doctor_id" defaultValue={selected.doctor_id}>
                        {allDoctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </Select>
                      <Input name="duration" type="number" defaultValue={(new Date(selected.ends_at).getTime() - new Date(selected.starts_at).getTime()) / 60_000} />
                      <Select name="room_id" defaultValue={selected.room_id ?? ""} className="col-span-2">
                        <option value="">No room</option>
                        {(rooms ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </Select>
                    </div>
                    <SubmitButton size="sm" variant="secondary">Move</SubmitButton>
                  </ActionForm>
                  <h3 className="mt-5 mb-2 text-sm font-semibold">Cancel</h3>
                  <ActionForm action={cancelAppointment.bind(null, selected.id)} className="gap-2">
                    <Field label="Reason"><Input name="reason" required /></Field>
                    <SubmitButton size="sm" variant="danger">Cancel appointment</SubmitButton>
                  </ActionForm>
                </>
              )}
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-muted">Select an appointment to see details, check the patient in, or reschedule.</p>
              <ul className="mt-3 flex flex-col gap-1 text-xs">
                {Object.entries(STATUS_LABELS).map(([k, l]) => <li key={k}><Badge tone={STATUS_TONES[k as keyof typeof STATUS_TONES]}>{l}</Badge></li>)}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function hhDate(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));
}
