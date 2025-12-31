import type { SystemSignal } from "./normalize";

export type Severity = "idle" | "info" | "warn" | "error";

export interface AggregatedSystemState {
  severity: Severity;
  icon: string | null;
  icons: string[]; // Multiple icons to display side-by-side
  summary: string;
  sources: SystemSignal[];
}

const severityRank: Record<Severity, number> = {
  error: 3,
  warn: 2,
  info: 1,
  idle: 0,
};

const ICON_PRIORITY: string[] = [
  "notification", // Notifications are front and center

  "audio",
  "mic",

  // Idle inhibitors (should surface before updates)
  "caffeine",
  "external",

  // System state
  "reboot",
  "updates",
];

export function resolveSystemState(
  states: Array<SystemSignal | null>,
): AggregatedSystemState {
  const active: SystemSignal[] = states.filter(
    (s): s is SystemSignal =>
      s !== null && (s.severity !== "idle" || s.contextual === true),
  );

  if (active.length === 0) {
    return {
      severity: "idle",
      icon: null,
      icons: [],
      summary: "All systems normal",
      sources: [],
    };
  }

  const top = active.sort(
    (a, b) => severityRank[b.severity] - severityRank[a.severity],
  )[0];

  // Collect icons from all active states, ordered by priority
  const icons: string[] = [];
  const seenCategories = new Set<string>();

  for (const category of ICON_PRIORITY) {
    const match = active.find((s) => s.category === category);
    if (match?.icon && !seenCategories.has(category)) {
      icons.push(match.icon);
      seenCategories.add(category);
    }
  }

  // Add any remaining icons from active states not in priority list
  for (const state of active) {
    if (state.icon && !seenCategories.has(state.category)) {
      icons.push(state.icon);
      seenCategories.add(state.category);
    }
  }

  // Primary icon is the first one (highest priority)
  const icon = icons.length > 0 ? icons[0] : top.icon;

  return {
    severity: top.severity,
    icon,
    icons,
    summary: top.summary,
    sources: active,
  };
}
