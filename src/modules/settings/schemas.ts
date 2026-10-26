import { z } from "zod";
import { ROLES } from "@/lib/auth/permissions";

const optional = z.string().trim().optional().transform((v) => (v ? v : null));

export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const time = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM");

export const clinicSchema = z.object({
  name: z.string().trim().min(2, "Enter the clinic's name"),
  legal_name: optional,
  registration_number: optional,
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(v), "This is not a valid GSTIN"),
  address_line1: optional,
  address_line2: optional,
  city: optional,
  state: optional,
  pincode: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[1-9][0-9]{5}$/.test(v), "Enter a 6-digit PIN code"),
  phone: optional,
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")).transform((v) => v || null),
  website: optional,
  letterhead_header: optional,
  letterhead_footer: optional,
  mrn_prefix: z.string().trim().regex(/^[A-Z0-9]{1,8}$/, "Up to 8 capital letters or digits"),
  invoice_prefix: z.string().trim().regex(/^[A-Z0-9]{1,8}$/, "Up to 8 capital letters or digits"),
  default_slot_minutes: z.coerce.number().int().min(5).max(240),
  mfa_doctors: z.literal("on").optional(),
});

export function openingHoursFrom(form: Record<string, unknown>) {
  const hours: Record<string, { open: string; close: string } | null> = {};
  for (const d of WEEKDAYS) {
    const open = form[`${d}_open`];
    const close = form[`${d}_close`];
    const closed = form[`${d}_closed`] === "on";
    hours[d] =
      !closed && typeof open === "string" && typeof close === "string" && time.safeParse(open).success && time.safeParse(close).success
        ? { open, close }
        : null;
  }
  return hours;
}

export const inviteSchema = z.object({
  full_name: z.string().trim().min(2, "Enter the name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: optional,
  title: optional,
  registration_number: optional,
  roles: z.array(z.enum(ROLES)).min(1, "Pick at least one role"),
  specialties: z.array(z.string().uuid()).optional().default([]),
});

export const staffUpdateSchema = inviteSchema.omit({ email: true }).extend({
  restrict_to_own_patients: z.literal("on").optional(),
});

export const scheduleSchema = z.object({
  doctor_id: z.string().uuid(),
  weekday: z.coerce.number().int().min(0).max(6),
  start_time: time,
  end_time: time,
  slot_minutes: z.coerce.number().int().min(5).max(240),
  room_id: z.string().uuid().optional(),
  specialty_id: z.string().uuid().optional(),
}).refine((v) => v.end_time > v.start_time, { message: "End must be after start", path: ["end_time"] });

export const specialtySchema = z.object({
  name: z.string().trim().min(2, "Enter a name"),
  code: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{1,30}$/, "Lowercase letters, digits and _"),
});

export const roomSchema = z.object({
  name: z.string().trim().min(1, "Enter a name"),
  specialty_id: z.string().uuid().optional(),
});

export const serviceSchema = z.object({
  name: z.string().trim().min(2, "Enter a name"),
  code: optional,
  category: z.enum(["consultation", "procedure", "lab", "package", "product", "other"]),
  specialty_id: z.string().uuid().optional(),
  doctor_id: z.string().uuid().optional(),
  visit_type: z.enum(["new", "follow_up", "procedure"]).optional(),
  price: z.string().trim().min(1, "Enter a price"),
  gst_rate: z.coerce.number().refine((v) => [0, 5, 12, 18, 28].includes(v), "GST must be 0, 5, 12, 18 or 28%"),
  sac_code: optional,
  sessions: z.coerce.number().int().positive().optional(),
});

export const templateSchema = z.object({
  body: z.string().trim().min(5, "Write the message").max(1000),
  provider_template: optional,
  is_active: z.literal("on").optional(),
});

export const recallSchema = z.object({
  name: z.string().trim().min(2),
  specialty_id: z.string().uuid().optional(),
  days_after_last_visit: z.coerce.number().int().min(1).max(1095),
});

const fieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,40}$/),
  label: z.string().min(1).max(80),
  type: z.enum(["text", "textarea", "number", "select", "checkbox", "date"]),
  options: z.array(z.string()).optional(),
  unit: z.string().optional(),
});

export const formTemplateSchema = z.object({
  name: z.string().trim().min(2, "Enter a name"),
  specialty_id: z.string().uuid(),
  // one field per line: "Label | type | option1, option2"
  fields: z.string().trim().min(1, "Add at least one field"),
});

/** Parses the simple one-field-per-line format used in the form builder. */
export function parseFieldLines(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, rawType = "text", rawOptions = ""] = line.split("|").map((s) => s.trim());
      const type = (["text", "textarea", "number", "select", "checkbox", "date"].includes(rawType) ? rawType : "text") as z.infer<
        typeof fieldSchema
      >["type"];
      const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "field";
      const options = type === "select" ? rawOptions.split(",").map((o) => o.trim()).filter(Boolean) : undefined;
      return fieldSchema.parse({ key: /^[a-z]/.test(key) ? key : `f_${key}`, label, type, options });
    });
}

