import { z } from "zod";

const num = (min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : Number(v)))
    .refine((v) => v === null || (Number.isFinite(v) && v >= min && v <= max), `Must be between ${min} and ${max}`);

const text = (max = 4000) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const date = z.string().optional().transform((v) => (v ? v : null)).refine((v) => v === null || !Number.isNaN(Date.parse(v)), "Not a date");

export const vitalsSchema = z
  .object({
    height_cm: num(20, 250),
    weight_kg: num(0.3, 400),
    head_circumference_cm: num(20, 70),
    temperature_c: num(30, 45),
    pulse_bpm: num(20, 250),
    respiratory_rate: num(4, 80),
    bp_systolic: num(50, 260),
    bp_diastolic: num(30, 160),
    spo2: num(50, 100),
    blood_glucose_mgdl: num(20, 800),
  })
  .refine((v) => Object.values(v).some((x) => x !== null), { message: "Enter at least one value" })
  .refine((v) => (v.bp_systolic === null) === (v.bp_diastolic === null), { message: "Enter both BP numbers", path: ["bp_diastolic"] });

export const encounterSchema = z.object({
  chief_complaint: text(500),
  history: text(),
  examination: text(),
  treatment_plan: text(),
  advice: text(),
  follow_up_on: date,
});

export const diagnosisSchema = z.object({
  icd10_code: z.string().trim().max(10).optional().transform((v) => (v ? v.toUpperCase() : null)),
  description: z.string().trim().min(2, "Describe the diagnosis").max(300),
  kind: z.enum(["provisional", "final"]).default("provisional"),
});

export const rxItemSchema = z.object({
  medication_id: z.string().uuid().optional().or(z.literal("")).transform((v) => v || undefined),
  drug_name: z.string().trim().min(1, "Enter the medicine").max(200),
  generic_name: z.string().trim().max(200).optional(),
  dose: z.string().trim().max(60).optional(),
  frequency: z.string().trim().max(60).optional(),
  timing: z.string().trim().max(60).optional(),
  duration_days: z.coerce.number().int().min(1).max(365).optional().or(z.literal("").transform(() => undefined)),
  route: z.string().trim().max(30).optional(),
  instructions: z.string().trim().max(300).optional(),
});

export const prescriptionSchema = z.object({
  items: z.array(rxItemSchema).max(30),
  notes: z.string().trim().max(1000).optional(),
  override_reason: z.string().trim().max(300).optional(),
});

export type RxItem = {
  medication_id?: string;
  drug_name: string;
  generic_name?: string;
  dose?: string;
  frequency?: string;
  timing?: string;
  duration_days?: number;
  route?: string;
  instructions?: string;
};

export const noteSchema = z.object({
  body: z.string().trim().min(1, "Write the note").max(8000),
  visibility: z.enum(["clinical_staff", "same_specialty", "author_only"]).default("clinical_staff"),
});

export const referralSchema = z.object({
  to_specialty_id: z.string().uuid("Pick a department"),
  to_doctor_id: z.string().uuid().optional(),
  reason: z.string().trim().min(3, "Give a reason").max(1000),
  urgency: z.enum(["routine", "soon", "urgent"]).default("routine"),
});

// ---------------------------------------------------------------------------
// Specialty panels: each validates what it stores in encounter_forms.data
// ---------------------------------------------------------------------------

export const panelSchemas = {
  growth_chart: z.object({ note: text(1000) }),
  vaccinations: z.object({ note: text(1000) }),
  obstetric_history: z.object({
    lmp: date,
    edd_by_scan: date,
    gravida: num(0, 20),
    para: num(0, 20),
    abortions: num(0, 20),
    living: num(0, 20),
    high_risk: z.boolean().optional(),
    risk_factors: text(1000),
    notes: text(2000),
  }),
  antenatal_visit: z.object({
    weight_kg: num(20, 250),
    bp: z.string().trim().max(10).optional().transform((v) => v || null).refine((v) => v === null || /^\d{2,3}\/\d{2,3}$/.test(v), "Use 120/80"),
    fundal_height_cm: num(5, 50),
    fetal_heart_rate: num(60, 220),
    presentation: z.enum(["", "cephalic", "breech", "transverse", "not_assessed"]).optional().transform((v) => v || null),
    fetal_movements: z.enum(["", "present", "reduced", "absent"]).optional().transform((v) => v || null),
    oedema: z.boolean().optional(),
    urine_albumin: z.enum(["", "nil", "trace", "+", "++", "+++"]).optional().transform((v) => v || null),
    urine_sugar: z.enum(["", "nil", "trace", "+", "++", "+++"]).optional().transform((v) => v || null),
    hb: num(3, 20),
    notes: text(2000),
  }),
  skin_photos: z.object({ note: text(1000) }),
  body_map: z.object({
    marks: z
      .array(
        z.object({
          view: z.enum(["front", "back"]),
          x: z.number().min(0).max(100),
          y: z.number().min(0).max(100),
          label: z.string().trim().max(80),
        }),
      )
      .max(60),
    note: text(1000),
  }),
  procedure_sessions: z.object({
    procedure: z.string().trim().min(2, "Name the procedure").max(120),
    area: text(120),
    session_number: num(1, 100),
    total_sessions: num(1, 100),
    settings: text(500),
    response: text(1000),
    next_session_on: date,
  }),
} as const;

/** Schema for a custom form built in Settings. */
export function customFormSchema(fields: { key: string; type: string; options?: string[] }[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    if (f.type === "number") shape[f.key] = num(-1e9, 1e9);
    else if (f.type === "checkbox") shape[f.key] = z.boolean().optional();
    else if (f.type === "select") shape[f.key] = z.string().optional().refine((v) => !v || (f.options ?? []).includes(v), "Pick an option");
    else shape[f.key] = text(4000);
  }
  return z.object(shape);
}
