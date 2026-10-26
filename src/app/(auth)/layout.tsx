import { CalendarCheck, ShieldCheck, Stethoscope } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-brand p-12 text-brand-ink lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Stethoscope className="size-6" /> Clinic CRM
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl leading-tight font-semibold">Your whole clinic, from front desk to follow-up.</h2>
          <ul className="mt-8 flex flex-col gap-4 text-brand-ink/85">
            <li className="flex gap-3"><CalendarCheck className="mt-0.5 size-5 shrink-0" /> Appointments, check-in tokens and a live queue for every department.</li>
            <li className="flex gap-3"><Stethoscope className="mt-0.5 size-5 shrink-0" /> Consultations, prescriptions, growth charts and antenatal records in one place.</li>
            <li className="flex gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0" /> Role-based access, two-step sign-in and a full audit trail for patient data.</li>
          </ul>
        </div>
        <p className="text-xs text-brand-ink/60">Patient data is stored in India and only visible to the staff who need it.</p>
        <div aria-hidden className="absolute -right-24 -bottom-24 size-96 rounded-full bg-white/5" />
      </section>
      <section className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </section>
    </main>
  );
}
