import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/confirm-button";
import { Select } from "@/components/ui/form";
import { Badge, Card, EmptyState, PageHeader, Table } from "@/components/ui/layout";
import { can, requirePermission } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cancelMessage } from "@/modules/messages/actions";

export const metadata = { title: "Messages" };
const tone = { queued: "neutral", sending: "brand", sent: "brand", delivered: "ok", read: "ok", failed: "danger", cancelled: "neutral", skipped: "warn" } as const;

export default async function MessagesPage({ searchParams }: PageProps<"/messages">) {
  const session = await requirePermission("messages.read");
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "";
  const supabase = await createClient();
  let q = supabase.from("message_queue").select("*, patient:patients(id, full_name)").order("created_at", { ascending: false }).limit(200);
  if (status) q = q.eq("status", status as keyof typeof tone);
  const { data: rows } = await q;

  return (
    <>
      <PageHeader
        title="Messages"
        description="Reminders, follow-ups and receipts. Sent every 10 minutes by the scheduled job; patients who reply STOP are opted out."
        actions={can(session, "messages.manage") && <Link href="/settings/messages" className={buttonClass("secondary")}>Templates and recalls</Link>}
      />
      <Card>
        <form className="mb-4 flex gap-2">
          <Select name="status" defaultValue={status} className="h-8 w-44">
            <option value="">All</option>
            {Object.keys(tone).map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <button className={buttonClass("secondary", "sm")}>Show</button>
        </form>
        {rows?.length ? (
          <Table>
            <thead><tr><th>Queued</th><th>Patient</th><th>Message</th><th>Channel</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap">{formatDateTime(m.created_at)}</td>
                  <td>{m.patient ? <Link href={`/patients/${m.patient.id}`} className="hover:underline">{m.patient.full_name}</Link> : m.to_address}</td>
                  <td className="max-w-md">
                    <span className="font-medium">{m.template_key.replace(/_/g, " ")}</span>
                    {m.body && <p className="truncate text-xs text-muted">{m.body}</p>}
                    {m.last_error && <p className="text-xs text-danger">{m.last_error}</p>}
                  </td>
                  <td>{m.channel}</td>
                  <td><Badge tone={tone[m.status]}>{m.status}</Badge></td>
                  <td>{m.status === "queued" && can(session, "messages.manage") && <ActionButton action={cancelMessage.bind(null, m.id)} variant="ghost">Cancel</ActionButton>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No messages yet" />
        )}
      </Card>
    </>
  );
}
