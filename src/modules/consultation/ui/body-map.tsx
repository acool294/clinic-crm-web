"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form";
import { savePanel } from "../actions";

type Mark = { view: "front" | "back"; x: number; y: number; label: string };

// A simple body outline; clicks are stored as percentages so the map scales.
function Outline() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="0.8" className="text-muted">
      <circle cx="50" cy="9" r="6.5" />
      <path d="M44 16 L56 16 L58 20 L70 24 L76 48 L72 49 L66 30 L63 52 L64 96 L56 96 L52 60 L48 60 L44 96 L36 96 L37 52 L34 30 L28 49 L24 48 L30 24 L42 20 Z" />
    </g>
  );
}

export function BodyMap({ encounterId, initial, locked }: { encounterId: string; initial: { marks?: Mark[]; note?: string | null }; locked: boolean }) {
  const [marks, setMarks] = useState<Mark[]>(initial.marks ?? []);
  const [note, setNote] = useState(initial.note ?? "");
  const [label, setLabel] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();

  function add(view: Mark["view"], e: React.MouseEvent<SVGSVGElement>) {
    if (locked) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - box.left) / box.width) * 1000) / 10;
    const y = Math.round(((e.clientY - box.top) / box.height) * 1000) / 10;
    setMarks((m) => [...m, { view, x, y, label: label || `Lesion ${m.length + 1}` }]);
    setMessage("");
  }

  return (
    <div className="flex flex-col gap-3">
      {!locked && <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label for the next mark, e.g. plaque 2×3 cm" />}
      <div className="grid grid-cols-2 gap-4">
        {(["front", "back"] as const).map((view) => (
          <figure key={view} className="text-center">
            <svg viewBox="0 0 100 100" className="mx-auto aspect-square w-full max-w-56 cursor-crosshair rounded-md border border-line bg-bg" onClick={(e) => add(view, e)}>
              <Outline />
              {marks.map((m, i) =>
                m.view === view ? (
                  <g key={i}>
                    <circle cx={m.x} cy={m.y} r="2.2" className="fill-danger/70" />
                    <text x={m.x + 3} y={m.y + 1.5} fontSize="4" className="fill-ink">{i + 1}</text>
                  </g>
                ) : null,
              )}
            </svg>
            <figcaption className="mt-1 text-xs text-muted capitalize">{view}</figcaption>
          </figure>
        ))}
      </div>
      <ol className="list-decimal pl-5 text-sm">
        {marks.map((m, i) => (
          <li key={i} className="flex items-center justify-between">
            <span>{m.label} <span className="text-muted">({m.view})</span></span>
            {!locked && <button type="button" className="text-xs text-muted hover:text-danger" onClick={() => setMarks((x) => x.filter((_, n) => n !== i))}>remove</button>}
          </li>
        ))}
      </ol>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Distribution, morphology…" disabled={locked} />
      {!locked && (
        <div className="flex items-center gap-3">
          <Button type="button" size="sm" disabled={pending} onClick={() => start(async () => {
            const r = await savePanel(encounterId, "body_map", { marks, note });
            setMessage(r.ok ? "Saved" : r.message ?? "Could not save");
          })}>
            {pending ? "Saving…" : "Save body map"}
          </Button>
          {message && <span className="text-sm text-muted">{message}</span>}
        </div>
      )}
    </div>
  );
}
