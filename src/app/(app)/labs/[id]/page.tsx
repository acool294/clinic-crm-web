import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { ActionButton } from "@/components/ui/confirm-button";
import { Input, SubmitButton } from "@/components/ui/form";
import { Badge, Card, PageHeader, Table } from "@/components/ui/layout";
import { can, requirePermission } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "@/modules/documents/upload-form";
import { saveLabResults, setLabStatus } from "@/modules/labs/actions";

export const metadata = { title: "Lab order" };

export default async function LabOrderPage({ params }: PageProps<"/labs/[id]">) {
  const session = await requirePermission("lab.read");
  const { id } = await params;
  const supabase = await createClient();
  const { data: o } = await supabase
    .from("lab_orders")
    .select("*, patient:patients(id, full_name, mrn, sex), lab_results(*, lab_test:lab_tests(name, ref_text))")
    .eq("id", id)
    .maybeSingle();
  if (!o) notFound();
  const write = can(session, "lab.write") && o.status !== "cancelled";

  return (
    <>
      <PageHeader
        title={`Lab order · ${o.patient?.full_name}`}
        description={`${o.patient?.mrn} · ordered ${formatDateTime(o.ordered_at)}${o.sample_collected_at ? ` · sample ${formatDateTime(o.sample_collected_at)}` : ""}`}
        actions={
          <>
            <Badge tone={o.status === "resulted" ? "ok" : "warn"}>{o.status.replace("_", " ")}</Badge>
            {write && o.status === "ordered" && <ActionButton action={setLabStatus.bind(null, id, "sample_collected")} variant="primary">Sample collected</ActionButton>}
            {write && o.status !== "resulted" && <ActionButton action={setLabStatus.bind(null, id, "cancelled")} confirm="Cancel this order?">Cancel order</ActionButton>}
            {o.encounter_id && <Link href={`/visits/${o.encounter_id}`} className="text-sm text-brand hover:underline">Open visit</Link>}
          </>
        }
      />
      <Card title="Results">
        <ActionForm action={saveLabResults.bind(null, id)}>
          <Table>
            <thead><tr><th>Test</th><th>Result</th><th>Unit</th><th>Reference</th><th /></tr></thead>
            <tbody>
              {o.lab_results.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.lab_test?.name}</td>
                  <td>
                    {write ? (
                      <Input name={`value_${r.id}`} defaultValue={r.value_numeric ?? r.value_text ?? ""} className="h-8 w-32" />
                    ) : (
                      r.value_numeric ?? r.value_text
                    )}
                  </td>
                  <td>{r.unit}</td>
                  <td className="text-xs text-muted">
                    {r.ref_low !== null || r.ref_high !== null ? `${r.ref_low ?? ""}–${r.ref_high ?? ""}` : ""} {r.lab_test?.ref_text}
                  </td>
                  <td>{r.is_abnormal && <Badge tone="danger">Abnormal</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          {write && <div><SubmitButton>Save results</SubmitButton></div>}
        </ActionForm>
      </Card>
      {can(session, "documents.write") && o.patient && (
        <Card title="Attach the lab's report" className="mt-6">
          <UploadForm patientId={o.patient.id} encounterId={o.encounter_id ?? undefined} category="lab_report" />
        </Card>
      )}
    </>
  );
}
