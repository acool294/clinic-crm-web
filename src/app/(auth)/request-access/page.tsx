import Link from "next/link";
import { RequestAccessForm } from "@/modules/auth/forms";

export const metadata = { title: "Request access" };

export default function RequestAccessPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Request access</h1>
      <p className="mb-6 text-sm text-muted">Staff accounts are created by the clinic owner. Send a request and they will email you an invite.</p>
      <RequestAccessForm />
      <Link href="/login" className="mt-6 block text-center text-sm text-muted hover:underline">Back to sign in</Link>
    </>
  );
}
