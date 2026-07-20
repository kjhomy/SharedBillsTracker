'use client';

import { useState } from 'react';

const BELOW_COLOR = '#2a78d6'; // diverging pole: spending below the benchmark
const ABOVE_COLOR = '#e34948'; // diverging pole: spending above the benchmark

function formatAmount(amount) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

/**
 * items: [{ id, name, actual, benchmark }] — actual/benchmark are £/month
 */
export default function BenchmarkChart({ items }) {
  const [hoverId, setHoverId] = useState(null);

  if (items.length === 0) {
    return <p className="text-sm text-ink/60 py-8 text-center">No benchmarks set for your logged categories yet.</p>;
  }

  const maxAbsDelta = Math.max(1, ...items.map((i) => Math.abs(i.actual - i.benchmark)));

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const delta = item.actual - item.benchmark;
        const widthPct = (Math.abs(delta) / maxAbsDelta) * 50; // half-width max, since baseline is centered
        const isAbove = delta >= 0;
        const color = isAbove ? ABOVE_COLOR : BELOW_COLOR;
        const hovered = hoverId === item.id;

        return (
          <div key={item.id} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-xs text-ink/70 truncate">{item.name}</span>
            <div
              className="relative flex-1 h-7 cursor-default"
              onPointerEnter={() => setHoverId(item.id)}
              onPointerLeave={() => setHoverId((v) => (v === item.id ? null : v))}
            >
              {/* baseline */}
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-line" />
              {/* bar */}
              <div
                className="absolute top-1 bottom-1 rounded transition-opacity"
                style={{
                  backgroundColor: color,
                  opacity: hovered ? 1 : 0.85,
                  left: isAbove ? '50%' : `${50 - widthPct}%`,
                  width: `${widthPct}%`,
                }}
              />
              {/* value label at the tip */}
              <span
                className="absolute top-1/2 -translate-y-1/2 text-xs font-medium text-ink whitespace-nowrap"
                style={{
                  left: isAbove ? `calc(${50 + widthPct}% + 6px)` : 'auto',
                  right: isAbove ? 'auto' : `calc(${50 + widthPct}% + 6px)`,
                }}
              >
                {delta >= 0 ? '+' : '−'}{formatAmount(Math.abs(delta))}/mo
              </span>

              {hovered && (
                <div className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full z-10 rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-card whitespace-nowrap">
                  <p className="font-medium text-ink">{item.name}</p>
                  <p className="text-ink/70">Your average: <span className="font-semibold text-ink">{formatAmount(item.actual)}/mo</span></p>
                  <p className="text-ink/70">UK benchmark: <span className="font-semibold text-ink">{formatAmount(item.benchmark)}/mo</span></p>
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-4 pt-1 text-xs text-ink/60">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: BELOW_COLOR }} />
          Below benchmark
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: ABOVE_COLOR }} />
          Above benchmark
        </span>
      </div>
    </div>
  );
}
