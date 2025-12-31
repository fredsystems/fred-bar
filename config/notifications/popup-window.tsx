import type Gtk from "gi://Gtk?version=4.0";
import { Astal } from "ags/gtk4";
import { PopupNotificationContainer } from "./popup";

export function PopupNotificationWindow(monitorIndex: number): Gtk.Window {
  const { TOP, RIGHT } = Astal.WindowAnchor;

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
