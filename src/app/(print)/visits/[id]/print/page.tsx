import { notFound } from "next/navigation";
import { Letterhead, LetterheadFooter } from "@/components/print/letterhead";
import { PrintButton } from "@/components/print/print-button";
import { requirePermission } from "@/lib/auth/session";
import { age, formatDate, SEX_LABELS } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Prescription" };

export default async function PrescriptionPrint({ params }: PageProps<"/visits/[id]/print">) {
  await requirePermission("clinical.read");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: enc }, { data: clinic }] = await Promise.all([
    supabase
      .from("encounters")
      .select("*, patient:patients(*), doctor:staff!encounters_doctor_id_fkey(full_name, title, registration_number), diagnoses(description, icd10_code, deleted_at), prescriptions(notes, prescription_items(*))")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("clinics").select("*").single(),
  ]);
  if (!enc || !enc.patient || !clinic) notFound();
  const { data: v } = await supabase
    .from("vitals")
    .select("*")
    .eq("encounter_id", id)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: allergies } = await supabase.from("patient_allergies").select("allergen").eq("patient_id", enc.patient.id).is("deleted_at", null);
  await supabase.rpc("log_event", { p_action: "print", p_entity: "prescriptions", p_entity_id: id, p_patient_id: enc.patient.id });

  const p = enc.patient;
  const items = [...(enc.prescriptions?.prescription_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const dx = enc.diagnoses.filter((d) => !d.deleted_at);
  const waText = encodeURIComponent(
    [`${clinic.name}: prescription for ${p.full_name} (${formatDate(enc.started_at)})`, ...items.map((i, n) => `${n + 1}. ${i.drug_name} ${i.dose ?? ""} ${i.frequency ?? ""} ${i.timing ?? ""} ${i.duration_days ? `x ${i.duration_days} days` : ""}`.replace(/\s+/g, " ")), enc.advice ? `Advice: ${enc.advice}` : "", enc.follow_up_on ? `Follow-up: ${formatDate(enc.follow_up_on)}` : ""].filter(Boolean).join("\n"),
  );

  return (
    <article className="text-sm">
      <div className="no-print mb-4 flex gap-2">
        <PrintButton label="Print / save as PDF" />
        {p.phone && (
          <a href={`https://wa.me/91${p.phone.slice(-10)}?text=${waText}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm">
            Send on WhatsApp
          </a>
        )}
      </div>
      <Letterhead
        clinic={clinic}
        right={
          <div className="text-right">
            <p className="font-semibold">{enc.doctor?.full_name}</p>
            {enc.doctor?.title && <p className="text-xs">{enc.doctor.title}</p>}
            {enc.doctor?.registration_number && <p className="text-xs">Reg. {enc.doctor.registration_number}</p>}
          </div>
        }
      />
      <section className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 border-b border-line pb-3">
        <p><span className="text-muted">Patient:</span> <span className="font-medium">{p.full_name}</span></p>
        <p className="text-right"><span className="text-muted">Date:</span> {formatDate(enc.started_at)}</p>
        <p><span className="text-muted">Age / sex:</span> {[age(p.dob), SEX_LABELS[p.sex]].filter(Boolean).join(" / ")}</p>
        <p className="text-right"><span className="text-muted">MRN:</span> {p.mrn}</p>
        {allergies && allergies.length > 0 && <p className="col-span-2 font-medium">Allergies: {allergies.map((a) => a.allergen).join(", ")}</p>}
        {v && (
          <p className="col-span-2 text-xs">
            {[v.bp_systolic && `BP ${v.bp_systolic}/${v.bp_diastolic}`, v.pulse_bpm && `Pulse ${v.pulse_bpm}`, v.temperature_c && `Temp ${v.temperature_c} °C`, v.spo2 && `SpO₂ ${v.spo2}%`, v.weight_kg && `Wt ${v.weight_kg} kg`, v.height_cm && `Ht ${v.height_cm} cm`].filter(Boolean).join(" · ")}
          </p>
        )}
      </section>
      {enc.chief_complaint && <p className="mt-3"><span className="font-semibold">Complaints:</span> {enc.chief_complaint}</p>}
      {dx.length > 0 && <p className="mt-1"><span className="font-semibold">Diagnosis:</span> {dx.map((d) => d.description + (d.icd10_code ? ` (${d.icd10_code})` : "")).join("; ")}</p>}

      <h2 className="mt-4 text-2xl font-serif">℞</h2>
      <ol className="mt-1 flex flex-col gap-2">
        {items.map((i, n) => (
          <li key={i.id} className="grid grid-cols-[1.5rem_1fr]">
            <span>{n + 1}.</span>
            <div>
              <p className="font-medium">{i.drug_name}</p>
              <p className="text-xs">
                {[i.dose, i.frequency, i.timing, i.duration_days && `for ${i.duration_days} days`, i.route && i.route !== "oral" ? i.route : null].filter(Boolean).join(" · ")}
                {i.instructions && <> — {i.instructions}</>}
              </p>
            </div>
          </li>
        ))}
        {!items.length && <li className="text-muted">No medicines prescribed.</li>}
      </ol>
      {enc.prescriptions?.notes && <p className="mt-3">{enc.prescriptions.notes}</p>}
      {enc.advice && <p className="mt-3"><span className="font-semibold">Advice:</span> <span className="whitespace-pre-wrap">{enc.advice}</span></p>}
      {enc.follow_up_on && <p className="mt-2"><span className="font-semibold">Follow-up:</span> {formatDate(enc.follow_up_on)}</p>}

      <div className="mt-12 flex justify-end">
        <div className="w-56 border-t border-ink pt-1 text-center text-xs">{enc.doctor?.full_name}<br />Signature</div>
      </div>
      <LetterheadFooter clinic={clinic} />
    </article>
  );
}
