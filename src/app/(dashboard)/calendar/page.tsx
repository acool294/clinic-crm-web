"use client";

import { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  CalendarDays,
  Clock,
  User,
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  CheckCircle2,
  Stethoscope,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  addDays,
  addWeeks,
  addMonths,
  subDays,
  subWeeks,
  subMonths,
  isToday,
  getHours,
  getMinutes,
} from "date-fns";

export type AppointmentType = "Consultation" | "Follow-up" | "Lab Review";

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "checked_in"
  | "in_progress"
  | "completed"
  | "cancelled";

export type CalendarView = "day" | "week" | "month";

export interface Appointment {
  id: string;
  patient: string;
  date: string; // 'YYYY-MM-DD' - the actual date
  time: string; // 'HH:MM'
  duration: number; // in minutes
  type: AppointmentType;
  doctor: string;
  status: AppointmentStatus;
}

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

function formatHour(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:00 ${period}`;
}

function getTimeRange(time: string, duration: number): string {
  const [h, m] = time.split(":").map(Number);
  const startMin = (h || 0) * 60 + (m || 0);
  const endMin = startMin + duration;

  const startH = Math.floor(startMin / 60);
  const startM = startMin % 60;
  const endH = Math.floor(endMin / 60);
  const endM = endMin % 60;

  const fmt = (hour: number, min: number) => {
    const period = hour >= 12 ? "PM" : "AM";
    const dHour = hour % 12 === 0 ? 12 : hour % 12;
    const dMin = min < 10 ? `0${min}` : `${min}`;
    return `${dHour}:${dMin} ${period}`;
  };

  return `${fmt(startH, startM)} - ${fmt(endH, endM)}`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return (name.slice(0, 2) || "PT").toUpperCase();
}

function getTopOffset(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  const startHour = 8;
  const totalMinutes = ((hours || 0) - startHour) * 60 + (minutes || 0);
  return Math.max(0, totalMinutes);
}

function getHeight(duration: number): number {
  return Math.max(28, duration);
}

function parseDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function getCardColorClasses(type: AppointmentType): string {
  switch (type) {
    case "Consultation":
      return "bg-blue-50/95 border-blue-200 text-blue-950 border-l-4 border-l-blue-600 hover:bg-blue-100/90";
    case "Follow-up":
      return "bg-teal-50/95 border-teal-200 text-teal-950 border-l-4 border-l-teal-600 hover:bg-teal-100/90";
    case "Lab Review":
      return "bg-purple-50/95 border-purple-200 text-purple-950 border-l-4 border-l-purple-600 hover:bg-purple-100/90";
    default:
      return "bg-slate-50 border-slate-200 text-slate-900 border-l-4 border-l-slate-500 hover:bg-slate-100";
  }
}

function getTypeBadgeColor(type: AppointmentType): string {
  switch (type) {
    case "Consultation":
      return "border-blue-200 bg-blue-50 text-blue-700 font-medium";
    case "Follow-up":
      return "border-teal-200 bg-teal-50 text-teal-700 font-medium";
    case "Lab Review":
      return "border-purple-200 bg-purple-50 text-purple-700 font-medium";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function getTypeDotColor(type: AppointmentType): string {
  switch (type) {
    case "Consultation":
      return "bg-blue-600";
    case "Follow-up":
      return "bg-teal-600";
    case "Lab Review":
      return "bg-purple-600";
    default:
      return "bg-slate-500";
  }
}

function renderStatusBadge(status: AppointmentStatus) {
  switch (status) {
    case "in_progress":
      return (
        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 gap-1 font-medium">
          <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
          In Progress
        </Badge>
      );
    case "checked_in":
      return (
        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 font-medium">
          Checked In
        </Badge>
      );
    case "scheduled":
      return (
        <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700 font-medium">
          Scheduled
        </Badge>
      );
    case "confirmed":
      return (
        <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700 font-medium">
          Confirmed
        </Badge>
      );
    case "completed":
      return (
        <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-700 font-medium">
          Completed
        </Badge>
      );
    case "cancelled":
      return (
        <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 font-medium">
          Cancelled
        </Badge>
      );
  }
}

function getInitialAppointments(): Appointment[] {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const mon = startOfWeek(today, { weekStartsOn: 1 });

  const dMon = format(mon, "yyyy-MM-dd");
  const dTue = format(addDays(mon, 1), "yyyy-MM-dd");
  const dWed = format(addDays(mon, 2), "yyyy-MM-dd");
  const dThu = format(addDays(mon, 3), "yyyy-MM-dd");
  const dFri = format(addDays(mon, 4), "yyyy-MM-dd");
  const dSat = format(addDays(mon, 5), "yyyy-MM-dd");

  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const mDay4 = format(addDays(monthStart, 3), "yyyy-MM-dd");
  const mDay10 = format(addDays(monthStart, 9), "yyyy-MM-dd");
  const mDay18 = format(addDays(monthStart, 17), "yyyy-MM-dd");
  const mDay24 = format(addDays(monthStart, 23), "yyyy-MM-dd");
  const mNearEnd = format(subDays(monthEnd, 2), "yyyy-MM-dd");

  const list: Appointment[] = [
    // 4 appointments for today
    {
      id: "apt-today-1",
      patient: "Eleanor Vance",
      date: todayStr,
      time: "09:00",
      duration: 45,
      type: "Consultation",
      doctor: "Dr. Smith",
      status: "in_progress",
    },
    {
      id: "apt-today-2",
      patient: "Marcus Brody",
      date: todayStr,
      time: "10:30",
      duration: 30,
      type: "Follow-up",
      doctor: "Dr. Smith",
      status: "checked_in",
    },
    {
      id: "apt-today-3",
      patient: "Sarah Jenkins",
      date: todayStr,
      time: "13:30",
      duration: 45,
      type: "Lab Review",
      doctor: "Dr. Patel",
      status: "scheduled",
    },
    {
      id: "apt-today-4",
      patient: "David Alvarez",
      date: todayStr,
      time: "15:00",
      duration: 60,
      type: "Consultation",
      doctor: "Dr. Adams",
      status: "confirmed",
    },
  ];

  // Week appointments on other days of the current week
  if (dMon !== todayStr) {
    list.push(
      {
        id: "apt-mon-1",
        patient: "Amanda Hayes",
        date: dMon,
        time: "09:30",
        duration: 30,
        type: "Follow-up",
        doctor: "Dr. Patel",
        status: "confirmed",
      },
      {
        id: "apt-mon-2",
        patient: "Arthur Pendelton",
        date: dMon,
        time: "11:30",
        duration: 45,
        type: "Consultation",
        doctor: "Dr. Smith",
        status: "scheduled",
      }
    );
  }

  if (dTue !== todayStr) {
    list.push(
      {
        id: "apt-tue-1",
        patient: "Robert Chen",
        date: dTue,
        time: "10:00",
        duration: 60,
        type: "Consultation",
        doctor: "Dr. Smith",
        status: "scheduled",
      },
      {
        id: "apt-tue-2",
        patient: "Elena Rostova",
        date: dTue,
        time: "14:00",
        duration: 30,
        type: "Lab Review",
        doctor: "Dr. Patel",
        status: "confirmed",
      }
    );
  }

  if (dWed !== todayStr) {
    list.push(
      {
        id: "apt-wed-1",
        patient: "Priya Sharma",
        date: dWed,
        time: "09:00",
        duration: 30,
        type: "Lab Review",
        doctor: "Dr. Patel",
        status: "confirmed",
      },
      {
        id: "apt-wed-2",
        patient: "Lucas Meyer",
        date: dWed,
        time: "13:00",
        duration: 45,
        type: "Consultation",
        doctor: "Dr. Adams",
        status: "scheduled",
      }
    );
  }

  if (dThu !== todayStr) {
    list.push(
      {
        id: "apt-thu-1",
        patient: "James Wilson",
        date: dThu,
        time: "11:00",
        duration: 60,
        type: "Consultation",
        doctor: "Dr. Smith",
        status: "scheduled",
      },
      {
        id: "apt-thu-2",
        patient: "Sophia Taylor",
        date: dThu,
        time: "15:30",
        duration: 30,
        type: "Follow-up",
        doctor: "Dr. Adams",
        status: "confirmed",
      }
    );
  }

  if (dFri !== todayStr) {
    list.push(
      {
        id: "apt-fri-1",
        patient: "Clara Oswald",
        date: dFri,
        time: "10:00",
        duration: 45,
        type: "Follow-up",
        doctor: "Dr. Patel",
        status: "scheduled",
      },
      {
        id: "apt-fri-2",
        patient: "Nathan Drake",
        date: dFri,
        time: "14:30",
        duration: 30,
        type: "Lab Review",
        doctor: "Dr. Adams",
        status: "confirmed",
      }
    );
  }

  if (dSat !== todayStr) {
    list.push({
      id: "apt-sat-1",
      patient: "Zoe Saldana",
      date: dSat,
      time: "09:30",
      duration: 60,
      type: "Consultation",
      doctor: "Dr. Smith",
      status: "scheduled",
    });
  }

  // Month appointments on other dates
  const otherDates = [mDay4, mDay10, mDay18, mDay24, mNearEnd].filter(
    (d) => d !== todayStr && d !== dMon && d !== dTue && d !== dWed && d !== dThu && d !== dFri && d !== dSat
  );

  if (otherDates.length > 0) {
    list.push(
      {
        id: "apt-m-1",
        patient: "Benjamin Sisko",
        date: otherDates[0],
        time: "09:00",
        duration: 45,
        type: "Consultation",
        doctor: "Dr. Smith",
        status: "scheduled",
      },
      {
        id: "apt-m-2",
        patient: "Kira Nerys",
        date: otherDates[0],
        time: "11:00",
        duration: 30,
        type: "Follow-up",
        doctor: "Dr. Patel",
        status: "confirmed",
      },
      {
        id: "apt-m-3",
        patient: "Jadzia Dax",
        date: otherDates[0],
        time: "14:00",
        duration: 30,
        type: "Lab Review",
        doctor: "Dr. Patel",
        status: "scheduled",
      }
    );
  }

  if (otherDates.length > 1) {
    list.push(
      {
        id: "apt-m-4",
        patient: "Miles O'Brien",
        date: otherDates[1],
        time: "10:30",
        duration: 60,
        type: "Consultation",
        doctor: "Dr. Adams",
        status: "scheduled",
      },
      {
        id: "apt-m-5",
        patient: "Keiko O'Brien",
        date: otherDates[1],
        time: "13:30",
        duration: 30,
        type: "Follow-up",
        doctor: "Dr. Smith",
        status: "confirmed",
      }
    );
  }

  if (otherDates.length > 2) {
    list.push({
      id: "apt-m-6",
      patient: "Julian Bashir",
      date: otherDates[2],
      time: "11:00",
      duration: 45,
      type: "Lab Review",
      doctor: "Dr. Patel",
      status: "scheduled",
    });
  }

  return list;
}

const INITIAL_APPOINTMENTS: Appointment[] = getInitialAppointments();

export default function CalendarPage() {
  const [view, setView] = useState<CalendarView>("week");
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [appointments, setAppointments] = useState<Appointment[]>(INITIAL_APPOINTMENTS);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  // New Appointment Modal State
  const [isNewDialogOpen, setIsNewDialogOpen] = useState<boolean>(false);
  const [newPatient, setNewPatient] = useState<string>("");
  const [newDoctor, setNewDoctor] = useState<string>("Dr. Smith");
  const [newDate, setNewDate] = useState<Date>(() => new Date());
  const [isDatePickerOpen, setIsDatePickerOpen] = useState<boolean>(false);
  const [newTime, setNewTime] = useState<string>("09:00");
  const [newDuration, setNewDuration] = useState<number>(30);
  const [newType, setNewType] = useState<AppointmentType>("Consultation");

  // Reschedule Modal State
  const [isRescheduleOpen, setIsRescheduleOpen] = useState<boolean>(false);
  const [rescheduleDate, setRescheduleDate] = useState<Date>(() => new Date());
  const [isRescheduleDatePickerOpen, setIsRescheduleDatePickerOpen] = useState<boolean>(false);
  const [rescheduleTime, setRescheduleTime] = useState<string>("09:00");

  // Calculate week dates (Mon-Sat, 6 days) based on currentDate
  const weekDays = useMemo(() => {
    const monday = startOfWeek(currentDate, { weekStartsOn: 1 });
    return [0, 1, 2, 3, 4, 5].map((offset) => {
      const d = addDays(monday, offset);
      return {
        date: d,
        dateStr: format(d, "yyyy-MM-dd"),
        dayAbbrev: format(d, "EEE"),
        dayName: format(d, "EEEE"),
        dayNumber: format(d, "d"),
        isToday: isToday(d),
      };
    });
  }, [currentDate]);

  // Calculate full month grid (7 columns Mon-Sun) for currentDate
  const monthDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [currentDate]);

  // Header range / date text depending on view
  const navigationTitle = useMemo(() => {
    if (view === "day") {
      return format(currentDate, "EEEE, MMMM d, yyyy");
    }
    if (view === "week") {
      if (weekDays.length === 0) return "";
      const start = weekDays[0].date;
      const end = weekDays[weekDays.length - 1].date;
      const startMonth = format(start, "MMM");
      const endMonth = format(end, "MMM");
      const year = format(end, "yyyy");

      if (startMonth === endMonth) {
        return `${startMonth} ${format(start, "d")} – ${format(end, "d")}, ${year}`;
      }
      return `${startMonth} ${format(start, "d")} – ${endMonth} ${format(end, "d")}, ${year}`;
    }
    return format(currentDate, "MMMM yyyy");
  }, [view, currentDate, weekDays]);

  // Total appointments in currently viewed month
  const monthAppointmentsCount = useMemo(() => {
    return appointments.filter((apt) => isSameMonth(parseDateString(apt.date), currentDate)).length;
  }, [appointments, currentDate]);

  // Appointments for day view
  const dayAppointments = useMemo(() => {
    const selectedDateStr = format(currentDate, "yyyy-MM-dd");
    return appointments.filter((apt) => apt.date === selectedDateStr);
  }, [appointments, currentDate]);

  // Current time offset for day and week indicators
  const now = new Date();
  const currentHour = getHours(now);
  const currentMinute = getMinutes(now);
  const currentTimeOffset = (currentHour - 8) * 60 + currentMinute;
  const isCurrentDateToday = isToday(currentDate);
  const showDayCurrentTime = isCurrentDateToday && currentTimeOffset >= 0 && currentTimeOffset <= 600;

  const handlePrevious = () => {
    if (view === "day") {
      setCurrentDate((prev) => subDays(prev, 1));
    } else if (view === "week") {
      setCurrentDate((prev) => subWeeks(prev, 1));
    } else {
      setCurrentDate((prev) => subMonths(prev, 1));
    }
  };

  const handleNext = () => {
    if (view === "day") {
      setCurrentDate((prev) => addDays(prev, 1));
    } else if (view === "week") {
      setCurrentDate((prev) => addWeeks(prev, 1));
    } else {
      setCurrentDate((prev) => addMonths(prev, 1));
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleCheckIn = () => {
    if (!selectedAppointment) return;
    const updated = appointments.map((apt) =>
      apt.id === selectedAppointment.id
        ? { ...apt, status: "checked_in" as AppointmentStatus }
        : apt
    );
    setAppointments(updated);
    setSelectedAppointment({
      ...selectedAppointment,
      status: "checked_in",
    });
  };

  const handleCancel = () => {
    if (!selectedAppointment) return;
    const updated = appointments.map((apt) =>
      apt.id === selectedAppointment.id
        ? { ...apt, status: "cancelled" as AppointmentStatus }
        : apt
    );
    setAppointments(updated);
    setSelectedAppointment({
      ...selectedAppointment,
      status: "cancelled",
    });
  };

  const openRescheduleModal = () => {
    if (!selectedAppointment) return;
    setRescheduleDate(parseDateString(selectedAppointment.date));
    setRescheduleTime(selectedAppointment.time);
    setIsRescheduleOpen(true);
  };

  const handleRescheduleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppointment) return;

    const updatedApt: Appointment = {
      ...selectedAppointment,
      date: format(rescheduleDate, "yyyy-MM-dd"),
      time: rescheduleTime,
      status: "scheduled",
    };

    setAppointments((prev) =>
      prev.map((apt) => (apt.id === selectedAppointment.id ? updatedApt : apt))
    );
    setSelectedAppointment(updatedApt);
    setIsRescheduleOpen(false);
  };

  const handleCreateAppointment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatient.trim()) return;

    const newApt: Appointment = {
      id: String(Date.now()),
      patient: newPatient.trim(),
      date: format(newDate, "yyyy-MM-dd"),
      time: newTime,
      duration: Number(newDuration),
      type: newType,
      doctor: newDoctor,
      status: "scheduled",
    };

    setAppointments((prev) => [...prev, newApt]);
    setSelectedAppointment(newApt);
    setIsNewDialogOpen(false);

    // Reset Form
    setNewPatient("");
    setNewDate(new Date());
    setNewTime("09:00");
    setNewDuration(30);
    setNewType("Consultation");
    setNewDoctor("Dr. Smith");
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1600px] mx-auto pb-10">
      {/* 1. HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Schedule
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage clinic appointments, patient check-ins, and practitioner calendars.
          </p>
        </div>

        {/* Action Controls Header */}
        <div className="flex flex-wrap items-center gap-3">
          {/* View Toggle */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100/80 p-0.5">
            <Button
              variant={view === "day" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("day")}
              className={cn(
                "h-8 px-3 text-xs font-medium cursor-pointer transition-all",
                view === "day"
                  ? "bg-white text-slate-900 shadow-xs hover:bg-white"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              Day
            </Button>
            <Button
              variant={view === "week" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("week")}
              className={cn(
                "h-8 px-3 text-xs font-medium cursor-pointer transition-all",
                view === "week"
                  ? "bg-white text-slate-900 shadow-xs hover:bg-white"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              Week
            </Button>
            <Button
              variant={view === "month" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("month")}
              className={cn(
                "h-8 px-3 text-xs font-medium cursor-pointer transition-all",
                view === "month"
                  ? "bg-white text-slate-900 shadow-xs hover:bg-white"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              Month
            </Button>
          </div>

          {/* Date Navigation */}
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-1 shadow-xs">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handlePrevious}
              className="size-7 cursor-pointer text-slate-600 hover:text-slate-900"
              aria-label={
                view === "day"
                  ? "Previous day"
                  : view === "week"
                  ? "Previous week"
                  : "Previous month"
              }
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToday}
              className="h-7 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleNext}
              className="size-7 cursor-pointer text-slate-600 hover:text-slate-900"
              aria-label={
                view === "day"
                  ? "Next day"
                  : view === "week"
                  ? "Next week"
                  : "Next month"
              }
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-800">
            <CalendarIcon className="size-4 text-slate-500" />
            <span>{navigationTitle}</span>
          </div>

          {/* New Appointment Button */}
          <Button
            onClick={() => {
              setNewDate(currentDate);
              setIsNewDialogOpen(true);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm gap-1.5 cursor-pointer ml-auto sm:ml-0"
          >
            <Plus className="size-4" />
            <span>New Appointment</span>
          </Button>
        </div>
      </div>

      {/* Main Calendar Viewport + Conditional Detail Panel */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Calendar Area */}
        <div className="flex-1 min-w-0 w-full">
          {/* WEEK VIEW (6 Columns: Mon-Sat) */}
          {view === "week" && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
              <div className="min-w-[840px]">
                {/* Header Row: Time Column + 6 Day Columns (Mon-Sat) */}
                <div className="grid grid-cols-[72px_repeat(6,1fr)] border-b border-slate-200 bg-slate-50/70 select-none">
                  <div className="p-3 text-center text-xs font-semibold text-slate-400 border-r border-slate-200 flex items-center justify-center">
                    <Clock className="size-4" />
                  </div>
                  {weekDays.map((day) => {
                    const count = appointments.filter(
                      (apt) => apt.date === day.dateStr
                    ).length;

                    return (
                      <div
                        key={day.dateStr}
                        onClick={() => {
                          setCurrentDate(day.date);
                          setView("day");
                        }}
                        className={cn(
                          "p-2.5 text-center border-r border-slate-200 last:border-r-0 cursor-pointer transition-colors hover:bg-slate-100/70 group",
                          day.isToday && "bg-blue-50/70 hover:bg-blue-100/60"
                        )}
                        title={`Switch to Day view for ${day.dayName}, ${format(day.date, "MMM d")}`}
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                            {day.dayAbbrev}
                          </span>
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[10px] px-1.5 py-0 h-4 font-semibold",
                              day.isToday
                                ? "bg-blue-200/80 text-blue-800"
                                : count > 0
                                ? "bg-slate-200 text-slate-700"
                                : "bg-slate-100 text-slate-400"
                            )}
                          >
                            {count}
                          </Badge>
                        </div>
                        <div className="mt-1 flex items-center justify-center">
                          <span
                            className={cn(
                              "flex size-7 items-center justify-center rounded-full text-sm font-bold transition-transform group-hover:scale-105",
                              day.isToday
                                ? "bg-blue-600 text-white shadow-xs"
                                : "text-slate-800"
                            )}
                          >
                            {day.dayNumber}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Calendar Body: CSS Grid with 1 time column + 6 day columns */}
                <div className="grid grid-cols-[72px_repeat(6,1fr)] relative">
                  {/* Left Column: Time slots 8:00 AM to 5:00 PM */}
                  <div className="border-r border-slate-200 bg-slate-50/20 select-none">
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        className="h-[60px] border-b border-slate-100 pr-2 text-right relative"
                      >
                        <span className="text-[11px] font-medium text-slate-400 select-none -translate-y-2.5 inline-block">
                          {formatHour(hour)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* 6 Day Columns (Mon-Sat) */}
                  {weekDays.map((day) => {
                    const dayAppointments = appointments.filter(
                      (apt) => apt.date === day.dateStr
                    );

                    return (
                      <div
                        key={day.dateStr}
                        className={cn(
                          "relative border-r border-slate-200 last:border-r-0 h-[600px]",
                          day.isToday && "bg-blue-50/30"
                        )}
                      >
                        {/* 10 hour background slots */}
                        {HOURS.map((hour) => (
                          <div
                            key={hour}
                            className="h-[60px] border-b border-slate-100 hover:bg-slate-50/40 transition-colors"
                          />
                        ))}

                        {/* Red line indicator for current time if today */}
                        {day.isToday && showDayCurrentTime && (
                          <div
                            className="absolute left-0 right-0 border-t-2 border-red-500 z-20 pointer-events-none"
                            style={{ top: `${currentTimeOffset}px` }}
                          >
                            <span className="absolute -left-1 -top-1 size-2 rounded-full bg-red-500" />
                          </div>
                        )}

                        {/* Absolutely positioned appointment cards */}
                        {dayAppointments.map((apt) => {
                          const top = getTopOffset(apt.time);
                          const height = getHeight(apt.duration);
                          const isSelected = selectedAppointment?.id === apt.id;

                          return (
                            <div
                              key={apt.id}
                              onClick={() => setSelectedAppointment(apt)}
                              style={{
                                top: `${top}px`,
                                height: `${height}px`,
                              }}
                              className={cn(
                                "absolute left-1 right-1 rounded-lg p-2 cursor-pointer transition-all z-10 select-none overflow-hidden flex flex-col justify-between border shadow-2xs",
                                getCardColorClasses(apt.type),
                                isSelected &&
                                  "ring-2 ring-blue-600 shadow-md ring-offset-1 z-20",
                                apt.status === "cancelled" &&
                                  "opacity-50 grayscale-40"
                              )}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-semibold text-xs leading-tight truncate">
                                    {apt.patient}
                                  </span>
                                  {apt.status === "in_progress" && (
                                    <span className="size-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                                  )}
                                </div>
                                <div className="flex items-center gap-1 text-[11px] opacity-80 mt-0.5 truncate">
                                  <Clock className="size-3 shrink-0" />
                                  <span>{getTimeRange(apt.time, apt.duration)}</span>
                                </div>
                              </div>
                              <div className="text-[10px] font-medium tracking-tight opacity-80 truncate">
                                {apt.type}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* DAY VIEW (Hourly timeline 8AM-6PM, 60px/hour) */}
          {view === "day" && (
            <div className="flex flex-col gap-4">
              {/* Day Selector Quick Pills (Mon-Sat of the week) */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {weekDays.map((day) => {
                  const isSelected = isSameDay(day.date, currentDate);
                  const count = appointments.filter(
                    (apt) => apt.date === day.dateStr
                  ).length;

                  return (
                    <Button
                      key={day.dateStr}
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentDate(day.date)}
                      className={cn(
                        "cursor-pointer font-medium text-xs gap-1.5 transition-all",
                        isSelected
                          ? "bg-blue-600 text-white shadow-xs hover:bg-blue-700"
                          : "text-slate-700 hover:bg-slate-100"
                      )}
                    >
                      <span>{day.dayName}</span>
                      <span className="opacity-80 font-normal">
                        ({format(day.date, "MMM d")})
                      </span>
                      {count > 0 && (
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px] px-1 py-0 h-4 ml-0.5",
                            isSelected
                              ? "bg-white/20 text-white"
                              : "bg-slate-100 text-slate-600"
                          )}
                        >
                          {count}
                        </Badge>
                      )}
                    </Button>
                  );
                })}
              </div>

              {/* Single Day Detailed Calendar */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
                <div className="min-w-[640px]">
                  {/* Header: [DayName], [Month DD] — X appointments */}
                  <div className="grid grid-cols-[90px_1fr] border-b border-slate-200 bg-slate-50/70 p-3 select-none">
                    <div className="text-center text-xs font-semibold text-slate-400">
                      Time
                    </div>
                    <div className="text-sm font-semibold text-slate-800 px-3">
                      {format(currentDate, "EEEE, MMMM d")} — {dayAppointments.length}{" "}
                      {dayAppointments.length === 1 ? "appointment" : "appointments"}
                    </div>
                  </div>

                  <div className="grid grid-cols-[90px_1fr] relative">
                    <div className="border-r border-slate-200 bg-slate-50/20 select-none">
                      {HOURS.map((hour) => (
                        <div
                          key={hour}
                          className="h-[60px] border-b border-slate-100 pr-3 text-right relative"
                        >
                          <span className="text-[11px] font-medium text-slate-400 select-none -translate-y-2.5 inline-block">
                            {formatHour(hour)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="relative h-[600px]">
                      {HOURS.map((hour) => (
                        <div
                          key={hour}
                          className="h-[60px] border-b border-slate-100 hover:bg-slate-50/40 transition-colors"
                        />
                      ))}

                      {/* Current time red horizontal line */}
                      {showDayCurrentTime && (
                        <div
                          className="absolute left-0 right-0 border-t-2 border-red-500 z-20 pointer-events-none"
                          style={{ top: `${currentTimeOffset}px` }}
                        >
                          <span className="absolute -left-1.5 -top-1.5 size-3 rounded-full bg-red-500" />
                          <span className="absolute left-2 -top-5 text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 shadow-2xs">
                            Current Time ({format(now, "h:mm a")})
                          </span>
                        </div>
                      )}

                      {dayAppointments.map((apt) => {
                        const top = getTopOffset(apt.time);
                        const height = getHeight(apt.duration);
                        const isSelected = selectedAppointment?.id === apt.id;

                        return (
                          <div
                            key={apt.id}
                            onClick={() => setSelectedAppointment(apt)}
                            style={{
                              top: `${top}px`,
                              height: `${height}px`,
                            }}
                            className={cn(
                              "absolute left-3 right-3 rounded-lg p-2.5 cursor-pointer transition-all z-10 select-none overflow-hidden flex flex-row items-center justify-between border shadow-2xs",
                              getCardColorClasses(apt.type),
                              isSelected &&
                                "ring-2 ring-blue-600 shadow-md ring-offset-1 z-20",
                              apt.status === "cancelled" &&
                                "opacity-50 grayscale-40"
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <Avatar className="size-8 border border-white/50 bg-white/80 shrink-0">
                                <AvatarFallback className="text-xs font-semibold">
                                  {getInitials(apt.patient)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-sm leading-tight text-slate-900 truncate">
                                    {apt.patient}
                                  </span>
                                  {renderStatusBadge(apt.status)}
                                </div>
                                <div className="flex items-center gap-3 text-xs opacity-80 mt-0.5">
                                  <span className="flex items-center gap-1">
                                    <Clock className="size-3" />
                                    {getTimeRange(apt.time, apt.duration)}
                                  </span>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <Stethoscope className="size-3" />
                                    {apt.doctor}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <Badge
                              variant="secondary"
                              className={getTypeBadgeColor(apt.type)}
                            >
                              {apt.type}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MONTH VIEW (7x5 or 7x6 Calendar Grid) */}
          {view === "month" && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {format(currentDate, "MMMM yyyy")} Overview
                  </h3>
                  <p className="text-xs text-slate-500">
                    Showing scheduled clinics and appointment counts across the month. Click any date to open its timeline.
                  </p>
                </div>
                <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700 font-medium">
                  {monthAppointmentsCount} Total Appointments
                </Badge>
              </div>

              {/* 7-column weekday headers (Mon-Sun) */}
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80 rounded-t-lg select-none text-center py-2 text-xs font-semibold text-slate-600">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((dayName) => (
                  <div key={dayName} className="uppercase tracking-wider">
                    {dayName}
                  </div>
                ))}
              </div>

              {/* Full Calendar Month Grid Cells */}
              <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-b-lg overflow-hidden border-x border-b border-slate-200">
                {monthDays.map((day) => {
                  const dayStr = format(day, "yyyy-MM-dd");
                  const dayApts = appointments.filter((a) => a.date === dayStr);
                  const isCurrentMonth = isSameMonth(day, currentDate);
                  const dayIsToday = isToday(day);

                  return (
                    <Tooltip key={dayStr}>
                      <TooltipTrigger
                        render={
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setCurrentDate(day);
                              setView("day");
                            }}
                            className={cn(
                              "min-h-[105px] p-2 flex flex-col justify-between transition-colors cursor-pointer text-left focus:outline-none select-none",
                              isCurrentMonth
                                ? "bg-white hover:bg-slate-50/90"
                                : "bg-slate-50/70 text-slate-400 hover:bg-slate-100/70",
                              dayIsToday && "ring-2 ring-blue-500 ring-inset bg-blue-50/20"
                            )}
                          >
                            <div>
                              <div className="flex items-center justify-between">
                                <span
                                  className={cn(
                                    "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                                    dayIsToday
                                      ? "bg-blue-600 text-white font-bold shadow-xs"
                                      : isCurrentMonth
                                      ? "text-slate-800"
                                      : "text-slate-400"
                                  )}
                                >
                                  {format(day, "d")}
                                </span>

                                {/* Count badge if > 2 */}
                                {dayApts.length > 2 && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] px-1.5 py-0 h-4 bg-slate-100 text-slate-700 font-semibold"
                                  >
                                    {dayApts.length}
                                  </Badge>
                                )}
                              </div>

                              {/* Colored dots: blue=Consultation, teal=Follow-up, purple=Lab Review */}
                              {dayApts.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                  {dayApts.slice(0, 4).map((apt) => (
                                    <span
                                      key={apt.id}
                                      className={cn(
                                        "size-2 rounded-full",
                                        getTypeDotColor(apt.type)
                                      )}
                                    />
                                  ))}
                                  {dayApts.length > 4 && (
                                    <span className="text-[9px] text-slate-400 font-medium">
                                      +{dayApts.length - 4}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Small preview of up to 2 appointments */}
                            <div className="space-y-1 mt-1">
                              {dayApts.slice(0, 2).map((apt) => (
                                <div
                                  key={apt.id}
                                  className={cn(
                                    "text-[10px] px-1.5 py-0.5 rounded truncate font-medium border leading-tight",
                                    getCardColorClasses(apt.type)
                                  )}
                                >
                                  {apt.time} {apt.patient}
                                </div>
                              ))}
                              {dayApts.length > 2 && (
                                <div className="text-[10px] text-slate-500 font-medium pl-0.5">
                                  +{dayApts.length - 2} more
                                </div>
                              )}
                            </div>
                          </div>
                        }
                      />
                      <TooltipContent
                        side="top"
                        className="bg-slate-900 text-white p-2.5 rounded-lg shadow-xl max-w-xs border border-slate-800"
                      >
                        <div className="font-semibold text-xs mb-1.5 pb-1 border-b border-slate-800 text-slate-200">
                          {format(day, "EEEE, MMMM d, yyyy")}
                        </div>
                        {dayApts.length > 0 ? (
                          <div className="space-y-1.5">
                            {dayApts.map((apt) => (
                              <div
                                key={apt.id}
                                className="flex items-center justify-between gap-3 text-[11px]"
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span
                                    className={cn(
                                      "size-2 rounded-full shrink-0",
                                      getTypeDotColor(apt.type)
                                    )}
                                  />
                                  <span className="font-medium text-slate-100 truncate">
                                    {apt.patient}
                                  </span>
                                </div>
                                <div className="text-slate-400 text-[10px] shrink-0">
                                  {apt.time} • {apt.type}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400 italic">
                            No appointments scheduled
                          </div>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 3. RIGHT DETAIL PANEL (Conditional, ~320px) */}
        {selectedAppointment && (
          <Card className="w-full lg:w-[320px] shrink-0 border-slate-200 shadow-sm transition-all duration-200">
            <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900">
                  Appointment Details
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ref: {selectedAppointment.id}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setSelectedAppointment(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="size-4" />
                <span className="sr-only">Close</span>
              </Button>
            </CardHeader>
            <CardContent className="pt-4 space-y-4 text-sm">
              {/* Patient Name + Avatar */}
              <div className="flex items-center gap-3">
                <Avatar className="size-12 border border-slate-200 bg-blue-50">
                  <AvatarFallback className="bg-blue-100 font-semibold text-blue-700 text-sm">
                    {getInitials(selectedAppointment.patient)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <h4 className="font-semibold text-slate-900 text-base leading-tight truncate">
                    {selectedAppointment.patient}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Verified Patient
                  </p>
                </div>
              </div>

              <Separator />

              {/* Date, Time & Duration, Type, Doctor, Status */}
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <CalendarDays className="size-3.5 text-slate-400" />
                    Date
                  </span>
                  <span className="font-medium text-slate-800">
                    {format(parseDateString(selectedAppointment.date), "EEE, MMM d, yyyy")}
                  </span>
                </div>

                <div className="flex items-start justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <Clock className="size-3.5 text-slate-400" />
                    Time & Duration
                  </span>
                  <div className="text-right font-medium text-slate-800">
                    <div>
                      {getTimeRange(
                        selectedAppointment.time,
                        selectedAppointment.duration
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500 font-normal">
                      {selectedAppointment.duration} mins
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <User className="size-3.5 text-slate-400" />
                    Doctor Assigned
                  </span>
                  <span className="font-medium text-slate-800">
                    {selectedAppointment.doctor}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Type</span>
                  <Badge
                    variant="secondary"
                    className={getTypeBadgeColor(selectedAppointment.type)}
                  >
                    {selectedAppointment.type}
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Status</span>
                  {renderStatusBadge(selectedAppointment.status)}
                </div>
              </div>

              <Separator />

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer"
                  onClick={handleCheckIn}
                  disabled={
                    selectedAppointment.status === "checked_in" ||
                    selectedAppointment.status === "in_progress" ||
                    selectedAppointment.status === "completed" ||
                    selectedAppointment.status === "cancelled"
                  }
                >
                  <CheckCircle2 className="size-4 mr-1" />
                  {selectedAppointment.status === "checked_in"
                    ? "Checked In"
                    : "Check In"}
                </Button>

                <Button
                  variant="outline"
                  className="w-full border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer"
                  onClick={openRescheduleModal}
                >
                  <RotateCcw className="size-3.5 mr-1 text-slate-500" />
                  Reschedule
                </Button>

                <Button
                  variant="outline"
                  className="w-full border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 cursor-pointer"
                  onClick={handleCancel}
                  disabled={selectedAppointment.status === "cancelled"}
                >
                  <AlertCircle className="size-3.5 mr-1" />
                  {selectedAppointment.status === "cancelled"
                    ? "Cancelled"
                    : "Cancel"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* NEW APPOINTMENT DIALOG (With Date Picker using shadcn Calendar + Popover) */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-slate-900">
              New Appointment
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Book a patient consultation, follow-up, or laboratory review session.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateAppointment} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Patient Name
              </label>
              <Input
                required
                placeholder="e.g. Clara Oswald"
                value={newPatient}
                onChange={(e) => setNewPatient(e.target.value)}
                className="h-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Doctor
                </label>
                <select
                  value={newDoctor}
                  onChange={(e) => setNewDoctor(e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-900 shadow-2xs focus:border-blue-500 focus:outline-none"
                >
                  <option value="Dr. Smith">Dr. Smith</option>
                  <option value="Dr. Patel">Dr. Patel</option>
                  <option value="Dr. Adams">Dr. Adams</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Type
                </label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as AppointmentType)}
                  className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-900 shadow-2xs focus:border-blue-500 focus:outline-none"
                >
                  <option value="Consultation">Consultation</option>
                  <option value="Follow-up">Follow-up</option>
                  <option value="Lab Review">Lab Review</option>
                </select>
              </div>
            </div>

            {/* Date Picker using Popover + Calendar */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Appointment Date
              </label>
              <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal h-9 text-xs cursor-pointer border-slate-200",
                        !newDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 size-3.5 text-slate-500" />
                      {newDate ? format(newDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  }
                />
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={newDate}
                    onSelect={(date) => {
                      if (date) {
                        setNewDate(date);
                        setIsDatePickerOpen(false);
                      }
                    }}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Time Slot
                </label>
                <select
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-900 shadow-2xs focus:border-blue-500 focus:outline-none"
                >
                  <option value="08:00">08:00 AM</option>
                  <option value="08:30">08:30 AM</option>
                  <option value="09:00">09:00 AM</option>
                  <option value="09:30">09:30 AM</option>
                  <option value="10:00">10:00 AM</option>
                  <option value="10:30">10:30 AM</option>
                  <option value="11:00">11:00 AM</option>
                  <option value="11:30">11:30 AM</option>
                  <option value="12:00">12:00 PM</option>
                  <option value="13:00">01:00 PM</option>
                  <option value="13:30">01:30 PM</option>
                  <option value="14:00">02:00 PM</option>
                  <option value="14:30">02:30 PM</option>
                  <option value="15:00">03:00 PM</option>
                  <option value="15:30">03:30 PM</option>
                  <option value="16:00">04:00 PM</option>
                  <option value="16:30">04:30 PM</option>
                  <option value="17:00">05:00 PM</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Duration
                </label>
                <select
                  value={newDuration}
                  onChange={(e) => setNewDuration(Number(e.target.value))}
                  className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-900 shadow-2xs focus:border-blue-500 focus:outline-none"
                >
                  <option value={30}>30 mins</option>
                  <option value={45}>45 mins</option>
                  <option value={60}>60 mins</option>
                </select>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsNewDialogOpen(false)}
                className="cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
              >
                Create Appointment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* RESCHEDULE DIALOG (With Date Picker using shadcn Calendar + Popover) */}
      <Dialog open={isRescheduleOpen} onOpenChange={setIsRescheduleOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-slate-900">
              Reschedule Appointment
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Select a new date and time for {selectedAppointment?.patient}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRescheduleSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                New Date
              </label>
              <Popover
                open={isRescheduleDatePickerOpen}
                onOpenChange={setIsRescheduleDatePickerOpen}
              >
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start text-left font-normal h-9 text-xs cursor-pointer border-slate-200"
                    >
                      <CalendarIcon className="mr-2 size-3.5 text-slate-500" />
                      {format(rescheduleDate, "PPP")}
                    </Button>
                  }
                />
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={rescheduleDate}
                    onSelect={(date) => {
                      if (date) {
                        setRescheduleDate(date);
                        setIsRescheduleDatePickerOpen(false);
                      }
                    }}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                New Time Slot
              </label>
              <select
                value={rescheduleTime}
                onChange={(e) => setRescheduleTime(e.target.value)}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-900 shadow-2xs focus:border-blue-500 focus:outline-none"
              >
                <option value="08:00">08:00 AM</option>
                <option value="08:30">08:30 AM</option>
                <option value="09:00">09:00 AM</option>
                <option value="09:30">09:30 AM</option>
                <option value="10:00">10:00 AM</option>
                <option value="10:30">10:30 AM</option>
                <option value="11:00">11:00 AM</option>
                <option value="11:30">11:30 AM</option>
                <option value="12:00">12:00 PM</option>
                <option value="13:00">01:00 PM</option>
                <option value="13:30">01:30 PM</option>
                <option value="14:00">02:00 PM</option>
                <option value="14:30">02:30 PM</option>
                <option value="15:00">03:00 PM</option>
                <option value="15:30">03:30 PM</option>
                <option value="16:00">04:00 PM</option>
                <option value="16:30">04:30 PM</option>
                <option value="17:00">05:00 PM</option>
              </select>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsRescheduleOpen(false)}
                className="cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
              >
                Confirm Reschedule
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
