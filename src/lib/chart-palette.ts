/**
 * Single source of truth for chart colors. Every chart in the console
 * reads from here so series colors stay consistent in both themes.
 * Electric blue = primary series, lime = a positive/target secondary series.
 */
export const chartPalette = {
  primary: "var(--primary)",
  accent: "var(--lime)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--destructive)",
  grid: "color-mix(in oklab, var(--border) 70%, transparent)",
  tooltipBg: "var(--popover)",
  tooltipFg: "var(--popover-foreground)",
} as const;

/** Ordered series colors for multi-series charts. */
export const chartSeries = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;
