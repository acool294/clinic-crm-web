import Link from "next/link";
import { ForgotPasswordForm } from "@/modules/auth/forms";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="mb-6 text-xl font-semibold">Reset your password</h1>
      <ForgotPasswordForm />
      <Link href="/login" className="mt-4 block text-center text-sm text-muted hover:underline">
        Back to sign in
      </Link>
    </>
  );
}
