// Validated categorical palette (see dataviz skill's references/palette.md) —
// order is the CVD-safety mechanism, never cycled. Past 8 series, fold the
// tail into "Other" rather than generating a 9th indistinguishable hue.
export const CHART_PALETTE = [
  '#2a78d6', // blue
  '#008300', // green
  '#e87ba4', // magenta
  '#eda100', // yellow
  '#1baf7a', // aqua
  '#eb6834', // orange
  '#4a3aa7', // violet
  '#e34948', // red
];

// Deterministic across renders: alphabetical, not first-appearance order
// (which could shift a category's color as new data arrives).
export function assignSeriesColors(names) {
  const sorted = [...new Set(names)].sort();
  const map = new Map();
  sorted.forEach((name, i) => {
    map.set(name, CHART_PALETTE[i % CHART_PALETTE.length]);
  });
  return map;
}
