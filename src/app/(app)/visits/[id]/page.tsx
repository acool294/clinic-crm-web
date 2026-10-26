import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { ButtonLink } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/confirm-button";
import { Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, Table } from "@/components/ui/layout";
import { can, requirePermission } from "@/lib/auth/session";
import { age, formatDate, formatDateTime, SEX_LABELS, todayInClinic } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { gestationalAge, vaccineDueDate } from "@/modules/consultation/clinical-math";
import { addNote, addReferral, orderLabs, recordVaccination, recordVitals, removeDiagnosis, signEncounter } from "@/modules/consultation/actions";
import { BUILT_IN_PANELS, isBuiltInPanel, panelLabel } from "@/modules/consultation/panels";
import type { RxItem } from "@/modules/consultation/schemas";
import { BodyMap } from "@/modules/consultation/ui/body-map";
import { DiagnosisPicker } from "@/modules/consultation/ui/diagnosis-picker";
import { EncounterNotes } from "@/modules/consultation/ui/encounter-notes";
import { GrowthChart } from "@/modules/consultation/ui/growth-chart";
import { ObstetricPanel } from "@/modules/consultation/ui/obstetric-panel";
import { PanelForm, type PanelField } from "@/modules/consultation/ui/panel-form";
import { PrescriptionBuilder } from "@/modules/consultation/ui/prescription-builder";
import { UploadForm } from "@/modules/documents/upload-form";

export const metadata = { title: "Consultation" };

const ANTENATAL_FIELDS: PanelField[] = [
  { key: "weight_kg", label: "Weight", type: "number", unit: "kg" },
  { key: "bp", label: "BP", type: "text" },
  { key: "fundal_height_cm", label: "Fundal height", type: "number", unit: "cm" },
  { key: "fetal_heart_rate", label: "Fetal heart rate", type: "number", unit: "bpm" },
  { key: "presentation", label: "Presentation", type: "select", options: ["cephalic", "breech", "transverse", "not_assessed"] },
  { key: "fetal_movements", label: "Fetal movements", type: "select", options: ["present", "reduced", "absent"] },
  { key: "urine_albumin", label: "Urine albumin", type: "select", options: ["nil", "trace", "+", "++", "+++"] },
  { key: "urine_sugar", label: "Urine sugar", type: "select", options: ["nil", "trace", "+", "++", "+++"] },
  { key: "hb", label: "Hb", type: "number", unit: "g/dL" },
  { key: "oedema", label: "Oedema", type: "checkbox" },
  { key: "notes", label: "Notes", type: "textarea" },
];

const PROCEDURE_FIELDS: PanelField[] = [
  { key: "procedure", label: "Procedure", type: "text" },
  { key: "area", label: "Area treated", type: "text" },
  { key: "session_number", label: "Session", type: "number" },
  { key: "total_sessions", label: "Of", type: "number" },
  { key: "settings", label: "Settings (fluence, strength, passes…)", type: "textarea" },
  { key: "response", label: "Response / side effects", type: "textarea" },
  { key: "next_session_on", label: "Next session", type: "date" },
];

type FormRow = { id: string; encounter_id: string; panel_key: string; data: unknown; created_at: string };

export default async function VisitPage({ params, searchParams }: PageProps<"/visits/[id]">) {
  const session = await requirePermission("clinical.read");
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: enc } = await supabase
    .from("encounters")
    .select("*, patient:patients(*), doctor:staff!encounters_doctor_id_fkey(full_name), specialty:specialties(id, name)")
    .eq("id", id)
    .maybeSingle();
  if (!enc || !enc.patient) notFound();
  const p = enc.patient;
  await supabase.rpc("log_event", { p_action: "view", p_entity: "encounters", p_entity_id: id, p_patient_id: p.id });

  const locked = !!enc.signed_at || Date.now() - new Date(enc.created_at).getTime() > 24 * 3600_000;
  const write = can(session, "clinical.write") && !locked;
  const today = todayInClinic();

  const [
    { data: allergies },
    { data: vitals },
    { data: diagnoses },
    { data: rx },
    { data: notes },
    { data: forms },
    { data: panels },
    { data: templates },
    { data: history },
    { data: labTests },
    { data: labOrders },
    { data: specialties },
  ] = await Promise.all([
    supabase.from("patient_allergies").select("*").eq("patient_id", p.id).is("deleted_at", null),
    supabase.from("vitals").select("*").eq("patient_id", p.id).is("deleted_at", null).order("recorded_at"),
    supabase.from("diagnoses").select("*").eq("encounter_id", id).is("deleted_at", null).order("created_at"),
    supabase.from("prescriptions").select("*, prescription_items(*)").eq("encounter_id", id).maybeSingle(),
    supabase.from("clinical_notes").select("*, author:staff!clinical_notes_author_id_fkey(full_name)").eq("patient_id", p.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("encounter_forms").select("id, encounter_id, panel_key, data, created_at").eq("patient_id", p.id).order("created_at"),
    supabase.from("specialty_panels").select("specialty_id, panel_key, enabled, sort_order").eq("enabled", true).order("sort_order"),
    supabase.from("form_templates").select("id, name, fields").eq("is_active", true),
    supabase
      .from("encounters")
      .select("id, started_at, chief_complaint, doctor:staff!encounters_doctor_id_fkey(full_name), specialty:specialties(name), diagnoses(description, icd10_code)")
      .eq("patient_id", p.id)
      .neq("id", id)
      .order("started_at", { ascending: false })
      .limit(6),
    can(session, "lab.write") ? supabase.from("lab_tests").select("id, name, code").eq("is_active", true).order("name") : Promise.resolve({ data: [] }),
    can(session, "lab.read") ? supabase.from("lab_orders").select("id, status, ordered_at, lab_results(id, value_numeric, value_text, unit, is_abnormal, lab_test:lab_tests(name))").eq("patient_id", p.id).order("ordered_at", { ascending: false }).limit(5) : Promise.resolve({ data: [] }),
    supabase.from("specialties").select("id, name").eq("is_active", true).order("sort_order"),
  ]);

  // Panels for this department, plus any enabled panel the doctor opened.
  const enabledKeys = [...new Set((panels ?? []).map((x) => x.panel_key))];
  const mine = (panels ?? []).filter((x) => x.specialty_id === enc.specialty_id).map((x) => x.panel_key);
  const opened = typeof sp.panel === "string" && enabledKeys.includes(sp.panel) ? [sp.panel] : [];
  const usedBefore = (forms ?? []).filter((f) => f.encounter_id === id).map((f) => f.panel_key);
  const shownPanels = [...new Set([...mine, ...usedBefore, ...opened])];
  const formFor = (key: string) => (forms ?? []).find((f) => f.encounter_id === id && f.panel_key === key) as FormRow | undefined;
  const latestFor = (key: string) => [...(forms ?? [])].reverse().find((f) => f.panel_key === key) as FormRow | undefined;
  const allFor = (key: string) => (forms ?? []).filter((f) => f.panel_key === key) as FormRow[];
  const latestVitals = vitals?.[vitals.length - 1];
  const rxItems: RxItem[] = [...(rx?.prescription_items ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => ({
      medication_id: i.medication_id ?? undefined,
      drug_name: i.drug_name,
      generic_name: i.generic_name ?? undefined,
      dose: i.dose ?? "",
      frequency: i.frequency ?? "",
      timing: i.timing ?? "",
      duration_days: i.duration_days ?? undefined,
      route: i.route ?? undefined,
      instructions: i.instructions ?? "",
    }));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            <Link href={`/patients/${p.id}`} className="hover:underline">{p.full_name}</Link>
          </h1>
          <p className="mt-1 text-sm text-muted">
            {[p.mrn, age(p.dob), SEX_LABELS[p.sex], p.blood_group && `Blood ${p.blood_group}`].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1 text-sm text-muted">
            {formatDateTime(enc.started_at)} · {enc.doctor?.full_name} · {enc.specialty?.name ?? "General"} · {enc.visit_type.replace("_", "-")}
            {enc.signed_at && <Badge tone="ok" className="ml-2">Signed {formatDateTime(enc.signed_at)}</Badge>}
            {!enc.signed_at && locked && <Badge tone="warn" className="ml-2">Locked after 24 hours</Badge>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/visits/${id}/print`} variant="secondary" target="_blank">Print prescription</ButtonLink>
          {can(session, "billing.write") && <ButtonLink href={`/billing/invoices/new?encounter=${id}`} variant="secondary">Bill</ButtonLink>}
          {write && (
            <ActionButton action={signEncounter.bind(null, id)} confirm="Sign this visit? It locks; later changes become addenda." variant="primary">
              Sign and finish
            </ActionButton>
          )}
        </div>
      </div>

      {allergies && allergies.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          <AlertTriangle className="size-4" />
          <span className="font-semibold">Allergies:</span>
          {allergies.map((a) => <span key={a.id}>{a.allergen}{a.reaction && ` (${a.reaction})`} · {a.severity}</span>)}
        </div>
      )}

      <div className="grid gap-6 2xl:grid-cols-[1fr_28rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Vitals">
            {latestVitals && (
              <p className="mb-3 text-sm">
                <span className="text-muted">Last ({formatDateTime(latestVitals.recorded_at)}):</span>{" "}
                {[
                  latestVitals.bp_systolic && `BP ${latestVitals.bp_systolic}/${latestVitals.bp_diastolic}`,
                  latestVitals.pulse_bpm && `pulse ${latestVitals.pulse_bpm}`,
                  latestVitals.temperature_c && `${latestVitals.temperature_c} °C`,
                  latestVitals.spo2 && `SpO₂ ${latestVitals.spo2}%`,
                  latestVitals.weight_kg && `${latestVitals.weight_kg} kg`,
                  latestVitals.height_cm && `${latestVitals.height_cm} cm`,
                  latestVitals.bmi && `BMI ${latestVitals.bmi}`,
                  latestVitals.blood_glucose_mgdl && `sugar ${latestVitals.blood_glucose_mgdl} mg/dL`,
                ].filter(Boolean).join(" · ")}
              </p>
            )}
            {can(session, "vitals.write") && !locked && (
              <ActionForm action={recordVitals.bind(null, id)} resetOnSuccess>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <Field label="BP sys"><Input name="bp_systolic" type="number" /></Field>
                  <Field label="BP dia"><Input name="bp_diastolic" type="number" /></Field>
                  <Field label="Pulse"><Input name="pulse_bpm" type="number" /></Field>
                  <Field label="Temp °C"><Input name="temperature_c" type="number" step="0.1" /></Field>
                  <Field label="SpO₂ %"><Input name="spo2" type="number" /></Field>
                  <Field label="Weight kg"><Input name="weight_kg" type="number" step="0.01" /></Field>
                  <Field label="Height cm"><Input name="height_cm" type="number" step="0.1" /></Field>
                  <Field label="Head circ. cm"><Input name="head_circumference_cm" type="number" step="0.1" /></Field>
                  <Field label="Resp. rate"><Input name="respiratory_rate" type="number" /></Field>
                  <Field label="Sugar mg/dL"><Input name="blood_glucose_mgdl" type="number" /></Field>
                </div>
                <div><SubmitButton size="sm" variant="secondary">Record vitals</SubmitButton></div>
              </ActionForm>
            )}
          </Card>

          <Card title="Consultation">
            <EncounterNotes
              encounterId={id}
              locked={!write}
              initial={{
                chief_complaint: enc.chief_complaint ?? "",
                history: enc.history ?? "",
                examination: enc.examination ?? "",
                treatment_plan: enc.treatment_plan ?? "",
                advice: enc.advice ?? "",
                follow_up_on: enc.follow_up_on ?? "",
              }}
            />
          </Card>

          <Card title="Diagnosis">
            <ul className="mb-3 flex flex-col gap-1 text-sm">
              {(diagnoses ?? []).map((d) => (
                <li key={d.id} className="flex items-center justify-between">
                  <span>
                    {d.icd10_code && <span className="mr-1 font-mono text-xs text-muted">{d.icd10_code}</span>}
                    {d.description} <Badge>{d.kind}</Badge>
                  </span>
                  {write && <ActionButton action={removeDiagnosis.bind(null, id, d.id)} variant="ghost">Remove</ActionButton>}
                </li>
              ))}
              {!diagnoses?.length && <li className="text-muted">None yet.</li>}
            </ul>
            {write && <DiagnosisPicker encounterId={id} />}
          </Card>

          <Card title="Prescription">
            {can(session, "prescriptions.write") || rxItems.length ? (
              <PrescriptionBuilder
                encounterId={id}
                initialItems={rxItems}
                initialNotes={rx?.notes ?? ""}
                locked={locked || !can(session, "prescriptions.write")}
              />
            ) : (
              <p className="text-sm text-muted">No prescription.</p>
            )}
            {rx?.allergy_override_reason && <Alert tone="danger">Prescribed despite an allergy: {rx.allergy_override_reason}</Alert>}
          </Card>

          {shownPanels.map((key) => (
            <Card key={key} title={panelLabel(key, templates ?? [])}>
              <Panel
                panelKey={key}
                encounterId={id}
                locked={!write}
                patient={p}
                vitals={vitals ?? []}
                current={formFor(key)}
                latest={latestFor(key)}
                all={allFor(key)}
                templates={templates ?? []}
                today={today}
              />
            </Card>
          ))}

          {write && enabledKeys.some((k) => !shownPanels.includes(k)) && (
            <form className="flex items-center gap-2 text-sm">
              <span className="text-muted">Open another panel:</span>
              <Select name="panel" className="h-8 w-60">
                {enabledKeys.filter((k) => !shownPanels.includes(k)).map((k) => <option key={k} value={k}>{panelLabel(k, templates ?? [])}</option>)}
              </Select>
              <button className="rounded-md border border-line bg-surface px-3 py-1">Open</button>
            </form>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <Card title="Notes and addenda">
            {can(session, "clinical.write") && (
              <ActionForm action={addNote.bind(null, id)} resetOnSuccess className="mb-4 gap-2">
                <Textarea name="body" rows={3} placeholder={locked ? "Addendum (the visit is locked)" : "Note"} />
                <div className="flex gap-2">
                  <Select name="visibility" defaultValue="clinical_staff">
                    <option value="clinical_staff">All clinical staff</option>
                    <option value="same_specialty">My department only</option>
                    <option value="author_only">Only me</option>
                  </Select>
                  <SubmitButton size="sm" variant="secondary">{locked ? "Add addendum" : "Add note"}</SubmitButton>
                </div>
              </ActionForm>
            )}
            <ul className="flex flex-col gap-3 text-sm">
              {(notes ?? []).map((n) => (
                <li key={n.id} className="rounded-md bg-bg p-2">
                  <p className="text-xs text-muted">
                    {formatDateTime(n.created_at)} · {n.author?.full_name} {n.kind === "addendum" && <Badge tone="warn">Addendum</Badge>}
                    {n.visibility !== "clinical_staff" && <Badge className="ml-1">{n.visibility === "author_only" ? "private" : "department"}</Badge>}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{n.body}</p>
                </li>
              ))}
            </ul>
          </Card>

          {can(session, "lab.read") && (
            <Card title="Lab tests">
              {can(session, "lab.write") && !locked && (
                <ActionForm action={orderLabs.bind(null, id)} resetOnSuccess className="mb-3 gap-2">
                  <div className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto text-sm">
                    {(labTests ?? []).map((t) => (
                      <label key={t.id} className="flex items-center gap-1.5"><input type="checkbox" name="tests" value={t.id} /> {t.name}</label>
                    ))}
                  </div>
                  <SubmitButton size="sm" variant="secondary">Order tests</SubmitButton>
                </ActionForm>
              )}
              <ul className="flex flex-col gap-2 text-sm">
                {(labOrders ?? []).map((o) => (
                  <li key={o.id}>
                    <Link href={`/labs/${o.id}`} className="text-brand hover:underline">{formatDate(o.ordered_at)}</Link> <Badge>{o.status.replace("_", " ")}</Badge>
                    <span className="block text-xs text-muted">
                      {o.lab_results.map((r) => `${r.lab_test?.name}${r.value_numeric !== null ? ` ${r.value_numeric}${r.unit ?? ""}` : r.value_text ? ` ${r.value_text}` : ""}${r.is_abnormal ? " ⚠" : ""}`).join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {can(session, "clinical.write") && (
            <Card title="Refer">
              <ActionForm action={addReferral.bind(null, id)} resetOnSuccess className="gap-2">
                <Select name="to_specialty_id">
                  {(specialties ?? []).filter((s) => s.id !== enc.specialty_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
                <Textarea name="reason" rows={2} placeholder="Reason for referral" />
                <div className="flex gap-2">
                  <Select name="urgency" defaultValue="routine">
                    <option value="routine">Routine</option><option value="soon">Soon</option><option value="urgent">Urgent</option>
                  </Select>
                  <SubmitButton size="sm" variant="secondary">Refer</SubmitButton>
                </div>
              </ActionForm>
            </Card>
          )}

          <Card title="Previous visits">
            <ul className="flex flex-col gap-2 text-sm">
              {(history ?? []).map((h) => (
                <li key={h.id}>
                  <Link href={`/visits/${h.id}`} className="font-medium text-brand hover:underline">{formatDate(h.started_at)}</Link>{" "}
                  <span className="text-muted">{h.specialty?.name} · {h.doctor?.full_name}</span>
                  <p className="text-xs">{[h.chief_complaint, ...h.diagnoses.map((d) => d.description)].filter(Boolean).join(" · ")}</p>
                </li>
              ))}
              {!history?.length && <li className="text-muted">First visit.</li>}
            </ul>
          </Card>
        </aside>
      </div>
    </>
  );
}

async function Panel({
  panelKey,
  encounterId,
  locked,
  patient,
  vitals,
  current,
  latest,
  all,
  templates,
  today,
}: {
  panelKey: string;
  encounterId: string;
  locked: boolean;
  patient: { id: string; dob: string | null; sex: string };
  vitals: { recorded_at: string; weight_kg: number | null; height_cm: number | null; head_circumference_cm: number | null }[];
  current?: FormRow;
  latest?: FormRow;
  all: FormRow[];
  templates: { id: string; name: string; fields: unknown }[];
  today: string;
}) {
  const data = (current?.data ?? {}) as Record<string, unknown>;
  const carried = (current?.data ?? latest?.data ?? {}) as Record<string, unknown>;
  const supabase = await createClient();

  if (panelKey === "growth_chart") {
    return (
      <div className="flex flex-col gap-3">
        <GrowthChart dob={patient.dob} sex={patient.sex} vitals={vitals} />
        <PanelForm encounterId={encounterId} panelKey={panelKey} locked={locked} initial={data as Record<string, string>} fields={[{ key: "note", label: "Growth note", type: "textarea" }]} />
      </div>
    );
  }

  if (panelKey === "vaccinations") {
    const [{ data: schedule }, { data: given }] = await Promise.all([
      supabase.from("vaccine_schedule").select("*").order("sort_order"),
      supabase.from("patient_vaccinations").select("vaccine_code, given_on, batch_number").eq("patient_id", patient.id).is("deleted_at", null),
    ]);
    const givenMap = new Map((given ?? []).map((g) => [g.vaccine_code, g]));
    const pending = (schedule ?? []).filter((v) => !givenMap.has(v.code));
    return (
      <div className="flex flex-col gap-3">
        {!patient.dob && <Alert>Add the date of birth to see due dates.</Alert>}
        <div className="max-h-72 overflow-y-auto">
          <Table>
            <thead><tr><th>Vaccine</th><th>Due</th><th>Given</th></tr></thead>
            <tbody>
              {(schedule ?? []).map((v) => {
                const g = givenMap.get(v.code);
                const due = patient.dob ? vaccineDueDate(patient.dob, v.due_age_days) : null;
                const overdue = !g && due && due < today;
                return (
                  <tr key={v.code}>
                    <td>{v.name} <span className="text-muted">{v.dose_label}</span></td>
                    <td className={overdue ? "text-danger" : ""}>{due ? formatDate(due) : "—"}</td>
                    <td>{g ? <Badge tone="ok">{formatDate(g.given_on)}</Badge> : overdue ? <Badge tone="danger">Overdue</Badge> : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
        {!locked && pending.length > 0 && (
          <ActionForm action={recordVaccination.bind(null, encounterId)} resetOnSuccess className="grid gap-2 sm:grid-cols-4 sm:items-end">
            <Field label="Vaccine" className="sm:col-span-2">
              <Select name="vaccine_code">{pending.map((v) => <option key={v.code} value={v.code}>{v.name} – {v.dose_label}</option>)}</Select>
            </Field>
            <Field label="Given on"><Input name="given_on" type="date" defaultValue={today} /></Field>
            <Field label="Batch"><Input name="batch_number" /></Field>
            <SubmitButton size="sm" variant="secondary">Record dose</SubmitButton>
          </ActionForm>
        )}
        <p className="text-xs text-muted">Default schedule based on the IAP timetable. Due reminders go to parents who agreed to messages.</p>
      </div>
    );
  }

  if (panelKey === "obstetric_history") {
    return <ObstetricPanel encounterId={encounterId} initial={carried} locked={locked} today={today} />;
  }

  if (panelKey === "antenatal_visit") {
    const { data: ob } = await supabase
      .from("encounter_forms")
      .select("data")
      .eq("patient_id", patient.id)
      .eq("panel_key", "obstetric_history")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lmp = (ob?.data as { lmp?: string } | null)?.lmp;
    const rows = all.filter((r) => r.encounter_id !== encounterId);
    return (
      <div className="flex flex-col gap-3">
        {!lmp && <Alert>Record the LMP in Obstetric history to see gestational age.</Alert>}
        {rows.length > 0 && (
          <Table>
            <thead><tr><th>Date</th><th>GA</th><th>Wt</th><th>BP</th><th>FH</th><th>FHR</th><th>Pres.</th><th>Alb</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const d = r.data as Record<string, string | number | null>;
                const ga = lmp ? gestationalAge(lmp, r.created_at.slice(0, 10)) : null;
                return (
                  <tr key={r.id} className="tabular-nums">
                    <td>{formatDate(r.created_at)}</td>
                    <td>{ga ? `${ga.weeks}+${ga.days}` : ""}</td>
                    <td>{d.weight_kg}</td><td>{d.bp}</td><td>{d.fundal_height_cm}</td><td>{d.fetal_heart_rate}</td><td>{d.presentation}</td><td>{d.urine_albumin}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {lmp && (() => {
          const ga = gestationalAge(lmp, today);
          return ga ? <p className="text-sm">Today: <span className="font-medium">{ga.weeks} weeks {ga.days} days</span></p> : null;
        })()}
        <PanelForm encounterId={encounterId} panelKey={panelKey} locked={locked} initial={data as Record<string, string>} fields={ANTENATAL_FIELDS} />
      </div>
    );
  }

  if (panelKey === "skin_photos") {
    const { data: photos } = await supabase
      .from("documents")
      .select("id, title, created_at, encounter_id")
      .eq("patient_id", patient.id)
      .eq("category", "clinical_photo")
      .is("deleted_at", null)
      .order("created_at");
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {(photos ?? []).map((ph) => (
            <a key={ph.id} href={`/api/documents/${ph.id}`} target="_blank" rel="noreferrer" className="block rounded-md border border-line p-1 text-center text-xs hover:border-brand">
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
              <img src={`/api/documents/${ph.id}`} alt={ph.title} className="aspect-square w-full rounded object-cover" loading="lazy" />
              <span className={ph.encounter_id === encounterId ? "font-medium" : "text-muted"}>{formatDate(ph.created_at)}</span>
            </a>
          ))}
        </div>
        {!locked && <UploadForm patientId={patient.id} encounterId={encounterId} category="clinical_photo" />}
        <PanelForm encounterId={encounterId} panelKey={panelKey} locked={locked} initial={data as Record<string, string>} fields={[{ key: "note", label: "Photo notes", type: "textarea" }]} />
      </div>
    );
  }

  if (panelKey === "body_map") {
    return <BodyMap encounterId={encounterId} locked={locked} initial={carried as { marks?: never[]; note?: string }} />;
  }

  if (panelKey === "procedure_sessions") {
    const rows = all.filter((r) => r.encounter_id !== encounterId);
    const last = rows[rows.length - 1]?.data as Record<string, string | number> | undefined;
    const initial = current
      ? (data as Record<string, string>)
      : last
        ? { procedure: last.procedure, area: last.area, total_sessions: last.total_sessions, session_number: Number(last.session_number ?? 0) + 1, settings: last.settings }
        : {};
    return (
      <div className="flex flex-col gap-3">
        {rows.length > 0 && (
          <Table>
            <thead><tr><th>Date</th><th>Procedure</th><th>Session</th><th>Settings</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const d = r.data as Record<string, string | number | null>;
                return (
                  <tr key={r.id}>
                    <td>{formatDate(r.created_at)}</td><td>{d.procedure} {d.area && `· ${d.area}`}</td>
                    <td>{d.session_number}{d.total_sessions ? ` / ${d.total_sessions}` : ""}</td><td className="text-xs">{d.settings}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <PanelForm encounterId={encounterId} panelKey={panelKey} locked={locked} initial={initial as Record<string, string>} fields={PROCEDURE_FIELDS} />
      </div>
    );
  }

  if (panelKey.startsWith("form:")) {
    const tpl = templates.find((t) => `form:${t.id}` === panelKey);
    if (!tpl) return <p className="text-sm text-muted">This form was removed.</p>;
    return <PanelForm encounterId={encounterId} panelKey={panelKey} locked={locked} initial={data as Record<string, string>} fields={tpl.fields as PanelField[]} />;
  }

  return isBuiltInPanel(panelKey) ? <p className="text-sm text-muted">{BUILT_IN_PANELS[panelKey].label}</p> : null;
}
