import GLib from "gi://GLib";
import { FallbackAdapter } from "./fallback";
import { HyprlandAdapter } from "./hyprland";
import type { CompositorAdapter } from "./types";

/**
 * Detect which compositor is currently running
 */
function detectCompositor(): string {
  // Check environment variables
  const hyprlandInstance = GLib.getenv("HYPRLAND_INSTANCE_SIGNATURE");
  const waylandDisplay = GLib.getenv("WAYLAND_DISPLAY");
  const xdgCurrentDesktop = GLib.getenv("XDG_CURRENT_DESKTOP");

  // Hyprland sets HYPRLAND_INSTANCE_SIGNATURE
  if (hyprlandInstance) {
    return "hyprland";
  }

  // Check XDG_CURRENT_DESKTOP
  if (xdgCurrentDesktop) {
    const desktop = xdgCurrentDesktop.toLowerCase();
    if (desktop.includes("hyprland")) {
      return "hyprland";
    }
    // Add more compositor checks here as they are implemented
    // if (desktop.includes("sway")) return "sway";
    // if (desktop.includes("niri")) return "niri";
  }

  // If we're on Wayland but don't recognize the compositor
  if (waylandDisplay) {
    console.warn(
      `[Compositor] Running on Wayland (${waylandDisplay}) but compositor not recognized`,
    );
  }

  return "fallback";
}

/**
 * Create the appropriate compositor adapter
 */
function createCompositorAdapter(compositorName?: string): CompositorAdapter {
  const name = compositorName ?? detectCompositor();

  console.log(`[Compositor] Initializing adapter for: ${name}`);

  switch (name) {
    case "hyprland":
      try {
        return new HyprlandAdapter();
      } catch (error) {
        console.error(
          "[Compositor] Failed to initialize Hyprland adapter:",
          error,
        );
        console.warn("[Compositor] Falling back to fallback adapter");
        return new FallbackAdapter();
      }

    // Add more compositor adapters here as they are implemented
    // case "sway":
    //   return new SwayAdapter();
    // case "niri":
    //   return new NiriAdapter();

    case "fallback":
    default:
      if (name !== "fallback") {
        console.warn(
          `[Compositor] Unknown compositor '${name}', using fallback adapter`,
        );
      }
      return new FallbackAdapter();
  }
}

/**
 * Singleton compositor instance
 */
let compositorInstance: CompositorAdapter | null = null;

/**
 * Get the current compositor adapter (singleton)
 */
export function getCompositor(compositorName?: string): CompositorAdapter {
  if (!compositorInstance) {
    compositorInstance = createCompositorAdapter(compositorName);
  }
  return compositorInstance;
}

/**
 * Re-export types for convenience
 */
export type {
  CompositorAdapter,
  CompositorEventHandlers,
  CompositorWindow,
  CompositorWorkspace,
  WindowPreviewData,
  WorkspacePreviewData,
} from "./types";
