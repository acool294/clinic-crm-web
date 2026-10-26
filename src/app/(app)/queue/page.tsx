import Link from "next/link";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { buttonClass } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/confirm-button";
import { Select } from "@/components/ui/form";
import { Badge, Card, PageHeader } from "@/components/ui/layout";
import { can, requirePermission } from "@/lib/auth/session";
import { age, formatTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { checkIn, setAppointmentStatus, startConsultation } from "@/modules/appointments/actions";
import { todaysAppointments, waitMinutes } from "@/modules/appointments/today";

export const metadata = { title: "Queue" };

export default async function QueuePage({ searchParams }: PageProps<"/queue">) {
  const session = await requirePermission("appointments.read");
  const sp = await searchParams;
  const supabase = await createClient();
  const isDoctor = session.roles.includes("doctor");
  const mine = sp.mine === "1" || (sp.mine === undefined && isDoctor && !session.roles.includes("receptionist"));
  const specialty = typeof sp.specialty === "string" ? sp.specialty : "";
  const { data: specialties } = await supabase.from("specialties").select("id, name").eq("is_active", true).order("sort_order");
  const appts = await todaysAppointments(supabase, { doctorId: mine ? session.staffId : undefined, specialtyId: specialty || undefined });

  const booked = appts.filter((a) => a.status === "scheduled" || a.status === "confirmed");
  const waiting = appts
    .filter((a) => a.status === "checked_in")
    .sort((a, b) => (a.queue_tokens?.token_number ?? 0) - (b.queue_tokens?.token_number ?? 0));
  const withDoctor = appts.filter((a) => a.status === "in_consultation");
  const done = appts.filter((a) => a.status === "completed");
  const manage = can(session, "queue.manage");
  const consult = can(session, "clinical.write");

  type Row = (typeof appts)[number];
  const Person = ({ a }: { a: Row }) => (
    <div className="min-w-0">
      <Link href={`/patients/${a.patient_id}`} className="font-medium hover:underline">{a.patient?.full_name}</Link>
      <p className="truncate text-xs text-muted">
        {[a.patient?.mrn, age(a.patient?.dob), a.doctor?.full_name, a.room?.name].filter(Boolean).join(" · ")}
      </p>
    </div>
  );

  return (
    <>
      <AutoRefresh seconds={20} />
      <PageHeader
        title="Queue"
        description="Updates every 20 seconds."
        actions={
          <>
            {can(session, "appointments.write") && <Link href="/calendar/new" className={buttonClass("primary")}>Walk-in / book</Link>}
            <Link href={`/display${specialty ? `?specialty=${specialty}` : ""}`} target="_blank" className={buttonClass("secondary")}>Waiting-room screen</Link>
          </>
        }
      />
      <form className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Select name="specialty" defaultValue={specialty} className="h-8 w-52">
          <option value="">All departments</option>
          {(specialties ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        {isDoctor && (
          <Select name="mine" defaultValue={mine ? "1" : "0"} className="h-8 w-40">
            <option value="1">My patients</option>
            <option value="0">Everyone&apos;s</option>
          </Select>
        )}
        <button className={buttonClass("secondary", "sm")}>Show</button>
      </form>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card title={`Booked (${booked.length})`}>
          <ul className="flex flex-col gap-3">
            {booked.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-2">
                <div className="flex gap-2"><span className="w-16 shrink-0 text-xs text-muted tabular-nums">{formatTime(a.starts_at)}</span><Person a={a} /></div>
                {manage && <ActionButton action={checkIn.bind(null, a.id)} variant="primary">Check in</ActionButton>}
              </li>
            ))}
          </ul>
        </Card>
        <Card title={`Waiting (${waiting.length})`}>
          <ul className="flex flex-col gap-3">
            {waiting.map((a) => {
              const wait = waitMinutes(a.checked_in_at);
              return (
                <li key={a.id} className="flex items-start justify-between gap-2">
                  <div className="flex gap-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-warn-soft text-sm font-semibold text-warn">{a.queue_tokens?.token_number}</span>
                    <div>
                      <Person a={a} />
                      <Badge tone={wait > 30 ? "danger" : "neutral"} className="mt-1">{wait} min</Badge>
                    </div>
                  </div>
                  {consult && a.doctor_id === session.staffId ? (
                    <ActionButton action={startConsultation.bind(null, a.id)} variant="primary">Call in</ActionButton>
                  ) : (
                    manage && <ActionButton action={setAppointmentStatus.bind(null, a.id, "in_consultation")}>Send in</ActionButton>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title={`With doctor (${withDoctor.length})`}>
          <ul className="flex flex-col gap-3">
            {withDoctor.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-2">
                <Person a={a} />
                {consult && a.doctor_id === session.staffId ? (
                  <Link href={a.encounters?.id ? `/visits/${a.encounters.id}` : "#"} className={buttonClass("secondary", "sm")}>Open</Link>
                ) : (
                  manage && <ActionButton action={setAppointmentStatus.bind(null, a.id, "completed")}>Done</ActionButton>
                )}
              </li>
            ))}
          </ul>
        </Card>
        <Card title={`Done (${done.length})`}>
          <ul className="flex flex-col gap-3">
            {done.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-2">
                <Person a={a} />
                {can(session, "billing.write") && (
                  <Link href={`/billing/invoices/new?appointment=${a.id}`} className={buttonClass("ghost", "sm")}>Bill</Link>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
