import GLib from "gi://GLib";
import type Gtk from "gi://Gtk?version=4.0";
import { FallbackAdapter } from "./fallback";
import { HyprlandAdapter } from "./hyprland";
import { NiriAdapter } from "./niri";
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
    if (desktop.includes("niri")) {
      return "niri";
    }
    // Add more compositor checks here as they are implemented
    // if (desktop.includes("sway")) return "sway";
  }

  // Check for niri by trying to run niri msg
  try {
    const [success] = GLib.spawn_command_line_sync("niri msg version");
    if (success) {
      return "niri";
    }
  } catch {
    // niri not available
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

    case "niri":
      try {
        return new NiriAdapter();
      } catch (error) {
        console.error("[Compositor] Failed to initialize Niri adapter:", error);
        console.warn("[Compositor] Falling back to fallback adapter");
        return new FallbackAdapter();
      }
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
 * Get monitor connector name from a GTK widget
 * Returns the monitor's connector name (e.g., "DP-2", "HDMI-A-1")
 */
export function getMonitorConnectorName(widget: Gtk.Widget): string | null {
  try {
    const display = widget.get_display?.();
    if (!display) return null;

    const native = widget.get_native?.();
    if (!native) return null;

    const surface = native.get_surface?.();
    if (!surface) return null;

    const monitor = display.get_monitor_at_surface?.(surface);
    if (!monitor) return null;

    const connector = monitor.get_connector?.();
    return connector || null;
  } catch (error) {
    console.error("[Compositor] Failed to get monitor connector:", error);
    return null;
  }
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
