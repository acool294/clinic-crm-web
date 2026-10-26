import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

const root = path.resolve(__dirname, "../..");
const migrationsDir = path.join(root, "supabase/migrations");

export type Role = "owner" | "doctor" | "nurse" | "receptionist" | "billing";

export async function createDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pg_trgm, btree_gist } });
  await db.exec(readFileSync(path.join(__dirname, "supabase-shim.sql"), "utf8"));
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await db.exec(readFileSync(path.join(migrationsDir, file), "utf8"));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }
  return db;
}

export interface Clinic {
  clinicId: string;
  users: Record<Role, string>;
  staff: Record<Role, string>;
  specialties: Record<string, string>;
}

async function addUser(db: PGlite | Transaction, email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [email],
  );
  return rows[0].id;
}

/** Sets up a clinic with one staff member per role. Runs as the superuser. */
export async function seedClinic(db: PGlite, name = "Asha Clinic"): Promise<Clinic> {
  const tag = name.toLowerCase().replace(/\W+/g, "");
  const ownerUser = await addUser(db, `owner@${tag}.test`);
  let clinicId: string;
  const existing = await db.query("select 1 from public.clinics");
  if (existing.rows.length === 0) {
    const { rows } = await db.query<{ id: string }>(
      "select public.bootstrap_clinic($1, $2, 'Olivia Owner', $3) as id",
      [name, ownerUser, `owner@${tag}.test`],
    );
    clinicId = rows[0].id;
  } else {
    // A second clinic exists only in tests, to prove clinics cannot see each other.
    const { rows } = await db.query<{ id: string }>(
      "insert into public.clinics (name) values ($1) returning id",
      [name],
    );
    clinicId = rows[0].id;
    const staff = await db.query<{ id: string }>(
      "insert into public.staff (clinic_id, user_id, full_name, email) values ($1, $2, 'Other Owner', $3) returning id",
      [clinicId, ownerUser, `owner@${tag}.test`],
    );
    await db.query("insert into public.staff_roles values ($1, 'owner')", [staff.rows[0].id]);
    await db.query(
      `insert into public.specialties (clinic_id, code, name) values
       ($1, 'general_medicine', 'General Medicine'), ($1, 'pediatrics', 'Pediatrics'),
       ($1, 'obgyn', 'Gynecology & Obstetrics'), ($1, 'dermatology', 'Dermatology')`,
      [clinicId],
    );
  }

  const users = { owner: ownerUser } as Record<Role, string>;
  const staff = {} as Record<Role, string>;
  const ownerStaff = await db.query<{ id: string }>(
    "select id from public.staff where user_id = $1",
    [ownerUser],
  );
  staff.owner = ownerStaff.rows[0].id;

  for (const role of ["doctor", "nurse", "receptionist", "billing"] as const) {
    const email = `${role}@${tag}.test`;
    users[role] = await addUser(db, email);
    const { rows } = await db.query<{ id: string }>(
      "insert into public.staff (clinic_id, user_id, full_name, email) values ($1, $2, $3, $4) returning id",
      [clinicId, users[role], `Test ${role}`, email],
    );
    staff[role] = rows[0].id;
    await db.query("insert into public.staff_roles values ($1, $2)", [staff[role], role]);
  }

  const specs = await db.query<{ id: string; code: string }>(
    "select id, code from public.specialties where clinic_id = $1",
    [clinicId],
  );
  const specialties = Object.fromEntries(specs.rows.map((r) => [r.code, r.id]));
  await db.query(
    "insert into public.doctor_specialties (staff_id, specialty_id, is_primary) values ($1, $2, true)",
    [staff.doctor, specialties.general_medicine],
  );

  return { clinicId, users, staff, specialties };
}

export async function addStaff(
  db: PGlite,
  clinicId: string,
  role: Role,
  email: string,
  opts: { specialtyId?: string; restrictToOwnPatients?: boolean } = {},
): Promise<{ userId: string; staffId: string }> {
  const userId = await addUser(db, email);
  const { rows } = await db.query<{ id: string }>(
    `insert into public.staff (clinic_id, user_id, full_name, email, restrict_to_own_patients)
     values ($1, $2, $3, $4, $5) returning id`,
    [clinicId, userId, email, email, opts.restrictToOwnPatients ?? false],
  );
  const staffId = rows[0].id;
  await db.query("insert into public.staff_roles values ($1, $2)", [staffId, role]);
  if (opts.specialtyId) {
    await db.query("insert into public.doctor_specialties (staff_id, specialty_id) values ($1, $2)", [
      staffId,
      opts.specialtyId,
    ]);
  }
  return { userId, staffId };
}

/**
 * Runs fn as a signed-in user, the way PostgREST does: role `authenticated`
 * with the JWT claims in request.jwt.claims. The transaction commits unless fn throws.
 */
export async function asUser<T>(
  db: PGlite,
  userId: string | null,
  fn: (tx: Transaction) => Promise<T>,
  opts: { aal?: "aal1" | "aal2"; role?: "authenticated" | "anon" | "service_role" } = {},
): Promise<T> {
  const role = opts.role ?? (userId ? "authenticated" : "anon");
  const claims = JSON.stringify({ sub: userId ?? "", role, aal: opts.aal ?? "aal2" });
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    await tx.query(`set local role ${role}`);
    return fn(tx);
  });
}

/** Returns the error message fn throws, or fails if it does not throw. */
export async function rejects(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("Expected the statement to be refused, but it succeeded");
}
