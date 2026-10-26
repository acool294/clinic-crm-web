import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, rejects, seedClinic, type Clinic } from "./harness";

let db: PGlite;
let clinic: Clinic;
let patientId: string;
let serviceId: string;

async function one<T>(userId: string, sql: string, params: unknown[] = []): Promise<T> {
  return asUser(db, userId, async (tx) => (await tx.query<T>(sql, params)).rows[0]);
}

async function invoice(items: unknown[], issue = true): Promise<string> {
  return (
    await one<{ id: string }>(clinic.users.receptionist, "select public.create_invoice($1, $2, $3) as id", [
      patientId,
      JSON.stringify(items),
      issue,
    ])
  ).id;
}

async function totals(id: string) {
  return one<{ total_paise: string; balance_paise: string; payment_status: string; tax_paise: string }>(
    clinic.users.billing,
    "select * from public.invoice_totals where invoice_id = $1",
    [id],
  );
}

beforeAll(async () => {
  db = await createDb();
  clinic = await seedClinic(db);
  await db.query("update public.clinics set invoice_prefix = 'ASH'");
  patientId = (
    await one<{ id: string }>(
      clinic.users.receptionist,
      "insert into public.patients (clinic_id, first_name, phone, consent_messaging, dob) values ($1, 'Kiran', '9800000001', true, '1990-03-10') returning id",
      [clinic.clinicId],
    )
  ).id;
  serviceId = (
    await one<{ id: string }>(
      clinic.users.owner,
      "insert into public.services (clinic_id, name, price_paise) values ($1, 'Consultation', 50000) returning id",
      [clinic.clinicId],
    )
  ).id;
});

describe("services", () => {
  it("only services.manage changes prices", async () => {
    const msg = await rejects(() =>
      asUser(db, clinic.users.receptionist, (tx) =>
        tx.query("insert into public.services (clinic_id, name, price_paise) values ($1, 'Cheap', 1)", [clinic.clinicId]),
      ),
    );
    expect(msg).toMatch(/row-level security/);
  });
});

describe("invoices and payments", () => {
  it("numbers issued invoices by financial year and computes GST", async () => {
    const id = await invoice([
      { service_id: serviceId },
      { description: "Chemical peel", unit_price_paise: 300000, discount_paise: 50000, gst_rate: 18 },
    ]);
    const { invoice_number } = await one<{ invoice_number: string }>(
      clinic.users.billing,
      "select invoice_number from public.invoices where id = $1",
      [id],
    );
    expect(invoice_number).toMatch(/^ASH\/20\d\d-\d\d\/00001$/);
    const t = await totals(id);
    // 500 + (3000 - 500) + 18% of 2500 = 500 + 2500 + 450
    expect(Number(t.tax_paise)).toBe(45000);
    expect(Number(t.total_paise)).toBe(345000);
    expect(t.payment_status).toBe("unpaid");
  });

  it("tracks partial payments instead of marking the invoice paid", async () => {
    const id = await invoice([{ service_id: serviceId }]);
    await one(
      clinic.users.receptionist,
      "insert into public.payments (clinic_id, invoice_id, amount_paise, method) values ($1, $2, 20000, 'cash') returning id",
      [clinic.clinicId, id],
    );
    let t = await totals(id);
    expect(t.payment_status).toBe("partial");
    expect(Number(t.balance_paise)).toBe(30000);

    const over = await rejects(() =>
      asUser(db, clinic.users.receptionist, (tx) =>
        tx.query("insert into public.payments (clinic_id, invoice_id, amount_paise, method, reference) values ($1, $2, 30001, 'upi', 'UTR1')", [
          clinic.clinicId,
          id,
        ]),
      ),
    );
    expect(over).toMatch(/more than the balance/);

    const noRef = await rejects(() =>
      asUser(db, clinic.users.receptionist, (tx) =>
        tx.query("insert into public.payments (clinic_id, invoice_id, amount_paise, method) values ($1, $2, 30000, 'upi')", [
          clinic.clinicId,
          id,
        ]),
      ),
    );
    expect(noRef).toMatch(/check constraint/);

    await one(
      clinic.users.receptionist,
      "insert into public.payments (clinic_id, invoice_id, amount_paise, method, reference) values ($1, $2, 30000, 'upi', 'UTR123') returning id",
      [clinic.clinicId, id],
    );
    t = await totals(id);
    expect(t.payment_status).toBe("paid");
    expect(Number(t.balance_paise)).toBe(0);
  });

  it("freezes items once issued and refuses payments on drafts", async () => {
    const draft = await invoice([{ service_id: serviceId }], false);
    const msg = await rejects(() =>
      asUser(db, clinic.users.receptionist, (tx) =>
        tx.query("insert into public.payments (clinic_id, invoice_id, amount_paise, method) values ($1, $2, 100, 'cash')", [
          clinic.clinicId,
          draft,
        ]),
      ),
    );
    expect(msg).toMatch(/issued invoice/);
    await one(clinic.users.receptionist, "update public.invoices set status = 'issued' where id = $1 returning id", [draft]);
    const edit = await rejects(() =>
      asUser(db, clinic.users.receptionist, (tx) =>
        tx.query("update public.invoice_items set unit_price_paise = 1 where invoice_id = $1", [draft]),
      ),
    );
    expect(edit).toMatch(/cannot change/);
  });

  it("refunds need billing.refund and cannot exceed what was paid", async () => {
    const id = await invoice([{ service_id: serviceId }]);
    await one(
      clinic.users.receptionist,
      "insert into public.payments (clinic_id, invoice_id, amount_paise, method) values ($1, $2, 50000, 'cash') returning id",
      [clinic.clinicId, id],
    );
    const receptionist = await rejects(() =>
      asUser(db, clinic.users.receptionist, (tx) =>
        tx.query("insert into public.refunds (clinic_id, invoice_id, amount_paise, method, reason) values ($1, $2, 100, 'cash', 'x')", [
          clinic.clinicId,
          id,
        ]),
      ),
    );
    expect(receptionist).toMatch(/row-level security/);
    const tooMuch = await rejects(() =>
      asUser(db, clinic.users.billing, (tx) =>
        tx.query("insert into public.refunds (clinic_id, invoice_id, amount_paise, method, reason) values ($1, $2, 50001, 'cash', 'x')", [
          clinic.clinicId,
          id,
        ]),
      ),
    );
    expect(tooMuch).toMatch(/more than/);

    const notAllowed = await rejects(() =>
      asUser(db, clinic.users.receptionist, (tx) =>
        tx.query("update public.invoices set status = 'void', void_reason = 'x' where id = $1", [id]),
      ),
    );
    expect(notAllowed).toMatch(/permission to void/);

    const voidFirst = await rejects(() =>
      asUser(db, clinic.users.billing, (tx) =>
        tx.query("update public.invoices set status = 'void', void_reason = 'Wrong patient' where id = $1", [id]),
      ),
    );
    expect(voidFirst).toMatch(/Refund the payments/);
    await one(
      clinic.users.billing,
      "insert into public.refunds (clinic_id, invoice_id, amount_paise, method, reason) values ($1, $2, 50000, 'cash', 'Wrong patient') returning id",
      [clinic.clinicId, id],
    );
    await one(clinic.users.billing, "update public.invoices set status = 'void', void_reason = 'Wrong patient' where id = $1 returning id", [
      id,
    ]);
    expect((await totals(id)).payment_status).toBe("void");
  });

  it("never lets anyone edit or delete a payment", async () => {
    const msg = await rejects(() =>
      asUser(db, clinic.users.owner, (tx) => tx.query("update public.payments set amount_paise = 1")),
    );
    expect(msg).toMatch(/permission denied/);
  });

  it("closes the day against the register", async () => {
    const day = await one<{ d: string }>(clinic.users.billing, "select to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as d");
    const summary = await asUser(db, clinic.users.billing, async (tx) =>
      (await tx.query<{ method: string; net_paise: string }>("select * from public.cash_summary($1)", [day.d])).rows,
    );
    const cash = Number(summary.find((r) => r.method === "cash")!.net_paise);
    expect(cash).toBe(20000 + 50000 - 50000);
    await one(clinic.users.billing, "select public.close_cash_day($1, $2, 'ok') as id", [day.d, 19000]);
    const { difference_paise } = await one<{ difference_paise: string }>(
      clinic.users.billing,
      "select difference_paise from public.cash_closings",
    );
    expect(Number(difference_paise)).toBe(-1000);
    const again = await rejects(() =>
      asUser(db, clinic.users.billing, (tx) => tx.query("select public.close_cash_day($1, 0)", [day.d])),
    );
    expect(again).toMatch(/duplicate key/);
  });
});

describe("messaging", () => {
  it("enqueues reminders once, only for patients who consented", async () => {
    await one(
      clinic.users.receptionist,
      `insert into public.appointments (clinic_id, patient_id, doctor_id, starts_at, ends_at)
       values ($1, $2, $3, now() + interval '24 hours', now() + interval '24 hours 15 minutes') returning id`,
      [clinic.clinicId, patientId, clinic.staff.doctor],
    );
    const first = await db.query<{ n: number }>("select public.enqueue_due_messages() as n");
    const second = await db.query<{ n: number }>("select public.enqueue_due_messages() as n");
    expect(first.rows[0].n).toBeGreaterThanOrEqual(2); // whatsapp + sms
    expect(second.rows[0].n).toBe(0);

    await db.query("update public.patients set messaging_opt_out_at = now() where id = $1", [patientId]);
    await db.query("delete from public.message_queue");
    const optedOut = await db.query<{ n: number }>("select public.enqueue_due_messages() as n");
    expect(optedOut.rows[0].n).toBe(0);
  });

  it("is not callable by staff", async () => {
    const msg = await rejects(() =>
      asUser(db, clinic.users.owner, (tx) => tx.query("select public.enqueue_due_messages()")),
    );
    expect(msg).toMatch(/permission denied/);
  });
});

describe("analytics and merge", () => {
  it("reports revenue only to analytics.read", async () => {
    const day = new Date().toISOString().slice(0, 10);
    const forBilling = await asUser(db, clinic.users.billing, async (tx) =>
      (await tx.query("select * from public.revenue_by_day(($1::date - 1), ($1::date + 1))", [day])).rows,
    );
    expect(forBilling.length).toBeGreaterThan(0);
    const forDoctor = await asUser(db, clinic.users.doctor, async (tx) =>
      (await tx.query("select * from public.revenue_by_day(($1::date - 1), ($1::date + 1))", [day])).rows,
    );
    expect(forDoctor).toEqual([]);
  });

  it("merges a duplicate into the kept record", async () => {
    const dup = await one<{ id: string }>(
      clinic.users.receptionist,
      "insert into public.patients (clinic_id, first_name, email) values ($1, 'Kiran', 'kiran@example.com') returning id",
      [clinic.clinicId],
    );
    await one(clinic.users.receptionist, "select public.create_invoice($1, $2) as id", [
      dup.id,
      JSON.stringify([{ service_id: serviceId }]),
    ]);
    const denied = await rejects(() =>
      asUser(db, clinic.users.receptionist, (tx) => tx.query("select public.merge_patients($1, $2)", [patientId, dup.id])),
    );
    expect(denied).toMatch(/permission/);
    await one(clinic.users.owner, "select public.merge_patients($1, $2)", [patientId, dup.id]);
    const left = await one<{ n: string }>(clinic.users.owner, "select count(*) as n from public.invoices where patient_id = $1", [dup.id]);
    expect(Number(left.n)).toBe(0);
    const kept = await one<{ email: string }>(clinic.users.owner, "select email from public.patients where id = $1", [patientId]);
    expect(kept.email).toBe("kiran@example.com");
  });
});
