"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { formatTime } from "@/lib/format";
import { PatientPicker } from "@/modules/patients/patient-picker";
import { bookAppointment, findSlots } from "./actions";

interface Doctor {
  id: string;
  name: string;
  specialties: string[];
}

export function BookingForm({
  doctors,
  specialties,
  rooms,
  today,
  patient,
  defaultSlot,
}: {
  doctors: Doctor[];
  specialties: { id: string; name: string }[];
  rooms: { id: string; name: string }[];
  today: string;
  patient?: { id: string; full_name: string; mrn: string };
  defaultSlot: number;
}) {
  const [specialty, setSpecialty] = useState("");
  const shown = useMemo(() => (specialty ? doctors.filter((d) => d.specialties.includes(specialty)) : doctors), [doctors, specialty]);
  const [picked, setDoctor] = useState(shown[0]?.id ?? "");
  // a department change can hide the picked doctor; fall back to the first one shown
  const doctor = shown.some((d) => d.id === picked) ? picked : (shown[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(defaultSlot);
  const [slots, setSlots] = useState<{ start: string; minutes: number; free: boolean }[]>([]);
  const [loading, start] = useTransition();

  useEffect(() => {
    if (!doctor || !date) return;
    start(async () => setSlots(await findSlots(doctor, date)));
  }, [doctor, date]);

  const specialtyForDoctor = specialty || doctors.find((d) => d.id === doctor)?.specialties[0] || "";

  return (
    <ActionForm action={bookAppointment}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Patient" className="sm:col-span-2">
          <PatientPicker initial={patient} required />
        </Field>
        <Field label="Department">
          <Select value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
            <option value="">All departments</option>
            {specialties.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Doctor">
          <Select name="doctor_id" value={doctor} onChange={(e) => setDoctor(e.target.value)} required>
            {shown.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        <input type="hidden" name="specialty_id" value={specialtyForDoctor} />
        <Field label="Date"><Input name="date" type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} required /></Field>
        <Field label="Time" hint="Pick a slot below or type a time">
          <Input name="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </Field>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Free slots {loading && <span className="text-muted">(loading…)</span>}</p>
        {slots.length ? (
          <div className="flex flex-wrap gap-1.5">
            {slots.map((s) => {
              const label = formatTime(s.start);
              const hhmm = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date(s.start));
              return (
                <button
                  key={s.start}
                  type="button"
                  disabled={!s.free}
                  onClick={() => { setTime(hhmm); setDuration(s.minutes); }}
                  className={`rounded-md border px-2.5 py-1 text-sm tabular-nums ${
                    time === hhmm ? "border-brand bg-brand text-brand-ink" : s.free ? "border-line bg-surface hover:border-brand" : "border-line bg-bg text-muted line-through"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted">No consulting hours set for this doctor on this day (or on leave). You can still type a time.</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Minutes"><Input name="duration" type="number" min={5} max={480} value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></Field>
        <Field label="Visit type">
          <Select name="visit_type" defaultValue="new">
            <option value="new">New</option>
            <option value="follow_up">Follow-up</option>
            <option value="procedure">Procedure</option>
          </Select>
        </Field>
        <Field label="Booked via">
          <Select name="source" defaultValue="front_desk">
            <option value="front_desk">Front desk</option>
            <option value="phone">Phone</option>
            <option value="online">Online</option>
          </Select>
        </Field>
        <Field label="Room">
          <Select name="room_id" defaultValue="">
            <option value="">—</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Reason for visit"><Textarea name="reason" rows={2} /></Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="check_in_now" /> Walk-in: check the patient in now and give a token
      </label>
      <div><SubmitButton>Book appointment</SubmitButton></div>
    </ActionForm>
  );
}
