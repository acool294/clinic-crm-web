"use client";

import {
  BarChart3,
  CalendarDays,
  FlaskConical,
  Home,
  IndianRupee,
  ListOrdered,
  MessageSquare,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ICONS = {
  home: Home,
  patients: Users,
  calendar: CalendarDays,
  queue: ListOrdered,
  labs: FlaskConical,
  billing: IndianRupee,
  messages: MessageSquare,
  analytics: BarChart3,
  settings: Settings,
} as const;

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
}

export function Nav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm",
              active ? "bg-brand-soft font-medium text-brand" : "text-ink hover:bg-bg",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
