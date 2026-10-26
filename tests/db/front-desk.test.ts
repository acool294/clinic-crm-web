import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { addStaff, asUser, createDb, rejects, seedClinic, type Clinic } from "./harness";

let db: PGlite;
let clinic: Clinic;
let other: Clinic;

async function addPatient(userId: string, first: string, extra: Record<string, unknown> = {}) {
  const cols = ["clinic_id", "first_name", ...Object.keys(extra)];
  const vals = [clinic.clinicId, first, ...Object.values(extra)];
  return asUser(db, userId, async (tx) => {
    const { rows } = await tx.query<{ id: string; mrn: string }>(
      `insert into public.patients (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id, mrn`,
      vals,
    );
    return rows[0];
  });
}

async function book(userId: string, patientId: string, start: string, end: string, doctorId = clinic.staff.doctor) {
  return asUser(db, userId, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `insert into public.appointments (clinic_id, patient_id, doctor_id, specialty_id, starts_at, ends_at)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [clinic.clinicId, patientId, doctorId, clinic.specialties.general_medicine, start, end],
    );
    return rows[0].id;
  });
}

beforeAll(async () => {
  db = await createDb();
  clinic = await seedClinic(db, "Asha Clinic");
  other = await seedClinic(db, "Other Clinic");
});

describe("patients", () => {
  it("assigns MRNs in sequence and never lets them change", async () => {
    const a = await addPatient(clinic.users.receptionist, "Ravi", { last_name: "Kumar", phone: "9876543210" });
    const b = await addPatient(clinic.users.receptionist, "Meera", { last_name: "Iyer", dob: "2019-05-01" });
    expect(a.mrn).toBe("MRN-000001");
    expect(b.mrn).toBe("MRN-000002");
    const msg = await rejects(() =>
      asUser(db, clinic.users.owner, (tx) => tx.query("update public.patients set mrn = 'X' where id = $1", [a.id])),
    );
    expect(msg).toMatch(/cannot be changed/);
  });

  it("keeps another clinic's patients invisible", async () => {
    const seen = await asUser(db, other.users.owner, async (tx) =>
      (await tx.query("select * from public.patients")).rows.length,
    );
    expect(seen).toBe(0);
    const msg = await rejects(() =>
      asUser(db, other.users.owner, (tx) =>
        tx.query("insert into public.patients (clinic_id, first_name) values ($1, 'Spy')", [clinic.clinicId]),
      ),
    );
    expect(msg).toMatch(/row-level security/);
  });

  it("finds patients by fuzzy name, phone and MRN", async () => {
    const search = (q: string) =>
      asUser(db, clinic.users.receptionist, async (tx) =>
        (await tx.query<{ full_name: string }>("select full_name from public.search_patients($1)", [q])).rows.map(
          (r) => r.full_name,
        ),
      );
    expect(await search("ravi kumr")).toContain("Ravi Kumar");
    expect(await search("43210")).toContain("Ravi Kumar");
    expect(await search("MRN-000002")).toEqual(["Meera Iyer"]);
  });

  it("flags likely duplicates", async () => {
    const rows = await asUser(db, clinic.users.receptionist, async (tx) =>
      (
        await tx.query<{ reason: string }>("select * from public.find_duplicate_patients('Meera', 'Iyyer', null, '2019-05-01')")
      ).rows,
    );
    expect(rows).toHaveLength(1);
    const byPhone = await asUser(db, clinic.users.receptionist, async (tx) =>
      (await tx.query<{ reason: string }>("select * from public.find_duplicate_patients('X', null, '9876543210', null)")).rows,
    );
    expect(byPhone[0].reason).toBe("Same phone number");
  });

  it("needs patients.delete to archive", async () => {
    const p = await addPatient(clinic.users.receptionist, "Temp");
    const msg = await rejects(() =>
      asUser(db, clinic.users.receptionist, (tx) =>
        tx.query("update public.patients set deleted_at = now() where id = $1", [p.id]),
      ),
    );
    expect(msg).toMatch(/permission to archive/);
    await asUser(db, clinic.users.owner, (tx) => tx.query("update public.patients set deleted_at = now() where id = $1", [p.id]));
  });

  it("lets billing read but not edit patients", async () => {
    const updated = await asUser(db, clinic.users.billing, async (tx) =>
      (await tx.query("update public.patients set notes = 'x' returning id")).rows.length,
    );
    expect(updated).toBe(0);
  });
});

describe("appointments", () => {
  let patientId: string;
  beforeAll(async () => {
    patientId = (await addPatient(clinic.users.receptionist, "Booking", { last_name: "Test" })).id;
  });

  it("blocks double booking the same doctor", async () => {
    await book(clinic.users.receptionist, patientId, "2026-11-02T04:00:00Z", "2026-11-02T04:15:00Z");
    const msg = await rejects(() =>
      book(clinic.users.receptionist, patientId, "2026-11-02T04:10:00Z", "2026-11-02T04:25:00Z"),
    );
    expect(msg).toMatch(/appointments_doctor_overlap/);
    // back-to-back is fine
    await book(clinic.users.receptionist, patientId, "2026-11-02T04:15:00Z", "2026-11-02T04:30:00Z");
  });

  it("frees the slot when cancelled", async () => {
    const id = await book(clinic.users.receptionist, patientId, "2026-11-03T04:00:00Z", "2026-11-03T04:15:00Z");
    await asUser(db, clinic.users.receptionist, (tx) =>
      tx.query("update public.appointments set status = 'cancelled', cancel_reason = 'Unwell' where id = $1", [id]),
    );
    await book(clinic.users.receptionist, patientId, "2026-11-03T04:00:00Z", "2026-11-03T04:15:00Z");
  });

  it("enforces the status flow and logs it", async () => {
    const id = await book(clinic.users.receptionist, patientId, "2026-11-04T04:00:00Z", "2026-11-04T04:15:00Z");
    const msg = await rejects(() =>
      asUser(db, clinic.users.receptionist, (tx) =>
        tx.query("update public.appointments set status = 'completed' where id = $1", [id]),
      ),
    );
    expect(msg).toMatch(/cannot go from scheduled to completed/);

    const token = await asUser(db, clinic.users.receptionist, async (tx) =>
      (await tx.query<{ token_number: number }>("select * from public.check_in($1)", [id])).rows[0].token_number,
    );
    expect(token).toBe(1);
    // checking in twice returns the same token
    const again = await asUser(db, clinic.users.receptionist, async (tx) =>
      (await tx.query<{ token_number: number }>("select * from public.check_in($1)", [id])).rows[0].token_number,
    );
    expect(again).toBe(1);

    const history = await asUser(db, clinic.users.owner, async (tx) =>
      (
        await tx.query<{ to_status: string }>(
          "select to_status from public.appointment_status_history where appointment_id = $1 order by id",
          [id],
        )
      ).rows.map((r) => r.to_status),
    );
    expect(history).toEqual(["scheduled", "checked_in"]);
  });

  it("does not let billing check patients in", async () => {
    const id = await book(clinic.users.receptionist, patientId, "2026-11-05T04:00:00Z", "2026-11-05T04:15:00Z");
    const msg = await rejects(() =>
      asUser(db, clinic.users.billing, (tx) => tx.query("select * from public.check_in($1)", [id])),
    );
    expect(msg).toMatch(/permission/);
  });

  it("limits a restricted doctor to their own patients", async () => {
    const restricted = await addStaff(db, clinic.clinicId, "doctor", "own@asha.test", { restrictToOwnPatients: true });
    const mine = (await addPatient(clinic.users.receptionist, "Mine")).id;
    await book(clinic.users.receptionist, mine, "2026-11-06T04:00:00Z", "2026-11-06T04:15:00Z", restricted.staffId);
    const seen = await asUser(db, restricted.userId, async (tx) =>
      (await tx.query<{ id: string }>("select id from public.patients")).rows.map((r) => r.id),
    );
    expect(seen).toEqual([mine]);
  });
});
