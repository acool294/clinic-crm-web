"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { fromError, type ActionState } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { seedDemo } from "./seed";

export interface DemoState extends ActionState {
  password?: string;
  logins?: { email: string; role: string }[];
}

function demoPassword() {
  const words = ["Neem", "Tulsi", "Amla", "Haldi", "Jeera", "Elaichi", "Saunf", "Pudina"];
  return `${words[randomInt(words.length)]}-${words[randomInt(words.length)]}-${randomInt(1000, 9999)}!`;
}

/** Owner only, and only while the clinic has no patients, so it can never mix with real records. */
export async function loadDemoData(_: DemoState, formData: FormData): Promise<DemoState> {
  try {
    const session = await assertPermission("settings.manage");
    if (!session.roles.includes("owner")) return { ok: false, message: "Only the owner can load demo data." };
    if (formData.get("confirm") !== "on") return { ok: false, message: "Tick the box to confirm this is a test clinic." };
    const supabase = await createClient();
    const { count } = await supabase.from("patients").select("id", { count: "exact", head: true });
    if ((count ?? 0) > 0) return { ok: false, message: "Demo data can only be loaded into a clinic with no patients yet." };

    const password = demoPassword();
    const result = await seedDemo(createAdminClient(), password, { patients: 25, pastDays: 14, futureDays: 5 });
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: `Loaded ${result.patients} patients and ${result.appointments} appointments.`,
      password,
      logins: result.logins,
    };
  } catch (e) {
    return fromError(e);
  }
}
