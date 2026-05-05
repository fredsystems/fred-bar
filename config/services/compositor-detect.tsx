import GLib from "gi://GLib";

import { runAsync } from "helpers/subprocess";

/**
 * Compositor identity detection.
 *
 * Previously each consumer (system-actions.tsx) ran three synchronous
 * `pgrep -x` invocations on the GTK main thread on every construction —
 * up to three sub-second hangs per sidebar open. The compositor doesn't
 * change at runtime, so detection happens exactly once at module load:
 *
 * 1. Inspect `XDG_CURRENT_DESKTOP` (cheap, deterministic, no fork).
 * 2. If unknown, asynchronously fall back to `pgrep -x` for known
 *    compositors. Falls into `runAsync` so the main loop never blocks.
 *
 * Until step 2 resolves, `getCompositorKind()` returns `"unknown"`.
 * Consumers that need to defer until detection completes can `await`
 * `compositorReady`.
 *
 * See AUDIT C-1.9 / C-3.1.
 */

export type CompositorKind = "hyprland" | "niri" | "sway" | "unknown";

let kind: CompositorKind = "unknown";

function fromEnv(): CompositorKind {
  const session = (GLib.getenv("XDG_CURRENT_DESKTOP") || "").toLowerCase();
  if (session.includes("hyprland")) return "hyprland";
  if (session.includes("niri")) return "niri";
  if (session.includes("sway")) return "sway";
  return "unknown";
}

async function detectViaPgrep(): Promise<CompositorKind> {
  // Run probes in parallel; first non-empty stdout wins.
  const probes: Array<[CompositorKind, Promise<string | null>]> = [
    ["hyprland", runAsync(["pgrep", "-x", "Hyprland"])],
    ["niri", runAsync(["pgrep", "-x", "niri"])],
    ["sway", runAsync(["pgrep", "-x", "sway"])],
  ];
  for (const [name, p] of probes) {
    const out = await p;
    if (out && out.trim().length > 0) return name;
  }
  return "unknown";
}

/**
 * Resolves once detection is finished. Most consumers don't need to
 * await it; `getCompositorKind()` is safe to call any time and simply
 * returns the best guess available so far.
 */
export const compositorReady: Promise<CompositorKind> = (async () => {
  kind = fromEnv();
  if (kind !== "unknown") return kind;
  kind = await detectViaPgrep();
  return kind;
})();

export function getCompositorKind(): CompositorKind {
  return kind;
}

export function getCompositorExitCommand(): string[] | null {
  switch (getCompositorKind()) {
    case "hyprland":
      return ["setsid", "hyprshutdown"];
    case "niri":
      return ["niri", "msg", "action", "quit"];
    case "sway":
      return ["swaymsg", "exit"];
    default:
      return null;
  }
}
