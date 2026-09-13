"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Building,
  Users,
  Plus,
  Pencil,
  Trash2,
  Check,
  AlertCircle,
  Mail,
  Phone,
  MapPin,
  Search,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

type StaffRole = "Doctor" | "Receptionist" | "Nurse" | "Admin";
type StaffStatus = "Active" | "Inactive";

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  status: StaffStatus;
}

interface ClinicProfile {
  name: string;
  address: string;
  phone: string;
  email: string;
}

const initialClinicProfile: ClinicProfile = {
  name: "City Health Clinic",
  address: "123 Medical Lane, Mumbai 400001",
  phone: "+91 22 2345 6789",
  email: "admin@cityhealthclinic.com",
};

const initialStaffList: StaffMember[] = [
  {
    id: "staff-1",
    name: "Dr. Rajesh Smith",
    email: "rajesh@clinic.com",
    role: "Doctor",
    status: "Active",
  },
  {
    id: "staff-2",
    name: "Dr. Anita Patel",
    email: "anita@clinic.com",
    role: "Doctor",
    status: "Active",
  },
  {
    id: "staff-3",
    name: "Meera Kapoor",
    email: "meera@clinic.com",
    role: "Receptionist",
    status: "Active",
  },
  {
    id: "staff-4",
    name: "Vikram Singh",
    email: "vikram@clinic.com",
    role: "Nurse",
    status: "Active",
  },
];

function getInitials(name: string): string {
  const parts = name.replace(/^Dr\.\s+/i, "").trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return (parts[0]?.[0] || "U").toUpperCase();
}

export default function SettingsPage() {
  // Tab 1: Clinic Profile State
  const [profile, setProfile] = useState<ClinicProfile>(initialClinicProfile);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Tab 2: Staff Management State
  const [staffList, setStaffList] = useState<StaffMember[]>(initialStaffList);
  const [searchQuery, setSearchQuery] = useState("");

  // Dialog States
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffRole, setNewStaffRole] = useState<StaffRole>("Doctor");
  const [newStaffStatus, setNewStaffStatus] = useState<StaffStatus>("Active");
  const [addStaffError, setAddStaffError] = useState<string | null>(null);

  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<StaffRole>("Doctor");
  const [editStatus, setEditStatus] = useState<StaffStatus>("Active");
  const [editStaffError, setEditStaffError] = useState<string | null>(null);

  const [staffToDelete, setStaffToDelete] = useState<StaffMember | null>(null);

  // Handle Save Profile
  function handleSaveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSavingProfile(true);
    setSaveSuccessMessage(null);

    setTimeout(() => {
      setIsSavingProfile(false);
      setSaveSuccessMessage("Clinic profile settings have been successfully updated.");
      setTimeout(() => {
        setSaveSuccessMessage(null);
      }, 4000);
    }, 600);
  }

  // Handle Add Staff
  function handleOpenAddStaff() {
    setNewStaffName("");
    setNewStaffEmail("");
    setNewStaffRole("Doctor");
    setNewStaffStatus("Active");
    setAddStaffError(null);
    setIsAddStaffOpen(true);
  }

  function handleSaveNewStaff(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newStaffName.trim()) {
      setAddStaffError("Staff member name is required.");
      return;
    }
    if (!newStaffEmail.trim() || !newStaffEmail.includes("@")) {
      setAddStaffError("A valid email address is required.");
      return;
    }

    const newMember: StaffMember = {
      id: `staff-${Date.now()}`,
      name: newStaffName.trim(),
      email: newStaffEmail.trim().toLowerCase(),
      role: newStaffRole,
      status: newStaffStatus,
    };

    setStaffList((prev) => [newMember, ...prev]);
    setIsAddStaffOpen(false);
  }

  // Handle Edit Staff
  function handleOpenEditStaff(member: StaffMember) {
    setEditingStaff(member);
    setEditName(member.name);
    setEditEmail(member.email);
    setEditRole(member.role);
    setEditStatus(member.status);
    setEditStaffError(null);
  }

  function handleSaveEditedStaff(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingStaff) return;

    if (!editName.trim()) {
      setEditStaffError("Staff member name is required.");
      return;
    }
    if (!editEmail.trim() || !editEmail.includes("@")) {
      setEditStaffError("A valid email address is required.");
      return;
    }

    setStaffList((prev) =>
      prev.map((item) =>
        item.id === editingStaff.id
          ? {
              ...item,
              name: editName.trim(),
              email: editEmail.trim().toLowerCase(),
              role: editRole,
              status: editStatus,
            }
          : item
      )
    );
    setEditingStaff(null);
  }

  // Handle Remove Staff
  function handleConfirmDelete() {
    if (!staffToDelete) return;
    setStaffList((prev) => prev.filter((item) => item.id !== staffToDelete.id));
    setStaffToDelete(null);
  }

  // Filter staff by search query
  const filteredStaff = staffList.filter(
    (member) =>
      member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Role Badge Helper
  function renderRoleBadge(role: StaffRole) {
    switch (role) {
      case "Doctor":
        return (
          <Badge
            variant="outline"
            className="border-blue-200 bg-blue-50 font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
          >
            Doctor
          </Badge>
        );
      case "Receptionist":
        return (
          <Badge
            variant="outline"
            className="border-teal-200 bg-teal-50 font-medium text-teal-700 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-300"
          >
            Receptionist
          </Badge>
        );
      case "Nurse":
        return (
          <Badge
            variant="outline"
            className="border-purple-200 bg-purple-50 font-medium text-purple-700 dark:border-purple-800 dark:bg-purple-950/60 dark:text-purple-300"
          >
            Nurse
          </Badge>
        );
      case "Admin":
        return (
          <Badge
            variant="outline"
            className="border-slate-200 bg-slate-100 font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            Admin
          </Badge>
        );
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage your clinic profile, contact information, and practice team.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="clinic-profile" className="w-full space-y-6">
        <TabsList className="grid h-10 w-full grid-cols-2 rounded-lg bg-slate-100 p-1 sm:w-[380px] dark:bg-slate-800/70">
          <TabsTrigger
            value="clinic-profile"
            className="flex items-center justify-center gap-2 font-medium text-slate-600 transition-all data-active:bg-white data-active:text-blue-600 data-active:shadow-xs dark:text-slate-400 dark:data-active:bg-slate-900 dark:data-active:text-blue-400"
          >
            <Building className="size-4" />
            <span>Clinic Profile</span>
          </TabsTrigger>
          <TabsTrigger
            value="staff-management"
            className="flex items-center justify-center gap-2 font-medium text-slate-600 transition-all data-active:bg-white data-active:text-blue-600 data-active:shadow-xs dark:text-slate-400 dark:data-active:bg-slate-900 dark:data-active:text-blue-400"
          >
            <Users className="size-4" />
            <span>Staff Management</span>
            <span className="ml-1 rounded-full bg-slate-200 px-1.5 py-0.2 text-[11px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-300">
              {staffList.length}
            </span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Clinic Profile */}
        <TabsContent value="clinic-profile" className="space-y-6 outline-none">
          {saveSuccessMessage && (
            <div
              role="alert"
              className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 text-sm text-emerald-800 shadow-xs dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>{saveSuccessMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="border-slate-200/80 bg-white shadow-xs lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
              <CardHeader className="space-y-1 pb-4">
                <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Clinic Details
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  Update your clinic identity and public communication channels.
                </CardDescription>
              </CardHeader>
              <Separator />

              <form onSubmit={handleSaveProfile}>
                <CardContent className="space-y-5 pt-6">
                  {/* Clinic Name */}
                  <div className="space-y-2">
                    <label
                      htmlFor="clinic-name"
                      className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                    >
                      <Building className="size-3.5 text-blue-600" />
                      <span>Clinic Name</span>
                    </label>
                    <Input
                      id="clinic-name"
                      type="text"
                      value={profile.name}
                      onChange={(e) =>
                        setProfile((prev) => ({ ...prev, name: e.target.value }))
                      }
                      placeholder="e.g. City Health Clinic"
                      className="h-10 border-slate-200 bg-white text-sm focus-visible:border-blue-600 focus-visible:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-950"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      This name will appear on patient invoices, appointments, and notifications.
                    </p>
                  </div>

                  {/* Phone & Email (2-Column) */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label
                        htmlFor="clinic-phone"
                        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                      >
                        <Phone className="size-3.5 text-blue-600" />
                        <span>Phone Number</span>
                      </label>
                      <Input
                        id="clinic-phone"
                        type="tel"
                        value={profile.phone}
                        onChange={(e) =>
                          setProfile((prev) => ({ ...prev, phone: e.target.value }))
                        }
                        placeholder="+91 22 2345 6789"
                        className="h-10 border-slate-200 bg-white text-sm focus-visible:border-blue-600 focus-visible:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-950"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="clinic-email"
                        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                      >
                        <Mail className="size-3.5 text-blue-600" />
                        <span>Email Address</span>
                      </label>
                      <Input
                        id="clinic-email"
                        type="email"
                        value={profile.email}
                        onChange={(e) =>
                          setProfile((prev) => ({ ...prev, email: e.target.value }))
                        }
                        placeholder="admin@cityhealthclinic.com"
                        className="h-10 border-slate-200 bg-white text-sm focus-visible:border-blue-600 focus-visible:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-950"
                        required
                      />
                    </div>
                  </div>

                  {/* Address Textarea */}
                  <div className="space-y-2">
                    <label
                      htmlFor="clinic-address"
                      className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                    >
                      <MapPin className="size-3.5 text-blue-600" />
                      <span>Address</span>
                    </label>
                    <textarea
                      id="clinic-address"
                      rows={3}
                      value={profile.address}
                      onChange={(e) =>
                        setProfile((prev) => ({ ...prev, address: e.target.value }))
                      }
                      placeholder="Enter the full street address..."
                      className="flex min-h-[96px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-blue-600 focus-visible:ring-3 focus-visible:ring-blue-600/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Physical clinic location shown on patient receipts and appointment directions.
                    </p>
                  </div>
                </CardContent>

                <Separator />
                <div className="flex items-center justify-end px-6 py-4">
                  <Button
                    type="submit"
                    disabled={isSavingProfile}
                    className="bg-blue-600 px-6 font-medium text-white shadow-sm hover:bg-blue-700 active:translate-y-px"
                  >
                    {isSavingProfile ? (
                      <span className="flex items-center gap-2">
                        <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Saving...
                      </span>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                </div>
              </form>
            </Card>

            {/* Clinic Info Overview Card */}
            <div className="space-y-4">
              <Card className="border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                    Live Preview
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/50 p-3 dark:border-blue-950 dark:bg-blue-950/30">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-xs">
                      <Building className="size-5" />
                    </div>
                    <div className="overflow-hidden">
                      <h4 className="truncate font-semibold text-slate-900 dark:text-slate-100">
                        {profile.name || "Clinic Name"}
                      </h4>
                      <p className="truncate text-xs text-teal-600 font-medium">
                        MediFlow Registered Practice
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2.5 text-xs text-slate-600 dark:text-slate-400">
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
                      <span className="leading-snug">{profile.address}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="size-3.5 shrink-0 text-slate-400" />
                      <span>{profile.phone}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="size-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{profile.email}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200/80 bg-gradient-to-br from-teal-50/50 to-blue-50/30 p-4 text-xs text-slate-600 shadow-xs dark:border-slate-800 dark:from-slate-900 dark:to-slate-900 dark:text-slate-400">
                <div className="flex items-start gap-2.5">
                  <div className="rounded-md bg-teal-600/10 p-1 text-teal-700 dark:text-teal-400">
                    <Check className="size-4" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-900 dark:text-slate-200">
                      Profile Verification
                    </p>
                    <p className="leading-relaxed text-slate-500 dark:text-slate-400">
                      All clinic information is verified against your local medical licensing authority.
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Staff Management */}
        <TabsContent value="staff-management" className="space-y-6 outline-none">
          <Card className="border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            {/* Header with "+ Add Staff" button */}
            <CardHeader className="gap-4 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Staff Members
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  Manage medical practitioners, nurses, and administrative staff members.
                </CardDescription>
              </div>
              <Button
                type="button"
                onClick={handleOpenAddStaff}
                className="gap-2 bg-blue-600 font-medium text-white shadow-sm hover:bg-blue-700 active:translate-y-px"
              >
                <Plus className="size-4" />
                <span>+ Add Staff</span>
              </Button>
            </CardHeader>
            <Separator />

            {/* Filter Bar */}
            <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="search"
                  placeholder="Search staff by name, email, or role..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 border-slate-200 bg-white pl-9 text-xs focus-visible:border-blue-600 focus-visible:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Showing</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {filteredStaff.length}
                </span>
                <span>of {staffList.length} members</span>
              </div>
            </div>

            {/* Table of Staff Members */}
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80 dark:bg-slate-800/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[280px] font-semibold text-slate-700 dark:text-slate-300">
                      Name
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 dark:text-slate-300">
                      Email
                    </TableHead>
                    <TableHead className="w-[140px] font-semibold text-slate-700 dark:text-slate-300">
                      Role
                    </TableHead>
                    <TableHead className="w-[120px] font-semibold text-slate-700 dark:text-slate-300">
                      Status
                    </TableHead>
                    <TableHead className="w-[180px] text-right font-semibold text-slate-700 dark:text-slate-300">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStaff.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-12 text-center text-sm text-muted-foreground"
                      >
                        No staff members found matching your search.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredStaff.map((member) => (
                      <TableRow
                        key={member.id}
                        className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/50"
                      >
                        {/* Name */}
                        <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                          <div className="flex items-center gap-3">
                            <Avatar className="size-8 border border-slate-200 bg-blue-50 dark:border-slate-700 dark:bg-blue-950">
                              <AvatarFallback className="bg-blue-100 text-xs font-semibold text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                                {getInitials(member.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold leading-tight text-slate-900 dark:text-slate-100">
                                {member.name}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                ID: {member.id}
                              </p>
                            </div>
                          </div>
                        </TableCell>

                        {/* Email */}
                        <TableCell className="text-slate-600 dark:text-slate-400">
                          <div className="flex items-center gap-1.5 text-xs">
                            <Mail className="size-3.5 text-slate-400" />
                            <span>{member.email}</span>
                          </div>
                        </TableCell>

                        {/* Role (Badge) */}
                        <TableCell>{renderRoleBadge(member.role)}</TableCell>

                        {/* Status */}
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "gap-1.5 font-medium",
                              member.status === "Active"
                                ? "border-emerald-200 bg-emerald-50/70 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                            )}
                          >
                            <span
                              className={cn(
                                "size-1.5 rounded-full",
                                member.status === "Active"
                                  ? "bg-emerald-500"
                                  : "bg-slate-400"
                              )}
                            />
                            {member.status}
                          </Badge>
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* 'Edit' outline button */}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenEditStaff(member)}
                              className="h-8 gap-1.5 border-slate-200 px-2.5 text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              <Pencil className="size-3.5" />
                              <span>Edit</span>
                            </Button>

                            {/* 'Remove' destructive outline button */}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setStaffToDelete(member)}
                              className="h-8 gap-1.5 border-red-200 px-2.5 text-xs text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                            >
                              <Trash2 className="size-3.5" />
                              <span>Remove</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Staff Dialog */}
      <Dialog open={isAddStaffOpen} onOpenChange={setIsAddStaffOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSaveNewStaff}>
            <DialogHeader>
              <DialogTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Add New Staff Member
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Enter details to register a healthcare practitioner or administrative staff.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {addStaffError && (
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                >
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{addStaffError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="add-name"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Full Name
                </label>
                <Input
                  id="add-name"
                  type="text"
                  placeholder="e.g. Dr. Kavita Roy"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  className="h-9 text-sm"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="add-email"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Email Address
                </label>
                <Input
                  id="add-email"
                  type="email"
                  placeholder="e.g. kavita@clinic.com"
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  className="h-9 text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="add-role"
                    className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Role
                  </label>
                  <select
                    id="add-role"
                    value={newStaffRole}
                    onChange={(e) => setNewStaffRole(e.target.value as StaffRole)}
                    className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-xs transition-colors outline-none focus-visible:border-blue-600 focus-visible:ring-3 focus-visible:ring-blue-600/20 dark:bg-slate-900"
                  >
                    <option value="Doctor">Doctor</option>
                    <option value="Receptionist">Receptionist</option>
                    <option value="Nurse">Nurse</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="add-status"
                    className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Status
                  </label>
                  <select
                    id="add-status"
                    value={newStaffStatus}
                    onChange={(e) =>
                      setNewStaffStatus(e.target.value as StaffStatus)
                    }
                    className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-xs transition-colors outline-none focus-visible:border-blue-600 focus-visible:ring-3 focus-visible:ring-blue-600/20 dark:bg-slate-900"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddStaffOpen(false)}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="h-9 bg-blue-600 text-xs font-medium text-white hover:bg-blue-700"
              >
                Add Staff Member
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Staff Dialog */}
      <Dialog
        open={Boolean(editingStaff)}
        onOpenChange={(open) => {
          if (!open) setEditingStaff(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSaveEditedStaff}>
            <DialogHeader>
              <DialogTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Edit Staff Member
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Update staff information, clinical role, or account status.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {editStaffError && (
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                >
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{editStaffError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="edit-name"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Full Name
                </label>
                <Input
                  id="edit-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-9 text-sm"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="edit-email"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Email Address
                </label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="h-9 text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="edit-role"
                    className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Role
                  </label>
                  <select
                    id="edit-role"
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as StaffRole)}
                    className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-xs transition-colors outline-none focus-visible:border-blue-600 focus-visible:ring-3 focus-visible:ring-blue-600/20 dark:bg-slate-900"
                  >
                    <option value="Doctor">Doctor</option>
                    <option value="Receptionist">Receptionist</option>
                    <option value="Nurse">Nurse</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="edit-status"
                    className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Status
                  </label>
                  <select
                    id="edit-status"
                    value={editStatus}
                    onChange={(e) =>
                      setEditStatus(e.target.value as StaffStatus)
                    }
                    className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-xs transition-colors outline-none focus-visible:border-blue-600 focus-visible:ring-3 focus-visible:ring-blue-600/20 dark:bg-slate-900"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingStaff(null)}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="h-9 bg-blue-600 text-xs font-medium text-white hover:bg-blue-700"
              >
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <Dialog
        open={Boolean(staffToDelete)}
        onOpenChange={(open) => {
          if (!open) setStaffToDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
              <ShieldAlert className="size-6" />
            </div>
            <DialogTitle className="text-center text-base font-semibold text-slate-900 dark:text-slate-100">
              Remove Staff Member
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-muted-foreground">
              Are you sure you want to remove{" "}
              <strong className="text-slate-900 dark:text-slate-100">
                {staffToDelete?.name}
              </strong>{" "}
              ({staffToDelete?.email})? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-4 sm:justify-center">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStaffToDelete(null)}
              className="h-9 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
              className="h-9 gap-1.5 text-xs font-medium"
            >
              <Trash2 className="size-3.5" />
              <span>Confirm Removal</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
