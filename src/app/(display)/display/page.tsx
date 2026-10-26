import { AutoRefresh } from "@/components/ui/auto-refresh";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { todaysAppointments } from "@/modules/appointments/today";

export const metadata = { title: "Waiting room" };

// For a TV in the waiting room: token numbers only, no patient names.
export default async function DisplayPage({ searchParams }: PageProps<"/display">) {
  await requirePermission("appointments.read");
  const { specialty } = await searchParams;
  const supabase = await createClient();
  const [{ data: clinic }, appts] = await Promise.all([
    supabase.from("clinics").select("name").single(),
    todaysAppointments(supabase, { specialtyId: typeof specialty === "string" ? specialty : undefined }),
  ]);
  const now = appts.filter((a) => a.status === "in_consultation" && a.queue_tokens);
  const next = appts
    .filter((a) => a.status === "checked_in" && a.queue_tokens)
    .sort((a, b) => a.queue_tokens!.token_number - b.queue_tokens!.token_number)
    .slice(0, 8);

  return (
    <main className="flex min-h-screen flex-col bg-ink p-10 text-white">
      <AutoRefresh seconds={10} />
      <h1 className="text-3xl font-semibold">{clinic?.name}</h1>
      <div className="mt-10 grid flex-1 gap-10 lg:grid-cols-2">
        <section>
          <h2 className="mb-6 text-xl tracking-wide text-white/60 uppercase">Now seeing</h2>
          <ul className="flex flex-col gap-4">
            {now.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded-xl bg-white/10 px-6 py-5">
                <span className="text-6xl font-bold tabular-nums">{a.queue_tokens!.token_number}</span>
                <span className="text-right text-2xl">{a.doctor?.full_name}<br /><span className="text-white/60">{a.room?.name}</span></span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-6 text-xl tracking-wide text-white/60 uppercase">Next</h2>
          <div className="flex flex-wrap gap-4">
            {next.map((a) => (
              <span key={a.id} className="rounded-xl bg-white/5 px-6 py-4 text-4xl font-semibold tabular-nums">{a.queue_tokens!.token_number}</span>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
