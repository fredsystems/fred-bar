import Battery from "gi://AstalBattery";
import Gtk from "gi://Gtk?version=4.0";

import { attachTooltip } from "helpers/tooltip";

/* -----------------------------
 * Helpers
 * ----------------------------- */

function formatTime(seconds: number): string {
  if (seconds <= 0) return "—";

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);

  return `${h}h ${m}m`;
}

function isCharged(b: Battery.Device, p: number | null): boolean {
  // Since state and charging are unreliable, use energy_rate
  // When plugged in at 100%, energy_rate should be 0 or very small positive
  // When unplugged, energy_rate should be negative (discharging)
  return p !== null && p >= 100 && b.energy_rate >= 0;
}

function percent(b: Battery.Device): number | null {
  if (b.energy_full > 0 && b.energy >= 0) {
    return Math.round((b.energy / b.energy_full) * 100);
  }
  return null;
}

function iconFor(b: Battery.Device, p: number | null): string {
  if (!b.is_present) return "";

  // https://www.nerdfonts.com/cheat-sheet
  // Fully charged
  if (isCharged(b, p)) {
    return "󰂄"; // Charging full icon
  }

  // State 1 = Charging
  if ((b as any).state === 1) {
    if (p === null) return "󰂄";
    if (p <= 10) return "󰢜";
    if (p <= 20) return "󰂆";
    if (p <= 30) return "󰂇";
    if (p <= 40) return "󰂈";
    if (p <= 50) return "󰢝";
    if (p <= 60) return "󰂉";
    if (p <= 70) return "󰢞";
    if (p <= 80) return "󰂊";
    if (p <= 90) return "󰂋";
    return "󰂅";
  }

  if (p === null) return "󰁹";
  if (p <= 5) return "󰂃";
  if (p <= 10) return "󰁺";
  if (p <= 20) return "󰁻";
  if (p <= 30) return "󰁼";
  if (p <= 40) return "󰁽";
  if (p <= 50) return "󰁾";
  if (p <= 60) return "󰁿";
  if (p <= 70) return "󰂀";
  if (p <= 80) return "󰂁";
  if (p <= 90) return "󰂂";
  return "󰁹";
}

function batteryClass(b: Battery.Device, p: number | null): string {
  // State 1 = Charging, State 4 = Fully charged
  if (isCharged(b, p) || (b as any).state === 1 || (p !== null && p >= 90))
    return "battery-good";
  if (p !== null && p >= 50) return "battery-warn";
  if (p !== null && p >= 20) return "battery-low";
  return "battery-critical";
}

/* -----------------------------
 * Battery pill widget
 * ----------------------------- */

export function BatteryPill(): Gtk.Box {
  const battery = Battery.get_default();

  let currentClass = "battery-good";

  const box = new Gtk.Box({
    spacing: 0,
    css_classes: ["battery-pill", "pill"],
  });

  const icon = new Gtk.Label({ label: "" });
  const label = new Gtk.Label({ label: "" });

  box.append(icon);
  box.append(label);

  function update(): void {
    if (!battery.is_present) {
      box.visible = false;
      return;
    }

    box.visible = true;

    const p = percent(battery);

    icon.label = iconFor(battery, p);

    // Show "Charged" when fully charged, otherwise show percentage
    if (isCharged(battery, p)) {
      label.label = "Charged";
    } else {
      label.label = p !== null ? `${p}%` : "";
    }

    // Clear previous state classes
    box.remove_css_class("battery-good");
    box.remove_css_class("battery-warn");
    box.remove_css_class("battery-low");
    box.remove_css_class("battery-critical");

    currentClass = batteryClass(battery, p);
    box.add_css_class(currentClass);
  }

  update();
  const chargingHandler = battery.connect("notify::charging", update);
  const energyHandler = battery.connect("notify::energy", update);
  const stateHandler = battery.connect("notify::state", update);

  // Poll every 2 seconds to catch state changes that don't fire events
  const pollInterval = setInterval(update, 2000);

  /* -----------------------------
   * Tooltip (shares pill class)
   * ----------------------------- */

  attachTooltip(box, {
    text: () => {
      if (!battery.is_present) return "";

      const lines: string[] = [];

      const p = percent(battery);
      if (p !== null) lines.push(`Charge: ${p}%`);

      if (isCharged(battery, p)) {
        lines.push("Fully Charged");
      } else if ((battery as any).state === 1) {
        lines.push("Charging");
        lines.push(`Time to full: ${formatTime(battery.time_to_full)}`);
      } else {
        lines.push("Discharging");
        lines.push(`Time remaining: ${formatTime(battery.time_to_empty)}`);
      }

      if (battery.energy_rate > 0) {
        lines.push(`Draw: ${battery.energy_rate.toFixed(1)} W`);
      }

      return lines.join("\n");
    },

    // 🔑 Tooltip inherits the SAME semantic state
    classes: () => [currentClass],
  });

  /* -----------------------------
   * Cleanup
   * ----------------------------- */

  (box as Gtk.Widget & { _cleanup?: () => void })._cleanup = () => {
    battery.disconnect(chargingHandler);
    battery.disconnect(energyHandler);
    battery.disconnect(stateHandler);
    clearInterval(pollInterval);
  };

  return box;
}
