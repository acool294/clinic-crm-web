import { LogOut } from "lucide-react";
import { GlobalSearch } from "@/components/shell/global-search";
import { Nav, type NavItem } from "@/components/shell/nav";
import { can, requireSession } from "@/lib/auth/session";
import type { Permission } from "@/lib/auth/permissions";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/modules/auth/actions";

const NAV: (NavItem & { need?: Permission | Permission[] })[] = [
  { href: "/", label: "Today", icon: "home" },
  { href: "/patients", label: "Patients", icon: "patients", need: "patients.read" },
  { href: "/calendar", label: "Calendar", icon: "calendar", need: "appointments.read" },
  { href: "/queue", label: "Queue", icon: "queue", need: "appointments.read" },
  { href: "/labs", label: "Labs", icon: "labs", need: "lab.read" },
  { href: "/billing", label: "Billing", icon: "billing", need: "billing.read" },
  { href: "/messages", label: "Messages", icon: "messages", need: "messages.read" },
  { href: "/analytics", label: "Analytics", icon: "analytics", need: "analytics.read" },
  {
    href: "/settings",
    label: "Settings",
    icon: "settings",
    need: ["settings.manage", "staff.read", "services.manage", "messages.manage", "audit.read"],
  },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const supabase = await createClient();
  const { data: clinic } = await supabase.from("clinics").select("name").single();

  const items = NAV.filter((item) => {
    if (!item.need) return true;
    const needs = Array.isArray(item.need) ? item.need : [item.need];
    return needs.some((p) => can(session, p));
  }).map(({ href, label, icon }) => ({ href, label, icon }));

  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line bg-surface p-3 md:flex">
        <div className="mb-4 px-3 py-2">
          <p className="truncate font-semibold">{clinic?.name ?? "Clinic"}</p>
          <p className="truncate text-xs text-muted">
            {session.fullName} · {session.roles.map((r) => ROLE_LABELS[r]).join(", ")}
          </p>
        </div>
        <Nav items={items} />
        <form action={logout} className="mt-auto">
          <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted hover:bg-bg">
            <LogOut className="size-4" /> Sign out
          </button>
        </form>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur md:px-8">
          <details className="md:hidden">
            <summary className="cursor-pointer list-none rounded-md border border-line bg-surface px-3 py-1.5 text-sm">Menu</summary>
            <div className="absolute left-4 mt-2 w-56 rounded-lg border border-line bg-surface p-2 shadow-lg">
              <Nav items={items} />
            </div>
          </details>
          {can(session, "patients.read") && <GlobalSearch />}
        </header>
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
