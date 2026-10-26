import { Card, PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/lib/auth/session";
import { todayInClinic } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { BookingForm } from "@/modules/appointments/booking-form";
import { loadDoctors } from "@/modules/appointments/queries";

export const metadata = { title: "Book appointment" };

export default async function NewAppointmentPage({ searchParams }: PageProps<"/calendar/new">) {
  await requirePermission("appointments.write");
  const { patient: patientId } = await searchParams;
  const supabase = await createClient();
  const [doctors, { data: specialties }, { data: rooms }, { data: clinic }, patient] = await Promise.all([
    loadDoctors(supabase),
    supabase.from("specialties").select("id, name").eq("is_active", true).order("sort_order"),
    supabase.from("rooms").select("id, name").eq("is_active", true).order("name"),
    supabase.from("clinics").select("default_slot_minutes").single(),
    typeof patientId === "string"
      ? supabase.from("patients").select("id, full_name, mrn").eq("id", patientId).maybeSingle().then((r) => r.data)
      : Promise.resolve(null),
  ]);
  return (
    <>
      <PageHeader title="Book appointment" />
      <Card>
        {doctors.length ? (
          <BookingForm
            doctors={doctors}
            specialties={specialties ?? []}
            rooms={rooms ?? []}
            today={todayInClinic()}
            patient={patient ? { id: patient.id, full_name: patient.full_name ?? "", mrn: patient.mrn } : undefined}
            defaultSlot={clinic?.default_slot_minutes ?? 15}
          />
        ) : (
          <p className="text-sm text-muted">Add a staff member with the Doctor role in Settings first.</p>
        )}
      </Card>
    </>
  );
}
