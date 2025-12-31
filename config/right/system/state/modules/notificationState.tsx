import { notificationService } from "services/notifications";
import type { SystemSignal } from "../helpers/normalize";

export function notificationState(): SystemSignal | null {
  const count = notificationService.getPendingCount();
  const dnd = notificationService.dnd;

  if (dnd) {
    return {
      severity: "info",
      category: "notification",
      icon: "󰂛",
      summary: "Do Not Disturb enabled",
    };
  }

  if (count === 0) {
    return null;
  }

  return {
    severity: count > 5 ? "warn" : "info",
    category: "notification",
    icon: "󰂚",
    summary: count === 1 ? "1 notification" : `${count} notifications`,
  };
}
