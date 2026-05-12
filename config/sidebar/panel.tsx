import Gtk from "gi://Gtk?version=4.0";
import { Astal } from "ags/gtk4";
import { setupBackdrop } from "helpers/backdrop";
import { registerCleanup } from "helpers/cleanup";
import { asWindow } from "helpers/jsx";
import { notificationService } from "services/notifications";
import { getWindowManager } from "services/window-manager";
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

  // Cleanup. Children now auto-clean via the destroy signal, so we only
  // need to drop the notification-service subscription here.
  registerCleanup(container, () => {
    unsubscribe();
  });

  return container;
}

export function SidebarWindow(monitorIndex: number): Gtk.Window {
  const { TOP, RIGHT, BOTTOM } = Astal.WindowAnchor;
  const windowManager = getWindowManager();
  const windowName = `sidebar-${monitorIndex}`;

  const win = asWindow(
    <window
      name={windowName}
      visible={false}
      monitor={monitorIndex}
      anchor={TOP | RIGHT | BOTTOM}
      class="sidebar-window"
      default_width={0}
      exclusivity={Astal.Exclusivity.NORMAL}
      layer={Astal.Layer.OVERLAY}
      // Keymode.NONE (not ON_DEMAND). With ON_DEMAND, the compositor
      // transfers the implicit pointer grab to the sidebar surface
      // when it maps. The bar then receives `pointer.leave` and
      // subsequent clicks on the state-pill (or any other bar pill)
      // are not delivered to the button widget until the pointer
      // moves again, breaking "click pill to dismiss". With NONE,
      // the bar keeps its pointer grab. Trade-off: ESC won't dismiss
      // via the window's own key controller; if needed later, use a
      // global key-snooper on the application root.
      keymode={Astal.Keymode.NONE}
    >
      <SidebarPanel />
    </window>,
  );

  // Create backdrop window for click-outside-to-close
  const _backdrop = setupBackdrop(win, () => {
    windowManager.hide(windowName);
  });

  // Register with window manager
  windowManager.register(windowName, win);

  // Handle ESC key to close
  const keyController = new Gtk.EventControllerKey();
  keyController.connect("key-pressed", (_ctrl, keyval) => {
    if (keyval === 65307) {
      // ESC key
      windowManager.hide(windowName);
      return true;
    }
    return false;
  });
  win.add_controller(keyController);

  // Handle visibility changes to properly manage window size
  win.connect("notify::visible", () => {
    if (win.visible) {
      win.set_default_size(420, -1);
    } else {
      win.set_default_size(0, -1);
    }
  });

  return win;
}
