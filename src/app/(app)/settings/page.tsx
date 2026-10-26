import { redirect } from "next/navigation";
import { can, requireSession } from "@/lib/auth/session";
import { SETTINGS_TABS } from "@/modules/settings/tabs";

export default async function SettingsIndex() {
  const session = await requireSession();
  const first = SETTINGS_TABS.find((t) => can(session, t.need));
  redirect(first ? first.href : "/forbidden");
}
