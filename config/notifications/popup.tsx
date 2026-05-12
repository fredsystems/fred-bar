import Gtk from "gi://Gtk?version=4.0";
import { getCompositor } from "compositors";
import { registerCleanup } from "helpers/cleanup";
import { resolveNotificationIcon } from "helpers/icon-resolver";
import {
  type NotificationData,
  notificationService,
} from "services/notifications";
import {
  addPopupGlobal,
  getLivePopups,
  livePopupCount,
  removePopupGlobal,
  subscribePopups,
} from "./popup-state";

/* -----------------------------
 * Presentation: a single popup row
 *
 * Pure presentation — no signal subscriptions, no timers, no per-row state
 * beyond what's needed to update the progress bar. The row is owned by
 * popup-state's livePopups map and reparented across per-monitor views.
 * ----------------------------- */

interface PopupNotificationRowResult {
  widget: Gtk.Box;
  progress: Gtk.ProgressBar;
  cleanup: () => void;
}

function PopupNotificationRow(
  notification: NotificationData,
): PopupNotificationRowResult {
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

  // Notification icon — prioritize custom image, then app icon, fallback bell.
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
    iconWidget = new Gtk.Label({
      label: "󰂚",
      css_classes: ["popup-icon"],
    });
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
  const closeHandler = closeBtn.connect("clicked", () => {
    notificationService.dismissDuringPopup(notification.id);
    removePopupGlobal(notification.id);
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

  // Progress bar — fraction is updated by the shared timer in popup-state.
  const progress = new Gtk.ProgressBar({
    css_classes: ["popup-progress"],
    fraction: 1.0,
  });
  body.append(progress);
  container.append(body);

  const cleanup = (): void => {
    try {
      closeBtn.disconnect(closeHandler);
    } catch (_e) {
      // Button may already be unrealised; ignore.
    }
  };

  return { widget: container, progress, cleanup };
}

/* -----------------------------
 * Per-monitor view
 *
 * Subscribes to (a) the compositor's focused-monitor (via the existing
 * onFocusedWorkspaceChanged event which fires on focus-follows-mouse in
 * Hyprland and on workspace changes in niri) and (b) the global popup
 * state. When this monitor is focused, it (re)parents every live row into
 * itself; when it loses focus, it detaches them and the next-focused
 * monitor's view picks them up.
 * ----------------------------- */

interface PopupNotificationContainerProps {
  /**
   * Connector name of the monitor this container lives on (e.g. "DP-2").
   * Used to decide whether this view should display popups.
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

  let isFocused = false;
  let lastEmpty = true;

  const ownConnector = (): string | null =>
    props?.getMonitorConnector?.() ?? null;

  const isOwnerOfFocus = (): boolean => {
    const own = ownConnector();
    const focused = compositor.getFocusedMonitor();
    // If either side is unknown, fall through: best-effort show.
    // This covers the fallback compositor and pre-bootstrap startup.
    if (own === null || focused === null) return true;
    return own === focused;
  };

  // Detach every row currently parented into this container (without
  // destroying the widget — popup-state still owns it).
  const detachAll = (): void => {
    let child = container.get_first_child();
    while (child) {
      const next = child.get_next_sibling();
      container.remove(child);
      child = next;
    }
  };

  // (Re)parent live rows from popup-state into this container, in the
  // order popup-state reports them. If a row is currently parented in
  // another monitor's view, unparent it first.
  const attachAll = (): void => {
    const popups = getLivePopups();
    // First: remove any child we hold that isn't in the live set anymore.
    const liveIds = new Set(popups.map((p) => p.id));
    let child = container.get_first_child();
    while (child) {
      const next = child.get_next_sibling();
      const id = (child as Gtk.Widget & { _popupId?: number })._popupId;
      if (id === undefined || !liveIds.has(id)) {
        container.remove(child);
      }
      child = next;
    }
    // Then: append any live popup not already in this container, in order.
    for (const p of popups) {
      const currentParent = p.widget.get_parent();
      if (currentParent === container) continue;
      if (currentParent) {
        try {
          (
            currentParent as unknown as { remove?: (w: Gtk.Widget) => void }
          ).remove?.(p.widget);
        } catch (_e) {
          p.widget.unparent();
        }
      }
      (p.widget as Gtk.Widget & { _popupId?: number })._popupId = p.id;
      container.append(p.widget);
    }
  };

  const checkAndNotify = (): void => {
    const empty = livePopupCount() === 0 || !isFocused;
    if (empty && !lastEmpty) {
      lastEmpty = true;
      props?.onEmpty?.();
    } else if (!empty && lastEmpty) {
      lastEmpty = false;
      props?.onHasNotifications?.();
    }
  };

  const refresh = (): void => {
    const shouldBeFocused = isOwnerOfFocus();
    if (shouldBeFocused !== isFocused) {
      isFocused = shouldBeFocused;
      if (!isFocused) {
        detachAll();
      }
    }
    if (isFocused) {
      attachAll();
    }
    checkAndNotify();
  };

  // Subscribe to the global popup set.
  const unsubPopups = subscribePopups(refresh);

  // Subscribe to focus changes. Hyprland's notify::focused-workspace fires
  // on focus-follows-mouse cross; niri's WorkspaceActivated fires on
  // keyboard / workspace-switch focus changes (mouse-cross-only focus
  // updates require additional niri-side wiring, deferred).
  const unsubCompositor = compositor.connect({
    onFocusedWorkspaceChanged: () => {
      refresh();
    },
    onFocusedWindowChanged: () => {
      // In niri, mouse-cross fires WindowFocusChanged but not
      // WorkspaceActivated. Re-resolving on window focus catches that case.
      refresh();
    },
  });

  // Service-driven popup events: a new notification needs to construct a
  // row and register it with popup-state. Dismissals from elsewhere need
  // to be reflected back into popup-state.
  //
  // Only one container should drive these — otherwise every monitor's
  // view would race to build its own row for the same notification.
  // Each container registers a "become driver" callback; the registry
  // picks the first registered as active and promotes the next one when
  // the active driver is destroyed (e.g. monitor hotplug).
  let unsubService: (() => void) | null = null;
  let unsubServiceMain: (() => void) | null = null;

  const becomeDriver = (): void => {
    unsubService = notificationService.subscribeToPopups((notification) => {
      const row = PopupNotificationRow(notification);
      addPopupGlobal({
        notification,
        widget: row.widget,
        progress: row.progress,
        cleanup: row.cleanup,
      });
    });

    unsubServiceMain = notificationService.subscribe(() => {
      // Reflect external dismissals. Use hasLiveNotification so transient
      // and sync-tagged popups (excluded from getNotifications()) aren't
      // wrongly torn down before their timeout completes.
      for (const p of getLivePopups()) {
        if (!notificationService.hasLiveNotification(p.id)) {
          removePopupGlobal(p.id);
        }
      }
    });
  };

  const unregisterDriverCandidate = registerDriverCandidate(becomeDriver);

  // Initial state.
  refresh();

  // Cleanup
  registerCleanup(container, () => {
    unsubPopups();
    unsubCompositor();
    unsubService?.();
    unsubServiceMain?.();
    unregisterDriverCandidate();
    detachAll();
  });

  return container;
}

/* -----------------------------
 * Driver election
 *
 * Exactly one container at a time owns the service subscriptions that
 * mutate popup-state. Containers register a "become driver" callback at
 * construction; the first registered is invoked immediately. On the active
 * driver's cleanup, the next-registered candidate (FIFO) is promoted.
 * This handles monitor hotplug: if the driver's monitor is unplugged, the
 * next monitor's container takes over without missing notifications.
 *
 * A nicer design would put the service subscription inside popup-state
 * itself, but that creates a chicken-and-egg with module load order; the
 * driver-election model keeps popup-state pure data.
 * ----------------------------- */

type DriverCandidate = {
  becomeDriver: () => void;
  // Set when this candidate is the active driver; null otherwise.
  // We don't currently need to dispose driver subscriptions here because
  // the container's own _cleanup() runs the unsubs and then calls
  // unregisterDriverCandidate() which advances to the next candidate.
};

const driverQueue: DriverCandidate[] = [];
let activeDriver: DriverCandidate | null = null;

function registerDriverCandidate(becomeDriver: () => void): () => void {
  const candidate: DriverCandidate = { becomeDriver };
  driverQueue.push(candidate);
  if (activeDriver === null) {
    activeDriver = candidate;
    becomeDriver();
  }
  return () => {
    const idx = driverQueue.indexOf(candidate);
    if (idx !== -1) driverQueue.splice(idx, 1);
    if (activeDriver === candidate) {
      activeDriver = driverQueue[0] ?? null;
      activeDriver?.becomeDriver();
    }
  };
}
