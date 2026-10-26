import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PatientForm } from "@/modules/patients/patient-form";

export const metadata = { title: "Edit patient" };

export default async function EditPatientPage({ params }: PageProps<"/patients/[id]/edit">) {
  await requirePermission("patients.write");
  const { id } = await params;
  const supabase = await createClient();
  const { data: patient } = await supabase.from("patients").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!patient) notFound();
  return (
    <>
      <PageHeader title={`Edit ${patient.full_name}`} description={patient.mrn} />
      <PatientForm patient={patient} />
    </>
  );
}
