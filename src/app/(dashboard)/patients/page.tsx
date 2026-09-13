"use client";

import * as React from "react";
import { useState, useMemo } from "react";
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
} from "lucide-react";

export type PatientStatus = "active" | "inactive" | "new";

export interface PastVisit {
  id: string;
  date: string;
  doctor: string;
  department: string;
  notes: string;
}

export interface Prescription {
  id: string;
  medication: string;
  dosage: string;
  instructions: string;
  date: string;
  doctor: string;
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
}

const INITIAL_PATIENTS: Patient[] = [
  {
    id: "P-8821",
    name: "Eleanor Vance",
    phone: "+91 98765 43210",
    email: "eleanor@email.com",
    lastVisit: "2026-09-10",
    balance: 240,
    status: "active",
    age: 34,
    gender: "Female",
    clinics: ["Metro Health Dental", "Downtown Wellness Clinic"],
    nextAppointment: {
      date: "Sep 24, 2026",
      time: "10:30 AM",
      doctor: "Dr. Priya Desai",
      type: "Root Canal Follow-up",
      room: "Suite 3B",
    },
    tags: [
      { label: "Regular", color: "blue" },
      { label: "Follow-up needed", color: "amber" },
    ],
    visits: [
      {
        id: "V-101",
        date: "Sep 10, 2026",
        doctor: "Dr. Priya Desai",
        department: "Endodontics",
        notes:
          "Crown fitting completed smoothly. Mild sensitivity reported; prescribed desensitizing gel.",
      },
      {
        id: "V-102",
        date: "Aug 14, 2026",
        doctor: "Dr. Rohan Mehra",
        department: "General Dentistry",
        notes:
          "Routine checkup and cleaning. Identified early decay on tooth 14.",
      },
      {
        id: "V-103",
        date: "Jun 22, 2026",
        doctor: "Dr. Priya Desai",
        department: "Endodontics",
        notes: "Initial consultation and full mouth digital X-rays taken.",
      },
    ],
    prescriptions: [
      {
        id: "RX-201",
        medication: "Amoxicillin",
        dosage: "500mg",
        instructions: "Take 1 capsule 3 times daily for 5 days with meals",
        date: "Sep 10, 2026",
        doctor: "Dr. Priya Desai",
      },
      {
        id: "RX-202",
        medication: "Ibuprofen",
        dosage: "400mg",
        instructions: "Take 1 tablet every 6 hours as needed for discomfort",
        date: "Sep 10, 2026",
        doctor: "Dr. Priya Desai",
      },
    ],
    invoices: [
      {
        id: "INV-1",
        invoiceNumber: "INV-2026-089",
        date: "Sep 10, 2026",
        amount: 240,
        status: "Pending",
        description: "Porcelain Crown Fitting & Assessment",
      },
      {
        id: "INV-2",
        invoiceNumber: "INV-2026-042",
        date: "Aug 14, 2026",
        amount: 350,
        status: "Paid",
        description: "Endodontic Root Canal Therapy - Stage 1",
      },
    ],
  },
  {
    id: "P-9042",
    name: "Marcus Brody",
    phone: "+91 87654 32109",
    email: "marcus@email.com",
    lastVisit: "2026-09-08",
    balance: 0,
    status: "active",
    age: 48,
    gender: "Male",
    clinics: ["Downtown Wellness Clinic"],
    nextAppointment: {
      date: "Oct 02, 2026",
      time: "02:00 PM",
      doctor: "Dr. Rohan Mehra",
      type: "Cardiovascular Assessment",
      room: "Exam Room 1",
    },
    tags: [
      { label: "VIP", color: "teal" },
      { label: "Regular", color: "blue" },
    ],
    visits: [
      {
        id: "V-201",
        date: "Sep 08, 2026",
        doctor: "Dr. Rohan Mehra",
        department: "Internal Medicine",
        notes:
          "Blood pressure normal (120/80 mmHg). Lipid panel reviewed and stable.",
      },
      {
        id: "V-202",
        date: "Jun 11, 2026",
        doctor: "Dr. Anita Roy",
        department: "Cardiology",
        notes:
          "ECG performed with normal sinus rhythm. Continued current statin dosage.",
      },
      {
        id: "V-203",
        date: "Mar 15, 2026",
        doctor: "Dr. Rohan Mehra",
        department: "Internal Medicine",
        notes:
          "Quarterly review. Notable lifestyle improvements and glycemic control.",
      },
    ],
    prescriptions: [
      {
        id: "RX-301",
        medication: "Atorvastatin",
        dosage: "20mg",
        instructions: "Take 1 tablet once daily at bedtime",
        date: "Sep 08, 2026",
        doctor: "Dr. Rohan Mehra",
      },
      {
        id: "RX-302",
        medication: "Metformin",
        dosage: "500mg",
        instructions: "Take 1 tablet twice daily with meals",
        date: "Sep 08, 2026",
        doctor: "Dr. Rohan Mehra",
      },
    ],
    invoices: [
      {
        id: "INV-3",
        invoiceNumber: "INV-2026-074",
        date: "Sep 08, 2026",
        amount: 180,
        status: "Paid",
        description: "Comprehensive Metabolic Panel & Consultation",
      },
      {
        id: "INV-4",
        invoiceNumber: "INV-2026-031",
        date: "Jun 11, 2026",
        amount: 220,
        status: "Paid",
        description: "Standard 12-Lead ECG & Cardiology Review",
      },
    ],
  },
  {
    id: "P-7619",
    name: "Sarah Jenkins",
    phone: "+91 76543 21098",
    email: "sarah@email.com",
    lastVisit: "2026-09-05",
    balance: 120,
    status: "active",
    age: 29,
    gender: "Female",
    clinics: ["CareFirst Pediatrics & Family"],
    nextAppointment: {
      date: "Sep 28, 2026",
      time: "11:15 AM",
      doctor: "Dr. Anita Roy",
      type: "Dermatology Follow-up",
      room: "Suite 2A",
    },
    tags: [{ label: "Regular", color: "blue" }],
    visits: [
      {
        id: "V-301",
        date: "Sep 05, 2026",
        doctor: "Dr. Anita Roy",
        department: "Dermatology",
        notes:
          "Eczema flare-up on right forearm. Prescribed topical corticosteroid taper.",
      },
      {
        id: "V-302",
        date: "Jul 20, 2026",
        doctor: "Dr. Anita Roy",
        department: "Dermatology",
        notes:
          "Skin allergy prick test conducted. Mild sensitivity to seasonal pollens.",
      },
      {
        id: "V-303",
        date: "Apr 10, 2026",
        doctor: "Dr. Rohan Mehra",
        department: "General Practice",
        notes:
          "Annual preventive physical and routine preventative blood panel.",
      },
    ],
    prescriptions: [
      {
        id: "RX-401",
        medication: "Hydrocortisone Cream 2.5%",
        dosage: "30g tube",
        instructions: "Apply thin layer to affected area twice daily for 7 days",
        date: "Sep 05, 2026",
        doctor: "Dr. Anita Roy",
      },
      {
        id: "RX-402",
        medication: "Cetirizine HCl",
        dosage: "10mg",
        instructions: "Take 1 tablet once daily at bedtime",
        date: "Sep 05, 2026",
        doctor: "Dr. Anita Roy",
      },
    ],
    invoices: [
      {
        id: "INV-5",
        invoiceNumber: "INV-2026-092",
        date: "Sep 05, 2026",
        amount: 120,
        status: "Pending",
        description: "Dermatological Consultation & Topical Formulation",
      },
      {
        id: "INV-6",
        invoiceNumber: "INV-2026-055",
        date: "Jul 20, 2026",
        amount: 150,
        status: "Paid",
        description: "Skin Allergy Sensitivity Screening Panel",
      },
    ],
  },
  {
    id: "P-8104",
    name: "David Alvarez",
    phone: "+91 65432 10987",
    email: "david@email.com",
    lastVisit: "2026-08-28",
    balance: 0,
    status: "inactive",
    age: 52,
    gender: "Male",
    clinics: ["Metro Health Dental"],
    nextAppointment: null,
    tags: [{ label: "Follow-up needed", color: "amber" }],
    visits: [
      {
        id: "V-401",
        date: "Aug 28, 2026",
        doctor: "Dr. Priya Desai",
        department: "Periodontics",
        notes:
          "Periodontal maintenance completed. Patient reminded to reschedule 6-month recall.",
      },
      {
        id: "V-402",
        date: "Feb 14, 2026",
        doctor: "Dr. Priya Desai",
        department: "Periodontics",
        notes:
          "Deep scaling upper right quadrant. Healing uneventful without pockets.",
      },
      {
        id: "V-403",
        date: "Nov 09, 2025",
        doctor: "Dr. Rohan Mehra",
        department: "General Practice",
        notes: "General consultation regarding episodic TMJ joint discomfort.",
      },
    ],
    prescriptions: [
      {
        id: "RX-501",
        medication: "Chlorhexidine 0.12%",
        dosage: "300ml bottle",
        instructions: "Rinse with 15ml twice daily after brushing for 2 weeks",
        date: "Aug 28, 2026",
        doctor: "Dr. Priya Desai",
      },
      {
        id: "RX-502",
        medication: "Paracetamol",
        dosage: "650mg",
        instructions: "Take 1 tablet every 6-8 hours as needed for joint ache",
        date: "Aug 28, 2026",
        doctor: "Dr. Priya Desai",
      },
    ],
    invoices: [
      {
        id: "INV-7",
        invoiceNumber: "INV-2026-061",
        date: "Aug 28, 2026",
        amount: 210,
        status: "Paid",
        description: "Periodontal Therapy & Scaling Maintenance",
      },
      {
        id: "INV-8",
        invoiceNumber: "INV-2026-015",
        date: "Feb 14, 2026",
        amount: 190,
        status: "Paid",
        description: "Targeted Quadrant Root Planing",
      },
    ],
  },
  {
    id: "P-9230",
    name: "Amanda Hayes",
    phone: "+91 54321 09876",
    email: "amanda@email.com",
    lastVisit: "2026-09-12",
    balance: 340,
    status: "active",
    age: 41,
    gender: "Female",
    clinics: ["Downtown Wellness Clinic", "City Orthopedics"],
    nextAppointment: {
      date: "Sep 26, 2026",
      time: "03:30 PM",
      doctor: "Dr. Vikram Patel",
      type: "Physical Therapy Assessment",
      room: "Rehab Gym",
    },
    tags: [
      { label: "VIP", color: "teal" },
      { label: "Follow-up needed", color: "amber" },
    ],
    visits: [
      {
        id: "V-501",
        date: "Sep 12, 2026",
        doctor: "Dr. Vikram Patel",
        department: "Orthopedics",
        notes:
          "Post-op knee rehab session #4. Range of motion improved to 110 degrees.",
      },
      {
        id: "V-502",
        date: "Aug 29, 2026",
        doctor: "Dr. Vikram Patel",
        department: "Orthopedics",
        notes:
          "Rehab session #3. Quad isometric strengthening exercises progressed smoothly.",
      },
      {
        id: "V-503",
        date: "Aug 15, 2026",
        doctor: "Dr. Vikram Patel",
        department: "Orthopedics",
        notes:
          "Rehab session #2. Mild effusion managed with cold therapy and elevation.",
      },
    ],
    prescriptions: [
      {
        id: "RX-601",
        medication: "Celecoxib",
        dosage: "200mg",
        instructions:
          "Take 1 capsule once daily with food for anti-inflammatory relief",
        date: "Sep 12, 2026",
        doctor: "Dr. Vikram Patel",
      },
      {
        id: "RX-602",
        medication: "Glucosamine Sulfate",
        dosage: "1500mg",
        instructions: "Take 1 tablet daily with morning breakfast",
        date: "Sep 12, 2026",
        doctor: "Dr. Vikram Patel",
      },
    ],
    invoices: [
      {
        id: "INV-9",
        invoiceNumber: "INV-2026-098",
        date: "Sep 12, 2026",
        amount: 340,
        status: "Pending",
        description: "Advanced Orthopedic Rehabilitation Session",
      },
      {
        id: "INV-10",
        invoiceNumber: "INV-2026-081",
        date: "Aug 29, 2026",
        amount: 280,
        status: "Paid",
        description: "Physical Therapy Biomechanical Assessment",
      },
    ],
  },
  {
    id: "P-7801",
    name: "Robert Chen",
    phone: "+91 43210 98765",
    email: "robert@email.com",
    lastVisit: "2026-09-01",
    balance: 0,
    status: "active",
    age: 63,
    gender: "Male",
    clinics: ["Downtown Wellness Clinic"],
    nextAppointment: {
      date: "Oct 15, 2026",
      time: "09:00 AM",
      doctor: "Dr. Rohan Mehra",
      type: "Diabetic Health Screen",
      room: "Suite 1B",
    },
    tags: [{ label: "Regular", color: "blue" }],
    visits: [
      {
        id: "V-601",
        date: "Sep 01, 2026",
        doctor: "Dr. Rohan Mehra",
        department: "Endocrinology",
        notes:
          "HbA1c checked at 6.8%. Foot examination normal with intact sensation and pulses.",
      },
      {
        id: "V-602",
        date: "May 20, 2026",
        doctor: "Dr. Rohan Mehra",
        department: "Internal Medicine",
        notes:
          "Renal panel review. Microalbumin ratio stable and within expected limits.",
      },
      {
        id: "V-603",
        date: "Feb 18, 2026",
        doctor: "Dr. Anita Roy",
        department: "Preventative Care",
        notes:
          "Annual influenza immunization administered without any adverse response.",
      },
    ],
    prescriptions: [
      {
        id: "RX-701",
        medication: "Empagliflozin",
        dosage: "10mg",
        instructions:
          "Take 1 tablet once daily in the morning with or without food",
        date: "Sep 01, 2026",
        doctor: "Dr. Rohan Mehra",
      },
      {
        id: "RX-702",
        medication: "Lisinopril",
        dosage: "10mg",
        instructions: "Take 1 tablet once daily in the morning",
        date: "Sep 01, 2026",
        doctor: "Dr. Rohan Mehra",
      },
    ],
    invoices: [
      {
        id: "INV-11",
        invoiceNumber: "INV-2026-068",
        date: "Sep 01, 2026",
        amount: 160,
        status: "Paid",
        description: "Endocrine Specialist Consult & HbA1c Lab",
      },
      {
        id: "INV-12",
        invoiceNumber: "INV-2026-024",
        date: "May 20, 2026",
        amount: 140,
        status: "Paid",
        description: "Comprehensive Renal Profile Screening",
      },
    ],
  },
  {
    id: "P-8456",
    name: "Priya Sharma",
    phone: "+91 32109 87654",
    email: "priya@email.com",
    lastVisit: "2026-09-11",
    balance: 180,
    status: "new",
    age: 26,
    gender: "Female",
    clinics: ["Downtown Wellness Clinic"],
    nextAppointment: {
      date: "Sep 22, 2026",
      time: "04:00 PM",
      doctor: "Dr. Anita Roy",
      type: "New Patient Intake Part 2",
      room: "Suite 2B",
    },
    tags: [
      { label: "New Patient", color: "sky" },
      { label: "VIP", color: "teal" },
    ],
    visits: [
      {
        id: "V-701",
        date: "Sep 11, 2026",
        doctor: "Dr. Anita Roy",
        department: "General Practice",
        notes:
          "Initial consultation and medical history intake. Baseline blood tests ordered.",
      },
      {
        id: "V-702",
        date: "Aug 30, 2026",
        doctor: "Nurse triage",
        department: "Clinical Triage",
        notes:
          "Pre-registration health questionnaire and vaccine history record.",
      },
      {
        id: "V-703",
        date: "Aug 25, 2026",
        doctor: "Admin Desk",
        department: "Patient Intake",
        notes:
          "Account setup and insurance coverage policy confirmation.",
      },
    ],
    prescriptions: [
      {
        id: "RX-801",
        medication: "Vitamin D3 (Cholecalciferol)",
        dosage: "60,000 IU",
        instructions:
          "Take 1 capsule weekly after lunch for 8 consecutive weeks",
        date: "Sep 11, 2026",
        doctor: "Dr. Anita Roy",
      },
      {
        id: "RX-802",
        medication: "Iron Polysaccharide Complex",
        dosage: "150mg",
        instructions:
          "Take 1 capsule daily on an empty stomach with citrus juice",
        date: "Sep 11, 2026",
        doctor: "Dr. Anita Roy",
      },
    ],
    invoices: [
      {
        id: "INV-13",
        invoiceNumber: "INV-2026-103",
        date: "Sep 11, 2026",
        amount: 180,
        status: "Pending",
        description: "New Patient Extended Diagnostic Intake",
      },
      {
        id: "INV-14",
        invoiceNumber: "INV-2026-099",
        date: "Aug 30, 2026",
        amount: 50,
        status: "Paid",
        description: "Initial Administrative File Registration",
      },
    ],
  },
  {
    id: "P-9102",
    name: "James Wilson",
    phone: "+91 21098 76543",
    email: "james@email.com",
    lastVisit: "2026-07-15",
    balance: 450,
    status: "inactive",
    age: 58,
    gender: "Male",
    clinics: ["Metro Health Dental", "CareFirst Pediatrics & Family"],
    nextAppointment: null,
    tags: [{ label: "Follow-up needed", color: "amber" }],
    visits: [
      {
        id: "V-801",
        date: "Jul 15, 2026",
        doctor: "Dr. Priya Desai",
        department: "Prosthodontics",
        notes:
          "Bridge consultation. Discussion around 3-unit fixed bridge vs dental implant.",
      },
      {
        id: "V-802",
        date: "Apr 18, 2026",
        doctor: "Dr. Priya Desai",
        department: "General Dentistry",
        notes:
          "Routine prophy and exam. Moderate calculus accumulation.",
      },
      {
        id: "V-803",
        date: "Jan 10, 2026",
        doctor: "Dr. Rohan Mehra",
        department: "General Practice",
        notes: "General consultation for seasonal allergic rhinitis.",
      },
    ],
    prescriptions: [
      {
        id: "RX-901",
        medication: "Amoxicillin/Clavulanate",
        dosage: "875/125mg",
        instructions: "Take 1 tablet twice daily every 12 hours for 7 days",
        date: "Jul 15, 2026",
        doctor: "Dr. Priya Desai",
      },
      {
        id: "RX-902",
        medication: "Tramadol HCl",
        dosage: "50mg",
        instructions:
          "Take 1 tablet every 6 hours as needed for severe toothache",
        date: "Jul 15, 2026",
        doctor: "Dr. Priya Desai",
      },
    ],
    invoices: [
      {
        id: "INV-15",
        invoiceNumber: "INV-2026-052",
        date: "Jul 15, 2026",
        amount: 450,
        status: "Overdue",
        description: "Prosthodontic Evaluation & Cast Study Models",
      },
      {
        id: "INV-16",
        invoiceNumber: "INV-2026-019",
        date: "Apr 18, 2026",
        amount: 200,
        status: "Paid",
        description: "Comprehensive Dental Prophylaxis & Polishing",
      },
    ],
  },
];

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
  const [patients, setPatients] = useState<Patient[]>(INITIAL_PATIENTS);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // Add Patient Modal Form State
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newPatientName, setNewPatientName] = useState("");
  const [newPatientPhone, setNewPatientPhone] = useState("");
  const [newPatientEmail, setNewPatientEmail] = useState("");
  const [newPatientAge, setNewPatientAge] = useState("32");
  const [newPatientGender, setNewPatientGender] = useState<"Female" | "Male" | "Other">("Female");
  const [newPatientClinic, setNewPatientClinic] = useState("Downtown Wellness Clinic");
  const [newPatientStatus, setNewPatientStatus] = useState<PatientStatus>("new");

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

  function handleCreatePatient(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newPatientName.trim() || !newPatientPhone.trim() || !newPatientEmail.trim()) {
      return;
    }

    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const newId = `P-${randomNum}`;

    const created: Patient = {
      id: newId,
      name: newPatientName.trim(),
      phone: newPatientPhone.trim(),
      email: newPatientEmail.trim(),
      lastVisit: new Date().toISOString().slice(0, 10),
      balance: 0,
      status: newPatientStatus,
      age: parseInt(newPatientAge, 10) || 30,
      gender: newPatientGender,
      clinics: [newPatientClinic],
      nextAppointment: null,
      tags: [
        {
          label: newPatientStatus === "new" ? "New Patient" : "Regular",
          color: newPatientStatus === "new" ? "sky" : "blue",
        },
      ],
      visits: [
        {
          id: `V-${randomNum}-1`,
          date: formatDate(new Date().toISOString().slice(0, 10)),
          doctor: "Dr. Rohan Mehra",
          department: "General Medicine",
          notes: "Initial registration intake and general baseline health assessment.",
        },
      ],
      prescriptions: [],
      invoices: [
        {
          id: `INV-${randomNum}-1`,
          invoiceNumber: `INV-2026-${Math.floor(100 + Math.random() * 900)}`,
          date: formatDate(new Date().toISOString().slice(0, 10)),
          amount: 0,
          status: "Paid",
          description: "New Patient Registration & Record Setup",
        },
      ],
    };

    setPatients((prev) => [created, ...prev]);
    setSelectedPatient(created);
    setIsAddDialogOpen(false);

    // Reset inputs
    setNewPatientName("");
    setNewPatientPhone("");
    setNewPatientEmail("");
    setNewPatientAge("32");
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
              {filteredPatients.length} {filteredPatients.length === 1 ? "Patient" : "Patients"}
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

      {/* 2. Patient Table using shadcn Table */}
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
              {filteredPatients.length === 0 ? (
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
                        {patient.phone}
                      </TableCell>

                      {/* Email */}
                      <TableCell className="py-3 text-sm text-slate-600 dark:text-slate-400">
                        {patient.email}
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
                      <div className="flex flex-wrap gap-2">
                        {selectedPatient.tags.map((tag, idx) => (
                          <TagBadge key={idx} tag={tag} />
                        ))}
                      </div>
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

                    {selectedPatient.visits.map((visit) => (
                      <Card
                        key={visit.id}
                        className="border border-slate-200/80 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900"
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
                    ))}
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

                      {selectedPatient.invoices.map((inv) => (
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
                      ))}
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
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Add New Patient
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Register a new patient into your clinic CRM database.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreatePatient} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label
                htmlFor="patient-name"
                className="text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Full Name *
              </label>
              <Input
                id="patient-name"
                placeholder="e.g. Jessica Taylor"
                value={newPatientName}
                onChange={(e) => setNewPatientName(e.target.value)}
                required
                className="h-9 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="patient-phone"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Phone Number *
                </label>
                <Input
                  id="patient-phone"
                  placeholder="+91 98765 43210"
                  value={newPatientPhone}
                  onChange={(e) => setNewPatientPhone(e.target.value)}
                  required
                  className="h-9 text-sm font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="patient-email"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Email Address *
                </label>
                <Input
                  id="patient-email"
                  type="email"
                  placeholder="jessica@email.com"
                  value={newPatientEmail}
                  onChange={(e) => setNewPatientEmail(e.target.value)}
                  required
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="patient-age"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Age
                </label>
                <Input
                  id="patient-age"
                  type="number"
                  min="1"
                  max="120"
                  value={newPatientAge}
                  onChange={(e) => setNewPatientAge(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="patient-gender"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Gender
                </label>
                <select
                  id="patient-gender"
                  value={newPatientGender}
                  onChange={(e) =>
                    setNewPatientGender(e.target.value as "Female" | "Male" | "Other")
                  }
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-slate-900"
                >
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="patient-clinic"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Primary Linked Clinic
                </label>
                <select
                  id="patient-clinic"
                  value={newPatientClinic}
                  onChange={(e) => setNewPatientClinic(e.target.value)}
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-slate-900"
                >
                  <option value="Downtown Wellness Clinic">Downtown Wellness Clinic</option>
                  <option value="Metro Health Dental">Metro Health Dental</option>
                  <option value="CareFirst Pediatrics & Family">
                    CareFirst Pediatrics & Family
                  </option>
                  <option value="City Orthopedics">City Orthopedics</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="patient-status"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Initial Status
                </label>
                <select
                  id="patient-status"
                  value={newPatientStatus}
                  onChange={(e) =>
                    setNewPatientStatus(e.target.value as PatientStatus)
                  }
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-slate-900"
                >
                  <option value="new">New</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <DialogFooter className="pt-3 sm:justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs cursor-pointer"
              >
                Create Patient
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
