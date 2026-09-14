"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { fetchDashboardStats } from "@/lib/db/staff";
import { fetchAppointments } from "@/lib/db/appointments";
import { supabase } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  CalendarDays,
  Receipt,
  UserPlus,
  AlertTriangle,
  ArrowUpRight,
  Download,
  Plus,
  CreditCard,
  FileText,
  Clock,
  HeartPulse,
  Stethoscope,
  AlertCircle,
  Pill,
  Check,
} from "lucide-react";

type AppointmentStatus = "In Progress" | "Checked In" | "Scheduled" | "Confirmed";

interface PatientAppointment {
  id: string;
  time: string;
  room: string;
  patientName: string;
  mrn: string;
  age: number;
  gender: "Female" | "Male" | "Other";
  dob: string;
  phone: string;
  email: string;
  insurance: string;
  type: string;
  status: AppointmentStatus;
  vitals: {
    bp: string;
    hr: number;
    temp: string;
    spo2: number;
    bmi: number;
  };
  diagnoses: string[];
  medications: string[];
  allergies: string[];
  notes: string;
}

interface ActivityItem {
  id: string;
  iconType: "payment" | "patient" | "alert" | "prescription" | "schedule";
  title: string;
  subtitle: string;
  timestamp: string;
}



const INITIAL_ACTIVITIES: ActivityItem[] = [
  {
    id: "act-1",
    iconType: "payment",
    title: "Payment received from John Doe - $340.00",
    subtitle: "Invoice #INV-2041 processed via Stripe Card",
    timestamp: "10m ago",
  },
  {
    id: "act-2",
    iconType: "patient",
    title: "New patient registered: Jane Smith",
    subtitle: "Completed online intake & insurance verification",
    timestamp: "24m ago",
  },
  {
    id: "act-3",
    iconType: "alert",
    title: "Critical Lab alert: Marcus Brody (K+ 6.2 mEq/L)",
    subtitle: "Quest Diagnostics flagged elevated serum potassium",
    timestamp: "45m ago",
  },
  {
    id: "act-4",
    iconType: "prescription",
    title: "Prescription renewed for Sarah Connor",
    subtitle: "Lisinopril 10mg (90-day supply) e-sent to CVS #4210",
    timestamp: "1h ago",
  },
  {
    id: "act-5",
    iconType: "schedule",
    title: "Appointment rescheduled: David Kim to Sep 16",
    subtitle: "Moved from 11:30 AM today per patient portal request",
    timestamp: "2h ago",
  },
];

export default function DashboardPage() {
  const { staffProfile } = useAuth();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [loadingAppts, setLoadingAppts] = useState(true);
    const [selectedPatient, setSelectedPatient] = useState<PatientAppointment | null>(null);
  const [isAddPatientOpen, setIsAddPatientOpen] = useState(false);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [stats, setStats] = useState({
    todayAppointments: 0,
    pendingInvoices: 0,
    outstandingAmount: 0,
    newPatientsThisMonth: 0,
    staffCount: 0, severeAlerts: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadStats() {
      try {
        setStatsLoading(true);
        const data = await fetchDashboardStats();
        if (isMounted) {
          setStats(data);
        }
      } catch {
        // Catch errors silently (keep showing 0)
      } finally {
        if (isMounted) {
          setStatsLoading(false);
        }
      }
    }
    loadStats();
    return () => {
      isMounted = false;
    };
  }, []);

  // Form state for adding patient
  const [newPatientName, setNewPatientName] = useState("");
  const [newPatientDob, setNewPatientDob] = useState("");
  const [newPatientGender, setNewPatientGender] = useState<"Female" | "Male" | "Other">("Female");
  const [newPatientPhone, setNewPatientPhone] = useState("");
  const [newPatientType, setNewPatientType] = useState("General Consultation");
  const [newPatientInsurance, setNewPatientInsurance] = useState("");

  // Format today's date nicely (e.g. Saturday, September 13, 2026)
  const [formattedDate, setFormattedDate] = useState<string>("Saturday, September 13, 2026");

  useEffect(() => {
    const now = new Date();
    const formatted = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(now);
    setFormattedDate(formatted);
  }, []);

  // Compute greeting name from staff profile or default to 'Doctor'
  const rawStaffName = staffProfile?.name?.trim() || "Doctor";
  const doctorName = rawStaffName.replace(/^dr\.?\s+/i, "");

  // Auto-dismiss transient toast
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Handler to export schedule
  const handleExportSchedule = () => {
    const headers = ["Time", "Room", "Patient Name", "MRN", "Age", "Gender", "Visit Type", "Status"];
    const rows = appointments.map((apt) => [
      apt.time,
      apt.room,
      `"${apt.patientName}"`,
      apt.mrn,
      apt.age,
      apt.gender,
      `"${apt.type}"`,
      apt.status,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `clinic_schedule_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setToastMessage("Schedule successfully exported to CSV file.");
  };

  // Handler to add a new patient
  const handleAddPatientSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientName.trim()) return;

    const newApt: PatientAppointment = {
      id: `apt-${Date.now()}`,
      time: "02:15 PM",
      room: "Exam 3B",
      patientName: newPatientName.trim(),
      mrn: `MRN-${Math.floor(10000 + Math.random() * 90000)}`,
      age: 38,
      gender: newPatientGender,
      dob: newPatientDob || "05/12/1988",
      phone: newPatientPhone || "(555) 000-0000",
      email: `${newPatientName.toLowerCase().replace(/\s+/g, ".")}@example.com`,
      insurance: newPatientInsurance || "Self-Pay / Commercial",
      type: newPatientType,
      status: "Scheduled",
      vitals: {
        bp: "120/80",
        hr: 72,
        temp: "98.6°F",
        spo2: 99,
        bmi: 23.5,
      },
      diagnoses: ["New Patient Evaluation"],
      medications: ["None recorded"],
      allergies: ["None known"],
      notes: "Newly scheduled patient intake via quick registration.",
    };

    setAppointments((prev) => [...prev, newApt]);
    setIsAddPatientOpen(false);
    setNewPatientName("");
    setNewPatientDob("");
    setNewPatientPhone("");
    setNewPatientInsurance("");
    setToastMessage(`Patient ${newPatientName} registered and added to schedule.`);
  };

  const getStatusBadge = (status: AppointmentStatus) => {
    switch (status) {
      case "In Progress":
        return (
          <Badge
            variant="outline"
            className="border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300 font-medium text-xs px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5"
          >
            <span className="size-1.5 rounded-full bg-blue-600 animate-pulse" />
            In Progress
          </Badge>
        );
      case "Checked In":
        return (
          <Badge
            variant="outline"
            className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-medium text-xs px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5"
          >
            <span className="size-1.5 rounded-full bg-emerald-600" />
            Checked In
          </Badge>
        );
      case "Confirmed":
        return (
          <Badge
            variant="outline"
            className="border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 font-medium text-xs px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5"
          >
            <span className="size-1.5 rounded-full bg-cyan-600" />
            Confirmed
          </Badge>
        );
      case "Scheduled":
        return (
          <Badge
            variant="outline"
            className="border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 font-medium text-xs px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5"
          >
            <span className="size-1.5 rounded-full bg-slate-400" />
            Scheduled
          </Badge>
        );
    }
  };

  const getActivityIcon = (type: ActivityItem["iconType"]) => {
    switch (type) {
      case "payment":
        return (
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400">
            <CreditCard className="size-4" />
          </div>
        );
      case "patient":
        return (
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
            <UserPlus className="size-4" />
          </div>
        );
      case "alert":
        return (
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-950/70 dark:text-red-400">
            <AlertCircle className="size-4" />
          </div>
        );
      case "prescription":
        return (
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
            <Pill className="size-4" />
          </div>
        );
      case "schedule":
        return (
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
            <CalendarDays className="size-4" />
          </div>
        );
    }
  };

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
      {/* Transient alert toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg bg-foreground text-background px-4 py-2.5 text-sm font-medium shadow-lg animate-in fade-in slide-in-from-bottom-2">
          <Check className="size-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Good Morning, Dr. {doctorName}
          </h1>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <CalendarDays className="size-4 text-muted-foreground" />
            <span>{formattedDate}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 self-start sm:self-auto">
          <Button
            variant="outline"
            onClick={handleExportSchedule}
            className="gap-2 h-9 text-xs sm:text-sm font-medium"
          >
            <Download className="size-4" />
            Export Schedule
          </Button>
          <Button
            onClick={() => setIsAddPatientOpen(true)}
            className="gap-2 h-9 text-xs sm:text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="size-4" />
            Add Patient
          </Button>
        </div>
      </div>

      {/* 2. 4 Stat Cards in Responsive Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Stat 1: Today's Appointments */}
        <Card className="shadow-xs border border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Today&apos;s Appointments
            </CardTitle>
            <div className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <CalendarDays className="size-4.5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold tracking-tight">
              {statsLoading ? <Skeleton className="h-8 w-16" /> : stats.todayAppointments}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              3 completed, 9 remaining
            </p>
          </CardContent>
        </Card>

        {/* Stat 2: Pending Invoices */}
        <Card className="shadow-xs border border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Invoices
            </CardTitle>
            <div className="flex size-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
              <Receipt className="size-4.5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold tracking-tight">
              {statsLoading ? <Skeleton className="h-8 w-16" /> : stats.pendingInvoices}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-semibold text-foreground">
                {statsLoading ? "..." : "₹" + stats.outstandingAmount.toLocaleString("en-IN")}
              </span>{" "}
              outstanding
            </p>
          </CardContent>
        </Card>

        {/* Stat 3: New Patients This Month */}
        <Card className="shadow-xs border border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              New Patients This Month
            </CardTitle>
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <UserPlus className="size-4.5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold tracking-tight">
              {statsLoading ? <Skeleton className="h-8 w-16" /> : stats.newPatientsThisMonth}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-medium text-emerald-600 dark:text-emerald-400">+18%</span> vs last month
            </p>
          </CardContent>
        </Card>

        {/* Stat 4: Severe Alerts (Red Card) */}
        <Card
          onClick={() => setIsAlertModalOpen(true)}
          className="cursor-pointer shadow-xs border-red-200 bg-red-50/90 text-red-950 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100 hover:bg-red-100/80 transition-colors"
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-red-900 dark:text-red-200">
              Severe Alerts
            </CardTitle>
            <div className="flex size-9 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-900/60 dark:text-red-300">
              <AlertTriangle className="size-4.5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-red-950 dark:text-red-100">
              {statsLoading ? <Skeleton className="h-8 w-16" /> : stats.severeAlerts}
            </div>
            <p className="text-xs font-medium text-red-700 dark:text-red-300 mt-1 flex items-center gap-1">
              <span>Requires attention</span>
              <ArrowUpRight className="size-3" />
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 3. Two Columns: Left (col-span-3) and Right (col-span-2) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left (col-span-3): Upcoming Appointments Card with Table */}
        <Card className="lg:col-span-3 shadow-xs border border-border flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base sm:text-lg font-semibold tracking-tight">
                Upcoming Appointments
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Today&apos;s active clinic schedule and check-in status
              </CardDescription>
            </div>
            <Link
              href="/calendar"
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400"
            >
              View Full Calendar
              <ArrowUpRight className="size-3.5" />
            </Link>
          </CardHeader>

          <CardContent className="p-0 flex-1">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b bg-muted/30">
                    <TableHead className="w-[110px] text-xs font-semibold text-muted-foreground py-3 pl-4">
                      Time
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground py-3">
                      Patient
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground py-3 hidden sm:table-cell">
                      Type
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground py-3">
                      Status
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground py-3 pr-4 text-right">
                      Action
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appointments.slice(0, 5).map((apt) => (
                    <TableRow
                      key={apt.id}
                      className="hover:bg-muted/40 transition-colors border-b last:border-0"
                    >
                      {/* Time & Room */}
                      <TableCell className="py-3 pl-4 align-middle">
                        <div className="font-semibold text-xs text-foreground flex items-center gap-1">
                          <Clock className="size-3 text-muted-foreground" />
                          <span>{apt.time}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground pl-4">
                          {apt.room}
                        </div>
                      </TableCell>

                      {/* Patient Details */}
                      <TableCell className="py-3 align-middle">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="size-7 ring-1 ring-border shrink-0">
                            <AvatarFallback className="text-[11px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                              {apt.patientName
                                .split(" ")
                                .map((n: string) => n[0])
                                .join("")}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="font-medium text-xs text-foreground truncate">
                              {apt.patientName}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {apt.mrn} • {apt.age}y {apt.gender === "Female" ? "F" : "M"}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      {/* Appointment Type */}
                      <TableCell className="py-3 align-middle hidden sm:table-cell">
                        <div className="text-xs text-foreground font-medium">
                          {apt.type}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {apt.insurance.split(" ")[0]}
                        </div>
                      </TableCell>

                      {/* Status Badge */}
                      <TableCell className="py-3 align-middle">
                        {getStatusBadge(apt.status)}
                      </TableCell>

                      {/* Action: Open Chart */}
                      <TableCell className="py-3 pr-4 align-middle text-right">
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => setSelectedPatient(apt)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200 dark:border-blue-900 dark:text-blue-400 dark:hover:bg-blue-950/60"
                        >
                          Open Chart
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Right (col-span-2): Recent Activity Card */}
        <Card className="lg:col-span-2 shadow-xs border border-border flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base sm:text-lg font-semibold tracking-tight">
                Recent Activity
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Live updates across billing, patients, and clinical alerts
              </CardDescription>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <span className="size-2 rounded-full bg-emerald-500 animate-ping" />
              Live
            </div>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col justify-between pt-0 pb-4">
            <div className="divide-y divide-border">
              {activities.map((item) => (
                <div
                  key={item.id}
                  className="py-3 first:pt-1 last:pb-1 flex items-start gap-3 transition-colors hover:bg-muted/30 -mx-2 px-2 rounded-lg"
                >
                  {getActivityIcon(item.iconType)}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground leading-snug">
                      {item.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {item.subtitle}
                    </p>
                  </div>
                  <div className="text-[11px] font-medium text-muted-foreground shrink-0 self-start mt-0.5">
                    {item.timestamp}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
              <Link
                href="/settings"
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400"
              >
                View audit log
                <ArrowUpRight className="size-3.5" />
              </Link>
              <span className="text-[11px] text-muted-foreground">
                Showing last 5 events
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Patient Chart Modal (Athenahealth style clinical view) */}
      <Dialog
        open={Boolean(selectedPatient)}
        onOpenChange={(open) => {
          if (!open) setSelectedPatient(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedPatient && (
            <>
              <DialogHeader className="border-b pb-3">
                <div className="flex items-center justify-between pr-6">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-10 ring-1 ring-border">
                      <AvatarFallback className="bg-blue-100 text-blue-700 font-bold text-sm">
                        {selectedPatient.patientName
                          .split(" ")
                          .map((n: string) => n[0])
                          .join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                        <span>{selectedPatient.patientName}</span>
                        {getStatusBadge(selectedPatient.status)}
                      </DialogTitle>
                      <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                        {selectedPatient.mrn} • DOB: {selectedPatient.dob} ({selectedPatient.age}y {selectedPatient.gender})
                      </DialogDescription>
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 py-2 text-xs">
                {/* Demographics Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-muted/40 rounded-lg border text-muted-foreground">
                  <div>
                    <span className="font-semibold text-foreground">Phone:</span> {selectedPatient.phone}
                  </div>
                  <div>
                    <span className="font-semibold text-foreground">Insurance:</span> {selectedPatient.insurance}
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <span className="font-semibold text-foreground">Assigned Room:</span> {selectedPatient.room}
                  </div>
                </div>

                {/* Vitals Strip */}
                <div>
                  <h4 className="font-semibold text-foreground mb-1.5 flex items-center gap-1.5 text-xs">
                    <HeartPulse className="size-3.5 text-red-500" />
                    Current Vitals (Recorded Today)
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <div className="border rounded-md p-2 bg-card text-center">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">BP</div>
                      <div className="text-sm font-bold text-foreground mt-0.5">{selectedPatient.vitals.bp}</div>
                      <div className="text-[10px] text-muted-foreground">mmHg</div>
                    </div>
                    <div className="border rounded-md p-2 bg-card text-center">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Heart Rate</div>
                      <div className="text-sm font-bold text-foreground mt-0.5">{selectedPatient.vitals.hr}</div>
                      <div className="text-[10px] text-muted-foreground">bpm</div>
                    </div>
                    <div className="border rounded-md p-2 bg-card text-center">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Temp</div>
                      <div className="text-sm font-bold text-foreground mt-0.5">{selectedPatient.vitals.temp}</div>
                      <div className="text-[10px] text-muted-foreground">Oral</div>
                    </div>
                    <div className="border rounded-md p-2 bg-card text-center">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">SpO2</div>
                      <div className="text-sm font-bold text-foreground mt-0.5">{selectedPatient.vitals.spo2}%</div>
                      <div className="text-[10px] text-muted-foreground">Room Air</div>
                    </div>
                    <div className="border rounded-md p-2 bg-card text-center col-span-2 sm:col-span-1">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">BMI</div>
                      <div className="text-sm font-bold text-foreground mt-0.5">{selectedPatient.vitals.bmi}</div>
                      <div className="text-[10px] text-muted-foreground">kg/m²</div>
                    </div>
                  </div>
                </div>

                {/* Allergies and Diagnoses */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="border rounded-lg p-3 bg-red-50/40 dark:bg-red-950/20 border-red-200 dark:border-red-900/40">
                    <h4 className="font-semibold text-red-900 dark:text-red-300 mb-1.5 flex items-center gap-1.5">
                      <AlertCircle className="size-3.5 text-red-500" />
                      Allergies & Contraindications
                    </h4>
                    <ul className="list-disc list-inside space-y-1 text-red-800 dark:text-red-200">
                      {selectedPatient.allergies.map((allergy, i) => (
                        <li key={i}>{allergy}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="border rounded-lg p-3 bg-card">
                    <h4 className="font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                      <Stethoscope className="size-3.5 text-blue-500" />
                      Active Problem List
                    </h4>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      {selectedPatient.diagnoses.map((diag, i) => (
                        <li key={i}>{diag}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Active Medications */}
                <div className="border rounded-lg p-3 bg-card">
                  <h4 className="font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                    <Pill className="size-3.5 text-purple-500" />
                    Active Medications
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedPatient.medications.map((med, i) => (
                      <Badge key={i} variant="secondary" className="font-normal text-xs">
                        {med}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Visit Notes */}
                <div className="border rounded-lg p-3 bg-card">
                  <h4 className="font-semibold text-foreground mb-1 flex items-center gap-1.5">
                    <FileText className="size-3.5 text-teal-500" />
                    Encounter Notes & Reason for Visit
                  </h4>
                  <p className="text-muted-foreground leading-relaxed">
                    {selectedPatient.notes}
                  </p>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0 mt-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setToastMessage(`Clinical encounter opened for ${selectedPatient.patientName}`);
                    setSelectedPatient(null);
                  }}
                  className="mr-auto"
                >
                  <FileText className="size-3.5 mr-1.5" />
                  Sign Clinical Note
                </Button>
                <DialogClose render={<Button variant="outline" size="sm" />}>
                  Close Chart
                </DialogClose>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Severe Alert Details Modal */}
      <Dialog open={isAlertModalOpen} onOpenChange={setIsAlertModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="size-5" />
              <DialogTitle className="text-base font-semibold text-red-950 dark:text-red-100">
                Critical Clinical Alert
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Action required within 1 hour per clinic safety protocol
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-900 dark:bg-red-950/40 dark:border-red-900 dark:text-red-200">
              <div className="font-bold text-sm">Marcus Brody (MRN-10874)</div>
              <div className="mt-1">
                <strong>Lab Result:</strong> Serum Potassium (K+) = 6.2 mEq/L (Critical High, Ref: 3.5 - 5.0 mEq/L)
              </div>
              <div className="mt-1 text-[11px] text-red-700 dark:text-red-300">
                Reported by Quest Diagnostics at 01:15 AM.
              </div>
            </div>

            <div className="rounded-lg border p-3 space-y-1.5 bg-card">
              <div className="font-semibold text-foreground">Recommended Protocol:</div>
              <ul className="list-disc list-inside text-muted-foreground space-y-1 text-xs">
                <li>Immediate phone contact with patient or emergency contact</li>
                <li>Urgent 12-lead ECG to evaluate peaked T-waves</li>
                <li>Hold ACE inhibitors / ARBs and potassium supplements</li>
                <li>Order urgent repeat stat basic metabolic panel</li>
              </ul>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsAlertModalOpen(false);
                setToastMessage("Marcus Brody's emergency contact notified via automated dispatch.");
              }}
            >
              Acknowledge & Notify
            </Button>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Dismiss
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Patient Modal */}
      <Dialog open={isAddPatientOpen} onOpenChange={setIsAddPatientOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-blue-600">
              <UserPlus className="size-5" />
              <DialogTitle className="text-base font-semibold text-foreground">
                Register New Patient
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Enter patient details to register and queue into today&apos;s schedule.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddPatientSubmit} className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <label className="font-medium text-foreground">Full Name *</label>
              <Input
                placeholder="e.g. Samuel Green"
                value={newPatientName}
                onChange={(e) => setNewPatientName(e.target.value)}
                required
                className="h-8 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="font-medium text-foreground">Date of Birth</label>
                <Input
                  placeholder="MM/DD/YYYY"
                  value={newPatientDob}
                  onChange={(e) => setNewPatientDob(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="font-medium text-foreground">Gender</label>
                <select
                  value={newPatientGender}
                  onChange={(e) => setNewPatientGender(e.target.value as "Female" | "Male" | "Other")}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="Female" className="bg-popover text-popover-foreground">Female</option>
                  <option value="Male" className="bg-popover text-popover-foreground">Male</option>
                  <option value="Other" className="bg-popover text-popover-foreground">Other</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="font-medium text-foreground">Phone Number</label>
                <Input
                  placeholder="(555) 000-0000"
                  value={newPatientPhone}
                  onChange={(e) => setNewPatientPhone(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="font-medium text-foreground">Visit Reason</label>
                <select
                  value={newPatientType}
                  onChange={(e) => setNewPatientType(e.target.value)}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="General Consultation" className="bg-popover text-popover-foreground">General Consultation</option>
                  <option value="Annual Physical" className="bg-popover text-popover-foreground">Annual Physical</option>
                  <option value="Follow-up Visit" className="bg-popover text-popover-foreground">Follow-up Visit</option>
                  <option value="Lab Review" className="bg-popover text-popover-foreground">Lab Review</option>
                  <option value="Urgent Care" className="bg-popover text-popover-foreground">Urgent Care</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Insurance Provider</label>
              <Input
                placeholder="e.g. BlueCross PPO, Medicare, Self-Pay"
                value={newPatientInsurance}
                onChange={(e) => setNewPatientInsurance(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <DialogClose render={<Button type="button" variant="outline" size="sm" />}>
                Cancel
              </DialogClose>
              <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                Register & Queue
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
