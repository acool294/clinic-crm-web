import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { asUser, createDb, rejects, seedClinic, type Clinic } from "./harness";

let db: PGlite;
let clinic: Clinic;
let other: Clinic;

beforeAll(async () => {
  db = await createDb();
  clinic = await seedClinic(db, "Asha Clinic");
  other = await seedClinic(db, "Other Clinic");
});

describe("schema hygiene", () => {
  it("has RLS enabled on every public table", async () => {
    const { rows } = await db.query<{ relname: string }>(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("gives anon nothing in public", async () => {
    const { rows } = await db.query<{ table_name: string }>(`
      select table_name from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public'`);
    expect(rows).toEqual([]);
  });

  it("pins search_path on every security definer function", async () => {
    const { rows } = await db.query<{ proname: string }>(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'app') and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
    expect(rows).toEqual([]);
  });

  it("keeps the permission list in sync with the app", async () => {
    const { rows } = await db.query<{ key: string }>("select key from public.permissions order by key");
    expect(rows.map((r) => r.key)).toEqual([...PERMISSIONS].sort());
  });
});

describe("bootstrap", () => {
  it("can only run once", async () => {
    const msg = await rejects(() =>
      db.query("select public.bootstrap_clinic('Again', gen_random_uuid(), 'X', 'x@x.test')"),
    );
    expect(msg).toMatch(/already set up/);
  });

  it("cannot be called by a signed-in user", async () => {
    const msg = await rejects(() =>
      asUser(db, clinic.users.owner, (tx) =>
        tx.query("select public.bootstrap_clinic('Mine', $1, 'X', 'x@x.test')", [clinic.users.owner]),
      ),
    );
    expect(msg).toMatch(/permission denied/);
  });
});

describe("access", () => {
  it("returns my roles and permissions", async () => {
    const rows = await asUser(db, clinic.users.receptionist, async (tx) =>
      (await tx.query<{ roles: string[]; permissions: string[] }>("select * from public.my_access()")).rows,
    );
    expect(rows[0].roles).toEqual(["receptionist"]);
    expect(rows[0].permissions).toContain("patients.write");
    expect(rows[0].permissions).not.toContain("clinical.read");
  });

  it("isolates clinics from each other", async () => {
    const names = await asUser(db, clinic.users.owner, async (tx) =>
      (await tx.query<{ name: string }>("select name from public.clinics")).rows.map((r) => r.name),
    );
    expect(names).toEqual(["Asha Clinic"]);
    const staff = await asUser(db, other.users.owner, async (tx) =>
      (await tx.query<{ clinic_id: string }>("select clinic_id from public.staff")).rows,
    );
    expect(staff.every((s) => s.clinic_id === other.clinicId)).toBe(true);
  });

  it("gives anonymous callers nothing", async () => {
    const msg = await rejects(() => asUser(db, null, (tx) => tx.query("select * from public.staff")));
    expect(msg).toMatch(/permission denied/);
  });

  it("lets only settings.manage edit the clinic", async () => {
    const updated = await asUser(db, clinic.users.receptionist, async (tx) =>
      (await tx.query("update public.clinics set name = 'Hacked' returning id")).rows.length,
    );
    expect(updated).toBe(0);
    await asUser(db, clinic.users.owner, (tx) =>
      tx.query("update public.clinics set gstin = '27AAPFU0939F1ZV', letterhead_footer = 'Mon-Sat 9-6'"),
    );
    const { rows } = await db.query<{ gstin: string }>("select gstin from public.clinics where id = $1", [clinic.clinicId]);
    expect(rows[0].gstin).toBe("27AAPFU0939F1ZV");
  });

  it("rejects an invalid GSTIN", async () => {
    const msg = await rejects(() =>
      asUser(db, clinic.users.owner, (tx) => tx.query("update public.clinics set gstin = 'NOT-A-GSTIN'")),
    );
    expect(msg).toMatch(/check constraint/);
  });

  it("lets only staff.manage add staff", async () => {
    const msg = await rejects(() =>
      asUser(db, clinic.users.doctor, (tx) =>
        tx.query("insert into public.staff (clinic_id, full_name, email) values ($1, 'New', 'new@x.test')", [
          clinic.clinicId,
        ]),
      ),
    );
    expect(msg).toMatch(/row-level security/);
    await asUser(db, clinic.users.owner, (tx) =>
      tx.query("insert into public.staff (clinic_id, full_name, email) values ($1, 'New Nurse', 'nn@asha.test')", [
        clinic.clinicId,
      ]),
    );
  });

  it("blocks writing staff into another clinic", async () => {
    const msg = await rejects(() =>
      asUser(db, clinic.users.owner, (tx) =>
        tx.query("insert into public.staff (clinic_id, full_name, email) values ($1, 'Spy', 'spy@x.test')", [
          other.clinicId,
        ]),
      ),
    );
    expect(msg).toMatch(/row-level security/);
  });

  it("never removes the last owner", async () => {
    const msg = await rejects(() =>
      asUser(db, clinic.users.owner, (tx) =>
        tx.query("delete from public.staff_roles where staff_id = $1 and role = 'owner'", [clinic.staff.owner]),
      ),
    );
    expect(msg).toMatch(/at least one active owner/);
  });

  it("protects the owner's own management permissions", async () => {
    const msg = await rejects(() =>
      asUser(db, clinic.users.owner, (tx) =>
        tx.query("delete from public.role_permissions where role = 'owner' and permission = 'settings.manage'"),
      ),
    );
    expect(msg).toMatch(/cannot lose/);
  });

  it("stops a deactivated staff member at once", async () => {
    const { rows } = await db.query<{ id: string; user_id: string }>(
      "insert into auth.users (email) values ('gone@asha.test') returning id as user_id, id",
    );
    const staff = await db.query<{ id: string }>(
      "insert into public.staff (clinic_id, user_id, full_name, email) values ($1, $2, 'Gone', 'gone@asha.test') returning id",
      [clinic.clinicId, rows[0].user_id],
    );
    await db.query("insert into public.staff_roles values ($1, 'receptionist')", [staff.rows[0].id]);
    await db.query("update public.staff set is_active = false where id = $1", [staff.rows[0].id]);
    const seen = await asUser(db, rows[0].user_id, async (tx) =>
      (await tx.query("select * from public.clinics")).rows.length,
    );
    expect(seen).toBe(0);
  });
});

describe("two-factor", () => {
  it("holds back owner permissions until the second factor is done", async () => {
    const aal1 = await asUser(
      db,
      clinic.users.owner,
      async (tx) => (await tx.query<{ ok: boolean }>("select app.has_permission('settings.manage') as ok")).rows[0].ok,
      { aal: "aal1" },
    );
    expect(aal1).toBe(false);
    const aal2 = await asUser(db, clinic.users.owner, async (tx) =>
      (await tx.query<{ ok: boolean }>("select app.has_permission('settings.manage') as ok")).rows[0].ok,
    );
    expect(aal2).toBe(true);
  });

  it("does not require it from a receptionist", async () => {
    const ok = await asUser(
      db,
      clinic.users.receptionist,
      async (tx) => (await tx.query<{ ok: boolean }>("select app.has_permission('patients.read') as ok")).rows[0].ok,
      { aal: "aal1" },
    );
    expect(ok).toBe(true);
  });
});

describe("audit log", () => {
  it("records writes and explicit views", async () => {
    await asUser(db, clinic.users.owner, (tx) =>
      tx.query("select public.log_event('export', 'report', null, null, '{\"report\":\"revenue\"}')"),
    );
    const rows = await asUser(db, clinic.users.owner, async (tx) =>
      (await tx.query<{ action: string; entity: string }>("select action, entity from public.audit_log")).rows,
    );
    expect(rows).toContainEqual({ action: "update", entity: "clinics" });
    expect(rows).toContainEqual({ action: "export", entity: "report" });
  });

  it("is append-only and hidden from other roles", async () => {
    const msg = await rejects(() =>
      asUser(db, clinic.users.owner, (tx) => tx.query("delete from public.audit_log")),
    );
    expect(msg).toMatch(/permission denied/);
    const forged = await rejects(() =>
      asUser(db, clinic.users.owner, (tx) =>
        tx.query("insert into public.audit_log (action, entity) values ('view', 'x')"),
      ),
    );
    expect(forged).toMatch(/permission denied/);
    const seen = await asUser(db, clinic.users.doctor, async (tx) =>
      (await tx.query("select * from public.audit_log")).rows.length,
    );
    expect(seen).toBe(0);
  });

  it("limits login attempts", async () => {
    for (let i = 0; i < 5; i++) {
      await db.query("select public.log_login_failure('Victim@x.test', '1.2.3.4')");
    }
    const { rows } = await db.query<{ ok: boolean }>("select public.login_allowed('victim@x.test', '9.9.9.9') as ok");
    expect(rows[0].ok).toBe(false);
    const anon = await rejects(() =>
      asUser(db, null, (tx) => tx.query("select public.log_login_failure('a@b.c', '1.1.1.1')")),
    );
    expect(anon).toMatch(/permission denied/);
  });
});

describe("staff functions", () => {
  it("creates staff with roles and departments in one go", async () => {
    const { rows } = await db.query<{ id: string }>("insert into auth.users (email) values ('newdoc@asha.test') returning id");
    const id = await asUser(db, clinic.users.owner, async (tx) =>
      (
        await tx.query<{ id: string }>(
          "select public.save_staff(null, $1, 'Dr New', 'newdoc@asha.test', null, 'MD', 'KMC 123', '{doctor}', $2) as id",
          [rows[0].id, [clinic.specialties.pediatrics]],
        )
      ).rows[0].id,
    );
    const roles = await db.query<{ role: string }>("select role::text from public.staff_roles where staff_id = $1", [id]);
    expect(roles.rows).toEqual([{ role: "doctor" }]);
    const msg = await rejects(() =>
      asUser(db, clinic.users.receptionist, (tx) =>
        tx.query("select public.save_staff($1, null, 'X', 'x', null, null, null, '{owner}', '{}')", [id]),
      ),
    );
    expect(msg).toMatch(/row-level security|not editable/);
  });

  it("lets the owner change a role's permissions", async () => {
    await asUser(db, clinic.users.owner, (tx) =>
      tx.query("select public.set_role_permissions('receptionist', '{patients.read,appointments.read}')"),
    );
    const perms = await asUser(db, clinic.users.receptionist, async (tx) =>
      (await tx.query<{ permissions: string[] }>("select permissions from public.my_access()")).rows[0].permissions,
    );
    expect(perms).toEqual(["appointments.read", "patients.read"]);
  });
});

describe("access requests", () => {
  it("records a request for the owner and hides it from others", async () => {
    await db.query("select public.submit_access_request('New Nurse', 'asker@x.test', null, 'nurse', 'Joined Monday', '5.5.5.5')");
    // asking twice does not create a second request
    await db.query("select public.submit_access_request('New Nurse', 'ASKER@x.test', null, 'nurse', null, '5.5.5.5')");
    const owner = await asUser(db, clinic.users.owner, async (tx) =>
      (await tx.query<{ email: string }>("select email from public.access_requests")).rows,
    );
    expect(owner).toEqual([{ email: "asker@x.test" }]);
    const nurse = await asUser(db, clinic.users.nurse, async (tx) => (await tx.query("select * from public.access_requests")).rows.length);
    expect(nurse).toBe(0);
    const anon = await rejects(() =>
      asUser(db, null, (tx) => tx.query("select public.submit_access_request('a b', 'a@b.c', null, null, null, '1')")),
    );
    expect(anon).toMatch(/permission denied/);
  });

  it("limits requests per network", async () => {
    for (let i = 0; i < 4; i++) await db.query(`select public.submit_access_request('Spam ${i}', 'spam${i}@x.test', null, null, null, '5.5.5.5')`);
    const msg = await rejects(() => db.query("select public.submit_access_request('Spam', 'spam9@x.test', null, null, null, '5.5.5.5')"));
    expect(msg).toMatch(/Too many/);
  });
});
