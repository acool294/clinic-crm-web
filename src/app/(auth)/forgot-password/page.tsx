import Link from "next/link";
import { ForgotPasswordForm } from "@/modules/auth/forms";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Reset your password</h1>
      <p className="mb-6 text-sm text-muted">Enter your email and we will send you a link to choose a new password.</p>
      <ForgotPasswordForm />
      <Link href="/login" className="mt-4 block text-center text-sm text-muted hover:underline">
        Back to sign in
      </Link>
    </>
  );
}
