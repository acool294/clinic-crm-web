import Link from "next/link";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Badge, Card, EmptyState, PageHeader, Table } from "@/components/ui/layout";
import { can, requirePermission } from "@/lib/auth/session";
import { age, formatDate, SEX_LABELS } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Patients" };
const PAGE = 25;

export default async function PatientsPage({ searchParams }: PageProps<"/patients">) {
  const session = await requirePermission("patients.read");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const page = Math.max(Number(sp.page ?? 0) || 0, 0);
  const supabase = await createClient();
  const { data: patients } = await supabase.rpc("search_patients", { p_query: q, p_limit: PAGE, p_offset: page * PAGE });

  return (
    <>
      <PageHeader
        title="Patients"
        actions={can(session, "patients.write") && <ButtonLink href="/patients/new">Register patient</ButtonLink>}
      />
      <Card>
        <form className="mb-4 flex gap-2">
          <Input name="q" defaultValue={q} placeholder="Search by name, mobile or MRN" className="max-w-md" autoFocus />
          <button className={buttonClass("secondary")}>Search</button>
        </form>
        {patients?.length ? (
          <Table>
            <thead><tr><th>Name</th><th>MRN</th><th>Age / sex</th><th>Mobile</th><th>Registered</th></tr></thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/patients/${p.id}`} className="font-medium text-brand hover:underline">{p.full_name}</Link>
                    {p.tags.map((t) => <Badge key={t} className="ml-1">{t}</Badge>)}
                  </td>
                  <td className="tabular-nums">{p.mrn}</td>
                  <td>{[age(p.dob), SEX_LABELS[p.sex]].filter(Boolean).join(" · ")}</td>
                  <td className="tabular-nums">{p.phone}</td>
                  <td>{formatDate(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title={q ? "No patients match" : "No patients yet"}>
            {can(session, "patients.write") && <Link href="/patients/new" className="text-brand hover:underline">Register a patient</Link>}
          </EmptyState>
        )}
        <div className="mt-4 flex gap-2">
          {page > 0 && <Link className={buttonClass("secondary", "sm")} href={`?q=${encodeURIComponent(q)}&page=${page - 1}`}>Previous</Link>}
          {patients?.length === PAGE && <Link className={buttonClass("secondary", "sm")} href={`?q=${encodeURIComponent(q)}&page=${page + 1}`}>Next</Link>}
        </div>
      </Card>
    </>
  );
}
