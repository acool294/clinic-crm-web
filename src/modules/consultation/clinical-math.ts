import who from "./who-growth.json";

export type GrowthMeasure = "weight" | "length" | "head";
type Lms = [month: number, L: number, M: number, S: number];

const table = who.data as Record<"male" | "female", Record<GrowthMeasure, Lms[]>>;

/** WHO LMS parameters at an age in months (0-24), linearly interpolated. */
export function lmsAt(sex: "male" | "female", measure: GrowthMeasure, months: number): [number, number, number] | null {
  const rows = table[sex][measure];
  if (months < 0 || months > rows[rows.length - 1][0]) return null;
  const i = rows.findIndex((r) => r[0] >= months);
  if (rows[i][0] === months || i === 0) return [rows[i][1], rows[i][2], rows[i][3]];
  const [a, b] = [rows[i - 1], rows[i]];
  const t = (months - a[0]) / (b[0] - a[0]);
  return [a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2]), a[3] + t * (b[3] - a[3])];
}

/** The measurement at a given z-score. */
export function valueAtZ([L, M, S]: [number, number, number], z: number): number {
  return L === 0 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L);
}

/** z-score of a measurement. */
export function zScore([L, M, S]: [number, number, number], x: number): number {
  return L === 0 ? Math.log(x / M) / S : (Math.pow(x / M, L) - 1) / (L * S);
}

/** Standard normal CDF, for turning z into a percentile. */
export function percentile(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return Math.round((z > 0 ? 1 - p : p) * 1000) / 10;
}

export const CURVES = [
  { label: "3rd", z: -1.881 },
  { label: "15th", z: -1.036 },
  { label: "50th", z: 0 },
  { label: "85th", z: 1.036 },
  { label: "97th", z: 1.881 },
] as const;

// ---------------------------------------------------------------------------
// Obstetrics
// ---------------------------------------------------------------------------

const DAY = 24 * 3600 * 1000;

/** Naegele's rule: estimated due date is LMP + 280 days. */
export function eddFromLmp(lmp: string): string {
  return new Date(Date.parse(`${lmp}T00:00:00Z`) + 280 * DAY).toISOString().slice(0, 10);
}

/** Gestational age on a date, from the LMP. */
export function gestationalAge(lmp: string, on: string): { weeks: number; days: number } | null {
  const diff = Math.round((Date.parse(`${on}T00:00:00Z`) - Date.parse(`${lmp}T00:00:00Z`)) / DAY);
  if (!Number.isFinite(diff) || diff < 0 || diff > 45 * 7) return null;
  return { weeks: Math.floor(diff / 7), days: diff % 7 };
}

export function trimester(weeks: number): 1 | 2 | 3 {
  return weeks < 14 ? 1 : weeks < 28 ? 2 : 3;
}

// ---------------------------------------------------------------------------
// Vaccinations
// ---------------------------------------------------------------------------

export function vaccineDueDate(dob: string, dueAgeDays: number): string {
  return new Date(Date.parse(`${dob}T00:00:00Z`) + dueAgeDays * DAY).toISOString().slice(0, 10);
}
