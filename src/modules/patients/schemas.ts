import { z } from "zod";

const optional = z.string().trim().optional().transform((v) => (v ? v : null));

/** Indian mobile numbers are stored as 10 digits; other numbers keep their country code. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits || null;
}

const phone = z
  .string()
  .optional()
  .transform((v) => normalizePhone(v))
  .refine((v) => v === null || /^[0-9]{10,13}$/.test(v), "Enter a 10-digit mobile number");

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

export const patientSchema = z.object({
  first_name: z.string().trim().min(1, "Enter the first name"),
  last_name: optional,
  dob: z
    .string()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || (!Number.isNaN(Date.parse(v)) && v <= new Date().toISOString().slice(0, 10)), "Date of birth cannot be in the future"),
  sex: z.enum(["male", "female", "other", "unknown"]).default("unknown"),
  phone,
  alt_phone: phone,
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")).transform((v) => v || null),
  address: optional,
  city: optional,
  state: optional,
  pincode: optional,
  blood_group: z.enum(BLOOD_GROUPS).optional().transform((v) => v ?? null),
  abha_number: optional,
  emergency_contact_name: optional,
  emergency_contact_phone: phone,
  emergency_contact_relation: optional,
  insurance_provider: optional,
  insurance_policy_number: optional,
  notes: optional,
  tags: z
    .string()
    .optional()
    .transform((v) => (v ? [...new Set(v.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))] : [])),
  consent_treatment: z.literal("on").optional(),
  consent_messaging: z.literal("on").optional(),
});

export type PatientInput = z.infer<typeof patientSchema>;

export const allergySchema = z.object({
  allergen: z.string().trim().min(2, "Enter what they are allergic to"),
  reaction: optional,
  severity: z.enum(["mild", "moderate", "severe"]).default("moderate"),
});

export const conditionSchema = z.object({
  name: z.string().trim().min(2, "Enter the condition"),
  icd10_code: optional,
  since: z.string().optional().transform((v) => v || null),
});
