import Bluetooth from "gi://AstalBluetooth";
import Network from "gi://AstalNetwork";
import Gtk from "gi://Gtk?version=4.0";

import { subscribeVpn, toggleVpn, type VpnStatus } from "services/vpn";

const bluetooth = Bluetooth.get_default();
const network = Network.get_default();

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
    toggleVpn();
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

  // Track latest VPN status fed by the centralised service.
  let vpnStatus: VpnStatus = { active: false, name: "" };

  function updateVpn(): void {
    if (vpnStatus.active) {
      vpnBtn.add_css_class("active");
      vpnIcon.label = "󰖂"; // VPN connected
    } else {
      vpnBtn.remove_css_class("active");
      vpnIcon.label = "󰖂"; // VPN disconnected
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

  // VPN status fed by the shared service (single 3 s nmcli poll for all
  // subscribers; previously connectivity-toggles + network-pill ran two
  // independent polls). See AUDIT C-3.1.
  const unsubscribeVpn = subscribeVpn((status) => {
    vpnStatus = status;
    updateVpn();
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
    unsubscribeVpn();
  };

  return container;
}
