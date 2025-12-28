import Network from "gi://AstalNetwork";
import { createPoll } from "ags/time";
import type { Severity, SystemSignal } from "../helpers/normalize";

const ICONS = {
  vpn: "󰖂", // pick your preferred VPN glyph
  network: "󰖩",
  ethernet: "󰈀",
  offline: "󰖪",
};

function getNetworkSignal(): SystemSignal | null {
  const network = Network.get_default();
  const wifi = network.wifi;
  const wired = network.wired;

  let severity: Severity = "idle";
  let icon = ICONS.network;
  let summary = "Network connected";
  let connectivity = "full";

  // Determine primary connection and connectivity
  const wifiConnected = wifi && wifi.internet === Network.Internet.CONNECTED;
  const wiredConnected = wired && wired.internet === Network.Internet.CONNECTED;
  const wifiConnecting = wifi && wifi.internet === Network.Internet.CONNECTING;
  const wiredConnecting =
    wired && wired.internet === Network.Internet.CONNECTING;

  if (!wifiConnected && !wiredConnected) {
    if (wifiConnecting || wiredConnecting) {
      severity = "info";
      summary = "Connecting to network...";
      connectivity = "connecting";
    } else {
      severity = "error";
      icon = ICONS.offline;
      summary = "No network connection";
      connectivity = "none";
    }
  } else {
    // Connected state
    if (wiredConnected) {
      icon = ICONS.ethernet;
      summary = "Ethernet connected";
    } else if (wifiConnected) {
      const ssid = wifi.ssid || "Unknown";
      summary = `Connected to ${ssid}`;

      // Adjust severity based on signal strength for WiFi
      if (wifi.strength < 30) {
        severity = "warn";
        summary += " (weak signal)";
      }
    }
  }

  // VPN detection is not directly supported by AstalNetwork
  // If VPN detection is needed, we would need to use nmcli or check
  // for specific VPN-related network devices
  const vpnActive = false;

  return {
    severity,
    category: "network",
    icon,
    summary,
    raw: {
      connectivity,
      vpnActive,
      wifiStrength: wifi?.strength,
      wiredSpeed: wired?.speed,
    },
    contextual: true,
  };
}

export const networkState = createPoll<SystemSignal | null>(
  null,
  3000,
  getNetworkSignal,
);

// Start polling immediately
networkState.subscribe(() => {});
