// The permission keys the app checks. The database holds the same list in
// public.permissions (tests/db/foundation.test.ts keeps the two in sync), and
// RLS checks them again, so a missed check here still cannot leak data.

export const PERMISSIONS = [
  "settings.manage",
  "staff.read",
  "staff.manage",
  "audit.read",
  "patients.read",
  "patients.write",
  "patients.delete",
  "patients.merge",
  "appointments.read",
  "appointments.write",
  "queue.manage",
  "vitals.write",
  "clinical.read",
  "clinical.write",
  "prescriptions.write",
  "documents.read",
  "documents.write",
  "lab.read",
  "lab.write",
  "billing.read",
  "billing.write",
  "billing.refund",
  "billing.close",
  "services.manage",
  "messages.read",
  "messages.manage",
  "analytics.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ["owner", "doctor", "nurse", "receptionist", "billing"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  doctor: "Doctor",
  nurse: "Nurse",
  receptionist: "Receptionist",
  billing: "Billing",
};

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
