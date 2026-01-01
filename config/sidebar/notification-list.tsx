import GLib from "gi://GLib";
import Gtk from "gi://Gtk?version=4.0";
import { resolveAppIcon, resolveNotificationIcon } from "helpers/icon-resolver";
import {
  type NotificationData,
  notificationService,
} from "services/notifications";

function formatTime(timestamp: number): string {
  const now = GLib.DateTime.new_now_local();
  const notifTime = GLib.DateTime.new_from_unix_local(timestamp);

  if (!notifTime) return "";

  const diff = now.difference(notifTime) / 1_000_000; // Convert to seconds

  if (diff < 60) {
    return "Just now";
  }
  if (diff < 3600) {
    const mins = Math.floor(diff / 60);
    return `${mins}m ago`;
  }
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return `${hours}h ago`;
  }

  return notifTime.format("%b %e, %H:%M") ?? "";
}

function NotificationItem(
  notif: NotificationData,
  isGrouped: boolean,
): Gtk.Box {
  const container = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 0,
    css_classes: ["notification-item"],
  });

  const header = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 8,
    css_classes: ["notification-header"],
  });

  // App icon (only show if not grouped, to avoid repetition)
  if (!isGrouped) {
    const notifIcon = resolveNotificationIcon(
      notif.image,
      notif.appIcon,
      notif.appName,
    );
    let iconWidget: Gtk.Widget;

    if (notifIcon) {
      const iconImage = Gtk.Image.new_from_gicon(notifIcon);
      iconImage.set_pixel_size(24);
      iconImage.set_css_classes(["notification-icon"]);
      iconWidget = iconImage;
    } else {
      // Fallback to bell icon
      const iconLabel = new Gtk.Label({
        label: "󰂚",
        css_classes: ["notification-icon"],
      });
      iconWidget = iconLabel;
    }
    header.append(iconWidget);
  } else {
    // Add left padding for grouped items
    const spacer = new Gtk.Box({
      css_classes: ["notification-group-spacer"],
    });
    header.append(spacer);
  }

  // App name and time
  const headerText = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 2,
    hexpand: true,
  });

  if (!isGrouped) {
    const appLabel = new Gtk.Label({
      label: notif.appName,
      css_classes: ["notification-app"],
      xalign: 0,
      ellipsize: 3, // Pango.EllipsizeMode.END
    });
    headerText.append(appLabel);
  }

  const timeLabel = new Gtk.Label({
    label: formatTime(notif.time),
    css_classes: ["notification-time"],
    xalign: 0,
  });
  headerText.append(timeLabel);

  header.append(headerText);

  // Close button
  const closeBtn = new Gtk.Button({
    label: "󰅖",
    css_classes: ["notification-close"],
    valign: Gtk.Align.START,
  });
  closeBtn.connect("clicked", () => {
    notificationService.dismiss(notif.id);
  });
  header.append(closeBtn);

  container.append(header);

  // Body
  const body = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 4,
    css_classes: ["notification-body"],
  });

  if (notif.summary) {
    const summary = new Gtk.Label({
      label: notif.summary,
      css_classes: ["notification-summary"],
      xalign: 0,
      wrap: true,
      max_width_chars: 40,
    });
    body.append(summary);
  }

  if (notif.body) {
    const bodyLabel = new Gtk.Label({
      label: notif.body,
      css_classes: ["notification-body-text"],
      xalign: 0,
      wrap: true,
      max_width_chars: 40,
      ellipsize: 3, // Pango.EllipsizeMode.END
      lines: 3,
    });
    body.append(bodyLabel);
  }

  container.append(body);

  // Make the whole notification clickable
  const button = new Gtk.Button({
    css_classes: ["notification-item-button"],
    child: container,
  });

  button.connect("clicked", () => {
    notificationService.invoke(notif.id);
  });

  // Add urgency class (0 = low, 1 = normal, 2 = critical)
  if (notif.urgency === 2) {
    button.add_css_class("urgency-critical");
  } else if (notif.urgency === 1) {
    button.add_css_class("urgency-normal");
  } else {
    button.add_css_class("urgency-low");
  }

  return button as unknown as Gtk.Box;
}

interface NotificationGroupProps {
  appName: string;
  notifications: NotificationData[];
}

function NotificationGroup(props: NotificationGroupProps): Gtk.Box {
  const { appName, notifications } = props;

  const container = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 4,
    css_classes: ["notification-group"],
  });

  let expanded = false;

  // Use overlay to position dismiss button separately
  const headerOverlay = new Gtk.Overlay({
    css_classes: ["notification-group-header-overlay"],
  });

  // Group header button (without dismiss button inside)
  const headerButton = new Gtk.Button({
    css_classes: ["notification-group-header"],
  });

  const headerBox = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 8,
  });

  // Icon - use app icon for the group
  const firstNotif = notifications[0];
  const appGicon = resolveAppIcon(firstNotif.appIcon || appName);
  let iconWidget: Gtk.Widget;

  if (appGicon) {
    const iconImage = Gtk.Image.new_from_gicon(appGicon);
    iconImage.set_pixel_size(24);
    iconImage.set_css_classes(["notification-icon"]);
    iconWidget = iconImage;
  } else {
    // Fallback to bell icon
    const iconLabel = new Gtk.Label({
      label: "󰂚",
      css_classes: ["notification-icon"],
    });
    iconWidget = iconLabel;
  }
  headerBox.append(iconWidget);

  // App name and count
  const textBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 2,
    hexpand: true,
  });

  const nameLabel = new Gtk.Label({
    label: appName,
    css_classes: ["notification-group-name"],
    xalign: 0,
  });
  textBox.append(nameLabel);

  const countLabel = new Gtk.Label({
    label: `${notifications.length} notification${notifications.length > 1 ? "s" : ""}`,
    css_classes: ["notification-group-count"],
    xalign: 0,
  });
  textBox.append(countLabel);

  headerBox.append(textBox);

  // Expand/collapse indicator
  const expandIcon = new Gtk.Label({
    label: "󰅂", // chevron down
    css_classes: ["notification-group-expand"],
  });
  headerBox.append(expandIcon);

  // Add some padding to the right to make room for dismiss button
  const spacer = new Gtk.Box({
    css_classes: ["notification-group-dismiss-spacer"],
  });
  headerBox.append(spacer);

  headerButton.set_child(headerBox);
  headerOverlay.set_child(headerButton);

  // Dismiss all button - as an overlay (positioned independently)
  const dismissAllBtn = new Gtk.Button({
    label: "󰆴", // trash icon
    css_classes: ["notification-group-dismiss"],
    tooltip_text: "Dismiss all from this app",
    halign: Gtk.Align.END,
    valign: Gtk.Align.CENTER,
  });

  dismissAllBtn.connect("clicked", () => {
    notificationService.dismissApp(appName);
  });

  headerOverlay.add_overlay(dismissAllBtn);
  container.append(headerOverlay);

  // Now header button click only toggles
  headerButton.connect("clicked", () => {
    toggleExpanded();
  });

  // Revealer for notifications
  const revealer = new Gtk.Revealer({
    reveal_child: false,
    transition_type: Gtk.RevealerTransitionType.SLIDE_DOWN,
    transition_duration: 200,
  });

  const notificationBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 4,
    css_classes: ["notification-group-items"],
  });

  revealer.set_child(notificationBox);
  container.append(revealer);

  function updateNotifications(): void {
    // Clear existing
    let child = notificationBox.get_first_child();
    while (child) {
      const next = child.get_next_sibling();
      notificationBox.remove(child);
      child = next;
    }

    // Add all notifications (sorted by time, newest first)
    notifications
      .sort((a, b) => b.time - a.time)
      .forEach((notif) => {
        notificationBox.append(NotificationItem(notif, true));
      });
  }

  function toggleExpanded(): void {
    expanded = !expanded;
    revealer.reveal_child = expanded;
    expandIcon.label = expanded ? "󰅀" : "󰅂"; // chevron up : chevron down

    if (expanded) {
      headerButton.add_css_class("expanded");
      updateNotifications();
    } else {
      headerButton.remove_css_class("expanded");
    }
  }

  return container;
}

export function NotificationList(): Gtk.Box {
  const container = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 0,
    css_classes: ["notification-list"],
  });

  const scrolled = new Gtk.ScrolledWindow({
    vexpand: true,
    hscrollbar_policy: Gtk.PolicyType.NEVER,
    vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
    css_classes: ["notification-scroll"],
  });

  const listBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 8,
    css_classes: ["notification-list-box"],
  });

  scrolled.set_child(listBox);
  container.append(scrolled);

  function update(): void {
    // Clear existing children
    let child = listBox.get_first_child();
    while (child) {
      const next = child.get_next_sibling();
      listBox.remove(child);
      child = next;
    }

    const grouped = notificationService.getNotificationsByApp();

    if (grouped.size === 0) {
      const empty = new Gtk.Label({
        label: "No notifications",
        css_classes: ["notification-empty"],
        valign: Gtk.Align.CENTER,
      });
      listBox.append(empty);
    } else {
      // Sort by most recent notification in each group
      const sortedApps = Array.from(grouped.entries()).sort((a, b) => {
        const aLatest = Math.max(...a[1].map((n) => n.time));
        const bLatest = Math.max(...b[1].map((n) => n.time));
        return bLatest - aLatest;
      });

      for (const [appName, notifications] of sortedApps) {
        if (notifications.length === 1) {
          // Single notification - show directly
          listBox.append(NotificationItem(notifications[0], false));
        } else {
          // Multiple notifications - show as group
          listBox.append(NotificationGroup({ appName, notifications }));
        }
      }
    }
  }

  // Initial render
  update();

  // Subscribe to updates
  const unsubscribe = notificationService.subscribe(update);

  // Cleanup
  (container as Gtk.Widget & { _cleanup?: () => void })._cleanup = () => {
    unsubscribe();
  };

  return container;
}
