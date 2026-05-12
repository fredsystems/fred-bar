import Gdk from "gi://Gdk?version=4.0";
import type Gtk from "gi://Gtk?version=4.0";
import { Astal } from "ags/gtk4";
import { PopupNotificationContainer } from "./popup";

/**
 * Resolve a monitor's connector name directly by its index in the Gdk
 * monitor list. This is the same index we pass to `<window monitor={i}>` so
 * the mapping is exact — unlike `get_monitor_at_surface(surface)` which is
 * unreliable for layer-shell windows (it can return the monitor under the
 * pointer instead of the one the surface is anchored to, leading to popups
 * showing on the wrong monitor when the cursor is elsewhere).
 */
function connectorForMonitorIndex(index: number): string | null {
  try {
    const display = Gdk.Display.get_default();
    if (!display) return null;
    const monitors = display.get_monitors();
    const monitor = monitors.get_item(index) as Gdk.Monitor | null;
    return monitor?.get_connector?.() ?? null;
  } catch {
    return null;
  }
}

export function PopupNotificationWindow(monitorIndex: number): Gtk.Window {
  const { TOP, RIGHT } = Astal.WindowAnchor;

  // Resolve once at construction — the monitor index is fixed for the
  // lifetime of this window, and the Gdk monitor list is already populated
  // by the time we're called (otherwise we wouldn't have an index).
  const ownConnector = connectorForMonitorIndex(monitorIndex);

  const win = (
    <window
      name={`notification-popup-${monitorIndex}`}
      visible={false}
      monitor={monitorIndex}
      anchor={TOP | RIGHT}
      class="popup-notification-window"
      default_width={0}
      exclusivity={Astal.Exclusivity.NORMAL}
      layer={Astal.Layer.OVERLAY}
      margin_top={8}
      margin_right={8}
    >
      <PopupNotificationContainer
        getMonitorConnector={() => ownConnector}
        onEmpty={() => {
          win.visible = false;
          win.set_default_size(0, -1);
        }}
        onHasNotifications={() => {
          win.visible = true;
          win.set_default_size(-1, -1);
        }}
      />
    </window>
  ) as unknown as Gtk.Window;

  return win;
}
