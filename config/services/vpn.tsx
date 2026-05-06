import GLib from "gi://GLib";

import { createLogger } from "helpers/logger";
import { runAsync, spawnDetached } from "helpers/subprocess";

const log = createLogger("VpnService");

/**
 * Centralised VPN status service.
 *
 * AstalNetwork has no VPN abstraction, so we fall back to nmcli polling.
 * Previously two widgets (`network.tsx` and `connectivity-toggles.tsx`)
 * each polled `nmcli` independently every 3 s on the GTK main thread via
 * `spawn_command_line_sync` — six fork+exec per 3 s window plus blocking
 * UI hitches.
 *
 * This service:
 *   - polls once per 3 s for *all* subscribers
 *   - uses `Gio.Subprocess` async (no main-thread block)
 *   - emits change events only when status actually changes
 *   - centralises connect/disconnect command construction
 *
 * Polling cadence reschedules from "now" via SOURCE_REMOVE rather than
 * SOURCE_CONTINUE to avoid GLib's catch-up cascade after system suspend.
 *
 * Long-term replacement: subscribe to `org.freedesktop.NetworkManager`
 * `ActiveConnections` PropertyChanged on D-Bus and drop polling. Out of
 * scope for the current audit pass. See AUDIT C-1.5 / C-1.6 / C-3.1.
 */

export interface VpnStatus {
  active: boolean;
  /** Connection name (or empty string when inactive). */
  name: string;
}

const POLL_MS = 3000;

let current: VpnStatus = { active: false, name: "" };
const listeners = new Set<(status: VpnStatus) => void>();
let pollerId: number | null = null;
let inFlight = false;

function statusEqual(a: VpnStatus, b: VpnStatus): boolean {
  return a.active === b.active && a.name === b.name;
}

function parseActiveConnections(stdout: string): VpnStatus {
  for (const line of stdout.split("\n")) {
    if (!line) continue;
    // `nmcli -t` output is colon-separated; embedded colons in NAME are
    // backslash-escaped (`\:`). Split on the *last* unescaped colon to
    // recover (NAME, TYPE) safely.
    let idx = -1;
    for (let i = line.length - 1; i >= 0; i--) {
      if (line[i] === ":" && line[i - 1] !== "\\") {
        idx = i;
        break;
      }
    }
    if (idx < 0) continue;
    const type = line.slice(idx + 1);
    if (type === "vpn" || type === "wireguard") {
      const name = line.slice(0, idx).replace(/\\:/g, ":") || "VPN";
      return { active: true, name };
    }
  }
  return { active: false, name: "" };
}

async function pollOnce(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const stdout = await runAsync([
      "nmcli",
      "-t",
      "-f",
      "NAME,TYPE",
      "connection",
      "show",
      "--active",
    ]);
    const next: VpnStatus = stdout
      ? parseActiveConnections(stdout)
      : { active: false, name: "" };
    if (!statusEqual(current, next)) {
      current = next;
      for (const cb of listeners) {
        try {
          cb(current);
        } catch (e) {
          log.error("listener error:", e);
        }
      }
    }
  } finally {
    inFlight = false;
  }
}

function schedulePoll(): void {
  pollerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POLL_MS, () => {
    pollerId = null;
    pollOnce().finally(() => {
      // Reschedule from *now* so post-suspend wakeups don't cascade.
      if (listeners.size > 0) schedulePoll();
    });
    return GLib.SOURCE_REMOVE;
  });
}

function ensurePoller(): void {
  if (pollerId !== null) return;
  // Kick an immediate fetch so subscribers don't wait 3 s for the first
  // accurate reading; the regular cadence picks up afterwards.
  pollOnce().finally(() => {
    if (listeners.size > 0) schedulePoll();
  });
}

function stopPoller(): void {
  if (pollerId !== null) {
    GLib.source_remove(pollerId);
    pollerId = null;
  }
}

/**
 * Subscribe to VPN status changes. The callback fires immediately with
 * the most-recent known status (potentially `{active:false, name:""}`
 * before the first poll completes), and again whenever the status
 * changes. Returns an unsubscribe function.
 */
export function subscribeVpn(cb: (status: VpnStatus) => void): () => void {
  listeners.add(cb);
  cb(current);
  ensurePoller();
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) stopPoller();
  };
}

/** Most recent VPN status (cheap synchronous read). */
export function getVpnStatus(): VpnStatus {
  return current;
}

/**
 * Toggle the first available VPN/Wireguard connection. Async fire-and-
 * forget: the next poll cycle (or whichever subscriber notices first)
 * will surface the resulting state change.
 */
export function toggleVpn(): void {
  const action = current.active ? "down" : "up";
  // Use a shell to compose `nmcli ... | head -n1` because we need a
  // single connection name. Quoted to handle names with spaces.
  const sh = `nmcli connection ${action} "$(nmcli -t -f NAME,TYPE connection ${
    current.active ? "show --active" : ""
  } | awk -F: '$2=="vpn" || $2=="wireguard"{print $1; exit}')"`;
  spawnDetached(["sh", "-c", sh]);
}
