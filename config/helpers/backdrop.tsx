// backdrop.tsx
// Utility for creating a backdrop that closes windows when clicking outside

import Gtk from "gi://Gtk?version=4.0";
import { Astal } from "ags/gtk4";
import App from "ags/gtk4/app";
import { asWindow } from "./jsx";

/**
 * Create a transparent backdrop window that closes a target window when clicked
 * This provides a reliable "click outside to close" behavior
 */
export function createBackdrop(
  targetWindow: Gtk.Window,
  onClose: () => void,
): Gtk.Window {
  const { TOP, RIGHT, BOTTOM, LEFT } = Astal.WindowAnchor;

  const backdrop = asWindow(
    <window
      name={`backdrop-${targetWindow.name || "unknown"}`}
      visible={false}
      anchor={TOP | RIGHT | BOTTOM | LEFT}
      class="backdrop-window"
      exclusivity={Astal.Exclusivity.NORMAL}
      layer={Astal.Layer.TOP}
      keymode={Astal.Keymode.NONE}
    />,
  );

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

  // Register with App. AGS' Astal.Application extends Gtk.Application
  // which provides add_window.
  App.add_window(backdrop);

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

/**
 * A backdrop with manual show/hide control, for components whose visibility
 * isn't tied to a single Gtk.Window — e.g. tray popovers, which are
 * Gtk.Popover instances parented to a button inside the bar window.
 *
 * The backdrop is constrained to a single monitor (by index in the GListModel
 * from Gdk.Display.get_monitors()). Scoping per-monitor instead of spanning
 * all outputs is a deliberate trade: a full-screen overlay across every
 * display has caused input-deadlock recoveries that required SSH-in-to-kill.
 * A per-monitor backdrop limits blast radius — if anything goes wrong, the
 * user can move the pointer to another monitor and interact normally.
 *
 * Returns a handle the caller can flip when their managed surface opens or
 * closes.
 */
export interface TrayBackdropHandle {
  show: () => void;
  hide: () => void;
}

export function createManualBackdrop(
  monitorIndex: number,
  onClose: () => void,
): TrayBackdropHandle {
  const { TOP, RIGHT, BOTTOM, LEFT } = Astal.WindowAnchor;

  const backdrop = asWindow(
    <window
      name="backdrop-tray"
      visible={false}
      monitor={monitorIndex}
      anchor={TOP | RIGHT | BOTTOM | LEFT}
      class="backdrop-window"
      exclusivity={Astal.Exclusivity.NORMAL}
      layer={Astal.Layer.TOP}
      keymode={Astal.Keymode.NONE}
    />,
  );

  const box = new Gtk.Box({
    css_classes: ["backdrop-box"],
    hexpand: true,
    vexpand: true,
  });
  backdrop.set_child(box);

  const clickController = new Gtk.GestureClick();
  clickController.connect("released", () => {
    onClose();
  });
  box.add_controller(clickController);

  App.add_window(backdrop);

  return {
    show: () => {
      backdrop.visible = true;
    },
    hide: () => {
      backdrop.visible = false;
    },
  };
}
