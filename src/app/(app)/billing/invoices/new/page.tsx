import { Card, PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { InvoiceBuilder } from "@/modules/billing/invoice-builder";
import { suggestServices } from "@/modules/billing/queries";

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage({ searchParams }: PageProps<"/billing/invoices/new">) {
  await requirePermission("billing.write");
  const sp = await searchParams;
  const supabase = await createClient();
  const str = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/.test(v) ? v : undefined);
  let patientId = str(sp.patient);
  let appointmentId = str(sp.appointment);
  const encounterId = str(sp.encounter);
  let visit = { doctor_id: null as string | null, specialty_id: null as string | null, visit_type: null as string | null };

  if (encounterId) {
    const { data } = await supabase.from("encounters").select("patient_id, appointment_id, doctor_id, specialty_id, visit_type").eq("id", encounterId).maybeSingle();
    if (data) {
      patientId = data.patient_id;
      appointmentId = data.appointment_id ?? appointmentId;
      visit = data;
    }
  } else if (appointmentId) {
    const { data } = await supabase.from("appointments").select("patient_id, doctor_id, specialty_id, visit_type").eq("id", appointmentId).maybeSingle();
    if (data) {
      patientId = data.patient_id;
      visit = data;
    }
  }

  const [{ data: services }, suggested, { data: patient }] = await Promise.all([
    supabase.from("services").select("id, name, price_paise, gst_rate").eq("is_active", true).order("name"),
    visit.doctor_id ? suggestServices(supabase, visit) : Promise.resolve([]),
    patientId ? supabase.from("patients").select("id, full_name, mrn").eq("id", patientId).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  return (
    <>
      <PageHeader title="New invoice" description="Totals, GST and balances are calculated by the system. Numbers are assigned when the invoice is issued." />
      <Card>
        <InvoiceBuilder
          services={services ?? []}
          suggested={suggested}
          patient={patient ? { id: patient.id, full_name: patient.full_name ?? "", mrn: patient.mrn } : undefined}
          appointmentId={appointmentId}
          encounterId={encounterId}
        />
      </Card>
    </>
  );
}
