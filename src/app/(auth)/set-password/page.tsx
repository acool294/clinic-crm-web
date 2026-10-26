import { redirect } from "next/navigation";
import { SetPasswordForm } from "@/modules/auth/forms";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Choose a password" };

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  return (
    <>
      <h1 className="mb-6 text-xl font-semibold">Choose a password</h1>
      <SetPasswordForm />
    </>
  );
}
