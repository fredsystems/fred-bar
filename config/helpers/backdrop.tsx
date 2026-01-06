// backdrop.tsx
// Utility for creating a backdrop that closes windows when clicking outside

import Gtk from "gi://Gtk?version=4.0";
import { Astal } from "ags/gtk4";
import App from "ags/gtk4/app";

/**
 * Create a transparent backdrop window that closes a target window when clicked
 * This provides a reliable "click outside to close" behavior
 */
export function createBackdrop(
  targetWindow: Gtk.Window,
  onClose: () => void,
): Gtk.Window {
  const { TOP, RIGHT, BOTTOM, LEFT } = Astal.WindowAnchor;

  const backdrop = (
    <window
      name={`backdrop-${targetWindow.name || "unknown"}`}
      visible={false}
      anchor={TOP | RIGHT | BOTTOM | LEFT}
      class="backdrop-window"
      exclusivity={Astal.Exclusivity.NORMAL}
      layer={Astal.Layer.TOP}
      keymode={Astal.Keymode.NONE}
    />
  ) as unknown as Gtk.Window;

  // Make the backdrop transparent and clickable
  const box = new Gtk.Box({
    css_classes: ["backdrop-box"],
    hexpand: true,
    vexpand: true,
  });

  backdrop.set_child(box);

  // Add click handler
  const clickController = new Gtk.GestureClick();
  clickController.connect("released", () => {
    // Close the target window
    onClose();
  });
  box.add_controller(clickController);

  // Auto-sync backdrop visibility with target window
  targetWindow.connect("notify::visible", () => {
    backdrop.visible = targetWindow.visible;
  });

  // Register with App
  const anyApp = App as unknown as {
    addWindow?: (w: Gtk.Window) => void;
    add_window?: (w: Gtk.Window) => void;
  };
  anyApp.addWindow?.(backdrop);
  anyApp.add_window?.(backdrop);

  return backdrop;
}

/**
 * Setup backdrop for a window with automatic cleanup
 * Returns the backdrop window for manual control if needed
 */
export function setupBackdrop(
  targetWindow: Gtk.Window,
  onClose: () => void,
): Gtk.Window {
  const backdrop = createBackdrop(targetWindow, onClose);

  // Clean up backdrop when target window is destroyed
  targetWindow.connect("destroy", () => {
    try {
      backdrop.close();
    } catch {
      // Ignore if already destroyed
    }
  });

  return backdrop;
}
