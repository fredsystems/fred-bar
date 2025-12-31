import Bluetooth from "gi://AstalBluetooth";
import Network from "gi://AstalNetwork";
import GLib from "gi://GLib";
import Gtk from "gi://Gtk?version=4.0";

const bluetooth = Bluetooth.get_default();
const network = Network.get_default();

// VPN detection helper
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

function toggleVpn(currentlyActive: boolean): void {
  if (currentlyActive) {
    // Disconnect active VPN
    try {
      GLib.spawn_command_line_async(
        "nmcli connection down id $(nmcli -t -f NAME,TYPE connection show --active | grep ':vpn$' | cut -d: -f1 | head -n1)",
      );
    } catch (e) {
      console.error("Failed to disconnect VPN:", e);
    }
  } else {
    // Try to connect to first available VPN
    try {
      GLib.spawn_command_line_async(
        "nmcli connection up $(nmcli -t -f NAME,TYPE connection | grep ':vpn$' | cut -d: -f1 | head -n1)",
      );
    } catch (e) {
      console.error("Failed to connect VPN:", e);
    }
  }
}

export function ConnectivityToggles(): Gtk.Box {
  const container = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 8,
    css_classes: ["connectivity-toggles-section"],
  });

  // All connectivity toggles in one row
  const connectivityRow = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 8,
    css_classes: ["connectivity-toggle-row"],
    homogeneous: true,
  });

  const bluetoothBtn = new Gtk.Button({
    css_classes: ["connectivity-toggle-btn"],
    tooltip_text: "Bluetooth",
  });
  const bluetoothBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 4,
    halign: Gtk.Align.CENTER,
  });
  const bluetoothIcon = new Gtk.Label({
    label: "󰂯",
    css_classes: ["connectivity-toggle-icon"],
  });
  const bluetoothLabel = new Gtk.Label({
    label: "Bluetooth",
    css_classes: ["connectivity-toggle-label"],
  });
  bluetoothBox.append(bluetoothIcon);
  bluetoothBox.append(bluetoothLabel);
  bluetoothBtn.set_child(bluetoothBox);

  bluetoothBtn.connect("clicked", () => {
    bluetooth.adapter.powered = !bluetooth.adapter.powered;
  });

  connectivityRow.append(bluetoothBtn);

  // WiFi Toggle
  const wifiBtn = new Gtk.Button({
    css_classes: ["connectivity-toggle-btn"],
    tooltip_text: "WiFi",
  });
  const wifiBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 4,
    halign: Gtk.Align.CENTER,
  });
  const wifiIcon = new Gtk.Label({
    label: "󰖩",
    css_classes: ["connectivity-toggle-icon"],
  });
  const wifiLabel = new Gtk.Label({
    label: "WiFi",
    css_classes: ["connectivity-toggle-label"],
  });
  wifiBox.append(wifiIcon);
  wifiBox.append(wifiLabel);
  wifiBtn.set_child(wifiBox);

  wifiBtn.connect("clicked", () => {
    if (network.wifi) {
      network.wifi.enabled = !network.wifi.enabled;
    }
  });

  connectivityRow.append(wifiBtn);

  // Ethernet (informational - typically can't toggle)
  const ethernetBtn = new Gtk.Button({
    css_classes: ["connectivity-toggle-btn", "connectivity-status-btn"],
    tooltip_text: "Ethernet",
    sensitive: false,
  });
  const ethernetBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 4,
    halign: Gtk.Align.CENTER,
  });
  const ethernetIcon = new Gtk.Label({
    label: "󰈀",
    css_classes: ["connectivity-toggle-icon"],
  });
  const ethernetLabel = new Gtk.Label({
    label: "Ethernet",
    css_classes: ["connectivity-toggle-label"],
  });
  ethernetBox.append(ethernetIcon);
  ethernetBox.append(ethernetLabel);
  ethernetBtn.set_child(ethernetBox);

  connectivityRow.append(ethernetBtn);

  // VPN Toggle
  const vpnBtn = new Gtk.Button({
    css_classes: ["connectivity-toggle-btn"],
    tooltip_text: "VPN",
  });
  const vpnBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 4,
    halign: Gtk.Align.CENTER,
  });
  const vpnIcon = new Gtk.Label({
    label: "󰖂",
    css_classes: ["connectivity-toggle-icon"],
  });
  const vpnLabel = new Gtk.Label({
    label: "VPN",
    css_classes: ["connectivity-toggle-label"],
  });
  vpnBox.append(vpnIcon);
  vpnBox.append(vpnLabel);
  vpnBtn.set_child(vpnBox);

  vpnBtn.connect("clicked", () => {
    const vpnStatus = checkVpnStatus();
    toggleVpn(vpnStatus.active);
  });

  connectivityRow.append(vpnBtn);
  container.append(connectivityRow);

  // Update function
  function updateBluetooth(): void {
    const isPowered = bluetooth.adapter?.powered ?? false;
    const isConnected = bluetooth.get_devices().some((d) => d.connected);

    if (isPowered) {
      bluetoothBtn.add_css_class("active");
      if (isConnected) {
        bluetoothIcon.label = "󰂱"; // Connected
        bluetoothBtn.add_css_class("connected");
      } else {
        bluetoothIcon.label = "󰂯"; // On
        bluetoothBtn.remove_css_class("connected");
      }
    } else {
      bluetoothBtn.remove_css_class("active");
      bluetoothBtn.remove_css_class("connected");
      bluetoothIcon.label = "󰂲"; // Off
    }
  }

  function updateWifi(): void {
    const wifi = network.wifi;
    if (!wifi) {
      wifiBtn.sensitive = false;
      wifiBtn.remove_css_class("active");
      wifiIcon.label = "󰖪"; // No WiFi
      return;
    }

    wifiBtn.sensitive = true;

    if (!wifi.enabled) {
      wifiBtn.remove_css_class("active");
      wifiBtn.remove_css_class("connected");
      wifiIcon.label = "󰖪"; // Disabled
      return;
    }

    wifiBtn.add_css_class("active");

    const activeAp = wifi.active_access_point;
    if (activeAp) {
      wifiBtn.add_css_class("connected");
      const strength = activeAp.strength;
      if (strength > 75) {
        wifiIcon.label = "󰤨"; // Excellent
      } else if (strength > 50) {
        wifiIcon.label = "󰤥"; // Good
      } else if (strength > 25) {
        wifiIcon.label = "󰤢"; // Fair
      } else {
        wifiIcon.label = "󰤟"; // Weak
      }
    } else {
      wifiBtn.remove_css_class("connected");
      wifiIcon.label = "󰤮"; // No connection
    }
  }

  function updateEthernet(): void {
    const wired = network.wired;
    if (!wired) {
      ethernetBtn.remove_css_class("active");
      ethernetIcon.label = "󰈂"; // No ethernet
      return;
    }

    if (wired.state === Network.DeviceState.ACTIVATED) {
      ethernetBtn.add_css_class("active");
      ethernetIcon.label = "󰈁"; // Connected
    } else {
      ethernetBtn.remove_css_class("active");
      ethernetIcon.label = "󰈂"; // Disconnected
    }
  }

  function updateVpn(): void {
    const vpnStatus = checkVpnStatus();

    if (vpnStatus.active) {
      vpnBtn.add_css_class("active");
      vpnIcon.label = "󰖂"; // VPN connected
      vpnBtn.tooltip_text = `VPN: ${vpnStatus.name}`;
    } else {
      vpnBtn.remove_css_class("active");
      vpnIcon.label = "󰖂"; // VPN disconnected
      vpnBtn.tooltip_text = "VPN";
    }

    // VPN button is always sensitive if nmcli is available
    vpnBtn.sensitive = true;
  }

  function updateAll(): void {
    updateBluetooth();
    updateWifi();
    updateEthernet();
    updateVpn();
  }

  // Initial update
  updateAll();

  // Connect to signals
  const btAdapterHandler = bluetooth.adapter?.connect(
    "notify::powered",
    updateBluetooth,
  );
  const btDeviceHandler = bluetooth.connect("device-added", updateBluetooth);
  const btDeviceRemovedHandler = bluetooth.connect(
    "device-removed",
    updateBluetooth,
  );

  const wifiHandler = network.wifi?.connect("notify::enabled", updateWifi);
  const wifiApHandler = network.wifi?.connect(
    "notify::active-access-point",
    updateWifi,
  );

  const wiredHandler = network.wired?.connect("notify::state", updateEthernet);

  // VPN monitoring via polling (since AstalNetwork doesn't expose VPN)
  const vpnPollInterval = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
    updateVpn();
    return true; // Continue polling
  });

  // Cleanup
  (container as Gtk.Widget & { _cleanup?: () => void })._cleanup = () => {
    if (btAdapterHandler && bluetooth.adapter) {
      bluetooth.adapter.disconnect(btAdapterHandler);
    }
    if (btDeviceHandler) {
      bluetooth.disconnect(btDeviceHandler);
    }
    if (btDeviceRemovedHandler) {
      bluetooth.disconnect(btDeviceRemovedHandler);
    }
    if (wifiHandler && network.wifi) {
      network.wifi.disconnect(wifiHandler);
    }
    if (wifiApHandler && network.wifi) {
      network.wifi.disconnect(wifiApHandler);
    }
    if (wiredHandler && network.wired) {
      network.wired.disconnect(wiredHandler);
    }
    if (vpnPollInterval) {
      GLib.source_remove(vpnPollInterval);
    }
  };

  return container;
}
