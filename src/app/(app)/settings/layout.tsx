import Link from "next/link";
import { can, requireSession } from "@/lib/auth/session";
import { SETTINGS_TABS } from "@/modules/settings/tabs";


export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const tabs = SETTINGS_TABS.filter((t) => can(session, t.need));
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <nav className="flex shrink-0 gap-1 overflow-x-auto lg:w-48 lg:flex-col">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className="rounded-md px-3 py-2 text-sm whitespace-nowrap hover:bg-surface">
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
