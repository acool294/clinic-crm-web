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

/** "Send now" on the Messages page: queue whatever is due and send it, without waiting for the daily run. */
export async function sendMessagesNow(): Promise<ActionState> {
  try {
    await assertPermission("messages.manage");
    const { runMessageJob } = await import("./job");
    const r = await runMessageJob(100);
    revalidatePath("/messages");
    return {
      ok: true,
      message: `Queued ${r.enqueued} new. Sent ${r.sent}, skipped ${r.skipped}, failed ${r.failed}.`,
    };
  } catch (e) {
    return fromError(e);
  }
}
