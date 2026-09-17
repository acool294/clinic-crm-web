"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, ChevronDown, CheckCircle2, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { createPatient } from "@/lib/db/patients";
import { createAppointment } from "@/lib/db/appointments";
import { INSURANCE_PROVIDERS_INDIA } from "@/lib/constants/insurance";

interface AddPatientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffProfile: any;
  onSuccess?: () => void;
}

export function AddPatientDialog({ open, onOpenChange, staffProfile, onSuccess }: AddPatientDialogProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [existingPatient, setExistingPatient] = useState<any>(null);
  const [formError, setFormError] = useState<string | null>(null);
  
  const [newPatient, setNewPatient] = useState({
    name: "", dob: "", gender: "Female" as "Female" | "Male" | "Other" | null, phone: "", address: "",
    bloodGroup: "", alternatePhone: "", insuranceProvider: "", isInsured: false, email: ""
  });
  
  const [scheduleAppointment, setScheduleAppointment] = useState(false);
  const [appointmentDetails, setAppointmentDetails] = useState({
    date: "", time: "09:00", duration: 30, type: "Consultation", doctorId: ""
  });
  
  const [doctorsList, setDoctorsList] = useState<any[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (open) {
      supabase.from('staff_users').select('id, name').eq('role', 'doctor').then(({data}) => {
        if (data) {
          setDoctorsList(data);
          if (staffProfile?.role === 'doctor') {
            setAppointmentDetails(prev => ({ ...prev, doctorId: staffProfile.id }));
          }
        }
      });
    } else {
      // Reset
      setNewPatient({ name: "", dob: "", gender: "Female", phone: "", address: "", bloodGroup: "", alternatePhone: "", insuranceProvider: "", isInsured: false, email: "" });
      setScheduleAppointment(false);
      setAppointmentDetails({ date: "", time: "09:00", duration: 30, type: "Consultation", doctorId: "" });
      setFormError(null);
      setShowAdvanced(false);
    }
  }, [open, staffProfile]);

  
  const handlePhoneBlur = async () => {
    if (newPatient.phone.trim().length >= 10) {
      const { data } = await supabase.from('patients').select('id, name, phone').eq('phone', newPatient.phone.trim()).single();
      if (data) {
        setExistingPatient(data);
        setFormError("Patient with this phone number already exists: " + data.name);
      } else {
        setExistingPatient(null);
        if (formError && formError.includes('already exists')) setFormError(null);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    
    if (existingPatient) { setFormError("Cannot create duplicate patient. Please search for " + existingPatient.name + " instead."); return; }
    if (!newPatient.name.trim() || !newPatient.dob || !newPatient.gender || !newPatient.phone.trim()) {
      setFormError("Please fill out all required fields.");
      return;
    }
    
    if (scheduleAppointment) {
      if (!appointmentDetails.date || !appointmentDetails.doctorId) {
        setFormError("Please fill all required appointment fields.");
        return;
      }
    }

    setIsCreating(true);
    try {
      const newPatientObj = await createPatient({
        name: newPatient.name,
        dob: newPatient.dob,
        gender: newPatient.gender as "Female" | "Male" | "Other",
        phone: newPatient.phone,
        address: newPatient.address || null,
        blood_group: newPatient.bloodGroup || null,
        alternate_phone: newPatient.alternatePhone || null,
        is_insured: newPatient.isInsured,
        insurance_provider: newPatient.isInsured ? newPatient.insuranceProvider : null,
        email: newPatient.email || null,
      });

      if (scheduleAppointment) {
        const { data: staffData } = await supabase.from('staff_users').select('clinic_id').eq('id', (await supabase.auth.getUser()).data.user?.id).single();
        if (staffData) {
           const { data: linkData } = await supabase.from('clinic_patient_links').select('id').eq('patient_id', newPatientObj.id).eq('clinic_id', staffData.clinic_id).single();
           if (linkData) {
              await createAppointment({
                clinic_patient_link_id: linkData.id,
                doctor_id: appointmentDetails.doctorId,
                scheduled_at: appointmentDetails.date + 'T' + appointmentDetails.time + ':00',
                duration_minutes: appointmentDetails.duration,
                appointment_type: appointmentDetails.type as any
              });
           }
        }
      }

      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setFormError(err.message || "Failed to register patient");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Register New Patient</DialogTitle>
          <DialogDescription>Enter patient details to register them in the clinic system.</DialogDescription>
        </DialogHeader>
        {formError && (
          <div className="flex items-center gap-2 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
            <AlertCircle className="size-4 shrink-0" />
            <p>{formError}</p>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="name">Full Name *</label>
            <Input id="name" placeholder="e.g. Samuel Green" value={newPatient.name} onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="dob">Date of Birth *</label>
              <Input id="dob" type="date" value={newPatient.dob} onChange={(e) => setNewPatient({ ...newPatient, dob: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="gender">Gender *</label>
              <Select value={newPatient.gender || ""} onValueChange={(val: any) => setNewPatient({ ...newPatient, gender: val })}>
                <SelectTrigger id="gender"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="phone">Phone Number *</label>
            <Input id="phone" type="tel" placeholder="(555) 000-0000" value={newPatient.phone} onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })} />
          </div>

          <div className="w-full bg-slate-50 rounded-md border border-slate-100 p-2">
            <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center justify-between w-full p-2 text-sm font-medium text-slate-700 hover:text-slate-900 focus:outline-none">
              Additional Information <span className="text-slate-400 font-normal">(Optional)</span>
              <ChevronDown className={`size-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            </button>
            {showAdvanced && (
              <div className="space-y-4 p-2 pt-4 border-t border-slate-200 mt-2">
                <div className="grid gap-2">
                  <label className="text-sm font-medium" htmlFor="email">Email Address</label>
                  <Input id="email" type="email" placeholder="patient@example.com" value={newPatient.email} onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium" htmlFor="address">Address</label>
                  <Input id="address" placeholder="123 Main St, City" value={newPatient.address} onChange={(e) => setNewPatient({ ...newPatient, address: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium" htmlFor="blood">Blood Group</label>
                    <Select value={newPatient.bloodGroup} onValueChange={(val) => setNewPatient({ ...newPatient, bloodGroup: val })}>
                      <SelectTrigger id="blood"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                          <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium" htmlFor="alt-phone">Alt Phone</label>
                    <Input id="alt-phone" type="tel" value={newPatient.alternatePhone} onChange={(e) => setNewPatient({ ...newPatient, alternatePhone: e.target.value })} />
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-200">
                  <div className="flex items-center gap-2 mb-3">
                    <input type="checkbox" id="is-insured" checked={newPatient.isInsured} onChange={(e) => setNewPatient({ ...newPatient, isInsured: e.target.checked })} className="rounded border-slate-300" />
                    <label className="text-sm font-medium cursor-pointer" htmlFor="is-insured">Patient has Insurance</label>
                  </div>
                  {newPatient.isInsured && (
                    <div className="grid gap-2">
                      <label className="text-sm font-medium" htmlFor="insurance">Insurance Provider</label>
                      <Select value={newPatient.insuranceProvider} onValueChange={(val) => setNewPatient({ ...newPatient, insuranceProvider: val })}>
                        <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                        <SelectContent>
                          {INSURANCE_PROVIDERS_INDIA.map(p => (
                            <SelectItem key={p} value={p}>{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Appointment Scheduling Option */}
          <div className="pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2 mb-4">
              <input type="checkbox" id="schedule-apt" checked={scheduleAppointment} onChange={(e) => setScheduleAppointment(e.target.checked)} className="rounded border-slate-300" />
              <label className="text-sm font-semibold cursor-pointer" htmlFor="schedule-apt">Schedule Appointment Now</label>
            </div>
            
            {scheduleAppointment && (
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Date *</label>
                  <Input type="date" value={appointmentDetails.date} onChange={e => setAppointmentDetails({...appointmentDetails, date: e.target.value})} />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Time *</label>
                  <Input type="time" value={appointmentDetails.time} onChange={e => setAppointmentDetails({...appointmentDetails, time: e.target.value})} />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Type</label>
                  <Select value={appointmentDetails.type} onValueChange={(val: any) => {
                      let autoDoc = appointmentDetails.doctorId;
                      if (val === 'Follow-up' && !autoDoc && doctorsList.length > 0) autoDoc = doctorsList[0].id;
                      setAppointmentDetails({...appointmentDetails, type: val, doctorId: autoDoc});
                  }}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Consultation">Consultation</SelectItem>
                      <SelectItem value="Follow-up">Follow-up</SelectItem>
                      <SelectItem value="Lab Review">Lab Review</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Doctor *</label>
                  <Select value={appointmentDetails.doctorId} onValueChange={val => setAppointmentDetails({...appointmentDetails, doctorId: val})}>
                    <SelectTrigger><SelectValue placeholder="Select Doctor"/></SelectTrigger>
                    <SelectContent>
                      {doctorsList.map(d => (
                        <SelectItem key={d.id} value={d.id}>Dr. {d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-4">
            <DialogClose render={<Button type="button" variant="outline">Cancel</Button>} />
            <Button type="submit" disabled={isCreating} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isCreating ? "Saving..." : scheduleAppointment ? "Register & Schedule" : "Register Patient"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
