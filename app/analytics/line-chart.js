'use client';

import { useMemo, useState } from 'react';

const WIDTH = 640;
const HEIGHT = 280;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 56 };
const INNER_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const INNER_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;

// Functions can't cross the server/client component boundary as props, so
// the formatter lives here rather than being passed in from the server page.
function formatAmount(amount) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

// Classic "nice numbers" tick step — picks a round step (1/2/2.5/5 x 10^k)
// so axis ticks read as 0 / 500 / 1,000 rather than 0 / 483 / 967.
function niceStep(roughStep) {
  const magnitude = 10 ** Math.floor(Math.log10(roughStep || 1));
  const residual = roughStep / magnitude;
  const step = residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1;
  return step * magnitude;
}

function buildTicks(maxValue, count = 4) {
  const step = niceStep(maxValue / count || 1);
  const top = Math.ceil((maxValue || step) / step) * step;
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return ticks;
}

/**
 * points: [{ x: number, xLabel: string, values: { [seriesId]: number|null } }]
 * seriesList: [{ id, name, color }]
 * xType: 'band' (evenly spaced by index) | 'time' (proportional to x)
 */
export default function LineChart({
  points,
  seriesList,
  xType = 'band',
  areaFill = false,
  emptyMessage = 'Nothing to show yet.',
}) {
  const yFormatter = formatAmount;
  const [hoverIndex, setHoverIndex] = useState(null);
  const [showTable, setShowTable] = useState(false);

  const { xPos, yPos, ticks, yMax, yMin } = useMemo(() => {
    if (points.length === 0) {
      return { xPos: () => 0, yPos: () => 0, ticks: [0], yMax: 0, yMin: 0 };
    }

    const allValues = points.flatMap((p) => Object.values(p.values).filter((v) => v != null));
    const dataMax = Math.max(0, ...allValues);
    const dataMin = Math.min(0, ...allValues);
    const builtTicks = buildTicks(Math.max(dataMax, -dataMin));
    const axisMax = builtTicks[builtTicks.length - 1];
    const axisMin = dataMin < 0 ? -axisMax : 0;

    const xMinVal = points[0].x;
    const xMaxVal = points[points.length - 1].x;
    const xRange = xMaxVal - xMinVal || 1;

    const xPosFn = (p, i) =>
      xType === 'band'
        ? points.length === 1
          ? MARGIN.left + INNER_WIDTH / 2
          : MARGIN.left + (i / (points.length - 1)) * INNER_WIDTH
        : MARGIN.left + ((p.x - xMinVal) / xRange) * INNER_WIDTH;

    const yRange = axisMax - axisMin || 1;
    const yPosFn = (v) => MARGIN.top + INNER_HEIGHT - ((v - axisMin) / yRange) * INNER_HEIGHT;

    return { xPos: xPosFn, yPos: yPosFn, ticks: builtTicks.concat(axisMin < 0 ? [axisMin] : []), yMax: axisMax, yMin: axisMin };
  }, [points, xType]);

  if (points.length === 0) {
    return <p className="text-sm text-ink/60 py-8 text-center">{emptyMessage}</p>;
  }

  const zeroY = yPos(0);
  const hovered = hoverIndex != null ? points[hoverIndex] : null;

  function handlePointerMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let nearestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(xPos(p, i) - relX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  return (
    <div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full h-auto touch-none"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverIndex(null)}
          role="img"
          aria-label="Line chart"
          data-chart="line"
        >
          {/* gridlines */}
          {ticks.map((t) => (
            <line
              key={t}
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={yPos(t)}
              y2={yPos(t)}
              stroke="#e1e0d9"
              strokeWidth={1}
            />
          ))}
          {/* zero baseline, emphasized */}
          {yMin < 0 && <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={zeroY} y2={zeroY} stroke="#c3c2b7" strokeWidth={1} />}

          {/* y ticks */}
          {ticks.map((t) => (
            <text key={t} x={MARGIN.left - 8} y={yPos(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="#898781">
              {yFormatter(t)}
            </text>
          ))}

          {/* x tick labels: first, last, and hovered */}
          {[0, points.length - 1].map((i) => (
            <text
              key={i}
              x={xPos(points[i], i)}
              y={HEIGHT - 8}
              textAnchor={i === 0 ? 'start' : 'end'}
              fontSize={11}
              fill="#898781"
            >
              {points[i].xLabel}
            </text>
          ))}

          {/* series lines */}
          {seriesList.map((s) => {
            const linePoints = points
              .map((p, i) => (p.values[s.id] != null ? `${xPos(p, i)},${yPos(p.values[s.id])}` : null))
              .filter(Boolean);
            if (linePoints.length === 0) return null;

            const areaPath =
              areaFill && seriesList.length === 1
                ? `M${xPos(points[0], 0)},${zeroY} L${linePoints.join(' L')} L${xPos(points[points.length - 1], points.length - 1)},${zeroY} Z`
                : null;

            return (
              <g key={s.id}>
                {areaPath && <path d={areaPath} fill={s.color} opacity={0.1} />}
                <polyline points={linePoints.join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {points.map((p, i) =>
                  p.values[s.id] != null && i === points.length - 1 ? (
                    <circle key={i} cx={xPos(p, i)} cy={yPos(p.values[s.id])} r={4} fill={s.color} stroke="#ffffff" strokeWidth={2} />
                  ) : null
                )}
              </g>
            );
          })}

          {/* crosshair */}
          {hovered && (
            <line
              x1={xPos(hovered, hoverIndex)}
              x2={xPos(hovered, hoverIndex)}
              y1={MARGIN.top}
              y2={HEIGHT - MARGIN.bottom}
              stroke="#c3c2b7"
              strokeWidth={1}
            />
          )}
        </svg>

        {hovered && (
          <div
            className="pointer-events-none absolute top-2 rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-card"
            style={{
              left: `${(xPos(hovered, hoverIndex) / WIDTH) * 100}%`,
              transform: xPos(hovered, hoverIndex) > WIDTH * 0.7 ? 'translateX(-100%)' : 'translateX(0)',
            }}
          >
            <p className="font-medium text-ink mb-1">{hovered.xLabel}</p>
            {seriesList.map((s) =>
              hovered.values[s.id] != null ? (
                <div key={s.id} className="flex items-center gap-2">
                  <span className="inline-block h-0.5 w-3" style={{ backgroundColor: s.color }} />
                  <span className="font-semibold text-ink">{yFormatter(hovered.values[s.id])}</span>
                  <span className="text-ink/60">{s.name}</span>
                </div>
              ) : null
            )}
          </div>
        )}
      </div>

      {seriesList.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
          {seriesList.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5 text-xs text-ink/70">
              <span className="inline-block h-0.5 w-3" style={{ backgroundColor: s.color }} />
              {s.name}
            </div>
          ))}
        </div>
      )}

      <button type="button" onClick={() => setShowTable((v) => !v)} className="btn-ghost mt-2">
        {showTable ? 'Hide table' : 'View as table'}
      </button>

      {showTable && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-ink/60">
                <th className="py-1 pr-3">Date</th>
                {seriesList.map((s) => (
                  <th key={s.id} className="py-1 pr-3">{s.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={i} className="border-t border-line/60">
                  <td className="py-1 pr-3 text-ink/70">{p.xLabel}</td>
                  {seriesList.map((s) => (
                    <td key={s.id} className="py-1 pr-3 text-ink">
                      {p.values[s.id] != null ? yFormatter(p.values[s.id]) : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
