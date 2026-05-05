import Notifd from "gi://AstalNotifd";

export interface NotificationData {
  id: number;
  appName: string;
  appIcon: string | null;
  image: string | null; // Custom notification image (takes priority over appIcon)
  summary: string;
  body: string;
  time: number;
  urgency: number;
  /**
   * freedesktop spec `transient` hint. When true the notification must not be
   * added to persistent history (popup-only).
   */
  transient: boolean;
  /**
   * Canonical extension `x-canonical-private-synchronous`. Notifications
   * sharing the same tag (per appName) replace each other and never persist.
   * Used by volume / brightness OSDs.
   */
  syncTag: string | null;
  dismissed?: boolean; // Track if dismissed during popup
}

class NotificationService {
  private notifd: Notifd.Notifd;
  private listeners: Set<() => void> = new Set();
  private popupListeners: Set<(notif: NotificationData) => void> = new Set();
  private dismissedIds: Set<number> = new Set(); // Track dismissed during popup

  constructor() {
    this.notifd = Notifd.get_default();

    // Listen to notification events
    this.notifd.connect("notified", (_notifd, id: number) => {
      this.handleNewNotification(id);
    });

    this.notifd.connect("resolved", (_notifd, id: number) => {
      // If it was dismissed during popup, remove from tracking
      this.dismissedIds.delete(id);
      this.notify();
    });
  }

  /**
   * Read the freedesktop `x-canonical-private-synchronous` hint. Returns the
   * tag string, or null if unset / wrong type. AstalNotifd exposes hints as
   * raw GVariant — the spec doesn't strictly require type `s`, so guard with
   * a type check before extracting the string payload.
   */
  private readSyncTag(n: Notifd.Notification): string | null {
    let hint: ReturnType<Notifd.Notification["get_hint"]> = null;
    try {
      hint = n.get_hint("x-canonical-private-synchronous");
    } catch {
      return null;
    }
    if (!hint) return null;
    try {
      // Variant type "s" — string. Some senders use "(ss)" tuples; ignore.
      if (hint.get_type_string() !== "s") return null;
      const [value] = hint.get_string();
      return value || null;
    } catch {
      return null;
    }
  }

  private buildNotificationData(n: Notifd.Notification): NotificationData {
    // The image property contains custom notification images (image-path hint)
    // The app_icon can also contain a custom icon path (via -i flag in notify-send)
    const customImage = n.image || null;
    const appIconOrPath = n.app_icon || n.desktop_entry || null;

    return {
      id: n.id,
      appName: n.app_name || "Unknown",
      appIcon: appIconOrPath,
      image: customImage,
      summary: n.summary || "",
      body: n.body || "",
      time: n.time,
      urgency: n.urgency,
      transient: n.transient === true,
      syncTag: this.readSyncTag(n),
    };
  }

  private handleNewNotification(id: number): void {
    const n = this.notifd.get_notification(id);
    if (!n) return;

    const notifData = this.buildNotificationData(n);

    // Notifications marked transient or carrying a synchronous tag must never
    // appear in persistent history. Mark them dismissed-from-history up front
    // so getNotifications() and any later subscriber rebuilds filter them out.
    if (notifData.transient || notifData.syncTag !== null) {
      this.dismissedIds.add(notifData.id);
    }

    // Notify popup listeners
    for (const listener of this.popupListeners) {
      listener(notifData);
    }

    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  subscribeToPopups(callback: (notif: NotificationData) => void): () => void {
    this.popupListeners.add(callback);
    return () => {
      this.popupListeners.delete(callback);
    };
  }

  getNotifications(): NotificationData[] {
    // Only return notifications that weren't dismissed during popup and that
    // are eligible for persistent history (transient + synchronous-tagged
    // notifications are popup-only per spec).
    return this.notifd
      .get_notifications()
      .filter((n) => !this.dismissedIds.has(n.id))
      .map((n) => this.buildNotificationData(n))
      .filter((n) => !n.transient && n.syncTag === null);
  }

  /**
   * Returns true if the notification with the given id still exists on the
   * server, regardless of history-eligibility. Popup containers use this to
   * detect external dismissal (e.g. dunstctl close-all) without confusing
   * transient/synchronous popups for "dismissed".
   */
  hasLiveNotification(id: number): boolean {
    return this.notifd.get_notification(id) !== null;
  }

  getNotificationsByApp(): Map<string, NotificationData[]> {
    const notifications = this.getNotifications();
    const grouped = new Map<string, NotificationData[]>();

    for (const notif of notifications) {
      const app = notif.appName;
      if (!grouped.has(app)) {
        grouped.set(app, []);
      }
      grouped.get(app)?.push(notif);
    }

    return grouped;
  }

  getPendingCount(): number {
    return this.getNotifications().length;
  }

  getAppCount(): number {
    return this.getNotificationsByApp().size;
  }

  dismiss(id: number): void {
    const notification = this.notifd.get_notification(id);
    if (notification) {
      notification.dismiss();
    }
  }

  dismissDuringPopup(id: number): void {
    // Mark as dismissed during popup so it doesn't appear in history
    this.dismissedIds.add(id);
    this.dismiss(id);
  }

  dismissApp(appName: string): void {
    const notifications = this.getNotifications().filter(
      (n) => n.appName === appName,
    );
    for (const n of notifications) {
      this.dismiss(n.id);
    }
  }

  dismissAll(): void {
    for (const n of this.notifd.get_notifications()) {
      this.dismiss(n.id);
    }
  }

  invoke(id: number): void {
    const notification = this.notifd.get_notification(id);
    if (notification) {
      notification.invoke("");
    }
  }

  get dnd(): boolean {
    return this.notifd.dont_disturb;
  }

  set dnd(value: boolean) {
    this.notifd.dont_disturb = value;
  }

  toggleDnd(): void {
    this.notifd.dont_disturb = !this.notifd.dont_disturb;
  }
}

export const notificationService = new NotificationService();
