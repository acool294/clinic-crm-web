import type { Permission } from "@/lib/auth/permissions";

export const SETTINGS_TABS: { href: string; label: string; need: Permission }[] = [
  { href: "/settings/clinic", label: "Clinic", need: "settings.manage" },
  { href: "/settings/staff", label: "Staff", need: "staff.read" },
  { href: "/settings/departments", label: "Departments", need: "settings.manage" },
  { href: "/settings/services", label: "Services & prices", need: "services.manage" },
  { href: "/settings/messages", label: "Messages", need: "messages.manage" },
  { href: "/settings/roles", label: "Roles", need: "settings.manage" },
  { href: "/settings/audit", label: "Audit log", need: "audit.read" },
];
