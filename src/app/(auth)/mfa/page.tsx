import { redirect } from "next/navigation";
import { TotpEnroll, TotpVerifyForm } from "@/modules/auth/forms";
import { logout } from "@/modules/auth/actions";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Two-step sign-in" };

export default async function MfaPage({ searchParams }: PageProps<"/mfa">) {
  const { next } = await searchParams;
  const nextPath = typeof next === "string" ? next : "/";
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login");
  if (claims.claims.aal === "aal2") redirect(nextPath);

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp?.find((f) => f.status === "verified");

  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Two-step sign-in</h1>
      <p className="mb-6 text-sm text-muted">
        {verified ? "Enter the code from your authenticator app." : "Set up your authenticator app to continue."}
      </p>
      {verified ? <TotpVerifyForm factorId={verified.id} next={nextPath} /> : <TotpEnroll next={nextPath} />}
      <form action={logout} className="mt-4 text-center">
        <button className="text-sm text-muted hover:underline">Sign out</button>
      </form>
    </>
  );
}
