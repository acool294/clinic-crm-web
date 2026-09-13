"use client";

import * as React from "react";
import { useState, useMemo } from "react";
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
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  DollarSign,
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
} from "lucide-react";

export type InvoiceStatus = "paid" | "pending" | "partial";
export type FilterTab = "all" | "pending" | "partial" | "paid";

export interface Invoice {
  id: string;
  patient: string;
  date: string;
  amount: number;
  paid: number;
  status: InvoiceStatus;
  method: string;
}

const INITIAL_INVOICES: Invoice[] = [
  { id: "INV-001", patient: "Eleanor Vance", date: "2026-09-10", amount: 2400, paid: 2400, status: "paid", method: "Card" },
  { id: "INV-002", patient: "Marcus Brody", date: "2026-09-08", amount: 1800, paid: 0, status: "pending", method: "" },
  { id: "INV-003", patient: "Sarah Jenkins", date: "2026-09-05", amount: 3200, paid: 1600, status: "partial", method: "UPI" },
  { id: "INV-004", patient: "David Alvarez", date: "2026-09-12", amount: 950, paid: 950, status: "paid", method: "Cash" },
  { id: "INV-005", patient: "Amanda Hayes", date: "2026-09-11", amount: 1500, paid: 0, status: "pending", method: "" },
  { id: "INV-006", patient: "Robert Chen", date: "2026-09-09", amount: 2100, paid: 2100, status: "paid", method: "Bank Transfer" },
  { id: "INV-007", patient: "Priya Sharma", date: "2026-09-07", amount: 780, paid: 400, status: "partial", method: "Cash" },
  { id: "INV-008", patient: "James Wilson", date: "2026-09-06", amount: 4500, paid: 0, status: "pending", method: "" },
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
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
  const [invoices, setInvoices] = useState<Invoice[]>(INITIAL_INVOICES);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Record Payment Sheet state
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Card");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentError, setPaymentError] = useState("");

  // View Invoice Modal state
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  // Create Invoice Modal state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newPatientName, setNewPatientName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newDate, setNewDate] = useState("2026-09-13");
  const [newStatus, setNewStatus] = useState<InvoiceStatus>("pending");
  const [newPaymentMethod, setNewPaymentMethod] = useState("");
  const [createError, setCreateError] = useState("");

  // Success Notification banner state
  const [notification, setNotification] = useState<string | null>(null);

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
        return matchesId || matchesPatient;
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
  const handleRecordPaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    const parsedAmount = parseFloat(paymentAmount);
    const remaining = selectedInvoice.amount - selectedInvoice.paid;

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setPaymentError("Please enter a valid payment amount greater than $0.");
      return;
    }

    if (parsedAmount > remaining) {
      setPaymentError(`Payment cannot exceed remaining balance of ${formatCurrency(remaining)}.`);
      return;
    }

    const newPaid = selectedInvoice.paid + parsedAmount;
    const newStatus: InvoiceStatus = newPaid >= selectedInvoice.amount ? "paid" : "partial";

    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === selectedInvoice.id
          ? {
              ...inv,
              paid: newPaid,
              status: newStatus,
              method: paymentMethod || inv.method,
            }
          : inv
      )
    );

    setPaymentSheetOpen(false);
    setNotification(
      `Payment of ${formatCurrency(parsedAmount)} recorded successfully for ${selectedInvoice.id} (${selectedInvoice.patient}).`
    );
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // Handle View Invoice
  const handleViewInvoice = (invoice: Invoice) => {
    setViewInvoice(invoice);
    setIsViewDialogOpen(true);
  };

  // Handle Create Invoice Submit
  const handleCreateInvoiceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientName.trim()) {
      setCreateError("Patient name is required.");
      return;
    }

    const parsedAmount = parseFloat(newAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setCreateError("Please enter a valid invoice amount.");
      return;
    }

    const nextIdNumber = invoices.length + 1;
    const nextId = `INV-${String(nextIdNumber).padStart(3, "0")}`;

    const paidAmount = newStatus === "paid" ? parsedAmount : 0;
    const finalMethod = newStatus === "paid" ? newPaymentMethod || "Card" : "";

    const newInvoice: Invoice = {
      id: nextId,
      patient: newPatientName.trim(),
      date: newDate || "2026-09-13",
      amount: parsedAmount,
      paid: paidAmount,
      status: newStatus,
      method: finalMethod,
    };

    setInvoices((prev) => [newInvoice, ...prev]);
    setIsCreateDialogOpen(false);
    setNewPatientName("");
    setNewAmount("");
    setNewDate("2026-09-13");
    setNewStatus("pending");
    setNewPaymentMethod("");
    setCreateError("");

    setNotification(`Invoice ${nextId} created successfully for ${newInvoice.patient}.`);
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
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
            className="rounded p-1 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-900"
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
              Manage patient billing, track payment status, and record transactions.
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
                className="gap-1.5 px-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-slate-100"
              >
                All
                <span className="rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                  {tabCounts.all}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="pending"
                className="gap-1.5 px-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-amber-800 data-[state=active]:shadow-2xs dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-amber-300"
              >
                Pending
                <span className="rounded-full bg-amber-100 px-1.5 py-0.2 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  {tabCounts.pending}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="partial"
                className="gap-1.5 px-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-blue-800 data-[state=active]:shadow-2xs dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-blue-300"
              >
                Partial
                <span className="rounded-full bg-blue-100 px-1.5 py-0.2 text-[10px] font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                  {tabCounts.partial}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="paid"
                className="gap-1.5 px-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-emerald-800 data-[state=active]:shadow-2xs dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-emerald-300"
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
              placeholder="Search by invoice # or patient..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 bg-white pl-9 pr-8 text-sm border-slate-200 shadow-2xs dark:border-slate-800 dark:bg-slate-900"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
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
        {/* Card 1: Total Revenue This Month */}
        <Card className="relative overflow-hidden border border-slate-200/90 bg-white p-5 shadow-xs transition-shadow hover:shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <CardHeader className="flex flex-row items-start justify-between p-0">
            <div className="space-y-1">
              <CardTitle className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Total Revenue This Month
              </CardTitle>
              <h3 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                $12,450
              </h3>
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
              <h3 className="text-2xl font-bold tracking-tight text-amber-700 dark:text-amber-400">
                $3,200
              </h3>
            </div>
            <div className="flex size-10 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-400">
              <DollarSign className="size-5" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="mt-4 flex items-center gap-1.5 text-xs text-amber-700/90 dark:text-amber-400/90">
              <Clock className="size-3.5" />
              <span>Pending & partial settlements</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Paid This Month */}
        <Card className="relative overflow-hidden border border-emerald-200/80 bg-gradient-to-br from-white to-emerald-50/30 p-5 shadow-xs transition-shadow hover:shadow-sm dark:border-emerald-900/50 dark:from-slate-900 dark:to-emerald-950/20">
          <CardHeader className="flex flex-row items-start justify-between p-0">
            <div className="space-y-1">
              <CardTitle className="text-xs font-medium text-emerald-900/80 dark:text-emerald-300/80">
                Paid This Month
              </CardTitle>
              <h3 className="text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
                $9,250
              </h3>
            </div>
            <div className="flex size-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400">
              <Receipt className="size-5" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="mt-4 flex items-center gap-1.5 text-xs text-emerald-700/90 dark:text-emerald-400/90">
              <CheckCircle2 className="size-3.5" />
              <span>74.3% collection rate</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Overdue */}
        <Card className="relative overflow-hidden border border-rose-200/80 bg-gradient-to-br from-white to-rose-50/30 p-5 shadow-xs transition-shadow hover:shadow-sm dark:border-rose-900/50 dark:from-slate-900 dark:to-rose-950/20">
          <CardHeader className="flex flex-row items-start justify-between p-0">
            <div className="space-y-1">
              <CardTitle className="text-xs font-medium text-rose-900/80 dark:text-rose-300/80">
                Overdue
              </CardTitle>
              <h3 className="text-2xl font-bold tracking-tight text-rose-700 dark:text-rose-400">
                2 invoices
              </h3>
            </div>
            <div className="flex size-10 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-400">
              <AlertCircle className="size-5" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="mt-4 flex items-center gap-1.5 text-xs text-rose-700/90 dark:text-rose-400/90">
              <AlertCircle className="size-3.5" />
              <span>Action required for follow-up</span>
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
                <TableHead className="w-[140px] py-3.5 pl-6 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
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
              {filteredInvoices.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-12 text-center text-slate-500 dark:text-slate-400"
                  >
                    <div className="mx-auto flex max-w-sm flex-col items-center justify-center gap-2">
                      <Receipt className="size-8 text-slate-300 dark:text-slate-600" />
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        No invoices match your criteria
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Try modifying your search or switching filter tabs.
                      </p>
                      {(searchQuery || filterTab !== "all") && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSearchQuery("");
                            setFilterTab("all");
                          }}
                          className="mt-2 text-xs"
                        >
                          Reset Filters
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredInvoices.map((invoice) => {
                  const remaining = invoice.amount - invoice.paid;
                  const isPaid = invoice.status === "paid";

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
                          <span>{invoice.id}</span>
                        </div>
                      </TableCell>

                      {/* Patient Name */}
                      <TableCell className="py-3.5 text-sm font-medium text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                            {getInitials(invoice.patient)}
                          </div>
                          <span>{invoice.patient}</span>
                        </div>
                      </TableCell>

                      {/* Date */}
                      <TableCell className="py-3.5 text-xs text-slate-600 dark:text-slate-400">
                        {formatDate(invoice.date)}
                      </TableCell>

                      {/* Amount */}
                      <TableCell className="py-3.5">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {formatCurrency(invoice.amount)}
                          </span>
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
                            className="h-8 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
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
                  {selectedInvoice?.id}
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
                        {selectedInvoice.id}
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
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Date Issued:</span>
                      <span className="text-slate-700 dark:text-slate-300">
                        {formatDate(selectedInvoice.date)}
                      </span>
                    </div>
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
                        Payment Amount ($) <span className="text-rose-500">*</span>
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
                        Pay Full Balance (${selectedInvoice.amount - selectedInvoice.paid})
                      </button>
                    </div>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                        $
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
                        <option value="Cash">Cash</option>
                        <option value="Card">Card</option>
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
                onClick={() => setPaymentSheetOpen(false)}
                className="h-9 px-4 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="record-payment-form"
                className="h-9 gap-1.5 bg-blue-600 px-4 text-xs font-medium text-white hover:bg-blue-700 shadow-xs cursor-pointer"
              >
                <CheckCircle2 className="size-3.5" />
                <span>Record Payment</span>
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* 5. View Invoice Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-lg bg-white p-0 dark:bg-slate-900">
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
              Complete invoice statement and transaction history.
            </DialogDescription>
          </DialogHeader>

          {viewInvoice && (
            <div className="p-6 space-y-5 text-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                    {viewInvoice.id}
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
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Itemized Charges
                </p>
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2 dark:border-slate-800 dark:bg-slate-800/30">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-700 dark:text-slate-300">
                      Medical Consultation & Clinical Assessment
                    </span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {formatCurrency(viewInvoice.amount * 0.65)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-700 dark:text-slate-300">
                      Diagnostic Laboratory & Procedure Fees
                    </span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {formatCurrency(viewInvoice.amount * 0.35)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Financial summary */}
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-800/50">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Total Invoiced:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {formatCurrency(viewInvoice.amount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Paid to Date:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(viewInvoice.paid)}
                  </span>
                </div>
                {viewInvoice.method && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Payment Method:</span>
                    <span className="text-slate-700 dark:text-slate-300">{viewInvoice.method}</span>
                  </div>
                )}
                <Separator className="my-1.5" />
                <div className="flex justify-between text-sm">
                  <span className="font-bold text-slate-900 dark:text-white">Balance Due:</span>
                  <span
                    className={cn(
                      "font-bold",
                      viewInvoice.amount - viewInvoice.paid > 0
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-emerald-600 dark:text-emerald-400"
                    )}
                  >
                    {formatCurrency(viewInvoice.amount - viewInvoice.paid)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex w-full items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="h-8 gap-1.5 text-xs text-slate-600 hover:bg-slate-100"
              >
                <Printer className="size-3.5" />
                <span>Print</span>
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsViewDialogOpen(false)}
                  className="h-8 text-xs"
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
                    className="h-8 gap-1 bg-blue-600 text-xs text-white hover:bg-blue-700"
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
        <DialogContent className="max-w-md bg-white p-0 dark:bg-slate-900">
          <DialogHeader className="border-b border-slate-200 p-6 dark:border-slate-800">
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <Receipt className="size-5" />
              <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
                Create New Invoice
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              Generate a new billable medical invoice for a patient.
            </DialogDescription>
          </DialogHeader>

          <form id="create-invoice-form" onSubmit={handleCreateInvoiceSubmit} className="p-6 space-y-4">
            {createError && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                <AlertCircle className="size-3.5 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            {/* Patient Name */}
            <div className="space-y-1.5">
              <label
                htmlFor="new-patient-name"
                className="text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Patient Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <Input
                  id="new-patient-name"
                  type="text"
                  placeholder="e.g. John Doe"
                  value={newPatientName}
                  onChange={(e) => setNewPatientName(e.target.value)}
                  className="h-10 pl-9 text-sm border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>

            {/* Invoice Amount */}
            <div className="space-y-1.5">
              <label
                htmlFor="new-amount"
                className="text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Amount ($) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <DollarSign className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <Input
                  id="new-amount"
                  type="number"
                  step="0.01"
                  min="1"
                  placeholder="0.00"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className="h-10 pl-9 text-sm border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <label
                htmlFor="new-date"
                className="text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Invoice Date
              </label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <Input
                  id="new-date"
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="h-10 pl-9 text-sm border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <label
                htmlFor="new-status"
                className="text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Initial Payment Status
              </label>
              <select
                id="new-status"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as InvoiceStatus)}
                className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus-visible:border-blue-500 focus-visible:ring-3 focus-visible:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="pending">Pending (Unpaid)</option>
                <option value="paid">Paid (In Full)</option>
              </select>
            </div>

            {/* Payment Method (if marked paid) */}
            {newStatus === "paid" && (
              <div className="space-y-1.5">
                <label
                  htmlFor="new-method"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Payment Method
                </label>
                <select
                  id="new-method"
                  value={newPaymentMethod}
                  onChange={(e) => setNewPaymentMethod(e.target.value)}
                  className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus-visible:border-blue-500 focus-visible:ring-3 focus-visible:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="Card">Card</option>
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>
            )}
          </form>

          <DialogFooter className="border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex w-full items-center justify-end gap-2.5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
                className="h-9 px-4 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="create-invoice-form"
                className="h-9 gap-1.5 bg-blue-600 px-4 text-xs font-medium text-white hover:bg-blue-700 shadow-xs cursor-pointer"
              >
                <Plus className="size-3.5" />
                <span>Create Invoice</span>
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
