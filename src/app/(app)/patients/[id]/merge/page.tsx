import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SubmitButton } from "@/components/ui/form";
import { Alert, Card, PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { mergePatients } from "@/modules/patients/actions";
import { PatientPicker } from "@/modules/patients/patient-picker";

export const metadata = { title: "Merge duplicate" };

export default async function MergePage({ params }: PageProps<"/patients/[id]/merge">) {
  await requirePermission("patients.merge");
  const { id } = await params;
  const supabase = await createClient();
  const { data: patient } = await supabase.from("patients").select("id, full_name, mrn").eq("id", id).maybeSingle();
  if (!patient) notFound();
  return (
    <>
      <PageHeader title="Merge a duplicate record" description={`Everything from the duplicate moves into ${patient.full_name} (${patient.mrn}).`} />
      <Card>
        <ActionForm action={mergePatients.bind(null, id)}>
          <Alert>Visits, prescriptions, reports, invoices and messages move to the kept record, and the duplicate is archived. This cannot be undone.</Alert>
          <Field label="Duplicate record to merge in"><PatientPicker name="merge_id" required /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm" /> I have checked these are the same person</label>
          <div><SubmitButton variant="danger">Merge records</SubmitButton></div>
        </ActionForm>
      </Card>
    </>
  );
}
