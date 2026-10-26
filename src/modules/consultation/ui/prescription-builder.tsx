"use client";

import { Star, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form";
import { checkPrescription, savePrescription, searchMedications, toggleFavourite } from "../actions";
import type { RxItem } from "../schemas";

type Med = Awaited<ReturnType<typeof searchMedications>>[number];
type Warning = { drug: string; warning: string; severity: string };

const FREQUENCIES = ["1-0-1", "1-1-1", "1-0-0", "0-0-1", "0-1-0", "1-1-1-1", "SOS", "once a week"];
const TIMINGS = ["after food", "before food", "empty stomach", "at bedtime", "with food"];

export function PrescriptionBuilder({
  encounterId,
  initialItems,
  initialNotes,
  locked,
}: {
  encounterId: string;
  initialItems: RxItem[];
  initialNotes: string;
  locked: boolean;
}) {
  const [items, setItems] = useState<RxItem[]>(initialItems);
  const [notes, setNotes] = useState(initialNotes);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Med[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [override, setOverride] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, start] = useTransition();
  const [, startSearch] = useTransition();

  useEffect(() => {
    if (query.trim().length < 2) return;
    const t = setTimeout(() => startSearch(async () => setHits(await searchMedications(query))), 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!items.length) {
      setWarnings([]);
      return;
    }
    const t = setTimeout(async () => setWarnings(await checkPrescription(encounterId, items)), 400);
    return () => clearTimeout(t);
  }, [items, encounterId]);

  function addMed(m: Med) {
    setItems((list) => [
      ...list,
      {
        medication_id: m.id,
        drug_name: [m.brand_name ?? m.generic_name, m.strength, m.form !== "tablet" ? m.form : ""].filter(Boolean).join(" "),
        generic_name: m.generic_name,
        dose: m.default_dose ?? "",
        frequency: m.default_frequency ?? "",
        duration_days: m.default_duration_days ?? undefined,
        timing: "",
        instructions: m.default_instructions ?? "",
      },
    ]);
    setQuery("");
    setHits([]);
    setMessage(null);
  }

  function addTyped() {
    if (!query.trim()) return;
    setItems((list) => [...list, { drug_name: query.trim(), frequency: "", dose: "" }]);
    setQuery("");
    setHits([]);
  }

  function update(i: number, patch: Partial<RxItem>) {
    setItems((list) => list.map((it, n) => (n === i ? { ...it, ...patch } : it)));
    setMessage(null);
  }

  const allergy = warnings.filter((w) => w.warning.startsWith("Patient is allergic"));

  function save() {
    start(async () => {
      const r = await savePrescription(encounterId, { items, notes, override_reason: override || undefined });
      if (r.warnings) setWarnings(r.warnings);
      setMessage({ ok: r.ok, text: r.message ?? (r.ok ? "Saved" : "Could not save") });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {!locked && (
        <div className="relative">
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (hits[0]) addMed(hits[0]);
                  else addTyped();
                }
              }}
              placeholder="Search medicine by generic or brand name"
            />
            <Button type="button" variant="secondary" onClick={addTyped} disabled={!query.trim()}>Add as typed</Button>
          </div>
          {hits.length > 0 && query.trim().length >= 2 && (
            <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-line bg-surface shadow-lg">
              {hits.map((m) => (
                <li key={m.id} className="flex items-center hover:bg-brand-soft">
                  <button type="button" onClick={() => addMed(m)} className="flex-1 px-3 py-2 text-left text-sm">
                    <span className="font-medium">{m.brand_name ?? m.generic_name}</span> {m.strength} {m.form}
                    {m.brand_name && <span className="ml-1 text-muted">({m.generic_name})</span>}
                  </button>
                  <button
                    type="button"
                    title={m.favourite ? "Remove from favourites" : "Add to favourites"}
                    onClick={async () => {
                      await toggleFavourite(m.id, !m.favourite);
                      setHits((h) => h.map((x) => (x.id === m.id ? { ...x, favourite: !x.favourite } : x)));
                    }}
                    className="px-3"
                  >
                    <Star className={`size-4 ${m.favourite ? "fill-warn text-warn" : "text-muted"}`} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr><th className="py-1">Medicine</th><th>Dose</th><th>Frequency</th><th>When</th><th>Days</th><th>Instructions</th><th /></tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-t border-line align-top">
                  <td className="py-1.5 pr-2"><Input value={it.drug_name} onChange={(e) => update(i, { drug_name: e.target.value })} disabled={locked} className="h-8 min-w-48" /></td>
                  <td className="pr-2"><Input value={it.dose ?? ""} onChange={(e) => update(i, { dose: e.target.value })} disabled={locked} className="h-8 w-24" /></td>
                  <td className="pr-2">
                    <Input list="rx-freq" value={it.frequency ?? ""} onChange={(e) => update(i, { frequency: e.target.value })} disabled={locked} className="h-8 w-28" />
                  </td>
                  <td className="pr-2">
                    <Select value={it.timing ?? ""} onChange={(e) => update(i, { timing: e.target.value })} disabled={locked} className="h-8 w-32">
                      <option value="">—</option>
                      {TIMINGS.map((t) => <option key={t}>{t}</option>)}
                    </Select>
                  </td>
                  <td className="pr-2">
                    <Input type="number" min={1} max={365} value={it.duration_days ?? ""} onChange={(e) => update(i, { duration_days: e.target.value ? Number(e.target.value) : undefined })} disabled={locked} className="h-8 w-16" />
                  </td>
                  <td className="pr-2"><Input value={it.instructions ?? ""} onChange={(e) => update(i, { instructions: e.target.value })} disabled={locked} className="h-8 min-w-40" /></td>
                  <td>
                    {!locked && (
                      <button type="button" onClick={() => setItems((l) => l.filter((_, n) => n !== i))} className="p-1.5 text-muted hover:text-danger" aria-label="Remove">
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="rx-freq">{FREQUENCIES.map((f) => <option key={f} value={f} />)}</datalist>
        </div>
      )}

      {warnings.length > 0 && (
        <ul className="flex flex-col gap-1">
          {warnings.map((w, i) => (
            <li key={i} className={`rounded-md px-3 py-1.5 text-sm ${w.warning.startsWith("Patient is allergic") ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}>
              <span className="font-medium">{w.drug}:</span> {w.warning}
            </li>
          ))}
        </ul>
      )}
      {allergy.length > 0 && !locked && (
        <Input value={override} onChange={(e) => setOverride(e.target.value)} placeholder="Reason to prescribe despite the allergy (recorded)" />
      )}

      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes on the prescription (optional)" disabled={locked} />
      {!locked && (
        <div className="flex items-center gap-3">
          <Button type="button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save prescription"}</Button>
          {message && <span className={`text-sm ${message.ok ? "text-ok" : "text-danger"}`}>{message.text}</span>}
        </div>
      )}
    </div>
  );
}
