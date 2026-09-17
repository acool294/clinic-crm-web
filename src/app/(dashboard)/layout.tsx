"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  Bell,
  CalendarDays,
  ChevronDown,
  User, LayoutDashboard,
  Loader2,
  LogOut,
  Receipt,
  Search,
  Settings,
  Stethoscope,
  Users,
  AlertCircle,
} from "lucide-react";

interface NavItem {
  title?: string;
  label?: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Calendar",
    href: "/calendar",
    icon: CalendarDays,
  },
  {
    title: "Patients",
    href: "/patients",
    icon: Users,
  },
  {
    title: "Diagnosis",
    href: "/diagnosis",
    icon: Stethoscope,
  },
  {
    title: "Billing",
    href: "/billing",
    icon: Receipt,
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

function getPageTitle(pathname: string): string {
  if (pathname === "/" || pathname === "") return "Dashboard";
  if (pathname.startsWith("/calendar")) return "Calendar";
  if (pathname.startsWith("/patients")) return "Patients";
  if (pathname.startsWith("/diagnosis")) return "Diagnosis";
  if (pathname.startsWith("/billing")) return "Billing";
  if (pathname.startsWith("/settings")) return "Settings";

  const segment = pathname.split("/").filter(Boolean)[0];
  if (!segment) return "Dashboard";
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, staffProfile, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  const userName = useMemo(() => {
    return staffProfile?.name || user?.email?.split("@")[0] || "Staff Member";
  }, [staffProfile?.name, user?.email]);

  const userRole = useMemo(() => {
    return staffProfile?.role || "Staff";
  }, [staffProfile?.role]);

  const userInitials = useMemo(() => {
    const parts = userName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return (userName.slice(0, 2) || "MD").toUpperCase();
  }, [userName]);

  const pageTitle = useMemo(() => getPageTitle(pathname), [pathname]);

  const isItemActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-slate-50 p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/20 ring-4 ring-blue-100">
            <Activity className="size-7 animate-pulse text-white" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-base font-bold tracking-tight text-slate-800">
              MediFlow CRM
            </span>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="size-3.5 animate-spin text-blue-600" />
              <span>Loading workspace...</span>
            </div>
          </div>
          <div className="mt-4 flex w-64 flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4 self-center" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-slate-50">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="size-4 animate-spin text-blue-600" />
          <span>Redirecting to login...</span>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
        {/* Sidebar Header: Blue medical icon + MediFlow CRM brand text */}
        <SidebarHeader className="border-b border-sidebar-border/60 p-4">
          <div className="flex items-center gap-3 overflow-hidden group-data-[collapsible=icon]:justify-center">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm ring-2 ring-blue-600/20">
              <Activity className="size-5" />
            </div>
            <div className="flex flex-col overflow-hidden group-data-[collapsible=icon]:hidden">
              <span className="truncate text-base font-bold tracking-tight text-slate-900">
                MediFlow CRM
              </span>
              <span className="truncate text-xs font-medium text-teal-600">
                Medical Practice
              </span>
            </div>
          </div>
        </SidebarHeader>

        {/* Sidebar Content: Navigation Items */}
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1 px-2 py-2">
                {navItems.map((item) => {
                  const active = isItemActive(item.href);
                  const label = item.label ?? item.title ?? "";
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={active}
                        tooltip={label}
                        className={cn(
                          "w-full justify-start gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-blue-50 text-blue-700 font-semibold shadow-xs"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        )}
                      >
                        <item.icon
                          className={cn(
                            "size-4 shrink-0 transition-colors",
                            active ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"
                          )}
                        />
                        <span className="truncate">{label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        {/* Sidebar Footer: User avatar + name + role badge + Sign Out button */}
        <SidebarFooter className="border-t border-sidebar-border/60 p-3">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 overflow-hidden group-data-[collapsible=icon]:justify-center">
              <Avatar className="size-9 shrink-0 border border-slate-200 bg-blue-50">
                <AvatarFallback className="bg-blue-100 text-xs font-semibold text-blue-700">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-1 flex-col overflow-hidden group-data-[collapsible=icon]:hidden">
                <span className="truncate text-sm font-semibold text-slate-800">
                  {userName}
                </span>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <Badge
                    variant="secondary"
                    className="h-4 border-teal-200 bg-teal-50 px-1.5 text-[10px] font-medium uppercase tracking-wider text-teal-700"
                  >
                    {userRole}
                  </Badge>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="w-full justify-start gap-2 text-slate-600 hover:bg-rose-50 hover:text-rose-600 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
              title="Sign Out"
            >
              <LogOut className="size-4 shrink-0" />
              <span className="truncate group-data-[collapsible=icon]:hidden">
                Sign Out
              </span>
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* Main Content Area */}
      <SidebarInset className="flex min-h-screen flex-1 flex-col bg-slate-50/50">
        {/* Top Header Bar: Page title, global search, notification bell, user dropdown */}
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-white px-4 md:px-6">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="h-4" />
            <h1 className="text-base font-semibold tracking-tight text-slate-900">
              {pageTitle}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Global Search Input */}
            <div className="relative w-44 sm:w-60 md:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="search"
                placeholder="Search patients, records..."
                className="h-8 border-slate-200 bg-slate-50 pl-8 text-xs focus-visible:border-blue-500 focus-visible:bg-white"
              />
            </div>

            {/* Notification Bell Icon */}
            <Button
              variant="ghost"
              size="icon"
              className="relative size-8 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              aria-label="Notifications"
            >
              <Bell className="size-4" />
              <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-rose-500 ring-2 ring-white" />
            </Button>

            {/* User Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger className="flex cursor-pointer items-center gap-2 rounded-full p-1 outline-none transition-colors hover:bg-slate-100">
                <Avatar className="size-8 border border-slate-200 bg-blue-50">
                  <AvatarFallback className="bg-blue-100 text-xs font-semibold text-blue-700">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden text-left sm:block">
                  <p className="max-w-[120px] truncate text-xs font-semibold leading-tight text-slate-800">
                    {userName}
                  </p>
                  <p className="text-[10px] capitalize leading-tight text-slate-500">
                    {userRole}
                  </p>
                </div>
                <ChevronDown className="hidden size-3.5 text-slate-400 sm:block" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1.5">
                <DropdownMenuLabel className="px-2 py-1.5 font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="truncate text-sm font-semibold leading-none text-slate-900">
                      {userName}
                    </p>
                    <p className="truncate text-xs leading-none text-slate-500">
                      {user.email}
                    </p>
                    <div className="flex items-center gap-1.5 pt-1">
                      <Badge
                        variant="secondary"
                        className="h-4 border-teal-200 bg-teal-50 px-1.5 text-[10px] font-medium uppercase text-teal-700"
                      >
                        {userRole}
                      </Badge>
                      {staffProfile?.clinic_id && (
                        <span className="font-mono text-[10px] text-slate-400">
                          {staffProfile.clinic_id.slice(0, 8)}...
                        </span>
                      )}
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => router.push("/profile")}
                    className="cursor-pointer"
                  >
                    <User className="size-4 text-slate-500" />
                    <span>My Profile</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/settings")}
                    className="cursor-pointer"
                  >
                    <Settings className="size-4 text-slate-500" />
                    <span>Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => window.location.href="mailto:support@clinic-crm.com?subject=Bug Report"}
                    className="cursor-pointer"
                  >
                    <AlertCircle className="size-4 text-slate-500 mr-2" />
                    <span>Report Issue</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={handleSignOut}
                  className="cursor-pointer"
                >
                  <LogOut className="size-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
