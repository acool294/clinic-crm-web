"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { savePanel } from "../actions";

export interface PanelField {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "checkbox" | "date";
  options?: string[];
  unit?: string;
}

type Data = Record<string, string | number | boolean | null | undefined | unknown[]>;

/** A form for one specialty panel, saved into this visit's encounter_forms row. */
export function PanelForm({
  encounterId,
  panelKey,
  fields,
  initial,
  locked,
  summary,
  extra,
}: {
  encounterId: string;
  panelKey: string;
  fields: PanelField[];
  initial: Data;
  locked: boolean;
  /** shown above the save button, recomputed as the person types */
  summary?: (data: Data) => ReactNode;
  extra?: Data;
}) {
  const [data, setData] = useState<Data>(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (k: string, v: Data[string]) => {
    setData((d) => ({ ...d, [k]: v }));
    setMessage(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => {
          const v = data[f.key];
          const label = f.unit ? `${f.label} (${f.unit})` : f.label;
          if (f.type === "checkbox")
            return (
              <label key={f.key} className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={!!v} onChange={(e) => set(f.key, e.target.checked)} disabled={locked} /> {f.label}
              </label>
            );
          return (
            <Field key={f.key} label={label} className={f.type === "textarea" ? "sm:col-span-2" : undefined}>
              {f.type === "textarea" ? (
                <Textarea value={String(v ?? "")} onChange={(e) => set(f.key, e.target.value)} rows={2} disabled={locked} />
              ) : f.type === "select" ? (
                <Select value={String(v ?? "")} onChange={(e) => set(f.key, e.target.value)} disabled={locked}>
                  <option value="">—</option>
                  {f.options?.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
                </Select>
              ) : (
                <Input
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                  step="any"
                  value={String(v ?? "")}
                  onChange={(e) => set(f.key, e.target.value)}
                  disabled={locked}
                />
              )}
            </Field>
          );
        })}
      </div>
      {summary?.(data)}
      {!locked && (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await savePanel(encounterId, panelKey, { ...data, ...extra });
                const fieldErrors = Object.entries(r.fieldErrors ?? {}).map(([k, e]) => `${k}: ${e?.join(" ")}`);
                setMessage({ ok: r.ok, text: r.ok ? "Saved" : fieldErrors.join("; ") || r.message || "Could not save" });
              })
            }
          >
            {pending ? "Saving…" : "Save"}
          </Button>
          {message && <span className={`text-sm ${message.ok ? "text-ok" : "text-danger"}`}>{message.text}</span>}
        </div>
      )}
    </div>
  );
}
