import Gio from "gi://Gio";
import GLib from "gi://GLib";
import { createPoll } from "ags/time";
import type { Severity, SystemSignal } from "../helpers/normalize";

/* -----------------------------
 * D-Bus Interface for systemd-logind
 * ----------------------------- */

const LOGIND_BUS = "org.freedesktop.login1";
const LOGIND_PATH = "/org/freedesktop/login1";
const LOGIND_INTERFACE = "org.freedesktop.login1.Manager";

interface Inhibitor {
  what: string;
  who: string;
  why: string;
  mode: string;
  uid: number;
  pid: number;
}

/* -----------------------------
 * Helpers
 * ----------------------------- */

function parseInhibitorName(who: string): string {
  if (who === "sway-audio-idle-inhibit") return "Audio";
  if (who === "caffeine") return "Caffeine";
  return who;
}

function buildTooltip(inhibitors: Inhibitor[]): string {
  const count = inhibitors.length;

  if (count === 0) {
    return "No idle inhibitors active";
  } else if (count === 1) {
    return `${parseInhibitorName(inhibitors[0].who)} is prohibiting sleep`;
  } else if (count === 2) {
    return `${parseInhibitorName(inhibitors[0].who)} and ${parseInhibitorName(inhibitors[1].who)} are prohibiting sleep`;
  } else {
    const names = inhibitors.map((i) => parseInhibitorName(i.who));
    const last = names.pop();
    return `${names.join(", ")}, and ${last} are prohibiting sleep`;
  }
}

function getInhibitors(): Inhibitor[] {
  try {
    const connection = Gio.DBus.system;

    const result = connection.call_sync(
      LOGIND_BUS,
      LOGIND_PATH,
      LOGIND_INTERFACE,
      "ListInhibitors",
      null,
      GLib.VariantType.new("(a(ssssuu))"),
      Gio.DBusCallFlags.NONE,
      -1,
      null,
    );

    const inhibitors: Inhibitor[] = [];

    // Parse the result: array of (what, who, why, mode, uid, pid)
    const inhibitorArray = result?.get_child_value(0);
    const n = inhibitorArray?.n_children() ?? 0;

    for (let i = 0; i < n; i++) {
      const item = inhibitorArray?.get_child_value(i);
      if (!item) continue;

      const what = item.get_child_value(0)?.get_string()[0] ?? "";
      const who = item.get_child_value(1)?.get_string()[0] ?? "";
      const why = item.get_child_value(2)?.get_string()[0] ?? "";
      const mode = item.get_child_value(3)?.get_string()[0] ?? "";
      const uid = item.get_child_value(4)?.get_uint32() ?? 0;
      const pid = item.get_child_value(5)?.get_uint32() ?? 0;

      // Filter for block mode and idle/sleep inhibitors
      if (
        mode === "block" &&
        (what.includes("idle") || what.includes("sleep"))
      ) {
        inhibitors.push({ what, who, why, mode, uid, pid });
      }
    }

    return inhibitors;
  } catch (error) {
    console.error("Failed to query systemd-logind inhibitors:", error);
    return [];
  }
}

function isCaffeineActive(): boolean {
  try {
    const result = GLib.spawn_command_line_sync(
      "systemctl --user --quiet is-active caffeine-inhibit.service",
    );
    return result[3] === 0; // exit code 0 means active
  } catch {
    return false;
  }
}

function getIdleInhibitSignal(): SystemSignal | null {
  const inhibitors = getInhibitors();
  const caffeineActive = isCaffeineActive();
  const tooltip = buildTooltip(inhibitors);

  let icon: string;
  let severity: Severity;
  let cls: string;

  if (caffeineActive) {
    icon = "󰛊";
    cls = "caffeine";
    severity = "warn";
  } else if (inhibitors.length > 0) {
    icon = "󰛊";
    cls = "external";
    severity = "warn";
  } else {
    icon = "󰛊";
    cls = "inactive";
    severity = "idle";
  }

  return {
    severity,
    category: "idle-inhibit",
    icon,
    summary: tooltip,
    raw: {
      class: cls,
      inhibitors: inhibitors.length,
      caffeine: caffeineActive,
    },
    contextual: true,
  };
}

/* -----------------------------
 * Idle Inhibit State
 * ----------------------------- */

export const idleInhibitState = createPoll<SystemSignal | null>(
  null,
  2000,
  getIdleInhibitSignal,
);

// Start polling immediately
idleInhibitState.subscribe(() => {});
