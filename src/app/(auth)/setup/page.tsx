import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SetupForm } from "@/modules/auth/forms";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Set up the clinic" };

export default async function SetupPage() {
  await connection();
  const { data: setUp } = await createAdminClient().rpc("clinic_is_set_up");
  if (setUp) redirect("/login");
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Set up the clinic</h1>
      <p className="mb-6 text-sm text-muted">This runs once. You become the clinic&apos;s owner.</p>
      <SetupForm />
    </>
  );
}
