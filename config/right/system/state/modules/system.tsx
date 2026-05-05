import { createPoll } from "ags/time";
import type { AggregatedSystemState } from "../helpers/aggregate";
import { resolveSystemState } from "../helpers/aggregate";

import { idleInhibitState } from "../modules/idleInhibit";
import { mediaState } from "../modules/media";
import { networkState } from "./networkState";
import { notificationState } from "./notificationState";
import { updateState } from "./updateState";

const INITIAL: AggregatedSystemState = {
  severity: "idle",
  icon: null,
  icons: [],
  summary: "",
  sources: [],
};

/**
 * Compare two AggregatedSystemState objects for material equality so the
 * underlying createPoll's reference-identity check can suppress no-op
 * subscriber notifications.
 *
 * The poll fires 4×/sec; without this dedup every consumer (state-pill,
 * tooltip text, etc.) would rebuild widgets four times a second even when
 * nothing changed. The aggregator's `sources` array is treated as
 * material — its SystemSignal entries are compared by category, severity,
 * icon and summary so unrelated module reshuffles don't trip the diff.
 */
function statesEqual(
  a: AggregatedSystemState,
  b: AggregatedSystemState,
): boolean {
  if (a === b) return true;
  if (a.severity !== b.severity) return false;
  if (a.icon !== b.icon) return false;
  if (a.summary !== b.summary) return false;
  if (a.icons.length !== b.icons.length) return false;
  for (let i = 0; i < a.icons.length; i++) {
    if (a.icons[i] !== b.icons[i]) return false;
  }
  if (a.sources.length !== b.sources.length) return false;
  for (let i = 0; i < a.sources.length; i++) {
    const sa = a.sources[i];
    const sb = b.sources[i];
    if (
      sa.category !== sb.category ||
      sa.severity !== sb.severity ||
      sa.icon !== sb.icon ||
      sa.summary !== sb.summary
    ) {
      return false;
    }
  }
  return true;
}

export const systemState = createPoll<AggregatedSystemState>(
  INITIAL,
  250,
  (prev) => {
    const next = resolveSystemState([
      idleInhibitState(),
      mediaState(),
      updateState(),
      networkState(),
      notificationState(),
    ]);
    // Returning prev (reference-equal) prevents createPoll from notifying
    // subscribers — see ags/time.ts createPoll set() reference check.
    return statesEqual(prev, next) ? prev : next;
  },
);
