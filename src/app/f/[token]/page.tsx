import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Your feedback" };

async function submit(token: string, formData: FormData) {
  "use server";
  const score = Number(formData.get("score"));
  if (!Number.isInteger(score) || score < 0 || score > 10) return;
  await createAdminClient().rpc("submit_feedback", {
    p_token: token,
    p_score: score,
    p_comment: String(formData.get("comment") ?? "").slice(0, 2000),
  });
  redirect(`/f/${token}?done=1`);
}

// Public page reached from a WhatsApp link. Shows no patient data.
export default async function FeedbackPage({ params, searchParams }: PageProps<"/f/[token]">) {
  const { token } = await params;
  const { done } = await searchParams;
  const valid = /^[0-9a-f]{64}$/.test(token);
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      {done ? (
        <h1 className="text-xl font-semibold">Thank you for your feedback.</h1>
      ) : !valid ? (
        <h1 className="text-xl font-semibold">This link is not valid.</h1>
      ) : (
        <form action={submit.bind(null, token)} className="flex flex-col gap-6">
          <h1 className="text-xl font-semibold">How likely are you to recommend us to friends and family?</h1>
          <div className="grid grid-cols-11 gap-1">
            {Array.from({ length: 11 }, (_, i) => (
              <label key={i} className="flex flex-col items-center gap-1 text-sm">
                <input type="radio" name="score" value={i} required className="size-5" />
                {i}
              </label>
            ))}
          </div>
          <textarea name="comment" rows={4} placeholder="Anything we could do better? (optional)" className="rounded-md border border-line p-3 text-sm" />
          <button className="h-11 rounded-md bg-brand font-medium text-brand-ink">Send</button>
        </form>
      )}
    </main>
  );
}
