"use server";

import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export interface SearchHit {
  kind: "patient" | "invoice" | "appointment";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export async function globalSearch(query: string): Promise<SearchHit[]> {
  const session = await getSession();
  if (!session || session.needsMfa || query.trim().length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("global_search", { p_query: query.slice(0, 80) });
  return (data ?? []).map((r) => {
    const kind = r.kind as SearchHit["kind"];
    const href =
      kind === "patient" ? `/patients/${r.id}` : kind === "invoice" ? `/billing/invoices/${r.id}` : `/calendar?appointment=${r.id}`;
    return { kind, id: r.id, title: r.title ?? "", subtitle: r.subtitle ?? "", href };
  });
}
