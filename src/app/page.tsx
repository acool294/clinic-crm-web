import { supabase } from "@/lib/supabase"

export default async function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 gap-4 font-sans">
      <h1 className="text-3xl font-bold">Clinic CRM Platform</h1>
      <p className="text-gray-600">Web Dashboard connected successfully.</p>
      <div className="p-4 bg-gray-100 rounded-lg shadow-inner">
        <p className="text-sm font-mono text-gray-800">
          Supabase URL configured: {process.env.NEXT_PUBLIC_SUPABASE_URL ? "✅ Yes" : "❌ No"}
        </p>
      </div>
    </div>
  );
}
