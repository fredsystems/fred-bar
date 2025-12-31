import type Gtk from "gi://Gtk?version=4.0";
import { Astal } from "ags/gtk4";
import { PopupNotificationContainer } from "./popup";

export function PopupNotificationWindow(monitorIndex: number): Gtk.Window {
  const { TOP, RIGHT } = Astal.WindowAnchor;

  const win = (
    <window
      name={`notification-popup-${monitorIndex}`}
      visible={true}
      monitor={monitorIndex}
      anchor={TOP | RIGHT}
      class="popup-notification-window"
      exclusivity={Astal.Exclusivity.NORMAL}
      layer={Astal.Layer.OVERLAY}
      margin_top={8}
      margin_right={8}
    >
      <PopupNotificationContainer />
    </window>
  ) as unknown as Gtk.Window;

  return win;
}
