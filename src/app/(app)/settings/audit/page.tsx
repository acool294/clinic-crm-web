import Link from "next/link";
import { Input, Select } from "@/components/ui/form";
import { Badge, Card, PageHeader, Table } from "@/components/ui/layout";
import { buttonClass } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Audit log" };
const PAGE = 50;

export default async function AuditPage({ searchParams }: PageProps<"/settings/audit">) {
  await requirePermission("audit.read");
  const sp = await searchParams;
  const action = typeof sp.action === "string" ? sp.action : "";
  const entity = typeof sp.entity === "string" ? sp.entity : "";
  const page = Math.max(Number(sp.page ?? 0) || 0, 0);

  const supabase = await createClient();
  let q = supabase.from("audit_log").select("*").order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
  if (action) q = q.eq("action", action);
  if (entity) q = q.eq("entity", entity);
  const [{ data: rows }, { data: staff }] = await Promise.all([q, supabase.from("staff").select("id, full_name")]);
  const who = new Map((staff ?? []).map((s) => [s.id, s.full_name]));

  return (
    <>
      <PageHeader title="Audit log" description="Every chart view, change, export, print and sign-in. Entries cannot be edited or deleted." />
      <Card>
        <form className="mb-4 flex flex-wrap gap-2">
          <Select name="action" defaultValue={action} className="w-40">
            <option value="">All actions</option>
            {["view", "create", "update", "delete", "export", "print", "login", "logout", "login_failed"].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </Select>
          <Input name="entity" defaultValue={entity} placeholder="Record type, e.g. patients" className="w-56" />
          <button className={buttonClass("secondary")}>Filter</button>
        </form>
        <Table>
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Details</th><th>IP</th></tr></thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                <td>{(r.actor_staff_id && who.get(r.actor_staff_id)) ?? (r.action === "login_failed" ? String((r.details as { email?: string })?.email ?? "") : "System")}</td>
                <td><Badge tone={r.action === "delete" || r.action === "login_failed" ? "danger" : r.action === "view" ? "neutral" : "brand"}>{r.action}</Badge></td>
                <td>
                  {r.entity}
                  {r.patient_id && <Link href={`/patients/${r.patient_id}`} className="ml-2 text-brand hover:underline">patient</Link>}
                </td>
                <td className="max-w-xs truncate text-xs text-muted">{JSON.stringify(r.details)}</td>
                <td className="text-xs text-muted">{r.ip}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="mt-4 flex gap-2">
          {page > 0 && <Link className={buttonClass("secondary", "sm")} href={`?action=${action}&entity=${entity}&page=${page - 1}`}>Newer</Link>}
          {rows?.length === PAGE && <Link className={buttonClass("secondary", "sm")} href={`?action=${action}&entity=${entity}&page=${page + 1}`}>Older</Link>}
        </div>
      </Card>
    </>
  );
}
