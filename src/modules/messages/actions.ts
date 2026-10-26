"use server";

import { revalidatePath } from "next/cache";
import { fromError, type ActionState } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function cancelMessage(id: string): Promise<ActionState> {
  try {
    await assertPermission("messages.manage");
    const supabase = await createClient();
    const { error } = await supabase.from("message_queue").update({ status: "cancelled" }).eq("id", id);
    if (error) return fromError(error);
    revalidatePath("/messages");
    return { ok: true };
  } catch (e) {
    return fromError(e);
  }
}
