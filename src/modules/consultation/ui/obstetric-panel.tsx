"use client";

import { formatDate } from "@/lib/format";
import { eddFromLmp, gestationalAge, trimester } from "../clinical-math";
import { PanelForm, type PanelField } from "./panel-form";

const FIELDS: PanelField[] = [
  { key: "lmp", label: "Last menstrual period", type: "date" },
  { key: "edd_by_scan", label: "EDD by dating scan", type: "date" },
  { key: "gravida", label: "Gravida", type: "number" },
  { key: "para", label: "Para", type: "number" },
  { key: "abortions", label: "Abortions", type: "number" },
  { key: "living", label: "Living children", type: "number" },
  { key: "high_risk", label: "High-risk pregnancy", type: "checkbox" },
  { key: "risk_factors", label: "Risk factors", type: "textarea" },
  { key: "notes", label: "Notes", type: "textarea" },
];

export function ObstetricPanel(props: { encounterId: string; initial: Record<string, unknown>; locked: boolean; today: string }) {
  return (
    <PanelForm
      encounterId={props.encounterId}
      panelKey="obstetric_history"
      fields={FIELDS}
      initial={props.initial as Record<string, string>}
      locked={props.locked}
      summary={(d) => {
        const lmp = typeof d.lmp === "string" && d.lmp ? d.lmp : null;
        if (!lmp) return null;
        const ga = gestationalAge(lmp, props.today);
        const edd = typeof d.edd_by_scan === "string" && d.edd_by_scan ? d.edd_by_scan : eddFromLmp(lmp);
        return (
          <p className="rounded-md bg-brand-soft px-3 py-2 text-sm">
            EDD <span className="font-semibold">{formatDate(edd)}</span>
            {d.edd_by_scan ? " (by scan)" : " (by LMP)"}
            {ga && <> · {ga.weeks} weeks {ga.days} days today · trimester {trimester(ga.weeks)}</>}
          </p>
        );
      }}
    />
  );
}
