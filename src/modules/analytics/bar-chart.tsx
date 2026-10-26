import { money } from "@/lib/format";

/** One series of daily values: thin bars from the baseline, a native tooltip per bar. */
export function DailyBars({ days, title }: { days: { day: string; value: number }[]; title: string }) {
  if (!days.length) return <p className="text-sm text-muted">No data in this range.</p>;
  const max = Math.max(...days.map((d) => d.value), 1);
  const W = 640, H = 180, P = 24;
  const bw = Math.max(Math.min((W - P) / days.length - 2, 28), 2);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title}>
        <line x1={P} x2={W} y1={H - P} y2={H - P} className="stroke-line" />
        <text x={P - 4} y={14} fontSize="9" textAnchor="end" className="fill-muted">{money(max, { whole: true })}</text>
        {days.map((d, i) => {
          const h = (d.value / max) * (H - P - 16);
          const x = P + 2 + i * ((W - P) / days.length);
          return (
            <g key={d.day}>
              <rect x={x} y={H - P - h} width={bw} height={Math.max(h, d.value > 0 ? 1 : 0)} rx={Math.min(4, bw / 2)} className="fill-brand">
                <title>{`${d.day}: ${money(d.value)}`}</title>
              </rect>
              {(days.length <= 10 || i % Math.ceil(days.length / 8) === 0) && (
                <text x={x + bw / 2} y={H - P + 12} fontSize="8" textAnchor="middle" className="fill-muted">{d.day.slice(5)}</text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="sr-only">{title}</figcaption>
    </figure>
  );
}
