import { age, ageInMonths } from "@/lib/format";
import { CURVES, lmsAt, percentile, valueAtZ, zScore, type GrowthMeasure } from "../clinical-math";

interface Point {
  recorded_at: string;
  weight_kg: number | null;
  height_cm: number | null;
  head_circumference_cm: number | null;
}

const MEASURES: { key: GrowthMeasure; label: string; unit: string; field: keyof Point }[] = [
  { key: "weight", label: "Weight for age", unit: "kg", field: "weight_kg" },
  { key: "length", label: "Length for age", unit: "cm", field: "height_cm" },
  { key: "head", label: "Head circumference for age", unit: "cm", field: "head_circumference_cm" },
];

/** WHO growth standards, 0-24 months, with this child's measurements plotted. */
export function GrowthChart({ dob, sex, vitals }: { dob: string | null; sex: string; vitals: Point[] }) {
  if (!dob) return <p className="text-sm text-muted">Add the date of birth to plot growth.</p>;
  if (sex !== "male" && sex !== "female") return <p className="text-sm text-muted">Record the child&apos;s sex to choose the right WHO chart.</p>;
  const s = sex as "male" | "female";
  const nowMonths = ageInMonths(dob, new Date());
  if (nowMonths > 24.5)
    return <p className="text-sm text-muted">The built-in WHO charts cover 0–24 months; this child is {age(dob)}. Measurements are in the vitals table.</p>;

  return (
    <div className="grid gap-4">
      {MEASURES.map((m) => {
        const pts = vitals
          .filter((v) => v[m.field] !== null)
          .map((v) => ({ months: ageInMonths(dob, v.recorded_at), value: Number(v[m.field]) }))
          .filter((p) => p.months >= 0 && p.months <= 24);
        const maxMonth = 24;
        const top = valueAtZ(lmsAt(s, m.key, maxMonth)!, 2.5);
        const bottom = valueAtZ(lmsAt(s, m.key, 0)!, -2.5);
        const W = 320, H = 180, P = 28;
        const x = (mo: number) => P + (mo / maxMonth) * (W - P - 8);
        const y = (v: number) => H - P - ((v - bottom) / (top - bottom)) * (H - P - 8);
        const last = pts[pts.length - 1];
        const lastLms = last ? lmsAt(s, m.key, last.months) : null;
        const lastZ = last && lastLms ? zScore(lastLms, last.value) : null;
        return (
          <figure key={m.key}>
            <figcaption className="mb-1 flex justify-between text-sm">
              <span className="font-medium">{m.label}</span>
              {lastZ !== null && (
                <span className={Math.abs(lastZ) > 2 ? "font-medium text-danger" : "text-muted"}>
                  Latest {last!.value} {m.unit}: {percentile(lastZ)}th percentile (z {lastZ.toFixed(1)})
                </span>
              )}
            </figcaption>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-md border border-line bg-surface">
              {[0, 6, 12, 18, 24].map((mo) => (
                <g key={mo}>
                  <line x1={x(mo)} x2={x(mo)} y1={8} y2={H - P} className="stroke-line" />
                  <text x={x(mo)} y={H - P + 12} fontSize="8" textAnchor="middle" className="fill-muted">{mo}m</text>
                </g>
              ))}
              {CURVES.map((c) => {
                const d = Array.from({ length: 49 }, (_, i) => i / 2)
                  .map((mo, i) => `${i ? "L" : "M"}${x(mo).toFixed(1)},${y(valueAtZ(lmsAt(s, m.key, mo)!, c.z)).toFixed(1)}`)
                  .join(" ");
                return (
                  <g key={c.label}>
                    <path d={d} fill="none" strokeWidth={c.z === 0 ? 1.4 : 0.8} className={c.z === 0 ? "stroke-ok" : Math.abs(c.z) > 1.5 ? "stroke-danger/50" : "stroke-muted/40"} />
                    <text x={W - 6} y={y(valueAtZ(lmsAt(s, m.key, 24)!, c.z)) + 3} fontSize="7" textAnchor="end" className="fill-muted">{c.label}</text>
                  </g>
                );
              })}
              {pts.length > 1 && (
                <path d={pts.map((p, i) => `${i ? "L" : "M"}${x(p.months)},${y(p.value)}`).join(" ")} fill="none" strokeWidth="1.5" className="stroke-brand" />
              )}
              {pts.map((p, i) => <circle key={i} cx={x(p.months)} cy={y(p.value)} r="2.8" className="fill-brand" />)}
            </svg>
          </figure>
        );
      })}
      <p className="text-xs text-muted">Reference: WHO Child Growth Standards, 0–24 months. Curves at the 3rd, 15th, 50th, 85th and 97th percentiles.</p>
    </div>
  );
}
