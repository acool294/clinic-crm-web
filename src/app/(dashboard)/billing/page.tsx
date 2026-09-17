"use client";
import { fetchPatients } from "@/lib/db/patients";

import * as React from "react";
import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import {
  fetchInvoices,
  createInvoice,
  recordPayment,
  type InvoiceWithPatient,
} from "@/lib/db/invoices";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { PatientCombobox } from "@/components/PatientCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  AlertCircle,
  Search,
  Plus,
  Receipt,
  Eye,
  CreditCard,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  X,
  Printer,
  Calendar,
  User,
  Wallet,
  Building2,
  Percent,
  IndianRupee,
  RotateCcw,
} from "lucide-react";

export type InvoiceStatus = "paid" | "pending" | "partial";
export type FilterTab = "all" | "pending" | "partial" | "paid";

export interface Invoice {
  id: string;
  patient: string;
  date: string;
  service?: string;
  subtotal: number; // original amount before discount
  discount_percent: number; // e.g. 10 for 10%
  discount_amount: number; // computed: subtotal * discount_percent / 100
  amount: number; // final amount = subtotal - discount_amount
  paid: number;
  status: InvoiceStatus;
  method: string;
  notes?: string;
}

function formatCurrency(amount: number, fractionDigits = 0): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits > 0 ? fractionDigits : 2,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "N/A";
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    if (!year || !month || !day) return dateStr;
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  switch (status) {
    case "paid":
      return (
        <Badge
          variant="outline"
          className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300 gap-1.5 font-medium px-2.5 py-0.5"
        >
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Paid
        </Badge>
      );
    case "pending":
      return (
        <Badge
          variant="outline"
          className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300 gap-1.5 font-medium px-2.5 py-0.5"
        >
          <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
          Pending
        </Badge>
      );
    case "partial":
      return (
        <Badge
          variant="outline"
          className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-300 gap-1.5 font-medium px-2.5 py-0.5"
        >
          <span className="size-1.5 rounded-full bg-blue-500" />
          Partial
        </Badge>
      );
  }
}

export default function BillingPage() {
  const { staffProfile } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [patientsList, setPatientsList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Record Payment Sheet state
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Card");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [isPaymentSaving, setIsPaymentSaving] = useState(false);

  // View Invoice Modal state
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  // Create Invoice Modal state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [patientIdInput, setPatientIdInput] = useState("");
  const [newSubtotal, setNewSubtotal] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [isCreateSaving, setIsCreateSaving] = useState(false);

  // Discount options inside Create Invoice Dialog
  const [applyDiscount, setApplyDiscount] = useState(false);
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [createError, setCreateError] = useState("");

  // Success Notification banner state
  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    loadInvoices();
    fetchPatients().then(setPatientsList).catch(() => {});
  }, []);

  async function loadInvoices() {
    try {
      setIsLoading(true);
      setLoadError(null);
      const rows: InvoiceWithPatient[] = await fetchInvoices();
      const mapped: Invoice[] = rows.map((r) => ({
        id: r.id,
        patient: r.patient_name,
        date: r.created_at.split("T")[0],
        service: r.notes ?? undefined,
        subtotal: r.subtotal ?? r.amount,
        discount_percent: r.discount_percent ?? 0,
        discount_amount: r.discount_amount ?? 0,
        amount: r.amount,
        paid: r.paid ?? 0,
        status: r.status,
        method: "",
        notes: r.notes ?? "",
      }));
      setInvoices(mapped);
    } catch {
      setLoadError("Failed to load invoices.");
    } finally {
      setIsLoading(false);
    }
  }

  // Live calculation for Create Invoice dialog
  const parsedSubtotal = parseFloat(newSubtotal) || 0;
  let computedDiscountAmount = 0;
  let computedDiscountPercent = 0;

  if (applyDiscount && parsedSubtotal > 0) {
    const rawVal = parseFloat(discountValue) || 0;
    if (discountType === "percentage") {
      const clampedPercent = Math.min(100, Math.max(0, rawVal));
      computedDiscountPercent = clampedPercent;
      computedDiscountAmount = Math.round(((parsedSubtotal * clampedPercent) / 100) * 100) / 100;
    } else {
      const clampedFixed = Math.min(parsedSubtotal, Math.max(0, rawVal));
      computedDiscountAmount = clampedFixed;
      computedDiscountPercent =
        parsedSubtotal > 0
          ? Math.round(((clampedFixed / parsedSubtotal) * 100) * 10) / 10
          : 0;
    }
  }

  const computedTotal = Math.max(0, parsedSubtotal - computedDiscountAmount);

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // Tab filter
      if (filterTab !== "all" && inv.status !== filterTab) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesId = inv.id.toLowerCase().includes(q);
        const matchesPatient = inv.patient.toLowerCase().includes(q);
        const matchesService = inv.service?.toLowerCase().includes(q);
        return matchesId || matchesPatient || Boolean(matchesService);
      }
      return true;
    });
  }, [invoices, filterTab, searchQuery]);

  // Counts for tabs
  const tabCounts = useMemo(() => {
    return {
      all: invoices.length,
      pending: invoices.filter((i) => i.status === "pending").length,
      partial: invoices.filter((i) => i.status === "partial").length,
      paid: invoices.filter((i) => i.status === "paid").length,
    };
  }, [invoices]);

  // Summary card stats
  const summaryStats = useMemo(() => {
    const totalRevenue = invoices.reduce((sum, inv) => sum + inv.amount, 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + inv.paid, 0);
    const totalOutstanding = invoices.reduce(
      (sum, inv) => sum + Math.max(0, inv.amount - inv.paid),
      0
    );
    const overdueCount = invoices.filter(
      (inv) => inv.status === "pending" || inv.status === "partial"
    ).length;
    return {
      totalRevenue,
      totalPaid,
      totalOutstanding,
      overdueCount,
    };
  }, [invoices]);

  // Handle open Record Payment Sheet
  const handleOpenRecordPayment = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    const remaining = invoice.amount - invoice.paid;
    setPaymentAmount(remaining > 0 ? remaining.toString() : "");
    setPaymentMethod(invoice.method || "Card");
    setPaymentNote("");
    setPaymentError("");
    setPaymentSheetOpen(true);
  };

  // Handle submit Record Payment
  async function handleRecordPaymentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedInvoice || !paymentAmount) return;

    const parsedAmount = parseFloat(paymentAmount);
    const remaining = selectedInvoice.amount - selectedInvoice.paid;

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setPaymentError("Please enter a valid payment amount greater than ₹0.");
      return;
    }

    if (parsedAmount > remaining) {
      setPaymentError(`Payment cannot exceed remaining balance of ${formatCurrency(remaining)}.`);
      return;
    }

    setIsPaymentSaving(true);
    setPaymentError("");

    try {
      await recordPayment({
        invoice_id: selectedInvoice.id,
        amount: parsedAmount,
        method: paymentMethod,
        staff_id: staffProfile?.id ?? "",
      });
      await loadInvoices(); // Refresh list
      setPaymentSheetOpen(false);
      setSelectedInvoice(null);
      setNotification(
        `Payment of ${formatCurrency(parsedAmount)} recorded successfully for ${selectedInvoice.patient}.`
      );
      setTimeout(() => {
        setNotification(null);
      }, 4500);
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : "Failed to record payment.");
    } finally {
      setIsPaymentSaving(false);
    }
  }

  // Handle View Invoice
  const handleViewInvoice = (invoice: Invoice) => {
    setViewInvoice(invoice);
    setIsViewDialogOpen(true);
  };

  // Reset Create Invoice form
  const resetCreateForm = () => {
    setPatientIdInput("");
    setNewSubtotal("");
    setNewNotes("");
    setApplyDiscount(false);
    setDiscountType("percentage");
    setDiscountValue("");
    setCreateError("");
  };

  // Handle Create Invoice Submit
  async function handleCreateInvoiceSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!patientIdInput.trim()) {
      setCreateError("Patient ID is required.");
      return;
    }

    const subtotal = parseFloat(newSubtotal);
    if (isNaN(subtotal) || subtotal <= 0) {
      setCreateError("Please enter a valid subtotal amount greater than ₹0.");
      return;
    }

    let finalDiscountAmount = 0;
    let finalDiscountPercent = 0;

    if (applyDiscount) {
      const val = parseFloat(discountValue);
      if (isNaN(val) || val < 0) {
        setCreateError("Please enter a valid discount amount or percentage.");
        return;
      }

      if (discountType === "percentage") {
        if (val > 100) {
          setCreateError("Discount percentage cannot exceed 100%.");
          return;
        }
        finalDiscountPercent = val;
        finalDiscountAmount = Math.round(((subtotal * val) / 100) * 100) / 100;
      } else {
        if (val > subtotal) {
          setCreateError(`Fixed discount cannot exceed subtotal (${formatCurrency(subtotal)}).`);
          return;
        }
        finalDiscountAmount = val;
        finalDiscountPercent = subtotal > 0 ? Math.round(((val / subtotal) * 100) * 10) / 10 : 0;
      }
    }

    const finalAmount = Math.max(0, Math.round((subtotal - finalDiscountAmount) * 100) / 100);

    setIsCreateSaving(true);
    setCreateError("");

    try {
      // Look up clinic_patient_link_id: if user entered patient ID, find corresponding link ID
      let linkId = patientIdInput.trim();
      const { data: linkData } = await supabase
        .from("clinic_patient_links")
        .select("id")
        .eq("patient_id", linkId)
        .maybeSingle();

      if (linkData?.id) {
        linkId = linkData.id;
      }

      await createInvoice({
        clinic_patient_link_id: linkId,
        subtotal: subtotal,
        discount_percent: finalDiscountPercent,
        discount_amount: finalDiscountAmount,
        amount: finalAmount,
        notes: newNotes.trim() || undefined,
      });

      await loadInvoices(); // Refresh list
      setIsCreateDialogOpen(false);
      resetCreateForm();

      setNotification("Invoice created successfully.");
      setTimeout(() => {
        setNotification(null);
      }, 4500);
    } catch (err) {
      setCreateError(
        err instanceof Error
          ? err.message
          : "Failed to create invoice. Please check the Patient ID."
      );
    } finally {
      setIsCreateSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Error Alert Banner with Retry */}
      {loadError && (
        <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-xs dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-300">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{loadError}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadInvoices()}
            className="h-7 border-rose-200 bg-white px-2.5 text-xs font-medium text-rose-700 hover:bg-rose-50 hover:text-rose-900 dark:border-rose-800 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950 cursor-pointer gap-1.5"
          >
            <RotateCcw className="size-3" />
            <span>Retry</span>
          </Button>
        </div>
      )}

      {/* Success Notification Alert */}
      {notification && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-xs dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{notification}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="rounded p-1 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-900 cursor-pointer"
          >
            <X className="size-3.5" />
            <span className="sr-only">Dismiss</span>
          </button>
        </div>
      )}

      {/* 1. Header Section */}
      <div className="flex flex-col gap-4">
        {/* Title row with action button */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Billing & Invoices
              </h1>
              <Badge
                variant="secondary"
                className="h-5 border-blue-200 bg-blue-50 text-[11px] font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300"
              >
                {invoices.length} Invoices
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Manage patient billing, discount deductions, track payment status, and record transactions.
            </p>
          </div>

          <Button
            onClick={() => {
              setCreateError("");
              setIsCreateDialogOpen(true);
            }}
            className="h-9 gap-1.5 bg-blue-600 font-medium text-white shadow-sm transition-colors hover:bg-blue-700 cursor-pointer self-start sm:self-auto shrink-0"
          >
            <Plus className="size-4" />
            <span>+ Create Invoice</span>
          </Button>
        </div>

        {/* Filter Tabs and Search Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs
            value={filterTab}
            onValueChange={(val) => setFilterTab(String(val) as FilterTab)}
            className="w-full sm:w-auto"
          >
            <TabsList className="h-9 bg-slate-100 p-1 dark:bg-slate-800/80">
              <TabsTrigger
                value="all"
                className="gap-1.5 px-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-slate-100 cursor-pointer"
              >
                All
                <span className="rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                  {tabCounts.all}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="pending"
                className="gap-1.5 px-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-amber-800 data-[state=active]:shadow-2xs dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-amber-300 cursor-pointer"
              >
                Pending
                <span className="rounded-full bg-amber-100 px-1.5 py-0.2 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  {tabCounts.pending}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="partial"
                className="gap-1.5 px-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-blue-800 data-[state=active]:shadow-2xs dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-blue-300 cursor-pointer"
              >
                Partial
                <span className="rounded-full bg-blue-100 px-1.5 py-0.2 text-[10px] font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                  {tabCounts.partial}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="paid"
                className="gap-1.5 px-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-emerald-800 data-[state=active]:shadow-2xs dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-emerald-300 cursor-pointer"
              >
                Paid
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.2 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  {tabCounts.paid}
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="text"
              placeholder="Search by invoice #, patient, service..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 bg-white pl-9 pr-8 text-sm border-slate-200 shadow-2xs dark:border-slate-800 dark:bg-slate-900"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
              >
                <X className="size-3.5" />
                <span className="sr-only">Clear search</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. 4 Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Revenue / Billed This Month */}
        <Card className="relative overflow-hidden border border-slate-200/90 bg-white p-5 shadow-xs transition-shadow hover:shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <CardHeader className="flex flex-row items-start justify-between p-0">
            <div className="space-y-1">
              <CardTitle className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Total Revenue Billed
              </CardTitle>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <h3 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {formatCurrency(summaryStats.totalRevenue)}
                </h3>
              )}
            </div>
            <div className="flex size-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-400">
              <TrendingUp className="size-5" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="mt-4 flex items-center gap-1.5 text-xs">
              <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight className="size-3.5" />
                +14.2%
              </span>
              <span className="text-slate-500 dark:text-slate-400">vs last month</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Outstanding Balance */}
        <Card className="relative overflow-hidden border border-amber-200/80 bg-gradient-to-br from-white to-amber-50/30 p-5 shadow-xs transition-shadow hover:shadow-sm dark:border-amber-900/50 dark:from-slate-900 dark:to-amber-950/20">
          <CardHeader className="flex flex-row items-start justify-between p-0">
            <div className="space-y-1">
              <CardTitle className="text-xs font-medium text-amber-900/80 dark:text-amber-300/80">
                Outstanding Balance
              </CardTitle>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <h3 className="text-2xl font-bold tracking-tight text-amber-700 dark:text-amber-400">
                  {formatCurrency(summaryStats.totalOutstanding)}
                </h3>
              )}
            </div>
            <div className="flex size-10 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-400">
              <IndianRupee className="size-5" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="mt-4 flex items-center gap-1.5 text-xs text-amber-700/90 dark:text-amber-400/90">
              <Clock className="size-3.5" />
              <span>Pending & partial settlements</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Paid Collections */}
        <Card className="relative overflow-hidden border border-emerald-200/80 bg-gradient-to-br from-white to-emerald-50/30 p-5 shadow-xs transition-shadow hover:shadow-sm dark:border-emerald-900/50 dark:from-slate-900 dark:to-emerald-950/20">
          <CardHeader className="flex flex-row items-start justify-between p-0">
            <div className="space-y-1">
              <CardTitle className="text-xs font-medium text-emerald-900/80 dark:text-emerald-300/80">
                Paid Collections
              </CardTitle>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <h3 className="text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(summaryStats.totalPaid)}
                </h3>
              )}
            </div>
            <div className="flex size-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400">
              <Receipt className="size-5" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="mt-4 flex items-center gap-1.5 text-xs text-emerald-700/90 dark:text-emerald-400/90">
              <CheckCircle2 className="size-3.5" />
              <span>
                {summaryStats.totalRevenue > 0
                  ? Math.round((summaryStats.totalPaid / summaryStats.totalRevenue) * 100)
                  : 0}
                % collection rate
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Overdue */}
        <Card className="relative overflow-hidden border border-rose-200/80 bg-gradient-to-br from-white to-rose-50/30 p-5 shadow-xs transition-shadow hover:shadow-sm dark:border-rose-900/50 dark:from-slate-900 dark:to-rose-950/20">
          <CardHeader className="flex flex-row items-start justify-between p-0">
            <div className="space-y-1">
              <CardTitle className="text-xs font-medium text-rose-900/80 dark:text-rose-300/80">
                Awaiting Payment
              </CardTitle>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <h3 className="text-2xl font-bold tracking-tight text-rose-700 dark:text-rose-400">
                  {summaryStats.overdueCount} invoices
                </h3>
              )}
            </div>
            <div className="flex size-10 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-400">
              <AlertCircle className="size-5" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="mt-4 flex items-center gap-1.5 text-xs text-rose-700/90 dark:text-rose-400/90">
              <AlertCircle className="size-3.5" />
              <span>Pending follow-up actions</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. Invoice Table */}
      <Card className="overflow-hidden border border-slate-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <CardHeader className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
                Invoice Records
              </CardTitle>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Showing {filteredInvoices.length} of {invoices.length} total entries
              </p>
            </div>
            {filterTab !== "all" && (
              <Badge variant="outline" className="w-fit capitalize text-xs">
                Filtered by: {filterTab}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/80 dark:bg-slate-800/50">
                <TableRow className="border-b border-slate-200 dark:border-slate-800">
                  <TableHead className="w-[150px] py-3.5 pl-6 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Invoice #
                  </TableHead>
                  <TableHead className="py-3.5 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Patient Name
                  </TableHead>
                  <TableHead className="py-3.5 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Date
                  </TableHead>
                  <TableHead className="py-3.5 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Amount
                  </TableHead>
                  <TableHead className="py-3.5 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Status
                  </TableHead>
                  <TableHead className="py-3.5 pr-6 text-right text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Actions
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
                      <TableCell className="py-4 pl-6">
                        <div className="flex items-center gap-2">
                          <Skeleton className="size-7 rounded-md" />
                          <Skeleton className="h-4 w-20" />
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center gap-2.5">
                          <Skeleton className="size-7 rounded-full" />
                          <div className="space-y-1">
                            <Skeleton className="h-4 w-28" />
                            <Skeleton className="h-3 w-16" />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="space-y-1">
                          <Skeleton className="h-4 w-16" />
                          <Skeleton className="h-3 w-12" />
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </TableCell>
                      <TableCell className="py-4 pr-6 text-right">
                        <div className="flex justify-end gap-2">
                          <Skeleton className="h-8 w-16 rounded-md" />
                          <Skeleton className="h-8 w-24 rounded-md" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-12 text-center text-slate-500 dark:text-slate-400"
                    >
                      <div className="mx-auto flex max-w-sm flex-col items-center justify-center gap-2">
                        <Receipt className="size-8 text-slate-300 dark:text-slate-600" />
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {invoices.length === 0
                            ? "No invoices yet. Create your first invoice using the button above."
                            : "No invoices match your criteria"}
                        </p>
                        {invoices.length > 0 && (searchQuery || filterTab !== "all") && (
                          <>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Try modifying your search or switching filter tabs.
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSearchQuery("");
                                setFilterTab("all");
                              }}
                              className="mt-2 text-xs cursor-pointer"
                            >
                              Reset Filters
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.map((invoice) => {
                    const remaining = invoice.amount - invoice.paid;
                    const isPaid = invoice.status === "paid";
                    const hasDiscount = invoice.discount_percent > 0;
                    const displayId =
                      invoice.id.length > 12
                        ? `INV-${invoice.id.slice(0, 8).toUpperCase()}`
                        : invoice.id;

                    return (
                      <TableRow
                        key={invoice.id}
                        className="border-b border-slate-100 transition-colors hover:bg-slate-50/60 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                      >
                        {/* Invoice # */}
                        <TableCell className="py-3.5 pl-6 font-mono text-xs font-semibold text-slate-900 dark:text-slate-200">
                          <div className="flex items-center gap-2">
                            <span className="flex size-7 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              <Receipt className="size-3.5" />
                            </span>
                            <span title={invoice.id} className="truncate max-w-[110px]">
                              {displayId}
                            </span>
                          </div>
                        </TableCell>

                        {/* Patient Name */}
                        <TableCell className="py-3.5 text-sm font-medium text-slate-900 dark:text-slate-100">
                          <div className="flex items-center gap-2.5">
                            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                              {getInitials(invoice.patient)}
                            </div>
                            <div className="flex flex-col">
                              <span>{invoice.patient}</span>
                              {invoice.service && (
                                <span className="text-xs font-normal text-slate-500 dark:text-slate-400 line-clamp-1 max-w-[180px]">
                                  {invoice.service}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Date */}
                        <TableCell className="py-3.5 text-xs text-slate-600 dark:text-slate-400">
                          {formatDate(invoice.date)}
                        </TableCell>

                        {/* Amount with Discount Indicator */}
                        <TableCell className="py-3.5">
                          <div className="flex flex-col">
                            {hasDiscount ? (
                              <>
                                <div className="flex items-center gap-1.5">
                                  <span className="line-through text-muted-foreground text-xs">
                                    {formatCurrency(invoice.subtotal)}
                                  </span>
                                  <span className="inline-flex items-center rounded-xs bg-emerald-50 px-1 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800">
                                    {invoice.discount_percent % 1 === 0
                                      ? invoice.discount_percent
                                      : invoice.discount_percent.toFixed(1)}
                                    % off
                                  </span>
                                </div>
                                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {formatCurrency(invoice.amount)}
                                </span>
                              </>
                            ) : (
                              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {formatCurrency(invoice.amount)}
                              </span>
                            )}

                            {invoice.status === "partial" && (
                              <span className="text-[11px] text-blue-600 dark:text-blue-400">
                                {formatCurrency(remaining)} due
                              </span>
                            )}
                            {invoice.status === "pending" && (
                              <span className="text-[11px] text-slate-400">
                                Unpaid
                              </span>
                            )}
                            {invoice.status === "paid" && invoice.method && (
                              <span className="text-[11px] text-slate-400">
                                via {invoice.method}
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* Status */}
                        <TableCell className="py-3.5">
                          <InvoiceStatusBadge status={invoice.status} />
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="py-3.5 pr-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewInvoice(invoice)}
                              className="h-8 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Eye className="size-3.5 mr-1" />
                              View
                            </Button>

                            {!isPaid && (
                              <Button
                                size="sm"
                                onClick={() => handleOpenRecordPayment(invoice)}
                                className="h-8 gap-1 bg-blue-600 text-xs font-medium text-white hover:bg-blue-700 shadow-2xs transition-colors cursor-pointer"
                              >
                                <CreditCard className="size-3.5" />
                                <span>Record Payment</span>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 4. Record Payment Sheet */}
      <Sheet open={paymentSheetOpen} onOpenChange={setPaymentSheetOpen}>
        <SheetContent
          side="right"
          className="flex h-full w-full flex-col justify-between sm:max-w-md bg-white p-0 dark:bg-slate-900"
        >
          <div className="flex flex-1 flex-col overflow-y-auto">
            <SheetHeader className="border-b border-slate-200 p-6 dark:border-slate-800">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                <Wallet className="size-5" />
                <SheetTitle className="text-lg font-bold text-slate-900 dark:text-white">
                  Record Payment
                </SheetTitle>
              </div>
              <SheetDescription className="text-xs text-slate-500 dark:text-slate-400">
                Enter payment details to record an incoming transaction for invoice{" "}
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {selectedInvoice?.id.slice(0, 8)}
                </span>
                .
              </SheetDescription>
            </SheetHeader>

            {selectedInvoice && (
              <div className="p-6 space-y-6">
                {/* Invoice Summary Box */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2.5 dark:border-slate-700">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Invoice
                      </span>
                      <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                        {selectedInvoice.id.length > 12
                          ? `INV-${selectedInvoice.id.slice(0, 8).toUpperCase()}`
                          : selectedInvoice.id}
                      </p>
                    </div>
                    <InvoiceStatusBadge status={selectedInvoice.status} />
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Patient:</span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {selectedInvoice.patient}
                      </span>
                    </div>
                    {selectedInvoice.service && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Service:</span>
                        <span className="text-slate-700 dark:text-slate-300">
                          {selectedInvoice.service}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Date Issued:</span>
                      <span className="text-slate-700 dark:text-slate-300">
                        {formatDate(selectedInvoice.date)}
                      </span>
                    </div>

                    {selectedInvoice.discount_amount > 0 && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 dark:text-slate-400">Subtotal:</span>
                          <span className="text-slate-700 dark:text-slate-300">
                            {formatCurrency(selectedInvoice.subtotal)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                          <span>
                            Discount ({Number(selectedInvoice.discount_percent.toFixed(1))}%):
                          </span>
                          <span>- {formatCurrency(selectedInvoice.discount_amount)}</span>
                        </div>
                      </>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Total Amount:</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {formatCurrency(selectedInvoice.amount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Already Paid:</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        {formatCurrency(selectedInvoice.paid)}
                      </span>
                    </div>
                    <Separator className="my-1.5" />
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        Remaining Balance:
                      </span>
                      <span className="font-bold text-amber-600 dark:text-amber-400">
                        {formatCurrency(selectedInvoice.amount - selectedInvoice.paid)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Payment Form */}
                <form id="record-payment-form" onSubmit={handleRecordPaymentSubmit} className="space-y-4">
                  {/* Amount Field */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="payment-amount"
                        className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Payment Amount (₹) <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const rem = selectedInvoice.amount - selectedInvoice.paid;
                          setPaymentAmount(rem.toString());
                          setPaymentError("");
                        }}
                        className="text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
                      >
                        Pay Full Balance ({formatCurrency(selectedInvoice.amount - selectedInvoice.paid)})
                      </button>
                    </div>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                        ₹
                      </span>
                      <Input
                        id="payment-amount"
                        type="number"
                        step="0.01"
                        min="1"
                        max={selectedInvoice.amount - selectedInvoice.paid}
                        value={paymentAmount}
                        onChange={(e) => {
                          setPaymentAmount(e.target.value);
                          if (paymentError) setPaymentError("");
                        }}
                        placeholder="0.00"
                        className="h-10 pl-7 text-sm font-medium border-slate-200 dark:border-slate-700"
                      />
                    </div>
                    {paymentError && (
                      <p className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1">
                        <AlertCircle className="size-3" />
                        {paymentError}
                      </p>
                    )}
                  </div>

                  {/* Payment Method Select */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="payment-method"
                      className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Payment Method <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <select
                        id="payment-method"
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus-visible:border-blue-500 focus-visible:ring-3 focus-visible:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      >
                        <option value="Card">Card</option>
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                      </select>
                      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <CreditCard className="size-4" />
                      </div>
                    </div>
                  </div>

                  {/* Reference / Transaction ID Note */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="payment-note"
                      className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Transaction Reference / Notes (Optional)
                    </label>
                    <Input
                      id="payment-note"
                      type="text"
                      value={paymentNote}
                      onChange={(e) => setPaymentNote(e.target.value)}
                      placeholder="e.g. UPI Ref / Auth code / Receipt #"
                      className="h-10 text-sm border-slate-200 dark:border-slate-700"
                    />
                  </div>
                </form>
              </div>
            )}
          </div>

          <SheetFooter className="border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex w-full items-center justify-end gap-2.5">
              <Button
                type="button"
                variant="outline"
                disabled={isPaymentSaving}
                onClick={() => setPaymentSheetOpen(false)}
                className="h-9 px-4 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="record-payment-form"
                disabled={isPaymentSaving}
                className="h-9 gap-1.5 bg-blue-600 px-4 text-xs font-medium text-white hover:bg-blue-700 shadow-xs cursor-pointer"
              >
                {isPaymentSaving ? (
                  <>
                    <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Recording...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-3.5" />
                    <span>Record Payment</span>
                  </>
                )}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* 5. View Invoice Detail Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-md bg-white p-0 dark:bg-slate-900">
          <DialogHeader className="border-b border-slate-200 p-6 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="size-5 text-blue-600 dark:text-blue-400" />
                <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
                  Invoice Details
                </DialogTitle>
              </div>
              {viewInvoice && <InvoiceStatusBadge status={viewInvoice.status} />}
            </div>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              Complete invoice breakdown and payment summary.
            </DialogDescription>
          </DialogHeader>

          {viewInvoice && (
            <div className="p-6 space-y-5 text-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                    {viewInvoice.id.length > 12
                      ? `INV-${viewInvoice.id.slice(0, 8).toUpperCase()}`
                      : viewInvoice.id}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Issued on {formatDate(viewInvoice.date)}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Billed To</span>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {viewInvoice.patient}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Breakdown */}
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-4 text-xs dark:border-slate-800 dark:bg-slate-800/50">
                <div className="flex justify-between py-1">
                  <span className="text-slate-500 dark:text-slate-400">Service:</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {viewInvoice.service || "Consultation"}
                  </span>
                </div>

                <div className="flex justify-between py-1">
                  <span className="text-slate-500 dark:text-slate-400">Subtotal:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {formatCurrency(viewInvoice.subtotal, 2)}
                  </span>
                </div>

                {viewInvoice.discount_amount > 0 ? (
                  <div className="flex justify-between py-1 text-emerald-600 dark:text-emerald-400">
                    <span>
                      Discount ({Number(viewInvoice.discount_percent.toFixed(1))}%):
                    </span>
                    <span className="font-semibold">
                      - {formatCurrency(viewInvoice.discount_amount, 2)}
                    </span>
                  </div>
                ) : (
                  <div className="flex justify-between py-1 text-slate-500 dark:text-slate-400">
                    <span>Discount (0%):</span>
                    <span>- {formatCurrency(0, 2)}</span>
                  </div>
                )}

                <Separator className="my-1.5" />

                <div className="flex justify-between py-1 font-bold text-slate-900 dark:text-white">
                  <span>Total:</span>
                  <span>{formatCurrency(viewInvoice.amount, 2)}</span>
                </div>

                <div className="flex justify-between py-1">
                  <span className="text-slate-500 dark:text-slate-400">Paid:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(viewInvoice.paid, 2)}
                  </span>
                </div>

                <div className="flex justify-between py-1 text-sm font-bold">
                  <span className="text-slate-900 dark:text-white">Balance Due:</span>
                  <span
                    className={cn(
                      viewInvoice.amount - viewInvoice.paid > 0
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-emerald-600 dark:text-emerald-400"
                    )}
                  >
                    {formatCurrency(Math.max(0, viewInvoice.amount - viewInvoice.paid), 2)}
                  </span>
                </div>

                {viewInvoice.method && (
                  <div className="flex justify-between py-1 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-slate-500 dark:text-slate-400">
                    <span>Payment Method:</span>
                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                      {viewInvoice.method}
                    </span>
                  </div>
                )}

                {viewInvoice.notes && (
                  <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-700/70">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-0.5">
                      Notes:
                    </span>
                    <p className="rounded-md bg-white p-2.5 text-xs text-slate-700 border border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700 whitespace-pre-wrap">
                      {viewInvoice.notes}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex w-full items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="h-8 gap-1.5 text-xs text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <Printer className="size-3.5" />
                <span>Print</span>
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsViewDialogOpen(false)}
                  className="h-8 text-xs cursor-pointer"
                >
                  Close
                </Button>
                {viewInvoice && viewInvoice.status !== "paid" && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setIsViewDialogOpen(false);
                      handleOpenRecordPayment(viewInvoice);
                    }}
                    className="h-8 gap-1 bg-blue-600 text-xs text-white hover:bg-blue-700 cursor-pointer"
                  >
                    <CreditCard className="size-3.5" />
                    <span>Record Payment</span>
                  </Button>
                )}
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 6. Create Invoice Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-lg max-h-[92vh] flex flex-col bg-white p-0 dark:bg-slate-900">
          <DialogHeader className="border-b border-slate-200 p-6 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <Receipt className="size-5" />
              <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
                Create New Invoice
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              Generate a new billable medical invoice with optional discount deductions.
            </DialogDescription>
          </DialogHeader>

          <form
            id="create-invoice-form"
            onSubmit={handleCreateInvoiceSubmit}
            className="flex-1 overflow-y-auto p-6 space-y-4"
          >
            {createError && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                <AlertCircle className="size-3.5 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            {/* Patient ID (UUID from Patients page) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="patient-id-input"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Patient ID <span className="text-rose-500">*</span>
                </label>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Copy from Patients page
                </span>
              </div>
              {/* TODO: Replace with patient search dropdown when patients page shares state */}
              <PatientCombobox
                patients={patientsList}
                value={patientIdInput}
                onChange={(val) => {
                  setPatientIdInput(val);
                  if (createError) setCreateError("");
                }}
              />
            </div>

            {/* Subtotal Amount Input */}
            <div className="space-y-1.5">
              <label
                htmlFor="new-subtotal"
                className="text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Subtotal Amount (₹) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                  ₹
                </span>
                <Input
                  id="new-subtotal"
                  type="number"
                  step="0.01"
                  min="1"
                  placeholder="3200"
                  value={newSubtotal}
                  onChange={(e) => {
                    setNewSubtotal(e.target.value);
                    if (createError) setCreateError("");
                  }}
                  className="h-10 pl-8 text-sm border-slate-200 dark:border-slate-700"
                  required
                />
              </div>
            </div>

            {/* Discount Section with Checkbox Toggle */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40 space-y-3">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="apply-discount-toggle"
                  className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-slate-800 dark:text-slate-200"
                >
                  <input
                    type="checkbox"
                    id="apply-discount-toggle"
                    checked={applyDiscount}
                    onChange={(e) => setApplyDiscount(e.target.checked)}
                    className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer dark:border-slate-700 dark:bg-slate-900"
                  />
                  <span>Apply Discount</span>
                </label>
                {applyDiscount && (
                  <Badge
                    variant="outline"
                    className="h-5 border-emerald-200 bg-emerald-50 text-[10px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  >
                    Discount Active
                  </Badge>
                )}
              </div>

              {/* Discount Options when checked */}
              {applyDiscount && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 space-y-3">
                  {/* Radio buttons: Percentage (%) or Fixed Amount (₹) */}
                  <div className="flex items-center gap-4 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-slate-300 font-medium">
                      <input
                        type="radio"
                        name="discount-type"
                        value="percentage"
                        checked={discountType === "percentage"}
                        onChange={() => setDiscountType("percentage")}
                        className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <span>Percentage (%)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-slate-300 font-medium">
                      <input
                        type="radio"
                        name="discount-type"
                        value="fixed"
                        checked={discountType === "fixed"}
                        onChange={() => setDiscountType("fixed")}
                        className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <span>Fixed Amount (₹)</span>
                    </label>
                  </div>

                  {/* Input field based on radio selection */}
                  {discountType === "percentage" ? (
                    <div className="space-y-1.5">
                      <label
                        htmlFor="discount-percent-input"
                        className="text-xs font-medium text-slate-600 dark:text-slate-400"
                      >
                        Discount Percentage (0 - 100%)
                      </label>
                      <div className="relative">
                        <Percent className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                        <Input
                          id="discount-percent-input"
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          placeholder="10"
                          value={discountValue}
                          onChange={(e) => setDiscountValue(e.target.value)}
                          className="h-9 pl-9 text-sm border-slate-200 dark:border-slate-700"
                        />
                      </div>
                      {parsedSubtotal > 0 && computedDiscountAmount > 0 && (
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                          Computed discount amount: - {formatCurrency(computedDiscountAmount)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label
                        htmlFor="discount-fixed-input"
                        className="text-xs font-medium text-slate-600 dark:text-slate-400"
                      >
                        Discount Fixed Amount (₹)
                      </label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                          ₹
                        </span>
                        <Input
                          id="discount-fixed-input"
                          type="number"
                          min="0"
                          max={parsedSubtotal || undefined}
                          step="1"
                          placeholder="200"
                          value={discountValue}
                          onChange={(e) => setDiscountValue(e.target.value)}
                          className="h-9 pl-8 text-sm border-slate-200 dark:border-slate-700"
                        />
                      </div>
                      {parsedSubtotal > 0 && computedDiscountPercent > 0 && (
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                          Equivalent to {computedDiscountPercent.toFixed(1)}% off
                        </p>
                      )}
                    </div>
                  )}

                  {/* Live calculation preview */}
                  <div className="rounded-md border border-slate-200 bg-white p-3 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 space-y-1">
                    <div className="flex justify-between text-slate-600 dark:text-slate-300">
                      <span>Subtotal:</span>
                      <span>{formatCurrency(parsedSubtotal)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                      <span>
                        Discount (
                        {computedDiscountPercent % 1 === 0
                          ? computedDiscountPercent
                          : computedDiscountPercent.toFixed(1)}
                        %):
                      </span>
                      <span>- {formatCurrency(computedDiscountAmount)}</span>
                    </div>
                    <div className="border-t border-dashed border-slate-200 dark:border-slate-700 my-1 pt-1 flex justify-between font-bold text-slate-900 dark:text-white">
                      <span>Total:</span>
                      <span>{formatCurrency(computedTotal)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Notes (Optional) */}
            <div className="space-y-1.5">
              <label
                htmlFor="new-notes"
                className="text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Notes / Service Description (Optional)
              </label>
              <textarea
                id="new-notes"
                rows={2}
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Add service description, notes, or justification..."
                className="flex min-h-[64px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-2xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-blue-600 focus-visible:ring-3 focus-visible:ring-blue-600/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </form>

          <DialogFooter className="border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60 shrink-0">
            <div className="flex w-full items-center justify-end gap-2.5">
              <Button
                type="button"
                variant="outline"
                disabled={isCreateSaving}
                onClick={() => {
                  setIsCreateDialogOpen(false);
                  resetCreateForm();
                }}
                className="h-9 px-4 text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="create-invoice-form"
                disabled={isCreateSaving}
                className="h-9 gap-1.5 bg-blue-600 px-4 text-xs font-medium text-white hover:bg-blue-700 shadow-xs cursor-pointer"
              >
                {isCreateSaving ? (
                  <>
                    <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <Plus className="size-3.5" />
                    <span>Generate Invoice</span>
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
