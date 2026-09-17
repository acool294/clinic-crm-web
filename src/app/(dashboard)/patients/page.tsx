"use client";
import { supabase } from "@/lib/supabase";
import { createAppointment } from "@/lib/db/appointments";

import * as React from "react";
import { useState, useMemo, useEffect, useCallback } from "react";
import { fetchPatients, createPatient, updatePatient, type PatientRow } from "@/lib/db/patients";
import { Skeleton } from "@/components/ui/skeleton";
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
import { formatId } from "@/lib/utils";
import { INSURANCE_PROVIDERS_INDIA } from "@/lib/constants/insurance";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Search,
  Plus,
  Phone,
  Mail,
  Calendar,
  User,
  Clock,
  Pill,
  FileText,
  Building2,
  CheckCircle2,
  AlertCircle,
  X,
  Heart,
  Thermometer,
  Activity,
  Weight,
  Ruler,
  Printer,
  ChevronDown,
} from "lucide-react";

export type PatientStatus = "active" | "inactive" | "new";

export interface VitalSigns {
  bp: string;       // e.g. '120/80 mmHg'
  hr: string;       // e.g. '72 bpm'
  temp: string;     // e.g. '98.6°F'
  spo2: string;     // e.g. '99%'
  weight: string;   // e.g. '70 kg'
  height: string;   // e.g. '170 cm'
}

export interface LabResult {
  test: string;
  result: string;
  status: "normal" | "abnormal" | "pending";
}

export interface Prescription {
  id: string;
  medication: string;
  dosage: string;
  instructions: string;
  date: string;
  doctor: string;
}

export interface PastVisit {
  id: string;
  date: string;
  doctor: string;
  department: string;
  notes: string;
  // NEW detailed fields:
  chiefComplaint: string;
  diagnosis: string;
  vitals: VitalSigns;
  treatmentPlan: string;
  prescriptions: Prescription[];  // reuse existing Prescription interface
  labResults: LabResult[];
  followUpDate: string | null;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  date: string;
  amount: number;
  status: "Paid" | "Pending" | "Overdue";
  description: string;
}

export interface NextAppointment {
  date: string;
  time: string;
  doctor: string;
  type: string;
  room?: string;
}

export interface PatientTag {
  label: "Regular" | "VIP" | "Follow-up needed" | "New Patient";
  color: "blue" | "teal" | "amber" | "sky";
}

export interface Patient {
  id: string;
  name: string;
  phone: string;
  email: string;
  lastVisit: string;
  balance: number;
  status: PatientStatus;
  age: number;
  gender: "Female" | "Male" | "Other";
  clinics: string[];
  nextAppointment: NextAppointment | null;
  tags: PatientTag[];
  visits: PastVisit[];
  prescriptions: Prescription[];
  invoices: Invoice[];
  dob?: string;
  address?: string;
  bloodGroup?: string;
  alternatePhone?: string;
  insuranceProvider?: string;
  isInsured?: boolean;
}


function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "N/A";
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    if (!year || !month || !day) return dateStr;
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function calculateAge(dob: string): number {
  if (!dob) return 0;
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : 0;
}

function mapRowToPatient(r: PatientRow): Patient {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone ?? "",
    email: r.email ?? "",
    lastVisit: r.created_at ? r.created_at.split("T")[0] : "",
    balance: 0,
    status: "active" as const,
    age: r.dob ? calculateAge(r.dob) : 0,
    gender: (r.gender ?? "Other") as "Male" | "Female" | "Other",
    clinics: [],
    nextAppointment: null,
    tags: [],
    visits: [],
    prescriptions: [],
    invoices: [],
    dob: r.dob ?? undefined,
    address: r.address ?? undefined,
    bloodGroup: r.blood_group ?? undefined,
    alternatePhone: r.alternate_phone ?? undefined,
    insuranceProvider: r.insurance_provider ?? undefined,
    isInsured: r.is_insured,
  };
}

function PatientStatusBadge({ status }: { status: PatientStatus }) {
  switch (status) {
    case "active":
      return (
        <Badge
          variant="outline"
          className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-400 gap-1.5 font-medium px-2 py-0.5"
        >
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Active
        </Badge>
      );
    case "inactive":
      return (
        <Badge
          variant="outline"
          className="border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 gap-1.5 font-medium px-2 py-0.5"
        >
          <span className="size-1.5 rounded-full bg-slate-400" />
          Inactive
        </Badge>
      );
    case "new":
      return (
        <Badge
          variant="outline"
          className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-400 gap-1.5 font-medium px-2 py-0.5"
        >
          <span className="size-1.5 rounded-full bg-blue-500" />
          New
        </Badge>
      );
  }
}

function InvoiceStatusBadge({ status }: { status: "Paid" | "Pending" | "Overdue" }) {
  switch (status) {
    case "Paid":
      return (
        <Badge
          variant="outline"
          className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300 text-[11px] font-medium"
        >
          Paid
        </Badge>
      );
    case "Pending":
      return (
        <Badge
          variant="outline"
          className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300 text-[11px] font-medium"
        >
          Pending
        </Badge>
      );
    case "Overdue":
      return (
        <Badge
          variant="outline"
          className="border-red-200 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300 text-[11px] font-medium"
        >
          Overdue
        </Badge>
      );
  }
}

function TagBadge({ tag }: { tag: PatientTag }) {
  const colorStyles: Record<PatientTag["color"], string> = {
    blue: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-300",
    teal: "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-300",
    amber:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300",
    sky: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-300",
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium text-xs px-2.5 py-0.5 rounded-full shadow-2xs",
        colorStyles[tag.color]
      )}
    >
      {tag.label}
    </Badge>
  );
}

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedVisit, setSelectedVisit] = useState<PastVisit | null>(null);

  // Add Patient Modal Form State
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newPatient, setNewPatient] = useState({
    name: "",
    dob: "",
    gender: "",
    phone: "",
    address: "",
    bloodGroup: "",
    alternatePhone: "",
    insuranceProvider: "",
    isInsured: false,
    email: "",
  });
  const [scheduleAppointment, setScheduleAppointment] = useState(false);
  const [appointmentDetails, setAppointmentDetails] = useState({
    date: '', time: '09:00', duration: 30, type: 'Consultation' as 'Consultation' | 'Follow-up' | 'Lab Review', doctorId: ''
  });
  const [doctorsList, setDoctorsList] = useState<any[]>([]);
  const [showAdditionalInfo, setShowAdditionalInfo] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadPatientsData = useCallback(async () => {
    supabase.from('staff_users').select('id, name').eq('role', 'doctor').then(({data}) => {
       if (data) setDoctorsList(data);
    });
    try {
      setIsLoading(true);
      setLoadError(null);
      const rows = await fetchPatients();
      setPatients(rows.map(mapRowToPatient));
    } catch {
      setLoadError("Failed to load patients.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPatientsData();
  }, [loadPatientsData]);

  // Filtered patients based on search
  const filteredPatients = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return patients;
    return patients.filter((patient) => {
      return (
        patient.name.toLowerCase().includes(q) ||
        patient.id.toLowerCase().includes(q) ||
        patient.email.toLowerCase().includes(q) ||
        patient.phone.toLowerCase().includes(q)
      );
    });
  }, [patients, searchQuery]);

  async function handleCreatePatient(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (
      !newPatient.name.trim() ||
      !newPatient.dob ||
      !newPatient.gender ||
      !newPatient.phone.trim() ||
      !newPatient.address.trim()
    ) {
      setFormError("Please fill all required fields.");
      return;
    }

    setIsCreating(true);
    setFormError(null);
    try {
      await createPatient({
        name: newPatient.name.trim(),
        phone: newPatient.phone.trim(),
        email: newPatient.email.trim() || null,
        dob: newPatient.dob,
        gender: newPatient.gender as "Male" | "Female" | "Other",
        address: newPatient.address.trim(),
        blood_group: newPatient.bloodGroup || null,
        alternate_phone: newPatient.alternatePhone.trim() || null,
        insurance_provider: newPatient.isInsured
          ? newPatient.insuranceProvider || null
          : null,
        is_insured: newPatient.isInsured,
      });

      // Reload patients list
      const rows = await fetchPatients();
      setPatients(rows.map(mapRowToPatient));
      setIsAddDialogOpen(false);
      setNewPatient({
        name: "",
        dob: "",
        gender: "",
        phone: "",
        address: "",
        bloodGroup: "",
        alternatePhone: "",
        insuranceProvider: "",
        isInsured: false,
        email: "",
      });
      setShowAdditionalInfo(false);
    } catch {
      setFormError("Failed to create patient. Please try again.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="w-full min-h-screen bg-slate-50/50 p-6 space-y-6 dark:bg-slate-950">
      {/* 1. Header: 'Patients' title, search Input on the right, and blue '+ Add Patient' Button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Patients
            </h1>
            <Badge
              variant="secondary"
              className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-semibold text-xs"
            >
              {patients.length} {patients.length === 1 ? "Patient" : "Patients"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            View, search, and manage your clinic’s patient registry and clinical charts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by name, ID, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9 pr-8 text-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="h-3.5 w-3.5" />
                <span className="sr-only">Clear search</span>
              </button>
            )}
          </div>

          {/* Blue + Add Patient Button */}
          <Button
            onClick={() => setIsAddDialogOpen(true)}
            className="h-9 gap-1.5 bg-blue-600 font-medium text-white hover:bg-blue-700 shadow-sm transition-colors cursor-pointer shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Add Patient</span>
          </Button>
        </div>
      </div>

      {/* Error Alert Banner */}
      {loadError && (
        <div className="flex items-center justify-between gap-3 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/40 dark:border-red-800 dark:text-red-400 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{loadError}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadPatientsData()}
            className="border-red-200 hover:bg-red-100 text-red-700 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/50 text-xs h-8 cursor-pointer"
          >
            Retry
          </Button>
        </div>
      )}

      {/* 2. Patient Table / Empty State Card */}
      {!isLoading && !loadError && patients.length === 0 ? (
        <Card className="border border-slate-200/90 bg-white shadow-xs p-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col items-center justify-center gap-3 max-w-md mx-auto">
            <div className="p-3 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400">
              <User className="size-8" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              No patients yet
            </h3>
            <p className="text-sm text-muted-foreground">
              No patients yet. Add your first patient using the button above.
            </p>
            <Button
              onClick={() => setIsAddDialogOpen(true)}
              className="mt-2 h-9 gap-1.5 bg-blue-600 font-medium text-white hover:bg-blue-700 shadow-sm cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Add Patient</span>
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="border border-slate-200/90 bg-white shadow-xs overflow-hidden dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/80 dark:bg-slate-800/40">
                <TableRow className="border-b border-slate-200 dark:border-slate-800">
                  <TableHead className="w-[300px] text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 py-3.5 pl-6">
                    Patient
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 py-3.5">
                    Phone
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 py-3.5">
                    Email
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 py-3.5">
                    Last Visit
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 py-3.5">
                    Outstanding Balance
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 py-3.5 pr-6 text-right">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <TableRow
                      key={`skeleton-${idx}`}
                      className="border-b border-slate-100 dark:border-slate-800/60"
                    >
                      <TableCell className="py-3 pl-6">
                        <div className="flex items-center gap-3">
                          <Skeleton className="size-9 rounded-full shrink-0" />
                          <div className="space-y-1.5 flex-1">
                            <Skeleton className="h-4 w-28" />
                            <Skeleton className="h-3 w-16" />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell className="py-3">
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell className="py-3">
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                      <TableCell className="py-3">
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                      <TableCell className="py-3 pr-6 text-right">
                        <div className="flex justify-end">
                          <Skeleton className="h-5 w-16 rounded-full" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : loadError ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-44 text-center text-slate-500 dark:text-slate-400"
                    >
                      <div className="flex flex-col items-center justify-center gap-2">
                        <AlertCircle className="size-8 text-red-500" />
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          {loadError}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => loadPatientsData()}
                          className="mt-2 text-xs"
                        >
                          Retry
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredPatients.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-44 text-center text-slate-500 dark:text-slate-400"
                    >
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="p-3 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400">
                          <Search className="size-6" />
                        </div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          No patients matching &ldquo;{searchQuery}&rdquo;
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Try searching with another name, email address, or patient ID.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSearchQuery("")}
                          className="mt-2 text-xs"
                        >
                          Clear Search
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPatients.map((patient) => {
                    const isSelected = selectedPatient?.id === patient.id;
                    return (
                      <TableRow
                        key={patient.id}
                        onClick={() => setSelectedPatient(patient)}
                        className={cn(
                          "cursor-pointer border-b border-slate-100 transition-colors dark:border-slate-800/60",
                          isSelected
                            ? "bg-blue-50/70 hover:bg-blue-50 dark:bg-blue-950/40 dark:hover:bg-blue-950/60"
                            : "hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                        )}
                      >
                        {/* Patient (Avatar + Name + ID) */}
                        <TableCell className="py-3 pl-6">
                          <div className="flex items-center gap-3">
                            <Avatar className="size-9 ring-1 ring-slate-200 dark:ring-slate-700">
                              <AvatarFallback className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-semibold text-xs">
                                {getInitials(patient.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col min-w-0">
                              <span className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                                {patient.name}
                              </span>
                              <span className="font-mono text-xs text-muted-foreground">
                                {patient.id}
                              </span>
                            </div>
                          </div>
                        </TableCell>

                        {/* Phone */}
                        <TableCell className="py-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                          {patient.phone || "—"}
                        </TableCell>

                        {/* Email */}
                        <TableCell className="py-3 text-sm text-slate-600 dark:text-slate-400">
                          {patient.email || "—"}
                        </TableCell>

                        {/* Last Visit */}
                        <TableCell className="py-3 text-sm text-slate-700 dark:text-slate-300">
                          {formatDate(patient.lastVisit)}
                        </TableCell>

                        {/* Outstanding Balance */}
                        <TableCell className="py-3 text-sm">
                          {patient.balance > 0 ? (
                            <span className="font-semibold text-rose-600 dark:text-rose-400">
                              {formatCurrency(patient.balance)}
                            </span>
                          ) : (
                            <span className="text-slate-500 dark:text-slate-400">
                              {formatCurrency(0)}
                            </span>
                          )}
                        </TableCell>

                        {/* Status Badge */}
                        <TableCell className="py-3 pr-6 text-right">
                          <PatientStatusBadge status={patient.status} />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* 3. Patient Detail Sheet (shadcn Sheet, opening from right, ~500px wide) */}
      <Sheet
        open={Boolean(selectedPatient)}
        onOpenChange={(open) => {
          if (!open) setSelectedPatient(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-[500px] h-full p-0 flex flex-col gap-0 overflow-hidden bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl"
        >
          {selectedPatient && (
            <>
              {/* Screen reader title/desc for accessibility */}
              <SheetHeader className="sr-only">
                <SheetTitle>Patient Details: {selectedPatient.name}</SheetTitle>
                <SheetDescription>
                  Profile, clinical visits, prescriptions, and billing info for {selectedPatient.name}
                </SheetDescription>
              </SheetHeader>

              {/* Sheet Visual Header: Avatar (large, with initials), name, age, gender */}
              <div className="p-6 pb-5 bg-gradient-to-b from-slate-50/80 to-white dark:from-slate-900 dark:to-slate-900/90 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-start gap-4">
                  <Avatar className="size-16 shrink-0 border-2 border-white shadow-md ring-2 ring-blue-100 dark:ring-blue-950 dark:border-slate-800">
                    <AvatarFallback className="bg-blue-600 text-white font-bold text-xl">
                      {getInitials(selectedPatient.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                        {selectedPatient.name}
                      </h2>
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {selectedPatient.id}
                      </span>
                      <PatientStatusBadge status={selectedPatient.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedPatient.age} years old • {selectedPatient.gender}
                    </p>
                  </div>
                </div>

                {/* Contact info: phone, email */}
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <a
                    href={`tel:${selectedPatient.phone}`}
                    className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-white p-2 text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Phone className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span className="font-mono text-xs truncate">{selectedPatient.phone}</span>
                  </a>
                  <a
                    href={`mailto:${selectedPatient.email}`}
                    className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-white p-2 text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Mail className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                    <span className="truncate">{selectedPatient.email}</span>
                  </a>
                </div>
              </div>

              {/* Tabs Component with 4 tabs: Overview, Visits, Prescriptions, Billing */}
              <div className="flex-1 overflow-y-auto p-6 pt-4">
                <Tabs defaultValue="overview" className="w-full">
                  <TabsList className="grid grid-cols-4 w-full h-9 bg-slate-100 dark:bg-slate-800 p-1 mb-6 rounded-lg">
                    <TabsTrigger
                      value="overview"
                      className="text-xs font-semibold py-1 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900"
                    >
                      Overview
                    </TabsTrigger>
                    <TabsTrigger
                      value="visits"
                      className="text-xs font-semibold py-1 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900"
                    >
                      Visits
                    </TabsTrigger>
                    <TabsTrigger
                      value="prescriptions"
                      className="text-xs font-semibold py-1 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900"
                    >
                      Rx
                    </TabsTrigger>
                    <TabsTrigger
                      value="billing"
                      className="text-xs font-semibold py-1 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900"
                    >
                      Billing
                    </TabsTrigger>
                  </TabsList>

                  {/* 1. Overview Tab Content */}
                  <TabsContent value="overview" className="space-y-6 focus-visible:outline-none">
                    {/* Linked Clinics section with clinic name badges */}
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="size-4 text-teal-600 dark:text-teal-400" />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Linked Clinics
                        </h3>
                      </div>
                      {selectedPatient.clinics.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No linked clinics</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {selectedPatient.clinics.map((clinic) => (
                            <Badge
                              key={clinic}
                              variant="secondary"
                              className="border border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-300 px-3 py-1 text-xs font-medium"
                            >
                              {clinic}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <Separator className="bg-slate-100 dark:bg-slate-800" />

                    {/* Next Appointment card (date, doctor, type) */}
                    <div className="space-y-2.5">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Next Appointment
                      </h3>
                      {selectedPatient.nextAppointment ? (
                        <Card className="border border-slate-200 bg-gradient-to-br from-blue-50/40 via-white to-slate-50/40 shadow-xs dark:border-slate-800 dark:from-slate-900 dark:to-slate-900/60">
                          <CardHeader className="pb-2 pt-4 px-4">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                                <Calendar className="size-4 text-blue-600 dark:text-blue-400" />
                                {selectedPatient.nextAppointment.type}
                              </CardTitle>
                              {selectedPatient.nextAppointment.room && (
                                <Badge
                                  variant="outline"
                                  className="text-[11px] font-normal border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-400"
                                >
                                  {selectedPatient.nextAppointment.room}
                                </Badge>
                              )}
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-2 text-xs pb-4 px-4">
                            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                              <Clock className="size-3.5 text-slate-400 shrink-0" />
                              <span className="font-semibold">
                                {selectedPatient.nextAppointment.date}
                              </span>
                              <span className="text-slate-400">•</span>
                              <span>{selectedPatient.nextAppointment.time}</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                              <User className="size-3.5 text-slate-400 shrink-0" />
                              <span>Attending: {selectedPatient.nextAppointment.doctor}</span>
                            </div>
                          </CardContent>
                        </Card>
                      ) : (
                        <Card className="border-dashed border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/40">
                          <CardContent className="py-6 flex flex-col items-center justify-center text-center">
                            <div className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 mb-2">
                              <Calendar className="size-5" />
                            </div>
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                              No upcoming appointment scheduled
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              This patient does not currently have any future bookings.
                            </p>
                          </CardContent>
                        </Card>
                      )}
                    </div>

                    <Separator className="bg-slate-100 dark:bg-slate-800" />

                    {/* Tags section with colored badge tags (Regular, VIP, Follow-up needed) */}
                    <div className="space-y-2.5">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Tags & Classification
                      </h3>
                      {selectedPatient.tags.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No tags assigned</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {selectedPatient.tags.map((tag, idx) => (
                            <TagBadge key={idx} tag={tag} />
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  {/* 2. Visits Tab Content: Simple list of 3 past visits (date, doctor, notes summary) */}
                  <TabsContent value="visits" className="space-y-3.5 focus-visible:outline-none">
                    <div className="flex items-center justify-between pb-1">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Visit History ({selectedPatient.visits.length})
                      </h3>
                      <span className="text-xs text-muted-foreground">Most recent first</span>
                    </div>

                    {selectedPatient.visits.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-muted-foreground">
                        No visit history recorded yet.
                      </div>
                    ) : (
                      selectedPatient.visits.map((visit) => (
                        <Card
                          key={visit.id}
                          onClick={() => setSelectedVisit(visit)}
                          className="border border-slate-200/80 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
                        >
                          <CardContent className="p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 font-semibold text-xs text-slate-900 dark:text-slate-100">
                                <Calendar className="size-3.5 text-blue-600 dark:text-blue-400" />
                                <span>{visit.date}</span>
                              </div>
                              <Badge
                                variant="outline"
                                className="text-[10px] font-medium border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-400"
                              >
                                {visit.department}
                              </Badge>
                            </div>

                            <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                              <User className="size-3.5 text-slate-400" />
                              <span>Physician: <strong className="text-slate-800 dark:text-slate-200">{visit.doctor}</strong></span>
                            </div>

                            <div className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-700 border border-slate-100 dark:bg-slate-800/60 dark:border-slate-800 dark:text-slate-300 leading-relaxed">
                              <span className="font-semibold text-slate-900 dark:text-slate-100 block mb-0.5">
                                Clinical Summary:
                              </span>
                              {visit.notes}
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </TabsContent>

                  {/* 3. Prescriptions Tab Content: List of 2 prescriptions (medication, dosage, date) */}
                  <TabsContent value="prescriptions" className="space-y-3.5 focus-visible:outline-none">
                    <div className="flex items-center justify-between pb-1">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Active Prescriptions ({selectedPatient.prescriptions.length})
                      </h3>
                      <Badge
                        variant="secondary"
                        className="text-[10px] bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800"
                      >
                        Verified
                      </Badge>
                    </div>

                    {selectedPatient.prescriptions.length === 0 ? (
                      <Card className="border-dashed border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/40">
                        <CardContent className="py-6 text-center text-xs text-muted-foreground">
                          No active prescriptions recorded for this patient.
                        </CardContent>
                      </Card>
                    ) : (
                      selectedPatient.prescriptions.map((rx) => (
                        <Card
                          key={rx.id}
                          className="border border-slate-200/80 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900"
                        >
                          <CardContent className="p-4 space-y-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <div className="p-2 rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                                  <Pill className="size-4" />
                                </div>
                                <div>
                                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                    {rx.medication}
                                  </h4>
                                  <span className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                                    {rx.dosage}
                                  </span>
                                </div>
                              </div>
                              <Badge
                                variant="outline"
                                className="text-[10px] border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                              >
                                Active
                              </Badge>
                            </div>

                            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1 pl-1">
                              <p>
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  Directions:
                                </span>{" "}
                                {rx.instructions}
                              </p>
                              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
                                <span>Prescriber: {rx.doctor}</span>
                                <span className="flex items-center gap-1">
                                  <Calendar className="size-3" />
                                  {rx.date}
                                </span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </TabsContent>

                  {/* 4. Billing Tab Content: List of 2 invoices (invoice #, amount, status badge) */}
                  <TabsContent value="billing" className="space-y-4 focus-visible:outline-none">
                    {/* Summary Balance Card */}
                    <Card
                      className={cn(
                        "border shadow-xs",
                        selectedPatient.balance > 0
                          ? "border-rose-200 bg-rose-50/50 dark:border-rose-900/50 dark:bg-rose-950/30"
                          : "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/30"
                      )}
                    >
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                            Total Outstanding Balance
                          </p>
                          <p
                            className={cn(
                              "text-2xl font-bold mt-1",
                              selectedPatient.balance > 0
                                ? "text-rose-700 dark:text-rose-400"
                                : "text-emerald-700 dark:text-emerald-400"
                            )}
                          >
                            {formatCurrency(selectedPatient.balance)}
                          </p>
                        </div>
                        {selectedPatient.balance > 0 ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                              <AlertCircle className="size-3.5" />
                              Payment Due
                            </span>
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-rose-600 hover:bg-rose-700 text-white font-medium cursor-pointer"
                            >
                              Collect Now
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-white/80 dark:bg-slate-900/80 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 className="size-4" />
                            Account Settled
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Invoice items */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Invoices ({selectedPatient.invoices.length})
                        </h3>
                        <span className="text-xs text-muted-foreground">All time</span>
                      </div>

                      {selectedPatient.invoices.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-muted-foreground">
                          No invoices recorded yet.
                        </div>
                      ) : (
                        selectedPatient.invoices.map((inv) => (
                          <Card
                            key={inv.id}
                            className="border border-slate-200/80 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900"
                          >
                            <CardContent className="p-4 space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                                  <FileText className="size-3.5 text-blue-600 dark:text-blue-400" />
                                  {inv.invoiceNumber}
                                </div>
                                <InvoiceStatusBadge status={inv.status} />
                              </div>

                              <p className="text-xs text-slate-700 dark:text-slate-300">
                                {inv.description}
                              </p>

                              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                                <span className="text-slate-400 text-[11px]">{inv.date}</span>
                                <span className="font-bold text-slate-900 dark:text-slate-100">
                                  {formatCurrency(inv.amount)}
                                </span>
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

              {/* Sheet Bottom Footer Actions */}
              <div className="p-4 border-t border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/60 flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedPatient(null)}
                  className="text-xs h-8"
                >
                  Close Chart
                </Button>
                <Button
                  size="sm"
                  className="text-xs h-8 bg-blue-600 hover:bg-blue-700 text-white font-medium cursor-pointer"
                >
                  Edit Patient Profile
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Add Patient Dialog Modal */}
      <Dialog
        open={isAddDialogOpen}
        onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          if (!open) {
            setFormError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col p-6">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Register New Patient
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Register a new patient into your clinic CRM database. Mandatory fields are marked with an asterisk (*).
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleCreatePatient}
            className="space-y-4 py-2 overflow-y-auto max-h-[80vh] pr-1"
          >
            {formError && (
              <div className="flex items-center gap-2 p-3 text-xs font-medium text-red-600 bg-red-50 dark:bg-red-950/40 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800">
                <AlertCircle className="size-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Mandatory Fields Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 1. Full Name */}
              <div className="sm:col-span-2 space-y-1.5">
                <label
                  htmlFor="patient-name"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Full Name <span className="text-red-500">*</span>
                </label>
                <Input
                  id="patient-name"
                  placeholder="e.g. Jessica Taylor"
                  value={newPatient.name}
                  onChange={(e) => {
                    setNewPatient((prev) => ({ ...prev, name: e.target.value }));
                    if (formError) setFormError(null);
                  }}
                  className="h-9 text-sm"
                />
              </div>

              {/* 2. Date of Birth */}
              <div className="space-y-1.5">
                <label
                  htmlFor="patient-dob"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Date of Birth <span className="text-red-500">*</span>
                </label>
                <Input
                  id="patient-dob"
                  type="date"
                  value={newPatient.dob}
                  onChange={(e) => {
                    setNewPatient((prev) => ({ ...prev, dob: e.target.value }));
                    if (formError) setFormError(null);
                  }}
                  className="h-9 text-sm"
                />
                {newPatient.dob && (
                  <p className="text-xs text-muted-foreground">
                    Age: {calculateAge(newPatient.dob)} years
                  </p>
                )}
              </div>

              {/* 3. Gender */}
              <div className="space-y-1.5">
                <label
                  htmlFor="patient-gender"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Gender <span className="text-red-500">*</span>
                </label>
                <select
                  id="patient-gender"
                  value={newPatient.gender}
                  onChange={(e) => {
                    setNewPatient((prev) => ({ ...prev, gender: e.target.value }));
                    if (formError) setFormError(null);
                  }}
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-slate-900"
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* 4. Phone Number */}
              <div className="sm:col-span-2 space-y-1.5">
                <label
                  htmlFor="patient-phone"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <Input
                  id="patient-phone"
                  placeholder="+91 XXXXX XXXXX"
                  value={newPatient.phone}
                  onChange={(e) => {
                    setNewPatient((prev) => ({ ...prev, phone: e.target.value }));
                    if (formError) setFormError(null);
                  }}
                  className="h-9 text-sm font-mono"
                />
              </div>

              {/* 5. Address */}
              <div className="sm:col-span-2 space-y-1.5">
                <label
                  htmlFor="patient-address"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Address <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="patient-address"
                  rows={2}
                  placeholder="Street address, City, State, PIN..."
                  value={newPatient.address}
                  onChange={(e) => {
                    setNewPatient((prev) => ({ ...prev, address: e.target.value }));
                    if (formError) setFormError(null);
                  }}
                  className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none dark:bg-input/30"
                />
              </div>
            </div>

            {/* Optional Fields Collapsible Section */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAdditionalInfo((prev) => !prev)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg"
              >
                <span className="flex items-center gap-1.5">
                  <span>Additional Information</span>
                  <span className="text-[11px] font-normal text-muted-foreground">(Optional)</span>
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 text-slate-500 transition-transform duration-200",
                    showAdditionalInfo && "rotate-180"
                  )}
                />
              </Button>

              {showAdditionalInfo && (
                <div className="mt-3 space-y-4 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* 6. Blood Group */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="patient-blood-group"
                        className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Blood Group
                      </label>
                      <select
                        id="patient-blood-group"
                        value={newPatient.bloodGroup}
                        onChange={(e) =>
                          setNewPatient((prev) => ({
                            ...prev,
                            bloodGroup: e.target.value,
                          }))
                        }
                        className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-slate-900"
                      >
                        <option value="">Select Blood Group</option>
                        <option value="A+">A+</option>
                        <option value="A-">A-</option>
                        <option value="B+">B+</option>
                        <option value="B-">B-</option>
                        <option value="AB+">AB+</option>
                        <option value="AB-">AB-</option>
                        <option value="O+">O+</option>
                        <option value="O-">O-</option>
                      </select>
                    </div>

                    {/* 7. Alternate Number */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="patient-alternate-phone"
                        className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Alternate Number
                      </label>
                      <Input
                        id="patient-alternate-phone"
                        placeholder="+91 XXXXX XXXXX"
                        value={newPatient.alternatePhone}
                        onChange={(e) =>
                          setNewPatient((prev) => ({
                            ...prev,
                            alternatePhone: e.target.value,
                          }))
                        }
                        className="h-9 text-sm font-mono"
                      />
                    </div>

                    {/* 10. Email */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="patient-email"
                        className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Email Address
                      </label>
                      <Input
                        id="patient-email"
                        type="email"
                        placeholder="jessica@email.com"
                        value={newPatient.email}
                        onChange={(e) =>
                          setNewPatient((prev) => ({
                            ...prev,
                            email: e.target.value,
                          }))
                        }
                        className="h-9 text-sm"
                      />
                    </div>

                    {/* 9. Insured - Toggle/Switch or Radio: Yes / No */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Insured
                      </label>
                      <div className="flex items-center gap-4 h-9">
                        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
                          <input
                            type="radio"
                            name="isInsured"
                            value="no"
                            checked={!newPatient.isInsured}
                            onChange={() =>
                              setNewPatient((prev) => ({
                                ...prev,
                                isInsured: false,
                                insuranceProvider: "",
                              }))
                            }
                            className="size-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                          />
                          <span>No</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
                          <input
                            type="radio"
                            name="isInsured"
                            value="yes"
                            checked={newPatient.isInsured}
                            onChange={() =>
                              setNewPatient((prev) => ({
                                ...prev,
                                isInsured: true,
                              }))
                            }
                            className="size-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                          />
                          <span>Yes</span>
                        </label>
                      </div>
                    </div>

                    {/* 8. Insurance Provider (If Yes, show insurance provider dropdown) */}
                    {newPatient.isInsured && (
                      <div className="sm:col-span-2 space-y-1.5">
                        <label
                          htmlFor="patient-insurance-provider"
                          className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                        >
                          Insurance Provider
                        </label>
                        <select
                          id="patient-insurance-provider"
                          value={newPatient.insuranceProvider}
                          onChange={(e) =>
                            setNewPatient((prev) => ({
                              ...prev,
                              insuranceProvider: e.target.value,
                            }))
                          }
                          className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-slate-900"
                        >
                          <option value="">Select Insurance Provider</option>
                          {[
                            "Star Health",
                            "HDFC ERGO",
                            "Niva Bupa",
                            "ICICI Lombard",
                            "United India",
                            "New India Assurance",
                            "Bajaj Allianz",
                            "ManipalCigna",
                            "Aditya Birla Health",
                            "Other",
                            "None",
                          ].map((provider) => (
                            <option key={provider} value={provider}>
                              {provider}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="pt-3 sm:justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isCreating}
                onClick={() => setIsAddDialogOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isCreating}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs cursor-pointer"
              >
                {isCreating ? "Creating..." : "Create Patient"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Visit Detail Dialog */}
      <Dialog open={!!selectedVisit} onOpenChange={() => setSelectedVisit(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedVisit && (
            <div className="space-y-6">
              {/* Header: Visit date, doctor name, department badge, "Print" outline button (window.print()) */}
              <DialogHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-800">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <DialogTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Calendar className="size-4 text-blue-600 dark:text-blue-400" />
                      <span>{selectedVisit.date}</span>
                    </DialogTitle>
                    <Badge
                      variant="outline"
                      className="text-xs font-semibold border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/50 dark:text-blue-300"
                    >
                      {selectedVisit.department}
                    </Badge>
                  </div>
                  <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                    <User className="size-3.5 text-slate-400" />
                    <span>
                      Attending Physician:{" "}
                      <strong className="text-slate-800 dark:text-slate-200 font-semibold">
                        {selectedVisit.doctor}
                      </strong>
                    </span>
                    {selectedPatient && (
                      <>
                        <span className="text-slate-300 dark:text-slate-600">•</span>
                        <span>
                          Patient:{" "}
                          <strong className="text-slate-800 dark:text-slate-200 font-semibold">
                            {selectedPatient.name} ({selectedPatient.id})
                          </strong>
                        </span>
                      </>
                    )}
                  </DialogDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.print();
                    }
                  }}
                  className="text-xs font-medium gap-1.5 self-start sm:self-auto cursor-pointer"
                >
                  <Printer className="size-3.5" />
                  Print
                </Button>
              </DialogHeader>

              {/* Section 1 - Chief Complaint: Text paragraph */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Chief Complaint
                </h4>
                <p className="text-sm text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-lg border border-slate-100 dark:border-slate-800 leading-relaxed">
                  {selectedVisit.chiefComplaint}
                </p>
              </div>

              {/* Section 2 - Vitals Strip: 6 cards in a grid (BP, HR, Temp, SpO2, Weight, Height) */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Vital Signs
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                  <Card className="border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 shadow-2xs">
                    <div className="flex items-center gap-1.5 mb-1 text-slate-500 dark:text-slate-400">
                      <Activity className="size-3.5 text-blue-600 dark:text-blue-400" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider">BP</span>
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {selectedVisit.vitals.bp}
                    </div>
                  </Card>

                  <Card className="border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 shadow-2xs">
                    <div className="flex items-center gap-1.5 mb-1 text-slate-500 dark:text-slate-400">
                      <Heart className="size-3.5 text-rose-600 dark:text-rose-400" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider">HR</span>
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {selectedVisit.vitals.hr}
                    </div>
                  </Card>

                  <Card className="border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 shadow-2xs">
                    <div className="flex items-center gap-1.5 mb-1 text-slate-500 dark:text-slate-400">
                      <Thermometer className="size-3.5 text-amber-600 dark:text-amber-400" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider">Temp</span>
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {selectedVisit.vitals.temp}
                    </div>
                  </Card>

                  <Card className="border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 shadow-2xs">
                    <div className="flex items-center gap-1.5 mb-1 text-slate-500 dark:text-slate-400">
                      <Activity className="size-3.5 text-teal-600 dark:text-teal-400" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider">SpO2</span>
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {selectedVisit.vitals.spo2}
                    </div>
                  </Card>

                  <Card className="border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 shadow-2xs">
                    <div className="flex items-center gap-1.5 mb-1 text-slate-500 dark:text-slate-400">
                      <Weight className="size-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider">Weight</span>
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {selectedVisit.vitals.weight}
                    </div>
                  </Card>

                  <Card className="border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 shadow-2xs">
                    <div className="flex items-center gap-1.5 mb-1 text-slate-500 dark:text-slate-400">
                      <Ruler className="size-3.5 text-cyan-600 dark:text-cyan-400" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider">Height</span>
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {selectedVisit.vitals.height}
                    </div>
                  </Card>
                </div>
              </div>

              {/* Section 3 - Diagnosis: Text with a label */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Diagnosis
                </h4>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-lg border border-slate-100 dark:border-slate-800 leading-relaxed">
                  {selectedVisit.diagnosis}
                </p>
              </div>

              {/* Section 4 - Treatment Plan: Text with a label */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Treatment Plan
                </h4>
                <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-lg border border-slate-100 dark:border-slate-800 leading-relaxed">
                  {selectedVisit.treatmentPlan}
                </p>
              </div>

              {/* Section 5 - Prescriptions: Small table with columns: Medication, Dosage, Instructions, Prescribed by */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Pill className="size-3.5 text-teal-600 dark:text-teal-400" />
                    Prescriptions
                  </h4>
                  <span className="text-xs text-muted-foreground">
                    {selectedVisit.prescriptions.length} item{selectedVisit.prescriptions.length === 1 ? "" : "s"}
                  </span>
                </div>
                {selectedVisit.prescriptions.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-4 text-center text-xs text-muted-foreground">
                    No prescriptions recorded for this encounter.
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-slate-50 dark:bg-slate-800/60">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 h-8">
                            Medication
                          </TableHead>
                          <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 h-8">
                            Dosage
                          </TableHead>
                          <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 h-8">
                            Instructions
                          </TableHead>
                          <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 h-8">
                            Prescribed by
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedVisit.prescriptions.map((rx) => (
                          <TableRow key={rx.id} className="text-xs">
                            <TableCell className="font-semibold text-slate-900 dark:text-slate-100 py-2.5">
                              {rx.medication}
                            </TableCell>
                            <TableCell className="text-teal-700 dark:text-teal-400 font-medium py-2.5">
                              {rx.dosage}
                            </TableCell>
                            <TableCell className="text-slate-600 dark:text-slate-400 py-2.5">
                              {rx.instructions}
                            </TableCell>
                            <TableCell className="text-slate-700 dark:text-slate-300 py-2.5">
                              {rx.doctor}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* Section 6 - Lab Results: Table with columns: Test, Result, Status (badge: green for normal, red for abnormal, gray for pending) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <FileText className="size-3.5 text-blue-600 dark:text-blue-400" />
                    Lab Results
                  </h4>
                  <span className="text-xs text-muted-foreground">
                    {selectedVisit.labResults.length} result{selectedVisit.labResults.length === 1 ? "" : "s"}
                  </span>
                </div>
                {selectedVisit.labResults.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-4 text-center text-xs text-muted-foreground">
                    No lab results recorded for this encounter.
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-slate-50 dark:bg-slate-800/60">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 h-8">
                            Test
                          </TableHead>
                          <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 h-8">
                            Result
                          </TableHead>
                          <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 h-8 text-right">
                            Status
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedVisit.labResults.map((lab, idx) => (
                          <TableRow key={idx} className="text-xs">
                            <TableCell className="font-semibold text-slate-900 dark:text-slate-100 py-2.5">
                              {lab.test}
                            </TableCell>
                            <TableCell className="text-slate-600 dark:text-slate-400 py-2.5">
                              {lab.result}
                            </TableCell>
                            <TableCell className="text-right py-2.5">
                              {lab.status === "normal" && (
                                <Badge
                                  variant="outline"
                                  className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-400 text-[10px] font-medium capitalize"
                                >
                                  Normal
                                </Badge>
                              )}
                              {lab.status === "abnormal" && (
                                <Badge
                                  variant="outline"
                                  className="border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-400 text-[10px] font-medium capitalize"
                                >
                                  Abnormal
                                </Badge>
                              )}
                              {lab.status === "pending" && (
                                <Badge
                                  variant="outline"
                                  className="border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 text-[10px] font-medium capitalize"
                                >
                                  Pending
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* Section 7 - Follow-up: Date or 'No follow-up scheduled' */}
              <div className="flex items-center justify-between p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 text-xs">
                <div className="flex items-center gap-2">
                  <Calendar className="size-4 text-blue-600 dark:text-blue-400" />
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Follow-up:
                  </span>
                  <span className="text-slate-900 dark:text-slate-100 font-medium">
                    {selectedVisit.followUpDate ? selectedVisit.followUpDate : "No follow-up scheduled"}
                  </span>
                </div>
                {selectedVisit.followUpDate && (
                  <Badge
                    variant="outline"
                    className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 text-[10px]"
                  >
                    Scheduled
                  </Badge>
                )}
              </div>

              {/* Footer: 'Close' button */}
              <DialogFooter className="pt-3 border-t border-slate-100 dark:border-slate-800 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedVisit(null)}
                  className="text-xs font-medium cursor-pointer"
                >
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
