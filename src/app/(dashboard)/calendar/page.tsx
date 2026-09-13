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
  time: string; // "HH:MM" in 24h format
  duration: number; // in minutes
  day: number; // 1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday
  type: AppointmentType;
  doctor: string;
  status: AppointmentStatus;
}

const INITIAL_APPOINTMENTS: Appointment[] = [
  {
    id: "1",
    patient: "Eleanor Vance",
    time: "09:00",
    duration: 45,
    day: 1,
    type: "Consultation",
    doctor: "Dr. Smith",
    status: "in_progress",
  },
  {
    id: "2",
    patient: "Marcus Brody",
    time: "10:00",
    duration: 30,
    day: 1,
    type: "Follow-up",
    doctor: "Dr. Smith",
    status: "checked_in",
  },
  {
    id: "3",
    patient: "Sarah Jenkins",
    time: "14:00",
    duration: 30,
    day: 2,
    type: "Lab Review",
    doctor: "Dr. Patel",
    status: "scheduled",
  },
  {
    id: "4",
    patient: "David Alvarez",
    time: "11:00",
    duration: 60,
    day: 2,
    type: "Consultation",
    doctor: "Dr. Smith",
    status: "scheduled",
  },
  {
    id: "5",
    patient: "Amanda Hayes",
    time: "09:30",
    duration: 30,
    day: 3,
    type: "Follow-up",
    doctor: "Dr. Patel",
    status: "confirmed",
  },
  {
    id: "6",
    patient: "Robert Chen",
    time: "15:00",
    duration: 45,
    day: 3,
    type: "Consultation",
    doctor: "Dr. Smith",
    status: "scheduled",
  },
  {
    id: "7",
    patient: "Priya Sharma",
    time: "10:00",
    duration: 30,
    day: 4,
    type: "Lab Review",
    doctor: "Dr. Patel",
    status: "confirmed",
  },
  {
    id: "8",
    patient: "James Wilson",
    time: "13:00",
    duration: 60,
    day: 5,
    type: "Consultation",
    doctor: "Dr. Smith",
    status: "scheduled",
  },
];

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri"];

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
  return Math.max(26, duration);
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

function getMondayOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

export default function CalendarPage() {
  const [view, setView] = useState<CalendarView>("week");
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(1); // For Day view
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [appointments, setAppointments] = useState<Appointment[]>(INITIAL_APPOINTMENTS);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  // New Appointment Modal State
  const [isNewDialogOpen, setIsNewDialogOpen] = useState<boolean>(false);
  const [newPatient, setNewPatient] = useState<string>("");
  const [newDoctor, setNewDoctor] = useState<string>("Dr. Smith");
  const [newDay, setNewDay] = useState<number>(1);
  const [newTime, setNewTime] = useState<string>("09:00");
  const [newDuration, setNewDuration] = useState<number>(30);
  const [newType, setNewType] = useState<AppointmentType>("Consultation");

  // Reschedule Modal State
  const [isRescheduleOpen, setIsRescheduleOpen] = useState<boolean>(false);
  const [rescheduleDay, setRescheduleDay] = useState<number>(1);
  const [rescheduleTime, setRescheduleTime] = useState<string>("09:00");

  // Calculate week dates based on weekOffset
  const weekDays = useMemo(() => {
    const baseMonday = getMondayOfWeek(new Date());
    baseMonday.setDate(baseMonday.getDate() + weekOffset * 7);

    return DAY_SHORT.map((name, i) => {
      const d = new Date(baseMonday);
      d.setDate(baseMonday.getDate() + i);
      return {
        name,
        fullName: DAY_NAMES[i],
        date: d,
        dayIndex: i + 1,
      };
    });
  }, [weekOffset]);

  const weekRangeText = useMemo(() => {
    if (weekDays.length === 0) return "";
    const start = weekDays[0].date;
    const end = weekDays[weekDays.length - 1].date;

    const startMonth = start.toLocaleString("en-US", { month: "short" });
    const endMonth = end.toLocaleString("en-US", { month: "short" });
    const year = end.getFullYear();

    if (startMonth === endMonth) {
      return `${startMonth} ${start.getDate()} – ${end.getDate()}, ${year}`;
    }
    return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}, ${year}`;
  }, [weekDays]);

  const handlePreviousWeek = () => {
    setWeekOffset((prev) => prev - 1);
  };

  const handleNextWeek = () => {
    setWeekOffset((prev) => prev + 1);
  };

  const handleToday = () => {
    setWeekOffset(0);
    const today = new Date().getDay();
    // Monday is 1, Friday is 5
    if (today >= 1 && today <= 5) {
      setSelectedDayIndex(today);
    } else {
      setSelectedDayIndex(1);
    }
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
    setRescheduleDay(selectedAppointment.day);
    setRescheduleTime(selectedAppointment.time);
    setIsRescheduleOpen(true);
  };

  const handleRescheduleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppointment) return;

    const updatedApt: Appointment = {
      ...selectedAppointment,
      day: Number(rescheduleDay),
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
      time: newTime,
      duration: Number(newDuration),
      day: Number(newDay),
      type: newType,
      doctor: newDoctor,
      status: "scheduled",
    };

    setAppointments((prev) => [...prev, newApt]);
    setSelectedAppointment(newApt);
    setIsNewDialogOpen(false);

    // Reset Form
    setNewPatient("");
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
              onClick={handlePreviousWeek}
              className="size-7 cursor-pointer text-slate-600 hover:text-slate-900"
              aria-label="Previous week"
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
              onClick={handleNextWeek}
              className="size-7 cursor-pointer text-slate-600 hover:text-slate-900"
              aria-label="Next week"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-800">
            <CalendarIcon className="size-4 text-slate-500" />
            <span>{weekRangeText}</span>
          </div>

          {/* New Appointment Button */}
          <Button
            onClick={() => setIsNewDialogOpen(true)}
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
          {view === "week" && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
              <div className="min-w-[760px]">
                {/* Header Row: 6 Columns */}
                <div className="grid grid-cols-6 border-b border-slate-200 bg-slate-50/70 select-none">
                  <div className="p-3 text-center text-xs font-semibold text-slate-400 border-r border-slate-200 flex items-center justify-center">
                    <Clock className="size-4" />
                  </div>
                  {weekDays.map((day) => {
                    const isToday = isSameDay(day.date, new Date());
                    return (
                      <div
                        key={day.name}
                        className={cn(
                          "p-3 text-center border-r border-slate-200 last:border-r-0 transition-colors",
                          isToday && "bg-blue-50/60"
                        )}
                      >
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          {day.name}
                        </div>
                        <div className="mt-1 flex items-center justify-center">
                          <span
                            className={cn(
                              "flex size-7 items-center justify-center rounded-full text-sm font-bold",
                              isToday
                                ? "bg-blue-600 text-white shadow-xs"
                                : "text-slate-800"
                            )}
                          >
                            {day.date.getDate()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Calendar Body: CSS Grid with 6 columns */}
                <div className="grid grid-cols-6 relative">
                  {/* Left Column: Time slots 8:00 AM to 6:00 PM */}
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

                  {/* 5 Day Columns (Mon-Fri) */}
                  {[1, 2, 3, 4, 5].map((dayIndex) => {
                    const dayAppointments = appointments.filter(
                      (apt) => apt.day === dayIndex
                    );

                    return (
                      <div
                        key={dayIndex}
                        className="relative border-r border-slate-200 last:border-r-0 h-[600px]"
                      >
                        {/* 10 hour background slots */}
                        {HOURS.map((hour) => (
                          <div
                            key={hour}
                            className="h-[60px] border-b border-slate-100 hover:bg-slate-50/40 transition-colors"
                          />
                        ))}

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

          {/* DAY VIEW */}
          {view === "day" && (
            <div className="flex flex-col gap-4">
              {/* Day Selector Pills */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {weekDays.map((day) => (
                  <Button
                    key={day.dayIndex}
                    variant={selectedDayIndex === day.dayIndex ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedDayIndex(day.dayIndex)}
                    className={cn(
                      "cursor-pointer font-medium text-xs gap-1.5",
                      selectedDayIndex === day.dayIndex && "bg-blue-600 text-white"
                    )}
                  >
                    <span>{day.fullName}</span>
                    <span className="opacity-80">({day.date.getDate()})</span>
                  </Button>
                ))}
              </div>

              {/* Single Day Detailed Calendar */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
                <div className="min-w-[600px]">
                  <div className="grid grid-cols-[90px_1fr] border-b border-slate-200 bg-slate-50/70 p-3 select-none">
                    <div className="text-center text-xs font-semibold text-slate-400">
                      Time
                    </div>
                    <div className="text-sm font-semibold text-slate-800 px-3">
                      {DAY_NAMES[selectedDayIndex - 1]} Schedule
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

                      {appointments
                        .filter((apt) => apt.day === selectedDayIndex)
                        .map((apt) => {
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

          {/* MONTH VIEW */}
          {view === "month" && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Monthly Overview
                  </h3>
                  <p className="text-xs text-slate-500">
                    Showing scheduled clinics and appointment counts across weeks.
                  </p>
                </div>
                <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700">
                  {appointments.length} Total Appointments
                </Badge>
              </div>

              <div className="grid grid-cols-5 gap-3">
                {weekDays.map((day) => {
                  const dayApts = appointments.filter((a) => a.day === day.dayIndex);
                  return (
                    <Card
                      key={day.dayIndex}
                      className="border-slate-200 shadow-2xs hover:border-blue-300 transition-all cursor-pointer"
                      onClick={() => {
                        setSelectedDayIndex(day.dayIndex);
                        setView("day");
                      }}
                    >
                      <CardHeader className="p-3 pb-2 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between space-y-0">
                        <span className="text-xs font-semibold text-slate-700">
                          {day.fullName}
                        </span>
                        <span className="text-xs font-bold text-blue-600">
                          {day.date.getDate()}
                        </span>
                      </CardHeader>
                      <CardContent className="p-3 space-y-2">
                        <div className="text-xs text-slate-500 font-medium">
                          {dayApts.length}{" "}
                          {dayApts.length === 1 ? "appointment" : "appointments"}
                        </div>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {dayApts.map((apt) => (
                            <div
                              key={apt.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAppointment(apt);
                              }}
                              className={cn(
                                "text-[11px] p-1.5 rounded border leading-snug cursor-pointer",
                                getCardColorClasses(apt.type),
                                selectedAppointment?.id === apt.id &&
                                  "ring-2 ring-blue-600"
                              )}
                            >
                              <div className="font-medium truncate">{apt.patient}</div>
                              <div className="text-[10px] opacity-75">{apt.time}</div>
                            </div>
                          ))}
                          {dayApts.length === 0 && (
                            <p className="text-[11px] italic text-slate-400 py-2 text-center">
                              No appointments
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 3. RIGHT DETAIL PANEL (Conditional, ~300px) */}
        {selectedAppointment && (
          <Card className="w-full lg:w-[320px] shrink-0 border-slate-200 shadow-sm transition-all duration-200">
            <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900">
                  Appointment Details
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  ID: #{selectedAppointment.id.padStart(4, "0")}
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
                    Patient #{1020 + Number(selectedAppointment.id)}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Time & Duration, Type, Doctor, Status */}
              <div className="space-y-3 text-xs">
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
                    <CalendarDays className="size-3.5 text-slate-400" />
                    Day
                  </span>
                  <span className="font-medium text-slate-800">
                    {DAY_NAMES[selectedAppointment.day - 1]}
                  </span>
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

      {/* NEW APPOINTMENT DIALOG */}
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

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Day
                </label>
                <select
                  value={newDay}
                  onChange={(e) => setNewDay(Number(e.target.value))}
                  className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-900 shadow-2xs focus:border-blue-500 focus:outline-none"
                >
                  {DAY_NAMES.map((name, i) => (
                    <option key={name} value={i + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Time
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

      {/* RESCHEDULE DIALOG */}
      <Dialog open={isRescheduleOpen} onOpenChange={setIsRescheduleOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-slate-900">
              Reschedule Appointment
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Select a new day and time for {selectedAppointment?.patient}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRescheduleSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                New Day
              </label>
              <select
                value={rescheduleDay}
                onChange={(e) => setRescheduleDay(Number(e.target.value))}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-900 shadow-2xs focus:border-blue-500 focus:outline-none"
              >
                {DAY_NAMES.map((name, i) => (
                  <option key={name} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
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
