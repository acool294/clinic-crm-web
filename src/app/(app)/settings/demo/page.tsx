import { Card, PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/lib/auth/session";
import { DemoForm } from "@/modules/demo/demo-form";

export const metadata = { title: "Demo data" };
export const maxDuration = 60;

export default async function DemoPage() {
  await requirePermission("settings.manage");
  return (
    <>
      <PageHeader
        title="Demo data"
        description="Fill a new test clinic with 4 doctors (one per department), a receptionist, a nurse, a billing user, 25 patients, two weeks of visits and invoices, and doctor hours."
      />
      <Card>
        <DemoForm />
      </Card>
    </>
  );
}
