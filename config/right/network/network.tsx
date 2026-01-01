import Network from "gi://AstalNetwork";
import GLib from "gi://GLib";
import Gtk from "gi://Gtk?version=4.0";

import { attachTooltip } from "helpers/tooltip";

/* -----------------------------
 * Network Widget - AstalNetwork Integration
 * -----------------------------
 *
 * This widget monitors network connectivity using AstalNetwork (NetworkManager).
 * It reactively updates when network state changes - no polling required!
 *
 * Features:
 * - WiFi: Shows SSID with signal strength icon
 * - Ethernet: Shows "Ethernet" connection
 * - Disconnected: Shows error state
 * - Tooltip: Displays connection details (signal, frequency, BSSID, speed)
 *
 * Icons used (Nerd Fonts):
 * - 󰤨 󰤥 󰤢 󰤟 󰤯 WiFi signal strength (excellent to minimal)
 * - 󰈀 Ethernet
 * - 󰖂 VPN
 * - 󰤮 Disconnected
 */

/* -----------------------------
 * Helpers
 * ----------------------------- */

/**
 * Returns WiFi icon based on signal strength percentage
 * @param strength - Signal strength (0-100)
 * @returns Nerd Font icon representing signal quality
 */
function wifiIcon(strength: number): string {
  // Icons: https://www.nerdfonts.com/cheat-sheet
  if (strength >= 80) return "󰤨"; // Excellent
  if (strength >= 60) return "󰤥"; // Good
  if (strength >= 40) return "󰤢"; // Fair
  if (strength >= 20) return "󰤟"; // Poor
  return "󰤯"; // Minimal
}

function ethernetIcon(): string {
  return "󰈀";
}

function disconnectedIcon(): string {
  return "󰤮";
}

function vpnIcon(): string {
  return "󰖂";
}

/**
 * Checks if a VPN connection is active using nmcli
 * @returns Object with VPN status and connection name
 */
function checkVpnStatus(): { active: boolean; name: string } {
  try {
    const [success, stdout] = GLib.spawn_command_line_sync(
      "nmcli -t -f NAME,TYPE connection show --active",
    );

    if (!success || !stdout) {
      return { active: false, name: "" };
    }

    const decoder = new TextDecoder();
    const output = decoder.decode(stdout);
    const lines = output.split("\n");

    for (const line of lines) {
      const [name, type] = line.split(":");
      if (type === "vpn") {
        return { active: true, name: name || "VPN" };
      }
    }

    return { active: false, name: "" };
  } catch (_e) {
    return { active: false, name: "" };
  }
}

/**
 * Determines current network state and returns display info
 * @param network - AstalNetwork.Network instance
 * @returns Object with icon, label, and connection status
 */
function getNetworkInfo(
  network: Network.Network,
  vpnStatus: { active: boolean; name: string },
): {
  icon: string;
  connected: boolean;
  vpnActive: boolean;
} {
  const wifi = network.wifi;
  const wired = network.wired;

  // Priority 1: VPN connection (show VPN regardless of underlying connection)
  if (vpnStatus.active) {
    return {
      icon: vpnIcon(),
      connected: true,
      vpnActive: true,
    };
  }

  // Priority 2: WiFi connection
  if (wifi && wifi.internet === Network.Internet.CONNECTED) {
    const _ssid = wifi.ssid || "Unknown";
    const strength = wifi.strength;
    return {
      icon: wifiIcon(strength),
      connected: true,
      vpnActive: false,
    };
  }

  // Priority 3: Ethernet connection
  if (wired && wired.internet === Network.Internet.CONNECTED) {
    return {
      icon: ethernetIcon(),
      connected: true,
      vpnActive: false,
    };
  }

  // No active connection
  return {
    icon: disconnectedIcon(),
    connected: false,
    vpnActive: false,
  };
}

function networkClass(connected: boolean): string {
  return connected ? "network-connected" : "network-error";
}

/* -----------------------------
 * Network pill widget
 * ----------------------------- */

/**
 * Network pill widget - shows current network connection status
 *
 * Reactive updates:
 * - Listens to AstalNetwork GObject signals
 * - Updates immediately when network state changes
 * - No polling required!
 */
export function NetworkPill(): Gtk.Box {
  const network = Network.get_default();

  // Track current CSS class for tooltip theming
  let currentClass = "network-connected";

  // Track VPN status
  let vpnStatus = checkVpnStatus();

  // Create container box with pill styling
  const box = new Gtk.Box({
    spacing: 4,
    css_classes: ["network-pill", "pill"],
  });

  const icon = new Gtk.Label({ label: "" });

  box.append(icon);

  /**
   * Updates widget display based on current network state
   */
  function update(): void {
    // Check VPN status
    vpnStatus = checkVpnStatus();

    const info = getNetworkInfo(network, vpnStatus);

    icon.label = info.icon;

    // Clear previous state classes
    box.remove_css_class("network-connected");
    box.remove_css_class("network-error");

    // Apply new state class (affects border/text color)
    currentClass = networkClass(info.connected);
    box.add_css_class(currentClass);
  }

  // Initial render
  update();

  // Subscribe to network state changes (GObject signals)
  // These fire automatically when network properties change
  const wifiHandler = network.wifi?.connect("notify", update);
  const wiredHandler = network.wired?.connect("notify", update);

  // Poll VPN status every 3 seconds since AstalNetwork doesn't expose VPN
  const vpnPollInterval = setInterval(() => {
    const newVpnStatus = checkVpnStatus();
    if (
      newVpnStatus.active !== vpnStatus.active ||
      newVpnStatus.name !== vpnStatus.name
    ) {
      update();
    }
  }, 3000);

  /* -----------------------------
   * Tooltip
   * ----------------------------- */

  /* -----------------------------
   * Tooltip - shows connection details
   * ----------------------------- */

  attachTooltip(box, {
    text: () => {
      const lines: string[] = [];
      const wifi = network.wifi;
      const wired = network.wired;

      // VPN details
      if (vpnStatus.active) {
        lines.push(`VPN: ${vpnStatus.name}`);
        // Show underlying connection
        if (wifi && wifi.internet === Network.Internet.CONNECTED) {
          lines.push(`Via WiFi: ${wifi.ssid || "Unknown"}`);
        } else if (wired && wired.internet === Network.Internet.CONNECTED) {
          lines.push(`Via: Ethernet`);
        }
      }
      // WiFi details: SSID, signal strength, frequency, BSSID
      else if (wifi && wifi.internet === Network.Internet.CONNECTED) {
        lines.push(`SSID: ${wifi.ssid || "Unknown"}`);
        lines.push(`Signal: ${wifi.strength}%`);
        if (wifi.frequency > 0) {
          lines.push(`Frequency: ${(wifi.frequency / 1000).toFixed(2)} GHz`);
        }
        const activeAP = wifi.access_points?.[0];
        if (activeAP?.bssid) {
          lines.push(`BSSID: ${activeAP.bssid}`);
        }
      }
      // Ethernet details: connection type and speed
      else if (wired && wired.internet === Network.Internet.CONNECTED) {
        lines.push("Connection: Ethernet");
        if (wired.speed > 0) {
          lines.push(`Speed: ${wired.speed} Mb/s`);
        }
      }
      // Disconnected state
      else {
        lines.push("No active connection");
      }

      return lines.join("\n");
    },

    // Tooltip inherits the pill's state class for consistent theming
    classes: () => [currentClass],
  });

  /* -----------------------------
   * Cleanup - disconnect signal handlers
   * ----------------------------- */

  (box as Gtk.Widget & { _cleanup?: () => void })._cleanup = () => {
    // Disconnect GObject signal handlers to prevent memory leaks
    if (wifiHandler && network.wifi) {
      network.wifi.disconnect(wifiHandler);
    }
    if (wiredHandler && network.wired) {
      network.wired.disconnect(wiredHandler);
    }
    clearInterval(vpnPollInterval);
  };

  return box;
}
