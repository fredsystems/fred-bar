import GLib from "gi://GLib";
import type Gtk from "gi://Gtk?version=4.0";
import {
  type NotificationData,
  notificationService,
} from "services/notifications";

/* -----------------------------
 * Global popup state model
 *
 * Single source of truth for live popup notifications. Per-monitor
 * `PopupNotificationContainer`s become thin views that subscribe here and
 * (un)parent rows depending on whether their monitor is currently focused.
 *
 * Why this exists:
 *   - Synchronous-tag replacement (e.g. volume / brightness OSDs) has to be
 *     a global operation. Previously the dedupe map lived inside each
 *     per-monitor container, so a new OSD on the focused monitor wouldn't
 *     replace a stale OSD still ticking on a previously-focused monitor.
 *   - Reparenting an existing row across monitors avoids the visual
 *     "rebuild flash" of tearing down and re-creating identical widgets.
 *   - One shared 10 Hz timer drives every popup's progress bar, instead of
 *     per-popup 50 ms timers. Self-cancels when the popup set empties.
 * ----------------------------- */

const POPUP_TIMEOUT_MS = 10000;
const PROGRESS_TICK_MS = 100;

export interface LivePopup {
  id: number;
  notification: NotificationData;
  /** Outer row widget. Reparented across monitor views; never destroyed
   *  until the popup expires or is dismissed. */
  widget: Gtk.Widget;
  /** Progress bar inside the row. Driven by the shared timer. */
  progress: Gtk.ProgressBar;
  /** Monotonic time (µs) when the popup first appeared. */
  startTime: number;
  /** `${appName}\x00${syncTag}` if this notification is sync-tagged, else
   *  null. Used by addPopupGlobal() to dedupe replacements. */
  syncKey: string | null;
  /** Per-popup cleanup hook installed by the row builder. */
  cleanup?: () => void;
}

const livePopups = new Map<number, LivePopup>();
const syncTagToId = new Map<string, number>();
const listeners = new Set<() => void>();
let sharedTimerId: number | null = null;

function syncKey(appName: string, tag: string): string {
  return `${appName}\x00${tag}`;
}

function notifyListeners(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch (_e) {
      // listeners must not throw; swallow defensively.
    }
  }
}

function ensureSharedTimer(): void {
  if (sharedTimerId !== null) return;
  sharedTimerId = GLib.timeout_add(
    GLib.PRIORITY_DEFAULT,
    PROGRESS_TICK_MS,
    () => {
      const now = GLib.get_monotonic_time();
      // Iterate over a snapshot — expiry mutates livePopups.
      const snapshot = Array.from(livePopups.values());
      for (const p of snapshot) {
        const elapsed = (now - p.startTime) / 1000; // µs → ms
        const remaining = Math.max(0, POPUP_TIMEOUT_MS - elapsed);
        p.progress.fraction = remaining / POPUP_TIMEOUT_MS;
        if (remaining <= 0) {
          // Treat timeout as a normal removal. The notification service has
          // already excluded transient / sync-tagged popups from history, so
          // we just drop the widget.
          removePopupGlobal(p.id);
        }
      }
      if (livePopups.size === 0) {
        sharedTimerId = null;
        return GLib.SOURCE_REMOVE;
      }
      return GLib.SOURCE_CONTINUE;
    },
  );
}

/**
 * Get a stable, ordered list of live popups. Order matches insertion order
 * (oldest first); callers may reverse if they want newest-on-top.
 */
export function getLivePopups(): LivePopup[] {
  return Array.from(livePopups.values());
}

/** Subscribe to live-popup-set changes. Returns an unsubscribe callback. */
export function subscribePopups(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Register a new popup. The caller has already built the row widget
 * (presentation only — no signal subscriptions or timers) and passes it in.
 * If the notification carries a sync tag, any prior popup with the same
 * `(appName, syncTag)` is removed first and its server-side notification
 * dismissed (mirroring what the user pressing "close" does).
 */
export function addPopupGlobal(args: {
  notification: NotificationData;
  widget: Gtk.Widget;
  progress: Gtk.ProgressBar;
  cleanup?: () => void;
}): void {
  const { notification, widget, progress, cleanup } = args;

  if (livePopups.has(notification.id)) return;

  let key: string | null = null;
  if (notification.syncTag !== null) {
    key = syncKey(notification.appName, notification.syncTag);
    const priorId = syncTagToId.get(key);
    if (priorId !== undefined && priorId !== notification.id) {
      notificationService.dismissDuringPopup(priorId);
      removePopupGlobal(priorId);
    }
    syncTagToId.set(key, notification.id);
  }

  const entry: LivePopup = {
    id: notification.id,
    notification,
    widget,
    progress,
    startTime: GLib.get_monotonic_time(),
    syncKey: key,
    cleanup,
  };
  livePopups.set(notification.id, entry);
  ensureSharedTimer();
  notifyListeners();
}

/**
 * Remove a popup by id. Runs the row's cleanup hook, unparents the widget
 * from whichever view currently holds it, and clears any sync-tag mapping.
 */
export function removePopupGlobal(id: number): void {
  const entry = livePopups.get(id);
  if (!entry) return;

  entry.cleanup?.();

  // Unparent from whichever container currently holds it. Views are
  // responsible for re-querying via subscribePopups and removing/adding
  // children to match, but unparenting here defensively avoids leaking the
  // widget if no view picks up the change in time.
  const parent = entry.widget.get_parent();
  if (parent) {
    try {
      (parent as unknown as { remove?: (w: Gtk.Widget) => void }).remove?.(
        entry.widget,
      );
    } catch (_e) {
      // Some containers don't expose remove(); fall back to unparent.
      entry.widget.unparent();
    }
  }

  livePopups.delete(id);
  if (entry.syncKey !== null && syncTagToId.get(entry.syncKey) === id) {
    syncTagToId.delete(entry.syncKey);
  }
  notifyListeners();
}

/** Whether any live popups exist. Cheap; useful for empty/hasNotifications
 *  bookkeeping in views. */
export function livePopupCount(): number {
  return livePopups.size;
}
