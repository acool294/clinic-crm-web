"use client";
import { supabase } from '@/lib/supabase';

import * as React from "react";
import { useState, useRef, useId, useEffect } from "react";
import {
  saveVisitRecord,
  fetchPatientVisits,
  fetchPatientUpcomingAppointment,
  uploadLabReport,
} from "@/lib/db/staff";
import { fetchPatients, type PatientRow } from "@/lib/db/patients";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  Stethoscope,
  Activity,
  FileText,
  Pill,
  FlaskConical,
  Upload,
  Trash2,
  Plus,
  Image as ImageIcon,
  Check,
  Loader2,
  X,
  User,
  Clock,
  Heart,
  Thermometer,
  Ruler,
  AlertCircle,
  Calendar,
  Sparkles,
} from "lucide-react";

interface MockPatient {
  id: string;
  name: string;
  age: number;
  gender: "Female" | "Male" | "Other";
  bloodGroup: string;
  allergies: string[];
  lastVisit: string;
  nextAppointment: {
    date: string;
    time: string;
    doctor: string;
    type: string;
    room?: string;
  };
  previousVisits: {
    id: string;
    date: string;
    doctor: string;
    department: string;
    notes: string;
  }[];
  activeMedications: {
    id: string;
    medication: string;
    dosage: string;
    frequency: string;
    prescribedDate: string;
  }[];
  defaultVitals: {
    bp: string;
    hr: string;
    temp: string;
    spo2: string;
    weight: string;
    height: string;
  };
  defaultChiefComplaint: string;
  defaultDiagnosis: string;
  defaultTreatmentPlan: string;
}



interface PrescriptionRow {
  id: string;
  medication: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}

type PatientVisit = Awaited<ReturnType<typeof fetchPatientVisits>>[number];
type ActiveMedication = PatientVisit["prescriptions"][number];

interface LabFileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  reportType: string;
  url: string;
  file?: File;
}

interface VitalsState {
  bp: string;
  hr: string;
  temp: string;
  spo2: string;
  weight: string;
  height: string;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function calculateAge(dob: string | null): number | string {
  if (!dob) return "--";
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return "--";
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 ? age : "--";
}

export default function DiagnosisPage() {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Patient selection state
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [patientList, setPatientList] = useState<PatientRow[]>([]);
  const [appointmentId, setAppointmentId] = useState<string>("");
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    fetchPatients()
      .then((list) => {
        setPatientList(list);
        if (list.length > 0) {
          setSelectedPatientId(list[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const selectedPatient =
    patientList.find((p) => p.id === selectedPatientId) ?? patientList[0] ?? null;

  

  // Sidebar states
  const [previousVisits, setPreviousVisits] = useState<PatientVisit[]>([]);
  const [activeMeds, setActiveMeds] = useState<ActiveMedication[]>([]);
  const [upcomingAppt, setUpcomingAppt] = useState<{
    date: string;
    time: string;
    doctor_name: string;
  } | null>(null);
  const [sidebarLoading, setSidebarLoading] = useState<boolean>(false);
  const [patientAppointments, setPatientAppointments] = useState<any[]>([]);

  useEffect(() => {
    if (!selectedPatient) {
      setPreviousVisits([]);
      setActiveMeds([]);
      setUpcomingAppt(null);
      return;
    }

    async function loadSidebar() {
      if (!selectedPatient) return;
      setSidebarLoading(true);
      try {
        const appt = await fetchPatientUpcomingAppointment(selectedPatient.id);
        setUpcomingAppt(appt);

        // Fetch all appointments for dropdown
        const { data: allAppts } = await supabase
          .from('appointments')
          .select('id, scheduled_at, staff_users(name)')
          .eq('patient_id', selectedPatient.auth_user_id || selectedPatient.id)
          .order('scheduled_at', { ascending: false });
        
        // Wait, appointments table links via patient_id which might be auth_user_id or the patient's row id.
        // Let's just fetch all appointments by querying clinic_patient_links.
        const { data: links } = await supabase.from('clinic_patient_links').select('id').eq('patient_id', selectedPatient.id);
        if (links && links.length > 0) {
           const linkIds = links.map((l: any) => l.id);
           const { data: realAppts } = await supabase.from('appointments')
              .select('id, scheduled_at, staff_users(name)')
              .in('clinic_patient_link_id', linkIds)
              .order('scheduled_at', { ascending: false });
           
           if (realAppts) {
              setPatientAppointments(realAppts);
              if (realAppts.length > 0 && !appointmentId) {
                setAppointmentId(realAppts[0].id);
              }
           }
        }

        const visits = await fetchPatientVisits(selectedPatient.id);
        setPreviousVisits(visits);

        const recentVisitWithMeds = visits.find(
          (v) => v.prescriptions && v.prescriptions.length > 0
        );
        if (recentVisitWithMeds) {
          setActiveMeds(recentVisitWithMeds.prescriptions);
        } else {
          setActiveMeds([]);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setSidebarLoading(false);
      }
    }
    loadSidebar();
  }, [selectedPatient]);

  // 2. Vitals state
  const [vitals, setVitals] = useState<VitalsState>({ bp: '', hr: '', temp: '', spo2: '', weight: '', height: '' });

  // 3. Clinical assessment state
  const [chiefComplaint, setChiefComplaint] = useState<string>('');
  const [diagnosis, setDiagnosis] = useState<string>('');
  const [treatmentPlan, setTreatmentPlan] = useState<string>('');

  // 4. Prescriptions state
  const [prescriptions, setPrescriptions] = useState<(PrescriptionRow & { isDeleted?: boolean })[]>([
    {
      id: "rx-init-1",
      medication: "Amoxicillin",
      dosage: "500mg",
      frequency: "3x daily",
      duration: "5 days",
      instructions: "Take 1 capsule with food and a full glass of water",
    },
    {
      id: "rx-init-2",
      medication: "Ibuprofen",
      dosage: "400mg",
      frequency: "As needed",
      duration: "3 days",
      instructions: "Take 1 tablet every 6 hours as needed for discomfort",
    },
  ]);

  // 5. Lab files state
  const [labFiles, setLabFiles] = useState<LabFileItem[]>([]);

  // 6. Saving / UI interaction state
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

  // When patient selection changes, load their baseline information
  
  // Auto-Save Draft Logic
  useEffect(() => {
    if (!selectedPatientId) return;
    const draftKey = `draft_diagnosis_${selectedPatientId}`;
    const draft = localStorage.getItem(draftKey);
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        if (parsed.vitals) setVitals(parsed.vitals);
        if (parsed.chiefComplaint !== undefined) setChiefComplaint(parsed.chiefComplaint);
        if (parsed.diagnosis !== undefined) setDiagnosis(parsed.diagnosis);
        if (parsed.treatmentPlan !== undefined) setTreatmentPlan(parsed.treatmentPlan);
        if (parsed.prescriptions) setPrescriptions(parsed.prescriptions);
      } catch (e) {
        console.error('Failed to parse draft', e);
      }
    } else {
      // Clear forms if no draft
      setVitals({ bp: '', hr: '', temp: '', spo2: '', weight: '', height: '' });
      setChiefComplaint('');
      setDiagnosis('');
      setTreatmentPlan('');
      setPrescriptions([]);
    }
  }, [selectedPatientId]);

  useEffect(() => {
    if (!selectedPatientId) return;
    const draftKey = `draft_diagnosis_${selectedPatientId}`;
    const draftData = { vitals, chiefComplaint, diagnosis, treatmentPlan, prescriptions };
    // Only save if there's actually some data
    const hasData = Object.values(vitals).some(v => v) || chiefComplaint || diagnosis || treatmentPlan || prescriptions.length > 0;
    if (hasData) {
      localStorage.setItem(draftKey, JSON.stringify(draftData));
    }
  }, [vitals, chiefComplaint, diagnosis, treatmentPlan, prescriptions, selectedPatientId]);


  const handleSelectPatient = (newPatientId: string) => {
    setSelectedPatientId(newPatientId);
    
    
  };

  // Vitals update handler
  const handleVitalChange = (field: keyof VitalsState, val: string) => {
    setVitals((prev) => ({ ...prev, [field]: val }));
  };

  // Prescription table handlers
  const handleAddPrescription = () => {
    const newRow: PrescriptionRow = {
      id: `rx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      medication: "",
      dosage: "",
      frequency: "Once daily",
      duration: "7 days",
      instructions: "",
    };
    setPrescriptions((prev) => [...prev, newRow]);
  };

  const handleUpdatePrescription = (
    id: string,
    field: keyof PrescriptionRow,
    value: string
  ) => {
    setPrescriptions((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleRemovePrescription = (id: string) => {
    setPrescriptions((prev) => prev.filter((item) => item.id !== id));
  };

  // Lab reports handlers
  const processFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const newEntries: LabFileItem[] = Array.from(fileList).map((file) => {
      const lower = file.name.toLowerCase();
      let defaultType = "Other";
      if (
        lower.includes("blood") ||
        lower.includes("cbc") ||
        lower.includes("panel") ||
        lower.includes("lipid")
      ) {
        defaultType = "Blood Test";
      } else if (lower.includes("xray") || lower.includes("x-ray")) {
        defaultType = "X-Ray";
      } else if (lower.includes("mri") || lower.includes("ct")) {
        defaultType = "MRI/CT Scan";
      } else if (lower.includes("urine") || lower.includes("urinalysis")) {
        defaultType = "Urine Test";
      } else if (lower.includes("ecg") || lower.includes("ekg")) {
        defaultType = "ECG";
      } else if (file.type.startsWith("image/")) {
        defaultType = "X-Ray";
      } else if (file.type === "application/pdf") {
        defaultType = "Blood Test";
      }

      let objectUrl = "#";
      try {
        objectUrl = URL.createObjectURL(file);
      } catch {
        objectUrl = "#";
      }

      return {
        id: `lab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        size: file.size,
        type: file.type || (lower.endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
        reportType: defaultType,
        url: objectUrl,
        file: file,
      };
    });

    setLabFiles((prev) => [...prev, ...newEntries]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(e.target.files);
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (e.dataTransfer.files) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleUpdateLabFileType = (id: string, reportType: string) => {
    setLabFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, reportType } : f))
    );
  };

  const handleRemoveLabFile = (id: string) => {
    setLabFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // Save handler
  const handleSave = async () => {
    if (!selectedPatient) {
      setSavedSuccess(false);
      setWarning("Please select a patient before saving.");
      return;
    }
    if (!appointmentId) {
      setSavedSuccess(false);
      setWarning(
        "Note: Visit records require a linked appointment. Please select an appointment ID from the Calendar."
      );
      return;
    }
    setIsSaving(true);
    setWarning(null);
    try {
      const visit = await saveVisitRecord({
        appointment_id: appointmentId,
        notes: treatmentPlan,
        chief_complaint: chiefComplaint,
        diagnosis: diagnosis,
        treatment_plan: treatmentPlan,
        vitals: {
          bp: vitals.bp,
          hr: vitals.hr,
          temp: vitals.temp,
          spo2: vitals.spo2,
          weight: vitals.weight,
          height: vitals.height,
        },
        prescriptions: prescriptions
          .filter((p) => p.medication)
          .map((p) => ({ 
            medication: p.isDeleted ? '[DELETED] ' + p.medication : p.medication, 
            dosage: p.dosage 
          })),
      });

      // NEW: Upload lab files
      if (labFiles.length > 0) {
        for (const fileObj of labFiles) {
          if (fileObj.file) {
            await uploadLabReport(
              fileObj.file,
              selectedPatient.id,
              visit.id,
              fileObj.reportType
            );
          }
        }
      }

      
      setSavedSuccess(true);
      if (selectedPatientId) {
         localStorage.removeItem(`draft_diagnosis_${selectedPatientId}`);
      }

      setTimeout(() => setSavedSuccess(false), 3000);

      // Refresh sidebar visits & active medications
      try {
        const visits = await fetchPatientVisits(selectedPatient.id);
        setPreviousVisits(visits);
        const recentVisitWithMeds = visits.find(
          (v) => v.prescriptions && v.prescriptions.length > 0
        );
        if (recentVisitWithMeds) {
          setActiveMeds(recentVisitWithMeds.prescriptions);
        } else {
          setActiveMeds([]);
        }
      } catch (refreshErr) {
        console.error("Failed to refresh visits after save:", refreshErr);
      }
    } catch {
      setWarning("Failed to save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // Initials for avatar
  const patientDisplayName = selectedPatient?.name ?? 'Unknown';
  const patientInitials =
    patientDisplayName
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "PT";

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      {/* Warning Notification */}
      {warning && (
        <div
          role="alert"
          className="fixed right-6 top-16 z-50 flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 shadow-xl shadow-amber-600/10 ring-1 ring-amber-500/20 animate-in fade-in slide-in-from-top-3 duration-300 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-600 text-white shadow-xs">
            <AlertCircle className="size-4 stroke-[2.5]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              Notice
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {warning}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setWarning(null)}
            aria-label="Dismiss warning"
            className="ml-2 rounded-md p-1 text-amber-700 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-300 dark:hover:bg-amber-900"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Top Floating Notification on Save */}
      {savedSuccess && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-6 top-16 z-50 flex items-center gap-3 rounded-xl border border-teal-300 bg-teal-50 px-4 py-3 text-slate-900 shadow-xl shadow-teal-600/10 ring-1 ring-teal-500/20 animate-in fade-in slide-in-from-top-3 duration-300 dark:border-teal-700 dark:bg-teal-950 dark:text-teal-100"
        >
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white shadow-xs">
            <Check className="size-4 stroke-[3]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-teal-900 dark:text-teal-100">
              Visit Record Saved!
            </p>
            <p className="text-xs text-teal-700 dark:text-teal-300">
              Clinical notes, vitals, and prescriptions saved for{" "}
              <span className="font-semibold">{selectedPatient?.name ?? 'Unknown'}</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSavedSuccess(false)}
            aria-label="Dismiss notification"
            className="ml-2 rounded-md p-1 text-teal-700 hover:bg-teal-100 hover:text-teal-900 dark:text-teal-300 dark:hover:bg-teal-900"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PAGE HEADER */}
      {/* ========================================================================= */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20 ring-4 ring-blue-50 dark:ring-blue-950">
            <Stethoscope className="size-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-2xl">
                Diagnosis &amp; Visit Record
              </h1>
              <Badge
                variant="outline"
                className="hidden border-blue-200 bg-blue-50/50 text-[11px] font-medium text-blue-700 sm:inline-flex dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300"
              >
                Dr. Session Active
              </Badge>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Document comprehensive examination findings, prescriptions, and diagnostic labs
            </p>
          </div>
        </div>

        {/* Patient Selector + Appointment ID + Save Button */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Patient Selector dropdown */}
          <div className="w-56 sm:w-64">
            <Select
              value={selectedPatientId}
              onValueChange={handleSelectPatient}
            >
              <SelectTrigger className="h-10 border-slate-200 bg-slate-50 text-xs font-medium focus:border-blue-600 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:focus:bg-slate-800">
                <div className="flex items-center gap-2 truncate">
                  <User className="size-3.5 text-slate-400" />
                  <SelectValue placeholder="Select patient..." />
                </div>
              </SelectTrigger>
              <SelectContent align="end" className="w-80">
                {patientList.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Appointment ID Input */}
          <div className="w-48 sm:w-56">
            <Select value={appointmentId} onValueChange={(val) => { setAppointmentId(val); if(warning) setWarning(null); }}>
              <SelectTrigger className="h-10 border-slate-200 bg-slate-50 text-xs font-medium focus:border-blue-600 focus:bg-white">
                 <SelectValue placeholder="Select Appointment..." />
              </SelectTrigger>
              <SelectContent>
                 {patientAppointments.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                       {new Date(a.scheduled_at).toLocaleString()} - Dr. {a.staff_users?.name || 'Unknown'}
                    </SelectItem>
                 ))}
                 {patientAppointments.length === 0 && (
                    <SelectItem value="none" disabled>No appointments found</SelectItem>
                 )}
              </SelectContent>
            </Select>
          </div>

          {/* Save Visit Record Primary Button */}
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="h-10 gap-2 bg-blue-600 px-4 font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-[0.99] disabled:opacity-75 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            {isSaving ? (
              <>
                <Loader2 className="size-4 animate-spin text-white" />
                <span>Saving Record...</span>
              </>
            ) : (
              <>
                <Check className="size-4" />
                <span>Save Visit Record</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Patient Selected Subheader Quick Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-2.5 text-xs text-slate-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-slate-300">
        <div className="flex items-center gap-2.5">
          <Avatar className="size-7 border border-blue-200 bg-white dark:border-blue-800">
            <AvatarFallback className="bg-blue-100 text-[10px] font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-200">
              {patientInitials}
            </AvatarFallback>
          </Avatar>
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {selectedPatient?.name ?? 'Unknown'}
          </span>
          <Badge
            variant="outline"
            className="border-blue-300 bg-white font-mono text-[10px] font-medium text-blue-700 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300"
          >
            {selectedPatient?.id ?? 'Unknown'}
          </Badge>
          <span className="text-slate-400 dark:text-slate-500">&bull;</span>
          <span className="font-medium">
            {selectedPatient
              ? `${calculateAge(selectedPatient.dob)} years old • ${selectedPatient.gender ?? 'Unknown'}` : 'Age Unknown'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
            <Clock className="size-3 text-slate-400" />
            <span>
              Last visit:{" "}
              {previousVisits.length > 0
                ? previousVisits[0].created_at.split("T")[0]
                : "None"}
            </span>
          </div>
          <Badge
            variant="secondary"
            className="border-teal-200 bg-teal-50 text-[10px] font-semibold text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300"
          >
            Blood Group: {selectedPatient?.blood_group ?? 'Unknown'}
          </Badge>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2-COLUMN MAIN CONTENT LAYOUT */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ======================================================================= */}
        {/* LEFT COLUMN (col-span-2) - 4 Clinical Cards Stacked Vertically */}
        {/* ======================================================================= */}
        <div className="space-y-6 lg:col-span-2">
          {/* ------------------------------------------------------------------- */}
          {/* CARD 1: VITAL SIGNS */}
          {/* ------------------------------------------------------------------- */}
          <Card className="border-slate-200 shadow-xs dark:border-slate-800">
            <CardHeader className="border-b border-slate-100 pb-4 dark:border-slate-800/80">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-950 dark:text-teal-400">
                    <Activity className="size-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      Vital Signs
                    </CardTitle>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Triage vitals logged at patient check-in
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className="border-emerald-200 bg-emerald-50 text-[11px] font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                >
                  <span className="mr-1.5 size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Stable Vitals
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                {/* Blood Pressure */}
                <div className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50/50 p-3 transition-colors hover:border-slate-200 dark:border-slate-800 dark:bg-slate-900/50">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="vital-bp"
                      className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      <Heart className="size-3.5 text-rose-500" />
                      <span>Blood Pressure</span>
                    </label>
                    <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
                      mmHg
                    </span>
                  </div>
                  <Input
                    id="vital-bp"
                    type="text"
                    value={vitals.bp}
                    onChange={(e) => handleVitalChange("bp", e.target.value)}
                    placeholder="120/80"
                    className="h-9 border-slate-200 bg-white text-sm font-semibold tracking-wide dark:border-slate-700 dark:bg-slate-800"
                  />
                  <p className="text-[10px] text-slate-400">Target: &lt;120/80 mmHg</p>
                </div>

                {/* Heart Rate */}
                <div className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50/50 p-3 transition-colors hover:border-slate-200 dark:border-slate-800 dark:bg-slate-900/50">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="vital-hr"
                      className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      <Activity className="size-3.5 text-blue-500" />
                      <span>Heart Rate</span>
                    </label>
                    <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
                      bpm
                    </span>
                  </div>
                  <Input
                    id="vital-hr"
                    type="text"
                    value={vitals.hr}
                    onChange={(e) => handleVitalChange("hr", e.target.value)}
                    placeholder="72"
                    className="h-9 border-slate-200 bg-white text-sm font-semibold tracking-wide dark:border-slate-700 dark:bg-slate-800"
                  />
                  <p className="text-[10px] text-slate-400">Normal resting: 60-100</p>
                </div>

                {/* Temperature */}
                <div className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50/50 p-3 transition-colors hover:border-slate-200 dark:border-slate-800 dark:bg-slate-900/50">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="vital-temp"
                      className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      <Thermometer className="size-3.5 text-amber-500" />
                      <span>Temperature</span>
                    </label>
                    <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
                      &deg;F
                    </span>
                  </div>
                  <Input
                    id="vital-temp"
                    type="text"
                    value={vitals.temp}
                    onChange={(e) => handleVitalChange("temp", e.target.value)}
                    placeholder="98.6"
                    className="h-9 border-slate-200 bg-white text-sm font-semibold tracking-wide dark:border-slate-700 dark:bg-slate-800"
                  />
                  <p className="text-[10px] text-slate-400">Normal: 97.8&deg;F - 99.1&deg;F</p>
                </div>

                {/* SpO2 */}
                <div className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50/50 p-3 transition-colors hover:border-slate-200 dark:border-slate-800 dark:bg-slate-900/50">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="vital-spo2"
                      className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      <Sparkles className="size-3.5 text-teal-500" />
                      <span>Oxygen Sat (SpO2)</span>
                    </label>
                    <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
                      %
                    </span>
                  </div>
                  <Input
                    id="vital-spo2"
                    type="text"
                    value={vitals.spo2}
                    onChange={(e) => handleVitalChange("spo2", e.target.value)}
                    placeholder="99"
                    className="h-9 border-slate-200 bg-white text-sm font-semibold tracking-wide dark:border-slate-700 dark:bg-slate-800"
                  />
                  <p className="text-[10px] text-slate-400">Normal range: 95-100%</p>
                </div>

                {/* Weight */}
                <div className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50/50 p-3 transition-colors hover:border-slate-200 dark:border-slate-800 dark:bg-slate-900/50">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="vital-weight"
                      className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      <Activity className="size-3.5 text-indigo-500" />
                      <span>Weight</span>
                    </label>
                    <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
                      kg
                    </span>
                  </div>
                  <Input
                    id="vital-weight"
                    type="text"
                    value={vitals.weight}
                    onChange={(e) => handleVitalChange("weight", e.target.value)}
                    placeholder="70"
                    className="h-9 border-slate-200 bg-white text-sm font-semibold tracking-wide dark:border-slate-700 dark:bg-slate-800"
                  />
                  <p className="text-[10px] text-slate-400">
                    BMI approx:{" "}
                    {Number(vitals.weight) && Number(vitals.height)
                      ? (
                          Number(vitals.weight) /
                          Math.pow(Number(vitals.height) / 100, 2)
                        ).toFixed(1)
                      : "--"}
                  </p>
                </div>

                {/* Height */}
                <div className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50/50 p-3 transition-colors hover:border-slate-200 dark:border-slate-800 dark:bg-slate-900/50">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="vital-height"
                      className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      <Ruler className="size-3.5 text-cyan-500" />
                      <span>Height</span>
                    </label>
                    <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
                      cm
                    </span>
                  </div>
                  <Input
                    id="vital-height"
                    type="text"
                    value={vitals.height}
                    onChange={(e) => handleVitalChange("height", e.target.value)}
                    placeholder="170"
                    className="h-9 border-slate-200 bg-white text-sm font-semibold tracking-wide dark:border-slate-700 dark:bg-slate-800"
                  />
                  <p className="text-[10px] text-slate-400">
                    {Number(vitals.height)
                      ? `${Math.floor(Number(vitals.height) / 30.48)} ft ${Math.round(
                          (Number(vitals.height) % 30.48) / 2.54
                        )} in`
                      : "--"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ------------------------------------------------------------------- */}
          {/* CARD 2: CHIEF COMPLAINT & CLINICAL ASSESSMENT */}
          {/* ------------------------------------------------------------------- */}
          <Card className="border-slate-200 shadow-xs dark:border-slate-800">
            <CardHeader className="border-b border-slate-100 pb-4 dark:border-slate-800/80">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                  <FileText className="size-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Clinical Assessment
                  </CardTitle>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Subjective complaint, objective diagnosis, and physician treatment recommendations
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              {/* Chief Complaint */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="chief-complaint"
                    className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Chief Complaint <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400">Patient&apos;s own words</span>
                </div>
                <Textarea
                  id="chief-complaint"
                  value={chiefComplaint}
                  onChange={(e) => setChiefComplaint(e.target.value)}
                  placeholder="Patient's main complaint..."
                  className="min-h-[80px] border-slate-200 bg-white leading-relaxed focus:border-blue-500 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900"
                />
              </div>

              {/* Diagnosis */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="clinical-diagnosis"
                    className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Diagnosis &amp; Clinical Findings <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400">ICD-10 / Clinical Impression</span>
                </div>
                <Textarea
                  id="clinical-diagnosis"
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  placeholder="Diagnosis and clinical findings..."
                  className="min-h-[100px] border-slate-200 bg-white leading-relaxed focus:border-blue-500 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900"
                />
              </div>

              {/* Treatment Plan */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="treatment-plan"
                    className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Treatment Plan &amp; Recommendations <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400">Next steps &amp; patient education</span>
                </div>
                <Textarea
                  id="treatment-plan"
                  value={treatmentPlan}
                  onChange={(e) => setTreatmentPlan(e.target.value)}
                  placeholder="Treatment plan and recommendations..."
                  className="min-h-[100px] border-slate-200 bg-white leading-relaxed focus:border-blue-500 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            </CardContent>
          </Card>

          {/* ------------------------------------------------------------------- */}
          {/* CARD 3: PRESCRIPTIONS */}
          {/* ------------------------------------------------------------------- */}
          <Card className="border-slate-200 shadow-xs dark:border-slate-800">
            <CardHeader className="border-b border-slate-100 pb-4 dark:border-slate-800/80">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-950 dark:text-teal-400">
                    <Pill className="size-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      Prescriptions
                    </CardTitle>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Medication orders, dosages, and administration guidelines
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddPrescription}
                  className="h-8 gap-1.5 border-teal-200 text-xs font-semibold text-teal-700 hover:bg-teal-50 hover:text-teal-800 dark:border-teal-800 dark:text-teal-300 dark:hover:bg-teal-950"
                >
                  <Plus className="size-3.5" />
                  <span>Add Medication</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 dark:bg-slate-900/60">
                      <TableHead className="w-[24%] min-w-[150px] text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Medication
                      </TableHead>
                      <TableHead className="w-[16%] min-w-[100px] text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Dosage
                      </TableHead>
                      <TableHead className="w-[18%] min-w-[130px] text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Frequency
                      </TableHead>
                      <TableHead className="w-[14%] min-w-[100px] text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Duration
                      </TableHead>
                      <TableHead className="w-[22%] min-w-[150px] text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Instructions
                      </TableHead>
                      <TableHead className="w-[6%] min-w-[40px] text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prescriptions.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-8 text-center text-xs text-slate-400"
                        >
                          No active medications added for this visit yet. Click &quot;+ Add Medication&quot; above.
                        </TableCell>
                      </TableRow>
                    ) : (
                      prescriptions.map((row, index) => (
                        <TableRow key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                          {/* Medication Name */}
                          <TableCell className="p-2.5">
                            <Input
                              type="text"
                              value={row.medication}
                              onChange={(e) =>
                                handleUpdatePrescription(row.id, "medication", e.target.value)
                              }
                              placeholder="e.g. Amoxicillin"
                              className="h-8 border-slate-200 bg-white text-xs font-medium dark:border-slate-700 dark:bg-slate-800"
                            />
                          </TableCell>

                          {/* Dosage */}
                          <TableCell className="p-2.5">
                            <Input
                              type="text"
                              value={row.dosage}
                              onChange={(e) =>
                                handleUpdatePrescription(row.id, "dosage", e.target.value)
                              }
                              placeholder="e.g. 500mg"
                              className="h-8 border-slate-200 bg-white text-xs dark:border-slate-700 dark:bg-slate-800"
                            />
                          </TableCell>

                          {/* Frequency Select */}
                          <TableCell className="p-2.5">
                            <Select
                              value={row.frequency}
                              onValueChange={(val) =>
                                handleUpdatePrescription(row.id, "frequency", val)
                              }
                            >
                              <SelectTrigger className="h-8 border-slate-200 bg-white text-xs dark:border-slate-700 dark:bg-slate-800">
                                <SelectValue placeholder="Frequency" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Once daily">Once daily</SelectItem>
                                <SelectItem value="Twice daily">Twice daily</SelectItem>
                                <SelectItem value="3x daily">3x daily</SelectItem>
                                <SelectItem value="As needed">As needed</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>

                          {/* Duration */}
                          <TableCell className="p-2.5">
                            <Input
                              type="text"
                              value={row.duration}
                              onChange={(e) =>
                                handleUpdatePrescription(row.id, "duration", e.target.value)
                              }
                              placeholder="e.g. 7 days"
                              className="h-8 border-slate-200 bg-white text-xs dark:border-slate-700 dark:bg-slate-800"
                            />
                          </TableCell>

                          {/* Instructions */}
                          <TableCell className="p-2.5">
                            <Input
                              type="text"
                              value={row.instructions}
                              onChange={(e) =>
                                handleUpdatePrescription(row.id, "instructions", e.target.value)
                              }
                              placeholder="Take with meals..."
                              className="h-8 border-slate-200 bg-white text-xs dark:border-slate-700 dark:bg-slate-800"
                            />
                          </TableCell>

                          {/* Delete action */}
                          <TableCell className="p-2.5 text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemovePrescription(row.id)}
                              className="size-8 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950 dark:hover:text-rose-400"
                              title={`Remove prescription ${index + 1}`}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* ------------------------------------------------------------------- */}
          {/* CARD 4: LAB REPORTS */}
          {/* ------------------------------------------------------------------- */}
          <Card className="border-slate-200 shadow-xs dark:border-slate-800">
            <CardHeader className="border-b border-slate-100 pb-4 dark:border-slate-800/80">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                    <FlaskConical className="size-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      Lab Reports &amp; Imaging
                    </CardTitle>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Upload pathology results, X-rays, ECG tracings, or ultrasound scans
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {labFiles.length} {labFiles.length === 1 ? "report" : "reports"} attached
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 pt-5">
              {/* File Upload Drop Area */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(true);
                }}
                onDragLeave={() => setIsDraggingFile(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all duration-200",
                  isDraggingFile
                    ? "border-blue-500 bg-blue-50/80 ring-4 ring-blue-500/10 dark:bg-blue-950/40"
                    : "border-slate-300 bg-slate-50/60 hover:border-blue-400 hover:bg-blue-50/30 dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-blue-500"
                )}
              >
                <input
                  id={fileInputId}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                />
                <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm ring-1 ring-slate-200 transition-transform duration-200 group-hover:scale-110 dark:bg-slate-800 dark:ring-slate-700">
                  <Upload className="size-5" />
                </div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Drop files here or{" "}
                  <span className="text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400">
                    click to upload
                  </span>
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  PDF, JPG, PNG up to 10MB each
                </p>
              </div>

              {/* Uploaded File List */}
              {labFiles.length > 0 && (
                <div className="space-y-2">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Attached Diagnostic Reports ({labFiles.length})
                  </h2>
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                    {labFiles.map((file) => {
                      const isImage =
                        file.type.startsWith("image/") ||
                        file.name.match(/\.(jpg|jpeg|png)$/i);

                      return (
                        <div
                          key={file.id}
                          className="flex flex-col gap-3 p-3 transition-colors hover:bg-slate-50/60 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-slate-800/50"
                        >
                          {/* File Icon + Name + Size */}
                          <div className="flex min-w-0 items-center gap-3">
                            <div
                              className={cn(
                                "flex size-9 shrink-0 items-center justify-center rounded-lg shadow-xs",
                                isImage
                                  ? "bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400"
                                  : "bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
                              )}
                            >
                              {isImage ? (
                                <ImageIcon className="size-5" />
                              ) : (
                                <FileText className="size-5" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                                {file.name}
                              </p>
                              <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                <span>{formatFileSize(file.size)}</span>
                                <span>&bull;</span>
                                <span className="uppercase text-[10px] font-bold text-slate-400">
                                  {file.name.split(".").pop()}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Report Type Selector + Remove Button */}
                          <div className="flex items-center gap-2 self-end sm:self-center">
                            <div className="w-36">
                              <Select
                                value={file.reportType}
                                onValueChange={(val) =>
                                  handleUpdateLabFileType(file.id, val)
                                }
                              >
                                <SelectTrigger className="h-8 border-slate-200 bg-slate-50 text-xs dark:border-slate-700 dark:bg-slate-800">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent align="end">
                                  <SelectItem value="Blood Test">Blood Test</SelectItem>
                                  <SelectItem value="X-Ray">X-Ray</SelectItem>
                                  <SelectItem value="MRI/CT Scan">MRI/CT Scan</SelectItem>
                                  <SelectItem value="Urine Test">Urine Test</SelectItem>
                                  <SelectItem value="ECG">ECG</SelectItem>
                                  <SelectItem value="Other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveLabFile(file.id)}
                              className="size-8 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950 dark:hover:text-rose-400"
                              title="Remove file"
                            >
                              <X className="size-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ======================================================================= */}
        {/* RIGHT COLUMN (col-span-1) - Sidebar Cards */}
        {/* ======================================================================= */}
        <div className="space-y-6 lg:col-span-1">
          {/* ------------------------------------------------------------------- */}
          {/* CARD A: PATIENT SUMMARY */}
          {/* ------------------------------------------------------------------- */}
          <Card className="border-slate-200 shadow-xs dark:border-slate-800">
            <CardHeader className="border-b border-slate-100 pb-3.5 dark:border-slate-800/80">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Patient Summary
                </CardTitle>
                <Badge
                  variant="outline"
                  className="border-rose-200 bg-rose-50 font-bold text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300"
                >
                  Blood: {selectedPatient?.blood_group ?? 'Unknown'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4 text-xs">
              {/* Patient Basic Identity */}
              <div className="flex items-center gap-3">
                <Avatar className="size-12 border border-slate-200 shadow-xs">
                  <AvatarFallback className="bg-blue-600 text-sm font-bold text-white">
                    {patientInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold text-slate-900 dark:text-slate-100">
                    {selectedPatient?.name ?? 'Unknown'}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant="secondary"
                      className="font-mono text-[10px] text-slate-700 dark:text-slate-300"
                    >
                      {selectedPatient?.id?.slice(0, 8) ?? 'Unknown'}
                    </Badge>
                    <span className="text-slate-400">&bull;</span>
                    <span className="text-slate-600 dark:text-slate-400">
                      {selectedPatient
                        ? `${calculateAge(selectedPatient.dob)} years old • ${selectedPatient.gender ?? 'Unknown'}` : 'Age Unknown'}
                    </span>
                  </div>
                </div>
              </div>

              <Separator className="bg-slate-100 dark:bg-slate-800" />

              {/* Last Visit & Allergies */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Last Visit</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {previousVisits.length > 0
                      ? previousVisits[0].created_at.split("T")[0]
                      : "None"}
                  </span>
                </div>

                {/* Allergies Alert List */}
                <div className="space-y-1">
                  <span className="flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
                    <AlertCircle className="size-3.5" />
                    Documented Allergies
                  </span>
                  <p className="text-slate-500 dark:text-slate-400">
                    No known allergies
                  </p>
                </div>
              </div>

              <Separator className="bg-slate-100 dark:bg-slate-800" />

              {/* Upcoming Appointment */}
              <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 dark:border-blue-900/60 dark:bg-blue-950/30">
                <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300">
                  <Calendar className="size-3.5" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Upcoming Appointment
                  </span>
                </div>
                <div className="mt-2 space-y-1">
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {upcomingAppt
                      ? `${upcomingAppt.date} at ${upcomingAppt.time} with ${upcomingAppt.doctor_name}`
                      : "No upcoming appointments"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ------------------------------------------------------------------- */}
          {/* CARD B: PREVIOUS VISITS (LAST 3) */}
          {/* ------------------------------------------------------------------- */}
          <Card className="border-slate-200 shadow-xs dark:border-slate-800">
            <CardHeader className="border-b border-slate-100 pb-3.5 dark:border-slate-800/80">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Previous Visits
                </CardTitle>
                <span className="text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400 cursor-pointer">
                  View Full History
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3.5 pt-4">
              {sidebarLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="size-5 animate-spin text-slate-400" />
                </div>
              ) : previousVisits.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-2">
                  No previous visits recorded.
                </p>
              ) : (
                previousVisits.slice(0, 3).map((visit, index) => (
                  <div
                    key={visit.id}
                    className={cn(
                      "space-y-1 text-xs",
                      index !== 0 && "border-t border-slate-100 pt-3 dark:border-slate-800"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        {visit.created_at.split("T")[0]}
                      </span>
                      <Badge
                        variant="secondary"
                        className="bg-slate-100 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      >
                        {visit.department}
                      </Badge>
                    </div>
                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {visit.doctor_name}
                    </p>
                    <p className="line-clamp-2 text-slate-600 dark:text-slate-300">
                      &quot;{visit.notes?.substring(0, 50) ?? visit.chief_complaint?.substring(0, 50) ?? "No notes"}&quot;
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* ------------------------------------------------------------------- */}
          {/* CARD C: ACTIVE MEDICATIONS */}
          {/* ------------------------------------------------------------------- */}
          <Card className="border-slate-200 shadow-xs dark:border-slate-800">
            <CardHeader className="border-b border-slate-100 pb-3.5 dark:border-slate-800/80">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Pill className="size-4 text-teal-600 dark:text-teal-400" />
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Active Medications
                  </CardTitle>
                </div>
                <Badge
                  variant="secondary"
                  className="bg-teal-50 text-[10px] font-semibold text-teal-700 dark:bg-teal-950 dark:text-teal-300"
                >
                  {activeMeds.length} Active
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-4 text-xs">
              {sidebarLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="size-5 animate-spin text-slate-400" />
                </div>
              ) : activeMeds.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-2">
                  No active long-term medications recorded.
                </p>
              ) : (
                activeMeds.map((med) => (
                  <div
                    key={med.id}
                    className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5 dark:border-slate-800 dark:bg-slate-900/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-slate-900 dark:text-slate-100">
                        {med.medication}
                      </p>
                      <Badge
                        variant="outline"
                        className="shrink-0 border-teal-200 text-[10px] text-teal-700 dark:border-teal-800 dark:text-teal-300"
                      >
                        {med.dosage}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-400">
                      Prescribed: {med.created_at.split("T")[0]}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
