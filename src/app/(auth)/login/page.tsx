import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/layout";
import { LoginForm } from "@/modules/auth/forms";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, reason } = await searchParams;
  const { data: setUp } = await createAdminClient().rpc("clinic_is_set_up");
  if (setUp === false) redirect("/setup");
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Sign in</h1>
      <p className="mb-6 text-sm text-muted">Staff access only.</p>
      {reason === "idle" && (
        <div className="mb-4">
          <Alert>You were signed out after 30 minutes without activity.</Alert>
        </div>
      )}
      <LoginForm next={typeof next === "string" ? next : undefined} />
    </>
  );
}
