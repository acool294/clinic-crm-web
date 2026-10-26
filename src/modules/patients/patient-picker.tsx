"use client";

import { useEffect, useState, useTransition } from "react";
import { Input } from "@/components/ui/form";
import { age } from "@/lib/format";
import { searchPatientsForPicker } from "./actions";

type Hit = Awaited<ReturnType<typeof searchPatientsForPicker>>[number];

/** Search-as-you-type patient field; submits the chosen id as `name`. */
export function PatientPicker({
  name = "patient_id",
  initial,
  onChange,
  required,
}: {
  name?: string;
  initial?: { id: string; full_name: string; mrn: string };
  onChange?: (patient: Hit | null) => void;
  required?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [picked, setPicked] = useState<{ id: string; full_name: string; mrn: string } | null>(initial ?? null);
  const [, start] = useTransition();

  useEffect(() => {
    if (picked || query.trim().length < 2) return;
    const t = setTimeout(() => start(async () => setHits(await searchPatientsForPicker(query))), 200);
    return () => clearTimeout(t);
  }, [query, picked]);

  if (picked) {
    return (
      <div className="flex h-10 items-center justify-between rounded-md border border-line bg-brand-soft px-3 text-sm">
        <input type="hidden" name={name} value={picked.id} />
        <span><span className="font-medium">{picked.full_name}</span> <span className="text-muted">{picked.mrn}</span></span>
        <button type="button" className="text-muted hover:underline" onClick={() => { setPicked(null); onChange?.(null); }}>
          Change
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, mobile or MRN" required={required} />
      {hits.length > 0 && query.trim().length >= 2 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-line bg-surface shadow-lg">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-brand-soft"
                onClick={() => { setPicked(h); onChange?.(h); setHits([]); }}
              >
                <span className="font-medium">{h.full_name}</span>{" "}
                <span className="text-muted">{h.mrn} · {h.phone ?? "—"} {h.dob ? `· ${age(h.dob)}` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
