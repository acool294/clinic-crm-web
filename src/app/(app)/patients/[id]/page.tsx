import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { ButtonLink } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/confirm-button";
import { Input, Select, SubmitButton } from "@/components/ui/form";
import { Badge, Card, EmptyState, Table, type Tone } from "@/components/ui/layout";
import { can, requirePermission } from "@/lib/auth/session";
import { age, formatDate, formatDateTime, money, SEX_LABELS } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { archiveDocument } from "@/modules/documents/actions";
import { CATEGORY_LABELS, UploadForm } from "@/modules/documents/upload-form";
import { addAllergy, addCondition, archivePatient, linkFamily, removeAllergy, resolveCondition } from "@/modules/patients/actions";
import { PatientPicker } from "@/modules/patients/patient-picker";

export const metadata = { title: "Patient" };

const KIND_LABELS: Record<string, { label: string; tone: Tone }> = {
  appointment: { label: "Appointment", tone: "neutral" },
  encounter: { label: "Visit", tone: "brand" },
  vitals: { label: "Vitals", tone: "neutral" },
  prescription: { label: "Prescription", tone: "brand" },
  document: { label: "Document", tone: "neutral" },
  lab_order: { label: "Lab", tone: "warn" },
  invoice: { label: "Invoice", tone: "neutral" },
  note: { label: "Note", tone: "neutral" },
  message: { label: "Message", tone: "neutral" },
};

function timelineHref(kind: string, refId: string, patientId: string) {
  switch (kind) {
    case "encounter":
      return `/visits/${refId}`;
    case "invoice":
      return `/billing/invoices/${refId}`;
    case "document":
      return `/api/documents/${refId}`;
    case "lab_order":
      return `/labs/${refId}`;
    default:
      return `/patients/${patientId}?tab=timeline`;
  }
}

const TABS = [
  { key: "timeline", label: "Timeline", need: "patients.read" },
  { key: "vitals", label: "Vitals", need: "clinical.read" },
  { key: "prescriptions", label: "Prescriptions", need: "clinical.read" },
  { key: "documents", label: "Documents", need: "documents.read" },
  { key: "billing", label: "Billing", need: "billing.read" },
] as const;

export default async function PatientPage({ params, searchParams }: PageProps<"/patients/[id]">) {
  const session = await requirePermission("patients.read");
  const { id } = await params;
  const sp = await searchParams;
  const tabs = TABS.filter((t) => can(session, t.need));
  const tab = tabs.find((t) => t.key === sp.tab)?.key ?? "timeline";
  const supabase = await createClient();

  const { data: p } = await supabase.from("patients").select("*").eq("id", id).maybeSingle();
  if (!p) notFound();
  await supabase.rpc("log_event", { p_action: "view", p_entity: "patients", p_entity_id: id, p_patient_id: id });

  const [{ data: allergies }, { data: conditions }, { data: family }, { data: upcoming }] = await Promise.all([
    supabase.from("patient_allergies").select("*").eq("patient_id", id).is("deleted_at", null),
    supabase.from("patient_conditions").select("*").eq("patient_id", id).is("deleted_at", null).order("status"),
    supabase.from("family_links").select("id, relation, related:patients!family_links_related_patient_id_fkey(id, full_name, mrn)").eq("patient_id", id),
    supabase
      .from("appointments")
      .select("id, starts_at, status, doctor:staff!appointments_doctor_id_fkey(full_name)")
      .eq("patient_id", id)
      .gte("starts_at", new Date().toISOString())
      .in("status", ["scheduled", "confirmed"])
      .order("starts_at")
      .limit(3),
  ]);
  const write = can(session, "patients.write");

  if (p.merged_into) {
    return (
      <EmptyState title="This record was merged">
        <Link href={`/patients/${p.merged_into}`} className="text-brand hover:underline">Open the kept record</Link>
      </EmptyState>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{p.full_name}</h1>
          <p className="mt-1 text-sm text-muted">
            {[p.mrn, age(p.dob) && `${age(p.dob)} (${formatDate(p.dob)})`, SEX_LABELS[p.sex], p.phone, p.blood_group && `Blood ${p.blood_group}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {p.tags.map((t) => <Badge key={t}>{t}</Badge>)}
            {!p.consent_treatment_at && <Badge tone="warn">No treatment consent</Badge>}
            {p.consent_messaging && !p.messaging_opt_out_at ? <Badge tone="ok">Messages on</Badge> : <Badge>No messages</Badge>}
            {p.deleted_at && <Badge tone="danger">Archived</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(session, "appointments.write") && <ButtonLink href={`/calendar/new?patient=${p.id}`}>Book appointment</ButtonLink>}
          {can(session, "billing.write") && <ButtonLink href={`/billing/invoices/new?patient=${p.id}`} variant="secondary">New invoice</ButtonLink>}
          {write && <ButtonLink href={`/patients/${p.id}/edit`} variant="secondary">Edit</ButtonLink>}
          {can(session, "patients.merge") && <ButtonLink href={`/patients/${p.id}/merge`} variant="ghost">Merge duplicate</ButtonLink>}
          {can(session, "patients.delete") && !p.deleted_at && (
            <ActionButton action={archivePatient.bind(null, p.id)} confirm="Archive this patient? Their records are kept." variant="ghost">
              Archive
            </ActionButton>
          )}
        </div>
      </div>

      {allergies && allergies.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          <AlertTriangle className="size-4" />
          <span className="font-semibold">Allergies:</span>
          {allergies.map((a) => (
            <span key={a.id} className="rounded bg-white/60 px-2 py-0.5">
              {a.allergen} {a.reaction && `(${a.reaction})`} · {a.severity}
              {write && (
                <ActionButton action={removeAllergy.bind(null, p.id, a.id)} confirm={`Remove the ${a.allergen} allergy?`} variant="ghost">×</ActionButton>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
            {tabs.map((t) => (
              <Link
                key={t.key}
                href={`?tab=${t.key}`}
                className={`border-b-2 px-3 py-2 text-sm whitespace-nowrap ${t.key === tab ? "border-brand font-medium text-brand" : "border-transparent text-muted"}`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          {tab === "timeline" && <Timeline patientId={id} />}
          {tab === "vitals" && <VitalsTab patientId={id} />}
          {tab === "prescriptions" && <PrescriptionsTab patientId={id} />}
          {tab === "documents" && <DocumentsTab patientId={id} canWrite={can(session, "documents.write")} />}
          {tab === "billing" && <BillingTab patientId={id} />}
        </div>

        <aside className="flex flex-col gap-4">
          <Card title="Upcoming">
            {upcoming?.length ? (
              <ul className="flex flex-col gap-1 text-sm">
                {upcoming.map((a) => (
                  <li key={a.id}>{formatDateTime(a.starts_at)} · {a.doctor?.full_name}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nothing booked.</p>
            )}
          </Card>

          <Card title="Conditions">
            <ul className="mb-3 flex flex-col gap-1 text-sm">
              {(conditions ?? []).map((c) => (
                <li key={c.id} className={`flex items-center justify-between ${c.status === "resolved" ? "text-muted line-through" : ""}`}>
                  <span>{c.name} {c.icd10_code && <span className="text-muted">({c.icd10_code})</span>}</span>
                  {write && c.status === "active" && <ActionButton action={resolveCondition.bind(null, p.id, c.id)} variant="ghost">Resolved</ActionButton>}
                </li>
              ))}
              {!conditions?.length && <li className="text-muted">None recorded.</li>}
            </ul>
            {write && (
              <ActionForm action={addCondition.bind(null, p.id)} resetOnSuccess className="gap-2">
                <Input name="name" placeholder="e.g. Hypertension" />
                <div className="flex gap-2"><Input name="since" type="date" /><SubmitButton size="sm" variant="secondary">Add</SubmitButton></div>
              </ActionForm>
            )}
          </Card>

          {write && (
            <Card title="Add allergy">
              <ActionForm action={addAllergy.bind(null, p.id)} resetOnSuccess className="gap-2">
                <Input name="allergen" placeholder="e.g. Penicillin, peanuts" />
                <Input name="reaction" placeholder="Reaction (optional)" />
                <div className="flex gap-2">
                  <Select name="severity" defaultValue="moderate">
                    <option value="mild">Mild</option><option value="moderate">Moderate</option><option value="severe">Severe</option>
                  </Select>
                  <SubmitButton size="sm" variant="secondary">Add</SubmitButton>
                </div>
              </ActionForm>
            </Card>
          )}

          <Card title="Family">
            <ul className="mb-3 flex flex-col gap-1 text-sm">
              {(family ?? []).map((f) => (
                <li key={f.id}>
                  <Link href={`/patients/${f.related?.id}`} className="text-brand hover:underline">{f.related?.full_name}</Link>{" "}
                  <span className="text-muted">({f.relation})</span>
                </li>
              ))}
              {!family?.length && <li className="text-muted">No linked family.</li>}
            </ul>
            {write && (
              <ActionForm action={linkFamily.bind(null, p.id)} resetOnSuccess className="gap-2">
                <PatientPicker name="related_patient_id" />
                <div className="flex gap-2"><Input name="relation" placeholder="Mother, son…" /><SubmitButton size="sm" variant="secondary">Link</SubmitButton></div>
              </ActionForm>
            )}
          </Card>

          <Card title="Contact">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted">Address</dt><dd>{[p.address, p.city, p.state, p.pincode].filter(Boolean).join(", ") || "—"}</dd>
              <dt className="text-muted">Emergency</dt><dd>{p.emergency_contact_name ? `${p.emergency_contact_name} (${p.emergency_contact_relation ?? ""}) ${p.emergency_contact_phone ?? ""}` : "—"}</dd>
              <dt className="text-muted">Insurance</dt><dd>{p.insurance_provider ? `${p.insurance_provider} ${p.insurance_policy_number ?? ""}` : "—"}</dd>
              <dt className="text-muted">ABHA</dt><dd>{p.abha_number ?? "—"}</dd>
            </dl>
            {p.notes && <p className="mt-2 text-sm">{p.notes}</p>}
          </Card>
        </aside>
      </div>
    </>
  );
}

async function Timeline({ patientId }: { patientId: string }) {
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("patient_timeline")
    .select("*")
    .eq("patient_id", patientId)
    .order("at", { ascending: false })
    .limit(100);
  if (!items?.length) return <EmptyState title="Nothing here yet" />;
  return (
    <ol className="flex flex-col gap-2">
      {items.map((i) => {
        const k = KIND_LABELS[i.kind ?? ""] ?? { label: i.kind, tone: "neutral" as Tone };
        return (
          <li key={`${i.kind}-${i.ref_id}`} className="flex gap-3 rounded-md border border-line bg-surface px-3 py-2 text-sm">
            <span className="w-36 shrink-0 text-muted">{formatDateTime(i.at)}</span>
            <Badge tone={k.tone} className="h-fit">{k.label}</Badge>
            <Link href={timelineHref(i.kind ?? "", i.ref_id ?? "", patientId)} className="min-w-0 flex-1 hover:underline">
              <span className="font-medium">{i.title?.replace(/_/g, " ")}</span>
              {i.detail && <span className="ml-2 text-muted">{i.detail}</span>}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

async function VitalsTab({ patientId }: { patientId: string }) {
  const supabase = await createClient();
  const { data: rows } = await supabase.from("vitals").select("*").eq("patient_id", patientId).is("deleted_at", null).order("recorded_at", { ascending: false }).limit(50);
  if (!rows?.length) return <EmptyState title="No vitals recorded" />;
  return (
    <Card>
      <Table>
        <thead><tr><th>When</th><th>BP</th><th>Pulse</th><th>Temp</th><th>SpO₂</th><th>Weight</th><th>Height</th><th>BMI</th><th>Sugar</th></tr></thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.id} className="tabular-nums">
              <td>{formatDateTime(v.recorded_at)}</td>
              <td>{v.bp_systolic ? `${v.bp_systolic}/${v.bp_diastolic}` : ""}</td>
              <td>{v.pulse_bpm}</td>
              <td>{v.temperature_c}</td>
              <td>{v.spo2}</td>
              <td>{v.weight_kg}</td>
              <td>{v.height_cm}</td>
              <td>{v.bmi}</td>
              <td>{v.blood_glucose_mgdl}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

async function PrescriptionsTab({ patientId }: { patientId: string }) {
  const supabase = await createClient();
  const { data: rx } = await supabase
    .from("prescriptions")
    .select("id, created_at, encounter_id, doctor:staff!prescriptions_doctor_id_fkey(full_name), prescription_items(drug_name, dose, frequency, duration_days, sort_order)")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (!rx?.length) return <EmptyState title="No prescriptions" />;
  return (
    <div className="flex flex-col gap-3">
      {rx.map((r) => (
        <Card key={r.id} title={`${formatDate(r.created_at)} · ${r.doctor?.full_name ?? ""}`} actions={<Link href={`/visits/${r.encounter_id}/print`} className="text-sm text-brand hover:underline">Print</Link>}>
          <ul className="text-sm">
            {[...r.prescription_items].sort((a, b) => a.sort_order - b.sort_order).map((i, n) => (
              <li key={n}>{i.drug_name} {i.dose} · {i.frequency} {i.duration_days ? `· ${i.duration_days} days` : ""}</li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

async function DocumentsTab({ patientId, canWrite }: { patientId: string; canWrite: boolean }) {
  const supabase = await createClient();
  const { data: docs } = await supabase.from("documents").select("*").eq("patient_id", patientId).is("deleted_at", null).order("created_at", { ascending: false });
  return (
    <div className="flex flex-col gap-4">
      {canWrite && <Card title="Upload"><UploadForm patientId={patientId} /></Card>}
      {docs?.length ? (
        <Card>
          <Table>
            <thead><tr><th>Document</th><th>Type</th><th>Date</th><th /></tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>
                    <a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer" className="text-brand hover:underline">{d.title}</a>
                    {d.is_abnormal && <Badge tone="danger" className="ml-2">Abnormal</Badge>}
                  </td>
                  <td>{CATEGORY_LABELS[d.category]}</td>
                  <td>{formatDate(d.taken_on ?? d.created_at)}</td>
                  <td className="text-right">
                    <a href={`/api/documents/${d.id}?download=1`} className="mr-2 text-sm text-muted hover:underline">Download</a>
                    {canWrite && <ActionButton action={archiveDocument.bind(null, d.id, patientId)} confirm="Remove this document?" variant="ghost">Remove</ActionButton>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : (
        <EmptyState title="No documents" />
      )}
    </div>
  );
}

async function BillingTab({ patientId }: { patientId: string }) {
  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("invoice_totals")
    .select("*")
    .eq("patient_id", patientId)
    .neq("status", "draft");
  const { data: meta } = await supabase.from("invoices").select("id, invoice_number, issued_at").eq("patient_id", patientId);
  const byId = new Map((meta ?? []).map((m) => [m.id, m]));
  const due = (invoices ?? []).reduce((s, i) => s + Number(i.balance_paise ?? 0), 0);
  if (!invoices?.length) return <EmptyState title="No invoices" />;
  return (
    <Card title={due > 0 ? `Outstanding: ${money(due)}` : "All paid"}>
      <Table>
        <thead><tr><th>Invoice</th><th>Date</th><th className="text-right">Total</th><th className="text-right">Balance</th><th>Status</th></tr></thead>
        <tbody>
          {invoices
            .sort((a, b) => String(byId.get(b.invoice_id!)?.issued_at).localeCompare(String(byId.get(a.invoice_id!)?.issued_at)))
            .map((i) => (
              <tr key={i.invoice_id}>
                <td><Link href={`/billing/invoices/${i.invoice_id}`} className="text-brand hover:underline">{byId.get(i.invoice_id!)?.invoice_number}</Link></td>
                <td>{formatDate(byId.get(i.invoice_id!)?.issued_at)}</td>
                <td className="text-right tabular-nums">{money(i.total_paise)}</td>
                <td className="text-right tabular-nums">{money(i.balance_paise)}</td>
                <td><Badge tone={i.payment_status === "paid" ? "ok" : i.payment_status === "void" ? "neutral" : "warn"}>{i.payment_status}</Badge></td>
              </tr>
            ))}
        </tbody>
      </Table>
    </Card>
  );
}

