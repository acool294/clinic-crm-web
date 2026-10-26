import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/layout";
import { LoginForm } from "@/modules/auth/forms";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, reason } = await searchParams;
  const { data: setUp, error } = await createAdminClient().rpc("clinic_is_set_up");
  if (setUp === false) redirect("/setup");
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Welcome back</h1>
      <p className="mb-6 text-sm text-muted">Sign in to your clinic account.</p>
      {reason === "idle" && (
        <div className="mb-4">
          <Alert>You were signed out after 30 minutes without activity.</Alert>
        </div>
      )}
      {reason === "link" && (
        <div className="mb-4">
          <Alert tone="danger">That link has expired or was already used. Request a new one.</Alert>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Alert tone="danger">The app cannot reach its database. Check <a href="/api/health" className="underline">/api/health</a>.</Alert>
        </div>
      )}
      <LoginForm next={typeof next === "string" ? next : undefined} />
    </>
  );
}
