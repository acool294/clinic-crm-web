import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader, Table } from "@/components/ui/layout";
import { requirePermission } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Labs" };
const STATUSES = { pending: ["ordered", "sample_collected"], resulted: ["resulted"], cancelled: ["cancelled"] } as const;

export default async function LabsPage({ searchParams }: PageProps<"/labs">) {
  await requirePermission("lab.read");
  const sp = await searchParams;
  const tab = (typeof sp.tab === "string" && sp.tab in STATUSES ? sp.tab : "pending") as keyof typeof STATUSES;
  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("lab_orders")
    .select("*, patient:patients(id, full_name, mrn), ordered_by_staff:staff!lab_orders_ordered_by_fkey(full_name), lab_results(is_abnormal, lab_test:lab_tests(name))")
    .in("status", [...STATUSES[tab]])
    .order("ordered_at", { ascending: tab === "pending" })
    .limit(100);

  return (
    <>
      <PageHeader title="Labs" description="Tests ordered during consultations. Enter results here or upload the lab's report to the patient." />
      <div className="mb-4 flex gap-1">
        {Object.keys(STATUSES).map((t) => (
          <Link key={t} href={`?tab=${t}`} className={buttonClass(t === tab ? "primary" : "secondary", "sm")}>{t}</Link>
        ))}
      </div>
      <Card>
        {orders?.length ? (
          <Table>
            <thead><tr><th>Ordered</th><th>Patient</th><th>Tests</th><th>By</th><th>Status</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="whitespace-nowrap"><Link href={`/labs/${o.id}`} className="text-brand hover:underline">{formatDateTime(o.ordered_at)}</Link></td>
                  <td><Link href={`/patients/${o.patient?.id}`} className="hover:underline">{o.patient?.full_name}</Link> <span className="text-muted">{o.patient?.mrn}</span></td>
                  <td className="text-xs">{o.lab_results.map((r) => r.lab_test?.name).join(", ")}</td>
                  <td>{o.ordered_by_staff?.full_name}</td>
                  <td>
                    <Badge tone={o.status === "resulted" ? "ok" : o.status === "cancelled" ? "neutral" : "warn"}>{o.status.replace("_", " ")}</Badge>
                    {o.lab_results.some((r) => r.is_abnormal) && <Badge tone="danger" className="ml-1">Abnormal</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Nothing here" />
        )}
      </Card>
    </>
  );
}
