"use client";

import { useEffect, useRef, useState } from "react";
import { Field, Input, Textarea } from "@/components/ui/form";
import { saveEncounter } from "../actions";

const FIELDS = [
  { key: "chief_complaint", label: "Chief complaint", rows: 1 },
  { key: "history", label: "History", rows: 3 },
  { key: "examination", label: "Examination", rows: 3 },
  { key: "treatment_plan", label: "Treatment plan", rows: 2 },
  { key: "advice", label: "Advice to patient (printed on the prescription)", rows: 2 },
] as const;

type Values = Record<(typeof FIELDS)[number]["key"] | "follow_up_on", string>;

/**
 * The consultation text. Saves to the server two seconds after typing stops,
 * never to the browser, so nothing stays behind on a shared PC.
 */
export function EncounterNotes({ encounterId, initial, locked }: { encounterId: string; initial: Values; locked: boolean }) {
  const [values, setValues] = useState(initial);
  const [status, setStatus] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const [error, setError] = useState("");
  const dirty = useRef<Partial<Values>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function flush() {
    const patch = dirty.current;
    if (!Object.keys(patch).length) return;
    dirty.current = {};
    setStatus("saving");
    const result = await saveEncounter(encounterId, patch as Record<string, string>);
    if (result.ok) setStatus(Object.keys(dirty.current).length ? "unsaved" : "saved");
    else {
      dirty.current = { ...patch, ...dirty.current };
      setStatus("error");
      setError(result.message ?? "Could not save");
    }
  }

  function change(key: keyof Values, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    dirty.current[key] = value;
    setStatus("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 2000);
  }

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(dirty.current).length) e.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {FIELDS.map((f) => (
        <Field key={f.key} label={f.label}>
          {f.rows === 1 ? (
            <Input value={values[f.key]} onChange={(e) => change(f.key, e.target.value)} onBlur={flush} disabled={locked} />
          ) : (
            <Textarea value={values[f.key]} rows={f.rows} onChange={(e) => change(f.key, e.target.value)} onBlur={flush} disabled={locked} />
          )}
        </Field>
      ))}
      <div className="flex items-end justify-between gap-4">
        <Field label="Follow-up on">
          <Input type="date" value={values.follow_up_on} onChange={(e) => change("follow_up_on", e.target.value)} onBlur={flush} disabled={locked} />
        </Field>
        <span className={`text-xs ${status === "error" ? "text-danger" : "text-muted"}`}>
          {locked ? "Locked" : status === "saving" ? "Saving…" : status === "unsaved" ? "Unsaved changes" : status === "error" ? error : "All changes saved"}
        </span>
      </div>
    </div>
  );
}
