import Gtk from "gi://Gtk?version=4.0";
import { Astal } from "ags/gtk4";
import { notificationService } from "services/notifications";
import { NotificationList } from "./notification-list";

export function SidebarPanel(): Gtk.Box {
  const container = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 0,
    css_classes: ["sidebar-panel"],
  });

  // Header
  const header = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 12,
    css_classes: ["sidebar-header"],
  });

  const titleBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 0,
    hexpand: true,
  });

  const title = new Gtk.Label({
    label: "Notifications",
    css_classes: ["sidebar-title"],
    xalign: 0,
  });
  titleBox.append(title);

  const countLabel = new Gtk.Label({
    label: "",
    css_classes: ["sidebar-count"],
    xalign: 0,
  });
  titleBox.append(countLabel);

  header.append(titleBox);

  // DND toggle button
  const dndButton = new Gtk.Button({
    css_classes: ["sidebar-dnd-button"],
    tooltip_text: "Do Not Disturb",
  });

  const dndIcon = new Gtk.Label({
    label: "󰂛",
  });
  dndButton.set_child(dndIcon);

  dndButton.connect("clicked", () => {
    notificationService.toggleDnd();
    updateDnd();
  });

  header.append(dndButton);

  // Clear all button
  const clearButton = new Gtk.Button({
    label: "Clear All",
    css_classes: ["sidebar-clear-button"],
  });

  clearButton.connect("clicked", () => {
    notificationService.dismissAll();
  });

  header.append(clearButton);

  container.append(header);

  // Separator
  const separator = new Gtk.Separator({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["sidebar-separator"],
  });
  container.append(separator);

  // Notification list
  const notifList = NotificationList();
  container.append(notifList);

  function updateCount(): void {
    const count = notificationService.getPendingCount();
    if (count === 0) {
      countLabel.label = "No new notifications";
    } else if (count === 1) {
      countLabel.label = "1 notification";
    } else {
      countLabel.label = `${count} notifications`;
    }
  }

  function updateDnd(): void {
    if (notificationService.dnd) {
      dndButton.add_css_class("active");
      dndIcon.label = "󰂛";
      dndButton.tooltip_text = "Do Not Disturb: On";
    } else {
      dndButton.remove_css_class("active");
      dndIcon.label = "󰂚";
      dndButton.tooltip_text = "Do Not Disturb: Off";
    }
  }

  // Initial state
  updateCount();
  updateDnd();

  // Subscribe to updates
  const unsubscribe = notificationService.subscribe(() => {
    updateCount();
  });

  // Cleanup
  (container as Gtk.Widget & { _cleanup?: () => void })._cleanup = () => {
    unsubscribe();
    (notifList as Gtk.Widget & { _cleanup?: () => void })._cleanup?.();
  };

  return container;
}

export function SidebarWindow(monitorIndex: number): Gtk.Window {
  const { TOP, RIGHT, BOTTOM } = Astal.WindowAnchor;

  const win = (
    <window
      name={`sidebar-${monitorIndex}`}
      visible={false}
      monitor={monitorIndex}
      anchor={TOP | RIGHT | BOTTOM}
      class="sidebar-window"
      default_width={420}
      exclusivity={Astal.Exclusivity.NORMAL}
      layer={Astal.Layer.OVERLAY}
      keymode={Astal.Keymode.ON_DEMAND}
    >
      <SidebarPanel />
    </window>
  ) as unknown as Gtk.Window;

  // Handle ESC key to close
  const keyController = new Gtk.EventControllerKey();
  keyController.connect("key-pressed", (_ctrl, keyval) => {
    if (keyval === 65307) {
      // ESC key
      win.visible = false;
      return true;
    }
    return false;
  });
  win.add_controller(keyController);

  return win;
}
