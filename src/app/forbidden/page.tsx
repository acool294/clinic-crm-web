import { ButtonLink } from "@/components/ui/button";

export const metadata = { title: "Not allowed" };

export default async function ForbiddenPage({ searchParams }: PageProps<"/forbidden">) {
  const { need } = await searchParams;
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">You don&apos;t have access to this page</h1>
      <p className="mt-2 text-sm text-muted">
        Your role does not include this{typeof need === "string" ? ` (${need})` : ""}. Ask the clinic owner if you need it.
      </p>
      <ButtonLink href="/" variant="secondary" className="mt-6">
        Back to today
      </ButtonLink>
    </main>
  );
}
