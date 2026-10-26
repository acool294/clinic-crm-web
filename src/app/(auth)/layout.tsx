export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-sm">{children}</div>
    </main>
  );
}
