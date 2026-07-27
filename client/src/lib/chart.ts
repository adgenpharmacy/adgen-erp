/**
 * Shared chart configuration.
 *
 * Hues are assigned in this fixed order and never cycled — a series keeps its colour
 * regardless of how many other series are on screen. Validated for colour-vision
 * deficiency and 3:1 contrast against the white card surface.
 */
export const SERIES = {
  sales: '#059669',      // emerald — brand
  purchases: '#6366F1',  // indigo
  tax: '#D97706',        // amber
  returns: '#0284C7',    // sky (darkened from #0EA5E9 to clear 3:1 on white)
  profit: '#0D9488',     // teal
  loss: '#DC2626',       // red
} as const;

/** Fixed categorical order for generic multi-series charts. */
export const CATEGORICAL = [
  SERIES.sales,
  SERIES.purchases,
  SERIES.tax,
  SERIES.returns,
  SERIES.profit,
  SERIES.loss,
];

export const AXIS = {
  stroke: '#94a3b8',
  fontSize: 11,
  grid: '#eef6f2',
};

/** Compact Indian-notation money for axis ticks: 1.2L, 3.4Cr, 12.5K. */
export function compactINR(value: number): string {
  const n = Math.abs(value);
  if (n >= 1e7) return `₹${(value / 1e7).toFixed(1).replace(/\.0$/, '')}Cr`;
  if (n >= 1e5) return `₹${(value / 1e5).toFixed(1).replace(/\.0$/, '')}L`;
  if (n >= 1e3) return `₹${(value / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return `₹${Math.round(value)}`;
}

/** Recharts tooltip chrome shared by every chart in the app. */
export const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: '#ffffff',
    border: '1px solid #dfede8',
    borderRadius: '8px',
    boxShadow: '0 8px 24px -6px rgb(15 23 42 / 0.14)',
    fontSize: '12px',
    padding: '8px 10px',
  },
  labelStyle: { color: '#0f172a', fontWeight: 700, marginBottom: 4 },
  itemStyle: { padding: 0 },
} as const;
