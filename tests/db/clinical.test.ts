import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { addStaff, asUser, createDb, rejects, seedClinic, type Clinic } from "./harness";

let db: PGlite;
let clinic: Clinic;
let patientId: string;
let encounterId: string;
let derm: { userId: string; staffId: string };

async function one<T>(userId: string, sql: string, params: unknown[] = []): Promise<T> {
  return asUser(db, userId, async (tx) => (await tx.query<T>(sql, params)).rows[0]);
}
async function count(userId: string, sql: string, params: unknown[] = []): Promise<number> {
  return asUser(db, userId, async (tx) => (await tx.query(sql, params)).rows.length);
}

beforeAll(async () => {
  db = await createDb();
  clinic = await seedClinic(db);
  derm = await addStaff(db, clinic.clinicId, "doctor", "derm@asha.test", { specialtyId: clinic.specialties.dermatology });

  patientId = (
    await one<{ id: string }>(
      clinic.users.receptionist,
      "insert into public.patients (clinic_id, first_name, last_name, dob, sex) values ($1, 'Anya', 'Rao', '2024-01-15', 'female') returning id",
      [clinic.clinicId],
    )
  ).id;
  await one(
    clinic.users.nurse,
    "insert into public.patient_allergies (clinic_id, patient_id, allergen, reaction, severity) values ($1, $2, 'Penicillin', 'Rash', 'severe') returning id",
    [clinic.clinicId, patientId],
  );
  const appt = await one<{ id: string }>(
    clinic.users.receptionist,
    `insert into public.appointments (clinic_id, patient_id, doctor_id, specialty_id, starts_at, ends_at)
     values ($1, $2, $3, $4, now(), now() + interval '15 minutes') returning id`,
    [clinic.clinicId, patientId, clinic.staff.doctor, clinic.specialties.pediatrics],
  );
  encounterId = (await one<{ id: string }>(clinic.users.doctor, "select public.start_encounter($1) as id", [appt.id])).id;
});

describe("consultation", () => {
  it("starts the visit and moves the appointment along", async () => {
    const { status } = await one<{ status: string }>(
      clinic.users.owner,
      "select a.status from public.appointments a join public.encounters e on e.appointment_id = a.id where e.id = $1",
      [encounterId],
    );
    expect(status).toBe("in_consultation");
  });

  it("lets a nurse record vitals but not write the consultation", async () => {
    await one(
      clinic.users.nurse,
      "insert into public.vitals (clinic_id, patient_id, encounter_id, weight_kg, height_cm) values ($1, $2, $3, 9.6, 75) returning id",
      [clinic.clinicId, patientId, encounterId],
    );
    const updated = await count(
      clinic.users.nurse,
      "update public.encounters set chief_complaint = 'x' where id = $1 returning id",
      [encounterId],
    );
    expect(updated).toBe(0);
    const { bmi } = await one<{ bmi: string }>(clinic.users.doctor, "select bmi from public.vitals where patient_id = $1", [patientId]);
    expect(Number(bmi)).toBeCloseTo(17.1, 1);
  });

  it("gives a receptionist and billing zero clinical records", async () => {
    await one(
      clinic.users.doctor,
      "insert into public.clinical_notes (clinic_id, patient_id, encounter_id, body) values ($1, $2, $3, 'Fever 2 days') returning id",
      [clinic.clinicId, patientId, encounterId],
    );
    for (const role of ["receptionist", "billing"] as const) {
      for (const table of ["encounters", "clinical_notes", "vitals", "diagnoses", "prescriptions", "encounter_forms"]) {
        expect(await count(clinic.users[role], `select * from public.${table}`), `${role} reading ${table}`).toBe(0);
      }
    }
  });

  it("hides author-only and other-specialty notes", async () => {
    await one(
      derm.userId,
      "insert into public.clinical_notes (clinic_id, patient_id, body, visibility, specialty_id) values ($1, $2, 'Private derm note', 'author_only', $3) returning id",
      [clinic.clinicId, patientId, clinic.specialties.dermatology],
    );
    await one(
      derm.userId,
      "insert into public.clinical_notes (clinic_id, patient_id, body, visibility, specialty_id) values ($1, $2, 'Derm team note', 'same_specialty', $3) returning id",
      [clinic.clinicId, patientId, clinic.specialties.dermatology],
    );
    const gp = await asUser(db, clinic.users.doctor, async (tx) =>
      (await tx.query<{ body: string }>("select body from public.clinical_notes")).rows.map((r) => r.body),
    );
    expect(gp).toEqual(["Fever 2 days"]);
    const mine = await count(derm.userId, "select * from public.clinical_notes");
    expect(mine).toBe(3);
  });

  it("stops a nurse writing a note in a doctor's name", async () => {
    const msg = await rejects(() =>
      asUser(db, clinic.users.doctor, (tx) =>
        tx.query("insert into public.clinical_notes (clinic_id, patient_id, body, author_id) values ($1, $2, 'x', $3)", [
          clinic.clinicId,
          patientId,
          derm.staffId,
        ]),
      ),
    );
    expect(msg).toMatch(/row-level security/);
  });

  it("saves a specialty panel into the visit", async () => {
    await one(
      clinic.users.doctor,
      "insert into public.encounter_forms (clinic_id, patient_id, encounter_id, panel_key, data) values ($1, $2, $3, 'growth_chart', '{\"note\":\"tracking well\"}') returning id",
      [clinic.clinicId, patientId, encounterId],
    );
    const panels = await asUser(db, clinic.users.doctor, async (tx) =>
      (
        await tx.query<{ panel_key: string }>(
          "select panel_key from public.specialty_panels where specialty_id = $1 order by sort_order",
          [clinic.specialties.pediatrics],
        )
      ).rows.map((r) => r.panel_key),
    );
    expect(panels).toEqual(["growth_chart", "vaccinations"]);
  });
});

describe("prescriptions", () => {
  const amox = [{ drug_name: "Amoxicillin 250 mg", generic_name: "Amoxicillin", dose: "5 ml", frequency: "1-1-1", duration_days: 5 }];

  it("warns about allergies through the drug's group", async () => {
    const med = await one<{ id: string }>(
      clinic.users.doctor,
      "select id from public.medications where generic_name = 'Amoxicillin' and form = 'capsule'",
    );
    const rows = await asUser(db, clinic.users.doctor, async (tx) =>
      (
        await tx.query<{ warning: string }>("select * from public.prescription_warnings($1, $2)", [
          patientId,
          JSON.stringify([{ drug_name: "Mox 500", medication_id: med.id }]),
        ])
      ).rows,
    );
    expect(rows[0].warning).toMatch(/allergic to Penicillin/);
  });

  it("refuses an allergy conflict without an override reason", async () => {
    const msg = await rejects(() =>
      asUser(db, clinic.users.doctor, (tx) =>
        tx.query("select public.save_prescription($1, $2)", [encounterId, JSON.stringify(amox)]),
      ),
    );
    expect(msg).toMatch(/Allergy conflict/);
  });

  it("saves with an override and replaces items on resave", async () => {
    await one(clinic.users.doctor, "select public.save_prescription($1, $2, null, 'Tolerated before, monitored') as id", [
      encounterId,
      JSON.stringify(amox),
    ]);
    await one(clinic.users.doctor, "select public.save_prescription($1, $2) as id", [
      encounterId,
      JSON.stringify([{ drug_name: "Paracetamol syrup", dose: "5 ml", frequency: "SOS" }]),
    ]);
    const items = await asUser(db, clinic.users.doctor, async (tx) =>
      (await tx.query<{ drug_name: string }>("select drug_name from public.prescription_items")).rows,
    );
    expect(items).toEqual([{ drug_name: "Paracetamol syrup" }]);
  });

  it("is refused for a nurse", async () => {
    const msg = await rejects(() =>
      asUser(db, clinic.users.nurse, (tx) =>
        tx.query("select public.save_prescription($1, '[]')", [encounterId]),
      ),
    );
    expect(msg).toMatch(/permission/);
  });
});

describe("locking", () => {
  it("locks a signed visit; addenda still work", async () => {
    await one(clinic.users.doctor, "update public.encounters set signed_at = now() where id = $1 returning id", [encounterId]);
    const { signed_by } = await one<{ signed_by: string }>(clinic.users.doctor, "select signed_by from public.encounters where id = $1", [
      encounterId,
    ]);
    expect(signed_by).toBe(clinic.staff.doctor);

    const edit = await rejects(() =>
      asUser(db, clinic.users.doctor, (tx) =>
        tx.query("update public.encounters set treatment_plan = 'changed' where id = $1", [encounterId]),
      ),
    );
    expect(edit).toMatch(/locked/);
    const vitals = await rejects(() =>
      asUser(db, clinic.users.nurse, (tx) =>
        tx.query("insert into public.vitals (clinic_id, patient_id, encounter_id, pulse_bpm) values ($1, $2, $3, 90)", [
          clinic.clinicId,
          patientId,
          encounterId,
        ]),
      ),
    );
    expect(vitals).toMatch(/locked/);
    const rx = await rejects(() =>
      asUser(db, clinic.users.doctor, (tx) => tx.query("select public.save_prescription($1, '[]')", [encounterId])),
    );
    expect(rx).toMatch(/locked/);
    await one(
      clinic.users.doctor,
      "insert into public.clinical_notes (clinic_id, patient_id, encounter_id, kind, body) values ($1, $2, $3, 'addendum', 'Lab came back normal') returning id",
      [clinic.clinicId, patientId, encounterId],
    );
  });

  it("locks visits older than 24 hours", async () => {
    const { id } = await one<{ id: string }>(
      clinic.users.doctor,
      "insert into public.encounters (clinic_id, patient_id, doctor_id) values ($1, $2, $3) returning id",
      [clinic.clinicId, patientId, clinic.staff.doctor],
    );
    await db.query("update public.encounters set created_at = now() - interval '25 hours' where id = $1", [id]);
    const msg = await rejects(() =>
      asUser(db, clinic.users.doctor, (tx) => tx.query("update public.encounters set advice = 'x' where id = $1", [id])),
    );
    expect(msg).toMatch(/locked/);
  });

  it("never lets anyone edit a note", async () => {
    const msg = await rejects(() =>
      asUser(db, clinic.users.owner, (tx) => tx.query("update public.clinical_notes set body = 'rewritten'")),
    );
    expect(msg).toMatch(/permission denied/);
  });
});

describe("labs and documents", () => {
  it("flags abnormal results from copied reference ranges", async () => {
    const tests = await asUser(db, clinic.users.doctor, async (tx) =>
      (await tx.query<{ id: string; code: string }>("select id, code from public.lab_tests where code in ('HB', 'TSH')")).rows,
    );
    const { id: orderId } = await one<{ id: string }>(clinic.users.doctor, "select public.create_lab_order($1, null, $2) as id", [
      patientId,
      tests.map((t) => t.id),
    ]);
    const hb = tests.find((t) => t.code === "HB")!.id;
    await one(
      clinic.users.nurse,
      "update public.lab_results set value_numeric = 9.1 where lab_order_id = $1 and lab_test_id = $2 returning id",
      [orderId, hb],
    );
    const { is_abnormal, resulted_at } = await one<{ is_abnormal: boolean; resulted_at: string }>(
      clinic.users.doctor,
      "select is_abnormal, resulted_at from public.lab_results where lab_order_id = $1 and lab_test_id = $2",
      [orderId, hb],
    );
    expect(is_abnormal).toBe(true);
    expect(resulted_at).not.toBeNull();
  });

  it("keeps document paths inside the clinic and patient folder", async () => {
    const msg = await rejects(() =>
      asUser(db, clinic.users.nurse, (tx) =>
        tx.query(
          "insert into public.documents (clinic_id, patient_id, title, storage_path, mime_type, size_bytes) values ($1, $2, 'x', 'elsewhere/x.pdf', 'application/pdf', 100)",
          [clinic.clinicId, patientId],
        ),
      ),
    );
    expect(msg).toMatch(/check constraint/);
    await one(
      clinic.users.nurse,
      "insert into public.documents (clinic_id, patient_id, title, storage_path, mime_type, size_bytes, category) values ($1, $2, 'CBC', $3, 'application/pdf', 100, 'lab_report') returning id",
      [clinic.clinicId, patientId, `${clinic.clinicId}/${patientId}/cbc.pdf`],
    );
    expect(await count(clinic.users.receptionist, "select * from public.documents")).toBe(0);
  });
});
