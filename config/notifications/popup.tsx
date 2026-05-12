import GLib from "gi://GLib";
import Gtk from "gi://Gtk?version=4.0";
import { getCompositor } from "compositors";
import { resolveNotificationIcon } from "helpers/icon-resolver";
import {
  type NotificationData,
  notificationService,
} from "services/notifications";

const POPUP_TIMEOUT = 10000; // 10 seconds
const PROGRESS_TICK_MS = 100; // shared scheduler cadence

/* -----------------------------
 * Shared progress scheduler
 *
 * One GLib source ticks every PROGRESS_TICK_MS and drives every live popup's
 * progress bar. Previously each PopupNotification spawned its own 50ms timer,
 * meaning N monitors × M popups × 20Hz wakeups. Now: a single 10Hz source for
 * the whole app, regardless of popup count.
 * ----------------------------- */

interface SharedPopupEntry {
  startTime: number; // GLib.get_monotonic_time() in microseconds
  progress: Gtk.ProgressBar;
  onTimeout: () => void;
}

const sharedPopups = new Set<SharedPopupEntry>();
let sharedTimerId: number | null = null;

function ensureSharedTimer(): void {
  if (sharedTimerId !== null) return;
  sharedTimerId = GLib.timeout_add(
    GLib.PRIORITY_DEFAULT,
    PROGRESS_TICK_MS,
    () => {
      // Iterate over a snapshot so onTimeout handlers can mutate the set.
      const snapshot = Array.from(sharedPopups);
      const now = GLib.get_monotonic_time();
      for (const entry of snapshot) {
        const elapsed = (now - entry.startTime) / 1000; // µs → ms
        const remaining = Math.max(0, POPUP_TIMEOUT - elapsed);
        entry.progress.fraction = remaining / POPUP_TIMEOUT;
        if (remaining <= 0) {
          sharedPopups.delete(entry);
          entry.onTimeout();
        }
      }
      if (sharedPopups.size === 0) {
        sharedTimerId = null;
        return GLib.SOURCE_REMOVE;
      }
      return GLib.SOURCE_CONTINUE;
    },
  );
}

function registerPopupProgress(entry: SharedPopupEntry): void {
  sharedPopups.add(entry);
  ensureSharedTimer();
}

function unregisterPopupProgress(entry: SharedPopupEntry): void {
  sharedPopups.delete(entry);
  // Timer is self-cancelling once the set empties; no need to remove here.
}

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

  // Timeout animation — driven by the shared scheduler.
  const entry: SharedPopupEntry = {
    startTime: GLib.get_monotonic_time(),
    progress,
    onTimeout,
  };
  registerPopupProgress(entry);

  // Cleanup
  (container as Gtk.Widget & { _cleanup?: () => void })._cleanup = () => {
    unregisterPopupProgress(entry);
  };

  return container;
}

interface PopupNotificationContainerProps {
  /**
   * Connector name of the monitor this container lives on (e.g. "DP-2").
   * Used to gate popup creation to the focused monitor only.
   * Resolved lazily by the caller — typically via `getMonitorConnectorName`
   * once the parent window is realised. If null, the container accepts
   * popups unconditionally (fallback: no focused-monitor info available).
   */
  getMonitorConnector?: () => string | null;
  onEmpty?: () => void;
  onHasNotifications?: () => void;
}

export function PopupNotificationContainer(
  props?: PopupNotificationContainerProps,
): Gtk.Box {
  const compositor = getCompositor();
  const container = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 8,
    css_classes: ["popup-notification-container"],
  });

  const popups = new Map<number, Gtk.Widget>();
  // Track currently-shown popup id per (appName + syncTag) so a follow-up
  // notification with the same tag replaces the existing popup instead of
  // stacking. This is what makes volume / brightness OSDs feel right.
  const syncTagToId = new Map<string, number>();

  function syncKey(appName: string, tag: string): string {
    return `${appName}\x00${tag}`;
  }

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

    // Focused-monitor gating: only the currently-focused monitor renders
    // popups. Resolved at popup-arrival time; we don't migrate popups across
    // monitors mid-lifetime. If we can't resolve our own connector or the
    // compositor can't tell us the focused monitor, fall through and show
    // the popup (best-effort fallback).
    const ownConnector = props?.getMonitorConnector?.() ?? null;
    const focused = compositor.getFocusedMonitor();
    if (ownConnector !== null && focused !== null && ownConnector !== focused) {
      return;
    }

    // Synchronous-tag replacement: dismiss any prior popup that shares the
    // same (appName, syncTag) key before showing the new one.
    if (notification.syncTag !== null) {
      const key = syncKey(notification.appName, notification.syncTag);
      const priorId = syncTagToId.get(key);
      if (priorId !== undefined && priorId !== notification.id) {
        // Mirror what the user pressing "close" does — remove from the
        // server too so the prior notification doesn't linger as resolved
        // history elsewhere.
        notificationService.dismissDuringPopup(priorId);
        removePopup(priorId);
      }
      syncTagToId.set(key, notification.id);
    }

    const popup = PopupNotification({
      notification,
      onDismiss: () => {
        removePopup(notification.id);
      },
      onTimeout: () => {
        // Timeout means it should go to history (unless transient/sync-tagged
        // — the service has already excluded those from getNotifications()).
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
    // Clear any sync-tag mapping that points at this id.
    for (const [key, mappedId] of syncTagToId) {
      if (mappedId === id) syncTagToId.delete(key);
    }
    checkAndNotify();
  }

  // Subscribe to new notifications
  const unsubscribe = notificationService.subscribeToPopups((notification) => {
    addPopup(notification);
  });

  // Also listen for dismissals
  const unsubscribeMain = notificationService.subscribe(() => {
    // Remove any popups that were dismissed externally on the server. Use
    // hasLiveNotification() rather than getNotifications() so transient and
    // synchronous-tagged popups (which are excluded from history) aren't
    // wrongly torn down before their timeout completes.
    for (const [id, _popup] of popups) {
      if (!notificationService.hasLiveNotification(id)) {
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
