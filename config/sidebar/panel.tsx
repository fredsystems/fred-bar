import Gtk from "gi://Gtk?version=4.0";
import { Astal } from "ags/gtk4";
import { notificationService } from "services/notifications";
import { ConnectivityToggles } from "./connectivity-toggles";
import { MediaPlayer } from "./media-player";
import { NotificationList } from "./notification-list";
import { PowerProfilesToggle } from "./power-profiles";
import { Sliders } from "./sliders";
import { SystemActions } from "./system-actions";

export function SidebarPanel(): Gtk.Box {
  const container = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 0,
    css_classes: ["sidebar-panel"],
  });

  // Main scrolled area
  const scrolled = new Gtk.ScrolledWindow({
    vexpand: true,
    hscrollbar_policy: Gtk.PolicyType.NEVER,
    vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
    css_classes: ["sidebar-scroll"],
  });

  const contentBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 16,
    css_classes: ["sidebar-content"],
  });

  // Media Player Section
  const mediaPlayer = MediaPlayer();
  contentBox.append(mediaPlayer);

  // Add separator
  const separator1 = new Gtk.Separator({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["sidebar-separator"],
  });
  contentBox.append(separator1);

  // System Actions Section
  const systemActions = SystemActions();
  contentBox.append(systemActions);

  // Connectivity Toggles Section
  const connectivityToggles = ConnectivityToggles();
  contentBox.append(connectivityToggles);

  // Power Profiles Section (only if supported)
  const powerProfiles = PowerProfilesToggle();
  if (powerProfiles) {
    contentBox.append(powerProfiles);
  }

  // Add separator
  const separator2 = new Gtk.Separator({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["sidebar-separator"],
  });
  contentBox.append(separator2);

  // Sliders Section
  const sliders = Sliders();
  contentBox.append(sliders);

  // Add separator before notifications
  const separator3 = new Gtk.Separator({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["sidebar-separator"],
  });
  contentBox.append(separator3);

  // Notifications Header
  const notifHeader = new Gtk.Box({
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

  notifHeader.append(titleBox);

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

  notifHeader.append(dndButton);

  // Clear all button
  const clearButton = new Gtk.Button({
    label: "Clear All",
    css_classes: ["sidebar-clear-button"],
  });

  clearButton.connect("clicked", () => {
    notificationService.dismissAll();
  });

  notifHeader.append(clearButton);

  contentBox.append(notifHeader);

  // Separator before notification list
  const notifSeparator = new Gtk.Separator({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["sidebar-separator"],
  });
  contentBox.append(notifSeparator);

  // Notification list
  const notifList = NotificationList();
  contentBox.append(notifList);

  scrolled.set_child(contentBox);
  container.append(scrolled);

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
    (mediaPlayer as Gtk.Widget & { _cleanup?: () => void })?._cleanup?.();
    (
      connectivityToggles as Gtk.Widget & { _cleanup?: () => void }
    )?._cleanup?.();
    (powerProfiles as Gtk.Widget & { _cleanup?: () => void })?._cleanup?.();
    (sliders as Gtk.Widget & { _cleanup?: () => void })?._cleanup?.();
    (notifList as Gtk.Widget & { _cleanup?: () => void })?._cleanup?.();
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
