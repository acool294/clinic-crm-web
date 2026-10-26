"use server";

import { revalidatePath } from "next/cache";
import { fromError, type ActionState } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function setLabStatus(orderId: string, status: "sample_collected" | "cancelled"): Promise<ActionState> {
  try {
    await assertPermission("lab.write");
    const supabase = await createClient();
    const { error } = await supabase
      .from("lab_orders")
      .update({ status, ...(status === "sample_collected" ? { sample_collected_at: new Date().toISOString() } : {}) })
      .eq("id", orderId);
    if (error) return fromError(error);
    revalidatePath(`/labs/${orderId}`);
    revalidatePath("/labs");
    return { ok: true };
  } catch (e) {
    return fromError(e);
  }
}

/** Saves every result on the form; marks the order resulted when all have a value. */
export async function saveLabResults(orderId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await assertPermission("lab.write");
    const supabase = await createClient();
    const { data: results } = await supabase.from("lab_results").select("id").eq("lab_order_id", orderId);
    let filled = 0;
    for (const r of results ?? []) {
      const raw = String(formData.get(`value_${r.id}`) ?? "").trim();
      if (!raw) continue;
      const n = Number(raw.replace(",", "."));
      const { error } = await supabase
        .from("lab_results")
        .update(Number.isFinite(n) && /^[-\d.,]+$/.test(raw) ? { value_numeric: n, value_text: null } : { value_text: raw.slice(0, 500), value_numeric: null })
        .eq("id", r.id);
      if (error) return fromError(error);
      filled++;
    }
    if (results?.length && filled === results.length) {
      await supabase.from("lab_orders").update({ status: "resulted", resulted_at: new Date().toISOString() }).eq("id", orderId);
    }
    revalidatePath(`/labs/${orderId}`);
    revalidatePath("/labs");
    return { ok: true, message: filled === results?.length ? "All results entered." : `${filled} of ${results?.length} entered.` };
  } catch (e) {
    return fromError(e);
  }
}
