"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { globalSearch, type SearchHit } from "@/modules/search/actions";

const KIND_LABEL = { patient: "Patient", invoice: "Invoice", appointment: "Appointment" } as const;

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  useEffect(() => {
    const q = query;
    const t = setTimeout(() => start(async () => {
      const result = await globalSearch(q);
      setHits(result);
      setActive(0);
    }), 200);
    return () => clearTimeout(t);
  }, [query]);

  function go(hit: SearchHit) {
    setOpen(false);
    setQuery("");
    router.push(hit.href);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm text-muted hover:border-brand/40"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search patients, invoices…</span>
        <kbd className="rounded border border-line px-1.5 text-xs">Ctrl K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 px-4 pt-24" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg overflow-hidden rounded-xl bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
            <input
              ref={input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, hits.length - 1));
                if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
                if (e.key === "Enter" && hits[active]) go(hits[active]);
              }}
              placeholder="Name, phone, MRN or invoice number"
              className="h-12 w-full border-b border-line px-4 outline-none"
            />
            <ul className="max-h-80 overflow-y-auto py-1">
              {hits.map((h, i) => (
                <li key={`${h.kind}-${h.id}`}>
                  <button
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(h)}
                    className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${i === active ? "bg-brand-soft" : ""}`}
                  >
                    <span>
                      <span className="font-medium">{h.title}</span>
                      <span className="ml-2 text-muted">{h.subtitle}</span>
                    </span>
                    <span className="text-xs text-muted">{KIND_LABEL[h.kind]}</span>
                  </button>
                </li>
              ))}
              {query.trim().length >= 2 && hits.length === 0 && <li className="px-4 py-3 text-sm text-muted">No matches</li>}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
