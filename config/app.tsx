import Gdk from "gi://Gdk?version=4.0";
import Gtk from "gi://Gtk?version=4.0";

import { Astal } from "ags/gtk4";
import App from "ags/gtk4/app";

import { WindowWorkspacesPill } from "./center/window-workspaces-pill";
import { SystemTray } from "./left/sys-tray/tray";
import { PopupNotificationWindow } from "./notifications/popup-window";
import { BatteryPill } from "./right/battery/battery";
import { NetworkPill } from "./right/network/network";
import { VolumePill } from "./right/speaker-volume/volume";
import { StatePill } from "./right/system/state-pill";
import { TimePill } from "./right/time-pill/time-pill";
import { SidebarWindow } from "./sidebar/panel";
import scss from "./styles/style.scss";

App.reset_css();

/**
 * Recursively calls _cleanup on a widget and all its children
 * This ensures timeouts, signal handlers, and other resources are properly released
 */
function recursiveCleanup(widget: Gtk.Widget | null): void {
  if (!widget) return;

  const cleanupWidget = widget as Gtk.Widget & { _cleanup?: () => void };

  // Call cleanup on this widget if it has one
  if (typeof cleanupWidget._cleanup === "function") {
    try {
      cleanupWidget._cleanup();
    } catch (e) {
      console.error("Error during widget cleanup:", e);
    }
  }

  // Recursively clean up children
  let child = widget.get_first_child();
  while (child) {
    const next = child.get_next_sibling();
    recursiveCleanup(child);
    child = next;
  }
}

function Bar(monitorIndex: number): Gtk.Window {
  const { TOP, LEFT, RIGHT } = Astal.WindowAnchor;

  const window = (
    <window
      name={`fredbar-${monitorIndex}`}
      visible
      monitor={monitorIndex}
      anchor={TOP | LEFT | RIGHT}
      class="bar"
      default_height={28}
      // These two are the "reserve space" sauce:
      // (you already found the right combo for single monitor)
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      layer={Astal.Layer.TOP}
    >
      <centerbox valign={Gtk.Align.CENTER}>
        <box $type="start" valign={Gtk.Align.CENTER}>
          <SystemTray />
        </box>

        <box $type="center" valign={Gtk.Align.CENTER}>
          <WindowWorkspacesPill />
        </box>

        <box $type="end" valign={Gtk.Align.CENTER}>
          <VolumePill />
          <NetworkPill />
          <BatteryPill />
          <TimePill />
          <StatePill />
        </box>
      </centerbox>
    </window>
  ) as unknown as Gtk.Window;

  // Ensure all widget cleanup methods are called when window is destroyed
  window.connect("destroy", () => {
    recursiveCleanup(window.get_child());
  });

  return window;
}

/** AGS API compatibility shim */
function appAddWindow(win: Gtk.Window): void {
  const anyApp = App as unknown as {
    addWindow?: (w: Gtk.Window) => void;
    add_window?: (w: Gtk.Window) => void;
  };

  anyApp.addWindow?.(win);
  anyApp.add_window?.(win);
}

function appRemoveWindow(win: Gtk.Window): void {
  const anyApp = App as unknown as {
    removeWindow?: (w: Gtk.Window) => void;
    remove_window?: (w: Gtk.Window) => void;
  };

  anyApp.removeWindow?.(win);
  anyApp.remove_window?.(win);
}

App.start({
  css: scss,
  main() {
    const display = Gdk.Display.get_default();
    if (!display) return [];

    const monitors = display.get_monitors(); // GListModel
    const windowsByIndex = new Map<number, Gtk.Window>();
    const sidebarsByIndex = new Map<number, Gtk.Window>();
    const popupsByIndex = new Map<number, Gtk.Window>();

    const sync = (): void => {
      const n = monitors.get_n_items();
      const wanted = new Set<number>();

      // Add missing bars, sidebars, and popups
      for (let i = 0; i < n; i++) {
        wanted.add(i);

        if (!windowsByIndex.has(i)) {
          const win = Bar(i);
          windowsByIndex.set(i, win);

          // For initial startup, returning windows is enough,
          // but for hotplug we need to add explicitly:
          appAddWindow(win);
        }

        if (!sidebarsByIndex.has(i)) {
          const sidebar = SidebarWindow(i);
          // Ensure cleanup on destroy
          sidebar.connect("destroy", () => {
            recursiveCleanup(sidebar.get_child());
          });
          sidebarsByIndex.set(i, sidebar);
          appAddWindow(sidebar);
        }

        if (!popupsByIndex.has(i)) {
          const popup = PopupNotificationWindow(i);
          // Ensure cleanup on destroy
          popup.connect("destroy", () => {
            recursiveCleanup(popup.get_child());
          });
          popupsByIndex.set(i, popup);
          appAddWindow(popup);
        }
      }

      // Remove bars, sidebars, and popups for disconnected monitors
      for (const [idx, win] of windowsByIndex.entries()) {
        if (wanted.has(idx)) continue;

        try {
          appRemoveWindow(win);
        } catch {
          // ignore
        }

        try {
          win.destroy();
        } catch {
          // ignore
        }

        windowsByIndex.delete(idx);
      }

      for (const [idx, sidebar] of sidebarsByIndex.entries()) {
        if (wanted.has(idx)) continue;

        try {
          appRemoveWindow(sidebar);
        } catch {
          // ignore
        }

        try {
          sidebar.destroy();
        } catch {
          // ignore
        }

        sidebarsByIndex.delete(idx);
      }

      for (const [idx, popup] of popupsByIndex.entries()) {
        if (wanted.has(idx)) continue;

        try {
          appRemoveWindow(popup);
        } catch {
          // ignore
        }

        try {
          popup.destroy();
        } catch {
          // ignore
        }

        popupsByIndex.delete(idx);
      }
    };

    // Initial windows
    sync();

    // Hotplug: monitor list changes
    monitors.connect("items-changed", () => {
      sync();
    });

    return [
      ...Array.from(windowsByIndex.values()),
      ...Array.from(sidebarsByIndex.values()),
      ...Array.from(popupsByIndex.values()),
    ];
  },
});
