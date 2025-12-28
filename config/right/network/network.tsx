import Network from "gi://AstalNetwork";
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

/**
 * Determines current network state and returns display info
 * @param network - AstalNetwork.Network instance
 * @returns Object with icon, label, and connection status
 */
function getNetworkInfo(network: Network.Network): {
  icon: string;
  label: string;
  connected: boolean;
} {
  const wifi = network.wifi;
  const wired = network.wired;

  // Priority 1: WiFi connection
  if (wifi && wifi.internet === Network.Internet.CONNECTED) {
    const ssid = wifi.ssid || "Unknown";
    const strength = wifi.strength;
    return {
      icon: wifiIcon(strength),
      label: ssid,
      connected: true,
    };
  }

  // Priority 2: Ethernet connection
  if (wired && wired.internet === Network.Internet.CONNECTED) {
    return {
      icon: ethernetIcon(),
      label: "Ethernet",
      connected: true,
    };
  }

  // No active connection
  return {
    icon: disconnectedIcon(),
    label: "No Connection",
    connected: false,
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

  // Create container box with pill styling
  const box = new Gtk.Box({
    spacing: 4,
    css_classes: ["network-pill", "pill"],
  });

  const icon = new Gtk.Label({ label: "" });
  const label = new Gtk.Label({ label: "" });

  box.append(icon);
  box.append(label);

  /**
   * Updates widget display based on current network state
   */
  function update(): void {
    const info = getNetworkInfo(network);

    icon.label = info.icon;
    label.label = info.label;

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

      // WiFi details: SSID, signal strength, frequency, BSSID
      if (wifi && wifi.internet === Network.Internet.CONNECTED) {
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
  };

  return box;
}
