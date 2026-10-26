"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { addDiagnosis, searchIcd10 } from "../actions";

export function DiagnosisPicker({ encounterId }: { encounterId: string }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ code: string; title: string }[]>([]);
  const [kind, setKind] = useState("provisional");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (query.trim().length < 2) return;
    const t = setTimeout(() => start(async () => setHits(await searchIcd10(query))), 200);
    return () => clearTimeout(t);
  }, [query]);

  function add(code: string | null, description: string) {
    const fd = new FormData();
    if (code) fd.set("icd10_code", code);
    fd.set("description", description);
    fd.set("kind", kind);
    start(async () => {
      const r = await addDiagnosis(encounterId, { ok: false }, fd);
      setMessage(r.ok ? "" : r.message ?? "");
      if (r.ok) { setQuery(""); setHits([]); }
    });
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ICD-10 by code or name, or type a diagnosis" />
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-36">
          <option value="provisional">Provisional</option>
          <option value="final">Final</option>
        </Select>
        <Button type="button" variant="secondary" disabled={pending || query.trim().length < 2} onClick={() => add(null, query.trim())}>
          Add as typed
        </Button>
      </div>
      {hits.length > 0 && query.trim().length >= 2 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-line bg-surface shadow-lg">
          {hits.map((h) => (
            <li key={h.code}>
              <button type="button" onClick={() => add(h.code, h.title)} className="w-full px-3 py-2 text-left text-sm hover:bg-brand-soft">
                <span className="font-mono text-xs text-muted">{h.code}</span> {h.title}
              </button>
            </li>
          ))}
        </ul>
      )}
      {message && <p className="mt-1 text-sm text-danger">{message}</p>}
    </div>
  );
}
