import Gio from "gi://Gio";
import GLib from "gi://GLib";
import { createPoll } from "ags/time";
import type { Severity, SystemSignal } from "../helpers/normalize";

/* -----------------------------
 * Idle Inhibit Detection - D-Bus Integration
 * -----------------------------
 *
 * This module detects active idle/sleep inhibitors using direct D-Bus
 * communication with systemd-logind. No shell scripts required!
 *
 * Features:
 * - Queries org.freedesktop.login1 for inhibitor locks
 * - Filters for block-mode idle/sleep inhibitors
 * - Checks for user caffeine service
 * - Parses inhibitor data natively (no awk/grep)
 *
 * Icons used (Nerd Fonts):
 * - 󰛊 Coffee cup (all states - color varies by severity)
 *
 * States:
 * - Caffeine: User explicitly enabled via caffeine-inhibit.service
 * - External: Other application blocking idle/sleep
 * - Inactive: No inhibitors active
 */

/* -----------------------------
 * D-Bus Interface for systemd-logind
 * ----------------------------- */

// systemd-logind D-Bus service coordinates
const LOGIND_BUS = "org.freedesktop.login1";
const LOGIND_PATH = "/org/freedesktop/login1";
const LOGIND_INTERFACE = "org.freedesktop.login1.Manager";

/**
 * Inhibitor lock representation
 * Corresponds to systemd-logind inhibitor tuple
 */
interface Inhibitor {
  what: string; // What is inhibited (e.g., "idle:sleep")
  who: string; // Application name
  why: string; // Reason for inhibit
  mode: string; // "block" or "delay"
  uid: number; // User ID
  pid: number; // Process ID
}

/* -----------------------------
 * Helpers
 * ----------------------------- */

/**
 * Converts raw inhibitor name to user-friendly display name
 * @param who - Raw application name from D-Bus
 * @returns Human-readable name
 */
function parseInhibitorName(who: string): string {
  if (who === "sway-audio-idle-inhibit") return "Audio";
  if (who === "caffeine") return "Caffeine";
  return who; // Show other apps as-is
}

/**
 * Builds grammatically correct tooltip text for inhibitor count
 * @param inhibitors - List of active inhibitors
 * @returns Tooltip string (e.g., "Caffeine and Audio are prohibiting sleep")
 */
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

/**
 * Queries systemd-logind for active inhibitor locks via D-Bus
 * This replaces the shell script approach of parsing `systemd-inhibit --list`
 *
 * @returns Array of block-mode idle/sleep inhibitors
 */
function getInhibitors(): Inhibitor[] {
  try {
    // Connect to system D-Bus (where systemd-logind lives)
    const connection = Gio.DBus.system;

    // Call ListInhibitors method synchronously
    const result = connection.call_sync(
      LOGIND_BUS, // Service name
      LOGIND_PATH, // Object path
      LOGIND_INTERFACE, // Interface
      "ListInhibitors", // Method name
      null, // No parameters
      GLib.VariantType.new("(a(ssssuu))"), // Expected return type
      Gio.DBusCallFlags.NONE, // No special flags
      -1, // Default timeout
      null, // No cancellable
    );

    const inhibitors: Inhibitor[] = [];

    // Parse the D-Bus result
    // Format: array of tuples (what, who, why, mode, uid, pid)
    const inhibitorArray = result?.get_child_value(0);
    const n = inhibitorArray?.n_children() ?? 0;

    for (let i = 0; i < n; i++) {
      const item = inhibitorArray?.get_child_value(i);
      if (!item) continue;

      // Extract tuple fields
      const what = item.get_child_value(0)?.get_string()[0] ?? ""; // What's inhibited
      const who = item.get_child_value(1)?.get_string()[0] ?? ""; // App name
      const why = item.get_child_value(2)?.get_string()[0] ?? ""; // Reason
      const mode = item.get_child_value(3)?.get_string()[0] ?? ""; // block/delay
      const uid = item.get_child_value(4)?.get_uint32() ?? 0; // User ID
      const pid = item.get_child_value(5)?.get_uint32() ?? 0; // Process ID

      // Only care about block-mode inhibitors that affect idle/sleep
      // (ignore "delay" mode and shutdown/handle-lid-switch locks)
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

/**
 * Checks if user's caffeine-inhibit systemd service is active
 * This is a custom service for manual idle inhibit control
 *
 * @returns true if caffeine service is running
 */
function isCaffeineActive(): boolean {
  try {
    // Use systemctl to check service state
    // Could also do this via D-Bus, but this is simpler
    const result = GLib.spawn_command_line_sync(
      "systemctl --user --quiet is-active caffeine-inhibit.service",
    );
    return result[3] === 0; // Exit code 0 = service is active
  } catch {
    return false;
  }
}

/**
 * Determines current idle inhibit state and returns system signal
 * Combines D-Bus inhibitor data with caffeine service check
 *
 * @returns SystemSignal with appropriate icon, severity, and tooltip
 */
function getIdleInhibitSignal(): SystemSignal | null {
  const inhibitors = getInhibitors();
  const caffeineActive = isCaffeineActive();
  const tooltip = buildTooltip(inhibitors);

  let icon: string;
  let severity: Severity;
  let cls: string;

  // Priority 1: Caffeine service (user-controlled)
  if (caffeineActive) {
    icon = "󰛊"; // Coffee cup
    cls = "caffeine";
    severity = "warn"; // Yellow/warning state
  }
  // Priority 2: External inhibitors (apps blocking idle)
  else if (inhibitors.length > 0) {
    icon = "󰛊"; // Coffee cup
    cls = "external";
    severity = "warn"; // Yellow/warning state
  }
  // No inhibitors active
  else {
    icon = "󰛊"; // Coffee cup
    cls = "inactive";
    severity = "idle"; // Muted/gray state
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

/**
 * Idle inhibit state - polls every 2 seconds
 *
 * Why polling instead of signals?
 * - D-Bus signals for inhibitor changes exist but are complex to monitor
 * - Polling is simple, consistent with other state modules
 * - 2-second interval is fine for this use case
 */
export const idleInhibitState = createPoll<SystemSignal | null>(
  null,
  2000, // Poll every 2 seconds
  getIdleInhibitSignal,
);

// Start polling immediately
idleInhibitState.subscribe(() => {});
