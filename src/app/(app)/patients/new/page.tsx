import { PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/lib/auth/session";
import { PatientForm } from "@/modules/patients/patient-form";

export const metadata = { title: "Register patient" };

export default async function NewPatientPage({ searchParams }: PageProps<"/patients/new">) {
  await requirePermission("patients.write");
  const { next } = await searchParams;
  return (
    <>
      <PageHeader title="Register patient" description="The MRN is assigned automatically." />
      <PatientForm next={typeof next === "string" ? next : undefined} />
    </>
  );
}
