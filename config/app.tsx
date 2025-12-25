import Gdk from "gi://Gdk?version=4.0";
import Gtk from "gi://Gtk?version=4.0";

import { Astal } from "ags/gtk4";
import App from "ags/gtk4/app";

import { WindowWorkspacesPill } from "./center/window-workspaces-pill";
import { SystemTray } from "./left/sys-tray/tray";
import { VolumePill } from "./right/speaker-volume/volume";
import { StatePill } from "./right/system/state-pill";
import { TimePill } from "./right/time-pill/time-pill";

App.reset_css();
App.apply_css(`./style.css`);

function Bar(monitorIndex: number): Gtk.Window {
  const { TOP, LEFT, RIGHT } = Astal.WindowAnchor;

  return (
    <window
      name={`fredbar-${monitorIndex}`}
      visible
      monitor={monitorIndex}
      anchor={TOP | LEFT | RIGHT}
      class="bar"
      default_height={28}
      // These two are the “reserve space” sauce:
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
          <TimePill />
          <StatePill />
        </box>
      </centerbox>
    </window>
  ) as unknown as Gtk.Window;
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
  main() {
    const display = Gdk.Display.get_default();
    if (!display) return [];

    const monitors = display.get_monitors(); // GListModel
    const windowsByIndex = new Map<number, Gtk.Window>();

    const sync = (): void => {
      const n = monitors.get_n_items();
      const wanted = new Set<number>();

      // Add missing bars
      for (let i = 0; i < n; i++) {
        wanted.add(i);

        if (!windowsByIndex.has(i)) {
          const win = Bar(i);
          windowsByIndex.set(i, win);

          // For initial startup, returning windows is enough,
          // but for hotplug we need to add explicitly:
          appAddWindow(win);
        }
      }

      // Remove bars for disconnected monitors
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
    };

    // Initial windows
    sync();

    // Hotplug: monitor list changes
    monitors.connect("items-changed", () => {
      sync();
    });

    return Array.from(windowsByIndex.values());
  },
});
