import GLib from "gi://GLib";
import Gtk from "gi://Gtk?version=4.0";
import { resolveNotificationIcon } from "helpers/icon-resolver";
import {
  type NotificationData,
  notificationService,
} from "services/notifications";

const POPUP_TIMEOUT = 10000; // 10 seconds

interface PopupNotificationProps {
  notification: NotificationData;
  onDismiss: () => void;
  onTimeout: () => void;
}

function PopupNotification(props: PopupNotificationProps): Gtk.Box {
  const { notification, onDismiss, onTimeout } = props;

  const container = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 0,
    css_classes: ["popup-notification"],
  });

  // Add urgency class (0 = low, 1 = normal, 2 = critical)
  if (notification.urgency === 2) {
    container.add_css_class("urgency-critical");
  } else if (notification.urgency === 1) {
    container.add_css_class("urgency-normal");
  } else {
    container.add_css_class("urgency-low");
  }

  const header = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 8,
    css_classes: ["popup-header"],
  });

  // Notification icon - prioritize custom image, then app icon, fallback to bell
  const notifIcon = resolveNotificationIcon(
    notification.image,
    notification.appIcon,
    notification.appName,
  );
  let iconWidget: Gtk.Widget;

  if (notifIcon) {
    const iconImage = Gtk.Image.new_from_gicon(notifIcon);
    iconImage.set_pixel_size(24);
    iconImage.set_css_classes(["popup-icon"]);
    iconWidget = iconImage;
  } else {
    // Fallback to bell icon
    const iconLabel = new Gtk.Label({
      label: "󰂚",
      css_classes: ["popup-icon"],
    });
    iconWidget = iconLabel;
  }
  header.append(iconWidget);

  // App name
  const appLabel = new Gtk.Label({
    label: notification.appName,
    css_classes: ["popup-app"],
    xalign: 0,
    hexpand: true,
    ellipsize: 3, // END
  });
  header.append(appLabel);

  // Close button
  const closeBtn = new Gtk.Button({
    label: "󰅖",
    css_classes: ["popup-close"],
    valign: Gtk.Align.START,
  });
  closeBtn.connect("clicked", () => {
    notificationService.dismissDuringPopup(notification.id);
    onDismiss();
  });
  header.append(closeBtn);

  container.append(header);

  // Body
  const body = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 4,
    css_classes: ["popup-body"],
  });

  if (notification.summary) {
    const summary = new Gtk.Label({
      label: notification.summary,
      css_classes: ["popup-summary"],
      xalign: 0,
      wrap: true,
      max_width_chars: 35,
    });
    body.append(summary);
  }

  if (notification.body) {
    const bodyLabel = new Gtk.Label({
      label: notification.body,
      css_classes: ["popup-body-text"],
      xalign: 0,
      wrap: true,
      max_width_chars: 35,
      lines: 3,
      ellipsize: 3, // END
    });
    body.append(bodyLabel);
  }

  // Progress bar for timeout (inside body)
  const progress = new Gtk.ProgressBar({
    css_classes: ["popup-progress"],
    fraction: 1.0,
  });
  body.append(progress);

  container.append(body);

  // Timeout animation
  let timeoutId: number | null = null;
  const startTime = GLib.get_monotonic_time();
  const updateProgress = (): boolean => {
    const elapsed = (GLib.get_monotonic_time() - startTime) / 1000; // microseconds to milliseconds
    const remaining = Math.max(0, POPUP_TIMEOUT - elapsed);
    progress.fraction = remaining / POPUP_TIMEOUT;

    if (remaining <= 0) {
      onTimeout();
      return false; // Stop the timeout
    }

    return true; // Continue
  };

  timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, updateProgress);

  // Cleanup
  (container as Gtk.Widget & { _cleanup?: () => void })._cleanup = () => {
    if (timeoutId !== null) {
      GLib.Source.remove(timeoutId);
      timeoutId = null;
    }
  };

  return container;
}

interface PopupNotificationContainerProps {
  onEmpty?: () => void;
  onHasNotifications?: () => void;
}

export function PopupNotificationContainer(
  props?: PopupNotificationContainerProps,
): Gtk.Box {
  const container = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 8,
    css_classes: ["popup-notification-container"],
  });

  const popups = new Map<number, Gtk.Widget>();

  function checkAndNotify(): void {
    if (popups.size === 0) {
      props?.onEmpty?.();
    } else if (popups.size === 1) {
      // Just got first notification
      props?.onHasNotifications?.();
    }
  }

  function addPopup(notification: NotificationData): void {
    // Don't show duplicate popups
    if (popups.has(notification.id)) return;

    const popup = PopupNotification({
      notification,
      onDismiss: () => {
        removePopup(notification.id);
      },
      onTimeout: () => {
        // Timeout means it should go to history
        removePopup(notification.id);
      },
    });

    popups.set(notification.id, popup);
    container.append(popup);
    checkAndNotify();
  }

  function removePopup(id: number): void {
    const popup = popups.get(id);
    if (!popup) return;

    (popup as Gtk.Widget & { _cleanup?: () => void })._cleanup?.();
    container.remove(popup);
    popups.delete(id);
    checkAndNotify();
  }

  // Subscribe to new notifications
  const unsubscribe = notificationService.subscribeToPopups((notification) => {
    addPopup(notification);
  });

  // Also listen for dismissals
  const unsubscribeMain = notificationService.subscribe(() => {
    // Remove any popups that were dismissed externally
    for (const [id, _popup] of popups) {
      const exists = notificationService
        .getNotifications()
        .some((n) => n.id === id);
      if (!exists) {
        removePopup(id);
      }
    }
  });

  // Cleanup
  (container as Gtk.Widget & { _cleanup?: () => void })._cleanup = () => {
    // Clean up all popups
    for (const [id, _popup] of popups) {
      removePopup(id);
    }
    unsubscribe();
    unsubscribeMain();
  };

  return container;
}
