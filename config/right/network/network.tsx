import Network from "gi://AstalNetwork";
import Gtk from "gi://Gtk?version=4.0";

import { attachTooltip } from "helpers/tooltip";

/* -----------------------------
 * Helpers
 * ----------------------------- */

function wifiIcon(strength: number): string {
  // https://www.nerdfonts.com/cheat-sheet
  if (strength >= 80) return "󰤨";
  if (strength >= 60) return "󰤥";
  if (strength >= 40) return "󰤢";
  if (strength >= 20) return "󰤟";
  return "󰤯";
}

function ethernetIcon(): string {
  return "󰈀";
}

function disconnectedIcon(): string {
  return "󰤮";
}

function getNetworkInfo(network: Network.Network): {
  icon: string;
  label: string;
  connected: boolean;
} {
  const wifi = network.wifi;
  const wired = network.wired;

  // Check WiFi first
  if (wifi && wifi.internet === Network.Internet.CONNECTED) {
    const ssid = wifi.ssid || "Unknown";
    const strength = wifi.strength;
    return {
      icon: wifiIcon(strength),
      label: ssid,
      connected: true,
    };
  }

  // Check Ethernet
  if (wired && wired.internet === Network.Internet.CONNECTED) {
    return {
      icon: ethernetIcon(),
      label: "Ethernet",
      connected: true,
    };
  }

  // No connection
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

export function NetworkPill(): Gtk.Box {
  const network = Network.get_default();

  let currentClass = "network-connected";

  const box = new Gtk.Box({
    spacing: 4,
    css_classes: ["network-pill", "pill"],
  });

  const icon = new Gtk.Label({ label: "" });
  const label = new Gtk.Label({ label: "" });

  box.append(icon);
  box.append(label);

  function update(): void {
    const info = getNetworkInfo(network);

    icon.label = info.icon;
    label.label = info.label;

    // Clear previous state classes
    box.remove_css_class("network-connected");
    box.remove_css_class("network-error");

    currentClass = networkClass(info.connected);
    box.add_css_class(currentClass);
  }

  update();
  const wifiHandler = network.wifi?.connect("notify", update);
  const wiredHandler = network.wired?.connect("notify", update);

  /* -----------------------------
   * Tooltip
   * ----------------------------- */

  attachTooltip(box, {
    text: () => {
      const lines: string[] = [];
      const wifi = network.wifi;
      const wired = network.wired;

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
      } else if (wired && wired.internet === Network.Internet.CONNECTED) {
        lines.push("Connection: Ethernet");
        if (wired.speed > 0) {
          lines.push(`Speed: ${wired.speed} Mb/s`);
        }
      } else {
        lines.push("No active connection");
      }

      return lines.join("\n");
    },

    // Tooltip inherits the SAME semantic state
    classes: () => [currentClass],
  });

  /* -----------------------------
   * Cleanup
   * ----------------------------- */

  (box as Gtk.Widget & { _cleanup?: () => void })._cleanup = () => {
    if (wifiHandler && network.wifi) {
      network.wifi.disconnect(wifiHandler);
    }
    if (wiredHandler && network.wired) {
      network.wired.disconnect(wiredHandler);
    }
  };

  return box;
}
