import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPermission, type Permission, type Role } from "./permissions";

export interface Session {
  userId: string;
  email: string;
  staffId: string;
  clinicId: string;
  fullName: string;
  roles: Role[];
  permissions: Set<Permission>;
  /** Owner/doctor without a completed second factor: the database withholds their permissions. */
  needsMfa: boolean;
}

export class ForbiddenError extends Error {
  constructor(public permission: Permission) {
    super(`You do not have permission to do this (${permission}).`);
    this.name = "ForbiddenError";
  }
}

/**
 * The signed-in staff member, read once per request. Checks the JWT with
 * Supabase (getClaims verifies the signature), then asks the database for the
 * same roles and permissions RLS will use.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const claims = data.claims;

  const { data: rows } = await supabase.rpc("my_access");
  const access = rows?.[0];
  if (!access) return null;

  const needsMfa = access.mfa_required && claims.aal !== "aal2";
  return {
    userId: claims.sub,
    email: String(claims.email ?? ""),
    staffId: access.staff_id,
    clinicId: access.clinic_id,
    fullName: access.full_name,
    roles: access.roles as Role[],
    permissions: new Set(needsMfa ? [] : access.permissions.filter(isPermission)),
    needsMfa,
  };
});

/** For pages and layouts: sends people to log in, or to the second factor. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.needsMfa) redirect("/mfa");
  return session;
}

export function can(session: Session | null, permission: Permission): boolean {
  return !!session && session.permissions.has(permission);
}

/** For pages: renders the 403 page when the permission is missing. */
export async function requirePermission(permission: Permission): Promise<Session> {
  const session = await requireSession();
  if (!can(session, permission)) redirect(`/forbidden?need=${encodeURIComponent(permission)}`);
  return session;
}

/** For server actions and route handlers: throws instead of redirecting. */
export async function assertPermission(...permissions: Permission[]): Promise<Session> {
  const session = await getSession();
  if (!session || session.needsMfa) throw new ForbiddenError(permissions[0]);
  for (const p of permissions) if (!session.permissions.has(p)) throw new ForbiddenError(p);
  return session;
}
