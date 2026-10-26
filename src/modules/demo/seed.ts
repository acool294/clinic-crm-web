// Demo data for a test clinic: staff for each role, patients, a month of visits,
// invoices and doctor hours. Used by scripts/seed.ts and Settings → Demo data.
// Never run it on a clinic that holds real patients.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types.ts";

const FIRST = ["Aarav", "Vihaan", "Aditya", "Arjun", "Sai", "Reyansh", "Ishaan", "Kabir", "Ananya", "Diya", "Saanvi", "Aadhya", "Kiara", "Myra", "Pari", "Anika", "Priya", "Rohan", "Meera", "Kavya", "Rahul", "Sneha", "Vikram", "Pooja", "Arnav", "Lakshmi", "Farhan", "Zoya", "Gurpreet", "Harini"];
const LAST = ["Sharma", "Verma", "Iyer", "Nair", "Reddy", "Patel", "Gupta", "Khan", "Singh", "Das", "Menon", "Rao", "Joshi", "Kulkarni", "Banerjee", "Chopra"];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const must = <T,>(r: { data: T; error: { message: string } | null }, what: string): NonNullable<T> => {
  if (r.error || r.data === null || r.data === undefined) throw new Error(`${what}: ${r.error?.message ?? "no data"}`);
  return r.data as NonNullable<T>;
};

export async function seedDemo(db: SupabaseClient<Database>, password: string, size: { patients?: number; pastDays?: number; futureDays?: number } = {}) {
  const { patients: patientCount = 40, pastDays = 30, futureDays = 7 } = size;
  const { data: clinic } = await db.from("clinics").select("id, name").single();
  if (!clinic) throw new Error("No clinic yet. Complete /setup first.");
  const specialties = must(await db.from("specialties").select("id, code"), "specialties");
  const spec = Object.fromEntries(specialties.map((s) => [s.code, s.id]));

  // Staff
  const DOCTORS = [
    { name: "Dr Neha Kapoor", email: "neha.gp@demo.clinic.test", code: "general_medicine", title: "MBBS, MD (Medicine)" },
    { name: "Dr Arvind Menon", email: "arvind.peds@demo.clinic.test", code: "pediatrics", title: "MBBS, DCH" },
    { name: "Dr Shalini Rao", email: "shalini.obgyn@demo.clinic.test", code: "obgyn", title: "MBBS, MS (OBG)" },
    { name: "Dr Imran Qureshi", email: "imran.derm@demo.clinic.test", code: "dermatology", title: "MBBS, MD (DVL)" },
  ];
  const OTHERS = [
    { name: "Ritu (Front desk)", email: "frontdesk@demo.clinic.test", role: "receptionist" as const },
    { name: "Sister Mary", email: "nurse@demo.clinic.test", role: "nurse" as const },
    { name: "Accounts", email: "billing@demo.clinic.test", role: "billing" as const },
  ];

  async function ensureUser(email: string) {
    const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
    const found = list?.users.find((u) => u.email === email);
    if (found) {
      // re-running resets the demo password so the logins shown afterwards work
      await db.auth.admin.updateUserById(found.id, { password });
      return found.id;
    }
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw new Error(`${email}: ${created.error.message}`);
    return created.data.user.id;
  }

  async function ensureStaff(name: string, email: string, role: Database["public"]["Enums"]["app_role"], extra: { title?: string; specialty?: string } = {}) {
    const { data: existing } = await db.from("staff").select("id").eq("email", email).maybeSingle();
    if (existing) return existing.id;
    const userId = await ensureUser(email);
    const staff = must(
      await db.from("staff").insert({ clinic_id: clinic!.id, user_id: userId, full_name: name, email, title: extra.title ?? null }).select("id").single(),
      "staff",
    );
    await db.from("staff_roles").insert({ staff_id: staff.id, role });
    if (extra.specialty) await db.from("doctor_specialties").insert({ staff_id: staff.id, specialty_id: extra.specialty, is_primary: true });
    return staff.id;
  }

  const doctors: { id: string; specialty: string }[] = [];
  for (const d of DOCTORS) {
    const id = await ensureStaff(d.name, d.email, "doctor", { title: d.title, specialty: spec[d.code] });
    doctors.push({ id, specialty: spec[d.code] });
    const { count } = await db.from("doctor_schedules").select("id", { count: "exact", head: true }).eq("doctor_id", id);
    if (!count) {
      await db.from("doctor_schedules").insert(
        [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
          { clinic_id: clinic.id, doctor_id: id, weekday, start_time: "10:00", end_time: "13:00", slot_minutes: 15, specialty_id: spec[d.code] },
          { clinic_id: clinic.id, doctor_id: id, weekday, start_time: "17:00", end_time: "20:00", slot_minutes: 15, specialty_id: spec[d.code] },
        ]),
      );
    }
  }
  for (const o of OTHERS) await ensureStaff(o.name, o.email, o.role);

  // Services
  const { count: serviceCount } = await db.from("services").select("id", { count: "exact", head: true });
  if (!serviceCount) {
    await db.from("services").insert([
      { clinic_id: clinic.id, name: "Consultation (new)", visit_type: "new", price_paise: 50000, sac_code: "999312" },
      { clinic_id: clinic.id, name: "Consultation (follow-up)", visit_type: "follow_up", price_paise: 30000, sac_code: "999312" },
      { clinic_id: clinic.id, name: "Paediatric consultation", specialty_id: spec.pediatrics, visit_type: "new", price_paise: 60000, sac_code: "999312" },
      { clinic_id: clinic.id, name: "Antenatal visit", specialty_id: spec.obgyn, price_paise: 70000, sac_code: "999312" },
      { clinic_id: clinic.id, name: "Dermatology consultation", specialty_id: spec.dermatology, price_paise: 80000, sac_code: "999312" },
      { clinic_id: clinic.id, name: "Chemical peel", category: "procedure", specialty_id: spec.dermatology, price_paise: 300000, gst_rate: 18, sac_code: "999722" },
      { clinic_id: clinic.id, name: "Vaccination charge", category: "procedure", specialty_id: spec.pediatrics, price_paise: 20000 },
      { clinic_id: clinic.id, name: "Dressing", category: "procedure", price_paise: 15000 },
    ]);
  }
  const services = must(await db.from("services").select("id, specialty_id, visit_type, price_paise"), "services");

  // Patients
  const patients: { id: string }[] = [];
  for (let i = 0; i < patientCount; i++) {
    const sex = Math.random() < 0.5 ? "female" : "male";
    const child = i % 5 === 0;
    const dob = new Date(Date.now() - (child ? Math.random() * 2 : 18 + Math.random() * 55) * 365.25 * 86400_000).toISOString().slice(0, 10);
    const p = must(
      await db
        .from("patients")
        .insert({
          clinic_id: clinic.id,
          first_name: pick(FIRST),
          last_name: pick(LAST),
          sex,
          dob,
          phone: `9${String(Math.floor(100000000 + Math.random() * 899999999))}`,
          city: pick(["Bengaluru", "Pune", "Chennai", "Hyderabad", "Mumbai"]),
          consent_treatment_at: new Date().toISOString(),
          consent_messaging: Math.random() < 0.7,
          tags: i % 7 === 0 ? ["diabetic"] : [],
        })
        .select("id")
        .single(),
      "patient",
    );
    patients.push(p);
    if (i % 9 === 0) await db.from("patient_allergies").insert({ clinic_id: clinic.id, patient_id: p.id, allergen: "Penicillin", reaction: "Rash", severity: "moderate" });
  }

  // Appointments over the last 30 days and the next 7, with visits and invoices for past ones
  let made = 0;
  for (let dayOffset = -pastDays; dayOffset <= futureDays; dayOffset++) {
    for (const doc of doctors) {
      const slots = Math.floor(Math.random() * 4);
      for (let s = 0; s < slots; s++) {
        const patient = pick(patients);
        const start = new Date();
        start.setUTCDate(start.getUTCDate() + dayOffset);
        start.setUTCHours(4 + s, 30 + Math.floor(Math.random() * 2) * 15, 0, 0); // 10:00-13:30 IST
        const end = new Date(start.getTime() + 15 * 60_000);
        const visitType = Math.random() < 0.6 ? "new" : "follow_up";
        const appt = await db
          .from("appointments")
          .insert({ clinic_id: clinic.id, patient_id: patient.id, doctor_id: doc.id, specialty_id: doc.specialty, starts_at: start.toISOString(), ends_at: end.toISOString(), visit_type: visitType })
          .select("id")
          .single();
        if (appt.error) continue; // overlap, skip
        made++;
        if (dayOffset >= 0) continue;
        if (Math.random() < 0.08) {
          await db.from("appointments").update({ status: "no_show" }).eq("id", appt.data.id);
          continue;
        }
        await db.from("appointments").update({ status: "checked_in" }).eq("id", appt.data.id);
        const enc = must(
          await db
            .from("encounters")
            .insert({ clinic_id: clinic.id, patient_id: patient.id, appointment_id: appt.data.id, doctor_id: doc.id, specialty_id: doc.specialty, visit_type: visitType, started_at: start.toISOString(), chief_complaint: pick(["Fever and cough", "Follow-up", "Skin rash", "Routine check", "Headache", "Abdominal pain"]), signed_at: end.toISOString() })
            .select("id")
            .single(),
          "encounter",
        );
        await db.from("vitals").insert({ clinic_id: clinic.id, patient_id: patient.id, recorded_at: start.toISOString(), bp_systolic: 110 + Math.floor(Math.random() * 30), bp_diastolic: 70 + Math.floor(Math.random() * 15), pulse_bpm: 70 + Math.floor(Math.random() * 20), weight_kg: 50 + Math.round(Math.random() * 300) / 10 });
        await db.from("diagnoses").insert({ clinic_id: clinic.id, patient_id: patient.id, encounter_id: enc.id, icd10_code: pick(["J06.9", "R50.9", "L20.9", "I10", "E11.9", "Z34.9", "K29.7"]), description: "Seeded diagnosis", kind: "final" });
        await db.from("appointments").update({ status: "completed" }).eq("id", appt.data.id);

        const service = services.find((x) => x.specialty_id === doc.specialty) ?? services.find((x) => x.visit_type === visitType)!;
        // create_invoice needs a signed-in staff member, so the seed writes the rows directly
        const inv = must(
          await db.from("invoices").insert({ clinic_id: clinic.id, patient_id: patient.id, encounter_id: enc.id, appointment_id: appt.data.id, doctor_id: doc.id, specialty_id: doc.specialty }).select("id").single(),
          "invoice",
        );
        await db.from("invoice_items").insert({ clinic_id: clinic.id, invoice_id: inv.id, service_id: service.id, description: "Consultation", unit_price_paise: service.price_paise });
        await db.from("invoices").update({ status: "issued" }).eq("id", inv.id);
        if (Math.random() < 0.9) {
          await db.from("payments").insert({ clinic_id: clinic.id, invoice_id: inv.id, amount_paise: service.price_paise, method: Math.random() < 0.5 ? "cash" : "upi", reference: "DEMO", received_at: end.toISOString() });
        }
      }
    }
  }
  return { patients: patients.length, appointments: made, logins: [...DOCTORS.map((d) => ({ email: d.email, role: `Doctor, ${d.code.replace("_", " ")}` })), ...OTHERS.map((o) => ({ email: o.email, role: o.role }))] };
}
