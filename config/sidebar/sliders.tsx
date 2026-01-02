import Wp from "gi://AstalWp";
import GLib from "gi://GLib";
import Gtk from "gi://Gtk?version=4.0";

const audio = Wp.get_default();

// Brightness control using /sys/class/backlight and /sys/class/leds
interface BrightnessDevice {
  name: string;
  displayName: string;
  path: string;
  max: number;
  current: number;
  type: "backlight" | "keyboard" | "ddcci";
}

function getDeviceDisplayName(
  name: string,
  type: "backlight" | "keyboard",
): string {
  // Handle common keyboard backlight patterns
  if (type === "keyboard") {
    if (name.includes("kbd_backlight")) return "Keyboard Backlight";
    if (name.includes("::kbd_backlight")) {
      const vendor = name.split("::")[0];
      return `${vendor.charAt(0).toUpperCase() + vendor.slice(1)} Keyboard`;
    }
    return "Keyboard";
  }

  // Handle common backlight device names
  if (name.includes("intel_backlight")) return "Display";
  if (name.includes("amdgpu_bl")) return "Display";
  if (name.includes("radeon_bl")) return "Display";
  if (name.includes("nvidia_")) return "Display";
  if (name.includes("acpi_video")) return "Display (ACPI)";
  if (name.includes("gmux_backlight")) return "Display";
  if (name.includes("backlight")) return "Display";

  // Fallback: capitalize the name
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Cache for DDC monitor info to avoid slow detection on every call
let ddcMonitorsCache: Array<{
  bus: string;
  name: string;
  max: number;
}> | null = null;

function getDDCMonitors(): BrightnessDevice[] {
  // Return cached results or empty - don't block on detection
  if (ddcMonitorsCache !== null) {
    const devices: BrightnessDevice[] = [];
    for (const monitor of ddcMonitorsCache) {
      devices.push({
        name: `ddcci-${monitor.bus}`,
        displayName: monitor.name,
        path: monitor.bus,
        max: monitor.max,
        current: 50, // Default to 50, will be updated by async call in widget
        type: "ddcci",
      });
    }
    return devices;
  }

  // First time - detect monitors (blocking, but only happens once per session)
  const monitors: Array<{ bus: string; name: string; max: number }> = [];

  try {
    const [success, stdout] = GLib.spawn_command_line_sync(
      "ddcutil detect --sleep-multiplier 0.1",
    );

    if (success && stdout) {
      const output = new TextDecoder().decode(stdout);
      const lines = output.split("\n");

      let currentDisplay: { displayNum: string; name: string } | null = null;

      for (const line of lines) {
        const displayMatch = line.match(/Display\s+(\d+)/);
        if (displayMatch) {
          currentDisplay = { displayNum: displayMatch[1], name: "" };
          continue;
        }

        const nameMatch = line.match(/Monitor:\s+(.+)/);
        if (nameMatch && currentDisplay) {
          currentDisplay.name = nameMatch[1].trim();
        }

        const busMatch = line.match(/I2C bus:\s+\/dev\/i2c-(\d+)/);
        if (busMatch && currentDisplay) {
          monitors.push({
            bus: busMatch[1],
            name: currentDisplay.name || `Monitor ${currentDisplay.displayNum}`,
            max: 100,
          });
          currentDisplay = null;
        }
      }
    }
  } catch (_e) {
    // ddcutil not available or failed
  }

  ddcMonitorsCache = monitors;
  const devices: BrightnessDevice[] = [];

  for (const monitor of monitors) {
    // Start with cached max, brightness will be updated async
    devices.push({
      name: `ddcci-${monitor.bus}`,
      displayName: monitor.name,
      path: monitor.bus,
      max: monitor.max,
      current: 50, // Default to 50, will be updated by async call in widget
      type: "ddcci",
    });
  }

  return devices;
}

function getBrightnessDevices(): BrightnessDevice[] {
  const devices: BrightnessDevice[] = [];

  // Check /sys/class/backlight for display backlight
  const backlightPath = "/sys/class/backlight";
  try {
    const dir = GLib.Dir.open(backlightPath, 0);
    let name = dir.read_name();

    while (name !== null) {
      const devicePath = `${backlightPath}/${name}`;
      const maxBrightnessFile = `${devicePath}/max_brightness`;
      const brightnessFile = `${devicePath}/brightness`;

      try {
        const [maxSuccess, maxContent] =
          GLib.file_get_contents(maxBrightnessFile);
        const [curSuccess, curContent] = GLib.file_get_contents(brightnessFile);

        if (maxSuccess && curSuccess) {
          const maxBrightness = parseInt(
            new TextDecoder().decode(maxContent).trim(),
            10,
          );
          const currentBrightness = parseInt(
            new TextDecoder().decode(curContent).trim(),
            10,
          );

          if (
            !Number.isNaN(maxBrightness) &&
            !Number.isNaN(currentBrightness)
          ) {
            devices.push({
              name,
              displayName: getDeviceDisplayName(name, "backlight"),
              path: devicePath,
              max: maxBrightness,
              current: currentBrightness,
              type: "backlight",
            });
          }
        }
      } catch (_e) {}

      name = dir.read_name();
    }
  } catch (_e) {
    // Backlight directory doesn't exist or can't be read
  }

  // Check /sys/class/leds for keyboard backlight
  const ledsPath = "/sys/class/leds";
  try {
    const dir = GLib.Dir.open(ledsPath, 0);
    let name = dir.read_name();

    while (name !== null) {
      // Only include keyboard backlight LEDs
      if (name.includes("kbd_backlight") || name.includes("::kbd_backlight")) {
        const devicePath = `${ledsPath}/${name}`;
        const maxBrightnessFile = `${devicePath}/max_brightness`;
        const brightnessFile = `${devicePath}/brightness`;

        try {
          const [maxSuccess, maxContent] =
            GLib.file_get_contents(maxBrightnessFile);
          const [curSuccess, curContent] =
            GLib.file_get_contents(brightnessFile);

          if (maxSuccess && curSuccess) {
            const maxBrightness = parseInt(
              new TextDecoder().decode(maxContent).trim(),
              10,
            );
            const currentBrightness = parseInt(
              new TextDecoder().decode(curContent).trim(),
              10,
            );

            if (
              !Number.isNaN(maxBrightness) &&
              !Number.isNaN(currentBrightness)
            ) {
              devices.push({
                name,
                displayName: getDeviceDisplayName(name, "keyboard"),
                path: devicePath,
                max: maxBrightness,
                current: currentBrightness,
                type: "keyboard",
              });
            }
          }
        } catch (_e) {}
      }

      name = dir.read_name();
    }
  } catch (_e) {
    // LEDs directory doesn't exist or can't be read
  }

  // Check for DDC/CI external monitors
  const ddcMonitors = getDDCMonitors();
  devices.push(...ddcMonitors);

  return devices;
}

function setBrightness(
  devicePath: string,
  value: number,
  type: "backlight" | "keyboard" | "ddcci",
): void {
  if (type === "ddcci") {
    // DDC/CI monitor - use ddcutil with faster settings
    try {
      const busNum = devicePath; // For DDC devices, path is the bus number
      const percentage = Math.round(value);

      GLib.spawn_command_line_async(
        `ddcutil setvcp 10 ${percentage} --bus ${busNum} --sleep-multiplier 0.1 --noverify`,
      );
    } catch (e) {
      console.error("Failed to set DDC brightness:", e);
    }
    return;
  }

  // Backlight or keyboard brightness
  try {
    // Use brightnessctl if available (handles permissions better)
    const deviceName = devicePath.split("/").pop();
    GLib.spawn_command_line_async(
      `brightnessctl -d ${deviceName} set ${Math.round(value)}`,
    );
  } catch (_e) {
    // Fallback to direct write (requires permissions)
    try {
      const brightnessFile = `${devicePath}/brightness`;
      GLib.file_set_contents(brightnessFile, `${Math.round(value)}\n`);
    } catch (writeError) {
      console.error("Failed to set brightness:", writeError);
    }
  }
}

function BrightnessSlider(device: BrightnessDevice): Gtk.Box {
  const container = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 4,
    css_classes: ["slider-box"],
  });

  const header = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 8,
  });

  const icon = new Gtk.Label({
    label: "󰃠",
    css_classes: ["slider-icon"],
  });
  header.append(icon);

  const label = new Gtk.Label({
    label: device.displayName,
    css_classes: ["slider-label"],
    xalign: 0,
    hexpand: true,
  });
  header.append(label);

  const valueLabel = new Gtk.Label({
    label: "0%",
    css_classes: ["slider-value"],
    xalign: 1,
  });
  header.append(valueLabel);

  container.append(header);

  const adjustment = new Gtk.Adjustment({
    lower: 0,
    upper: device.max,
    value: device.current,
    step_increment: device.max / 100,
    page_increment: device.max / 10,
  });

  const scale = Gtk.Scale.new(Gtk.Orientation.HORIZONTAL, adjustment);
  scale.set_draw_value(false);
  scale.set_hexpand(true);
  scale.set_sensitive(true);
  scale.set_can_focus(true);
  scale.set_can_target(true);
  scale.set_has_origin(true);
  scale.set_css_classes(["slider-scale", "brightness-slider"]);

  let isChanging = false;
  let debounceTimeout: number | null = null;

  scale.connect("value-changed", () => {
    if (isChanging) return;

    const value = scale.get_value();
    const percentage = Math.round((value / device.max) * 100);
    valueLabel.label = `${percentage}%`;

    // Update icon based on device type and brightness level
    if (device.type === "keyboard") {
      if (percentage > 66) {
        icon.label = "󰥸";
      } else if (percentage > 33) {
        icon.label = "󰥶";
      } else if (percentage > 0) {
        icon.label = "󰥴";
      } else {
        icon.label = "󰹐";
      }
    } else {
      if (percentage > 75) {
        icon.label = "󰃠";
      } else if (percentage > 50) {
        icon.label = "󰃟";
      } else if (percentage > 25) {
        icon.label = "󰃞";
      } else {
        icon.label = "󰃝";
      }
    }

    // Debounce brightness changes, especially for slow DDC/CI
    if (debounceTimeout !== null) {
      GLib.source_remove(debounceTimeout);
    }

    const debounceDelay = device.type === "ddcci" ? 300 : 50;
    debounceTimeout = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      debounceDelay,
      () => {
        setBrightness(device.path, value, device.type);
        debounceTimeout = null;
        return false;
      },
    );
  });

  container.append(scale);

  // Add scroll event controller for mouse wheel support
  const scrollController = new Gtk.EventControllerScroll();
  scrollController.set_flags(Gtk.EventControllerScrollFlags.VERTICAL);
  scrollController.connect("scroll", (_ctrl, _dx, dy) => {
    const currentValue = scale.get_value();
    const step = device.max / 20; // 5% per scroll
    const newValue = Math.max(
      0,
      Math.min(device.max, currentValue - dy * step),
    );
    scale.set_value(newValue);
    // setBrightness is debounced in value-changed handler
    return true;
  });
  container.add_controller(scrollController);

  // Initial brightness fetch for DDC monitors (async)
  if (device.type === "ddcci") {
    GLib.spawn_command_line_async(
      `ddcutil getvcp 10 --bus ${device.path} --brief --sleep-multiplier 0.1`,
    );
    // Read result asynchronously
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
      try {
        const [success, stdout] = GLib.spawn_command_line_sync(
          `ddcutil getvcp 10 --bus ${device.path} --brief --sleep-multiplier 0.1`,
        );
        if (success && stdout) {
          const output = new TextDecoder().decode(stdout);
          const match = output.match(/VCP\s+10\s+\w+\s+(\d+)\s+(\d+)/);
          if (match) {
            const current = parseInt(match[1], 10);
            const max = parseInt(match[2], 10);
            if (!Number.isNaN(current) && !Number.isNaN(max)) {
              isChanging = true;
              scale.set_range(0, max);
              scale.set_value(current);
              isChanging = false;
            }
          }
        }
      } catch (_e) {
        // Failed to get initial brightness
      }
      return false; // Don't repeat
    });
  }

  // Poll for external brightness changes (only for sysfs devices, DDC is too slow)
  const pollInterval =
    device.type === "ddcci"
      ? null
      : GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
          try {
            // Poll sysfs brightness
            const [success, content] = GLib.file_get_contents(
              `${device.path}/brightness`,
            );
            if (success) {
              const current = parseInt(
                new TextDecoder().decode(content).trim(),
                10,
              );
              if (!Number.isNaN(current) && current !== scale.get_value()) {
                isChanging = true;
                scale.set_value(current);
                isChanging = false;
              }
            }
          } catch (_e) {
            // Ignore poll errors
          }
          return true;
        });

  // Initial value and icon
  const percentage = Math.round((device.current / device.max) * 100);
  valueLabel.label = `${percentage}%`;

  // Set initial icon based on device type and brightness level
  if (device.type === "keyboard") {
    if (percentage > 66) {
      icon.label = "󰥸";
    } else if (percentage > 33) {
      icon.label = "󰥶";
    } else if (percentage > 0) {
      icon.label = "󰥴";
    } else {
      icon.label = "󰹐";
    }
  } else {
    if (percentage > 75) {
      icon.label = "󰃠";
    } else if (percentage > 50) {
      icon.label = "󰃟";
    } else if (percentage > 25) {
      icon.label = "󰃞";
    } else {
      icon.label = "󰃝";
    }
  }

  // Cleanup
  (container as Gtk.Widget & { _cleanup?: () => void })._cleanup = () => {
    if (pollInterval !== null) {
      GLib.source_remove(pollInterval);
    }
    if (debounceTimeout !== null) {
      GLib.source_remove(debounceTimeout);
    }
  };

  return container;
}

function VolumeSlider(
  endpoint: Wp.Endpoint,
  type: "speaker" | "microphone",
): Gtk.Box {
  const container = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 4,
    css_classes: ["slider-box"],
  });

  const header = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 8,
  });

  const icon = new Gtk.Label({
    label: type === "speaker" ? "󰕾" : "󰍬",
    css_classes: ["slider-icon"],
  });
  header.append(icon);

  // Make the icon clickable to toggle mute
  const iconGesture = new Gtk.GestureClick();
  iconGesture.connect("pressed", () => {
    endpoint.mute = !endpoint.mute;
  });
  icon.add_controller(iconGesture);

  const label = new Gtk.Label({
    label: type === "speaker" ? "Volume" : "Microphone",
    css_classes: ["slider-label"],
    xalign: 0,
    hexpand: true,
  });
  header.append(label);

  const valueLabel = new Gtk.Label({
    label: "0%",
    css_classes: ["slider-value"],
    xalign: 1,
  });
  header.append(valueLabel);

  container.append(header);

  const adjustment = new Gtk.Adjustment({
    lower: 0,
    upper: 1,
    value: endpoint.volume,
    step_increment: 0.01,
    page_increment: 0.1,
  });

  const scale = Gtk.Scale.new(Gtk.Orientation.HORIZONTAL, adjustment);
  scale.set_draw_value(false);
  scale.set_hexpand(true);
  scale.set_sensitive(true);
  scale.set_can_focus(true);
  scale.set_can_target(true);
  scale.set_has_origin(true);
  scale.set_css_classes(["slider-scale", `${type}-slider`]);

  let isChanging = false;

  scale.connect("value-changed", () => {
    if (isChanging) return;

    const value = scale.get_value();
    endpoint.volume = value;
  });

  container.append(scale);

  // Add scroll event controller for mouse wheel support
  const scrollController = new Gtk.EventControllerScroll();
  scrollController.set_flags(Gtk.EventControllerScrollFlags.VERTICAL);
  scrollController.connect("scroll", (_ctrl, _dx, dy) => {
    const currentValue = scale.get_value();
    const step = 0.05; // 5% per scroll
    const newValue = Math.max(0, Math.min(1, currentValue - dy * step));
    scale.set_value(newValue);
    endpoint.volume = newValue;
    return true;
  });
  container.add_controller(scrollController);

  function updateDisplay(): void {
    const volume = endpoint.volume;
    const muted = endpoint.mute;
    const percentage = Math.round(volume * 100);

    valueLabel.label = muted ? "Muted" : `${percentage}%`;

    if (type === "speaker") {
      if (muted || volume === 0) {
        icon.label = "󰝟";
      } else if (volume > 0.66) {
        icon.label = "󰕾";
      } else if (volume > 0.33) {
        icon.label = "󰖀";
      } else {
        icon.label = "󰕿";
      }
    } else {
      // microphone
      if (muted || volume === 0) {
        icon.label = "󰍭";
      } else {
        icon.label = "󰍬";
      }
    }

    if (muted) {
      icon.add_css_class("muted");
    } else {
      icon.remove_css_class("muted");
    }

    // Update scale value if not currently changing
    isChanging = true;
    scale.set_value(volume);
    isChanging = false;
  }

  // Initial update
  updateDisplay();

  // Connect to changes
  const volumeHandler = endpoint.connect("notify::volume", updateDisplay);
  const muteHandler = endpoint.connect("notify::mute", updateDisplay);

  // Cleanup
  (container as Gtk.Widget & { _cleanup?: () => void })._cleanup = () => {
    endpoint.disconnect(volumeHandler);
    endpoint.disconnect(muteHandler);
  };

  return container;
}

export function Sliders(): Gtk.Box {
  const container = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 12,
    css_classes: ["sliders-section"],
  });

  const slidersBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 12,
    css_classes: ["sliders-container"],
  });
  container.append(slidersBox);

  // Speaker volume
  const speaker = audio?.get_default_speaker();
  if (speaker) {
    slidersBox.append(VolumeSlider(speaker, "speaker"));
  }

  // Microphone volume
  const microphone = audio?.get_default_microphone();
  if (microphone) {
    slidersBox.append(VolumeSlider(microphone, "microphone"));
  }

  // Brightness sliders
  const brightnessDevices = getBrightnessDevices();
  for (const device of brightnessDevices) {
    slidersBox.append(BrightnessSlider(device));
  }

  // If no sliders were added, show a message
  if (slidersBox.get_first_child() === null) {
    const noSliders = new Gtk.Label({
      label: "No sliders available",
      css_classes: ["no-sliders"],
      valign: Gtk.Align.CENTER,
    });
    slidersBox.append(noSliders);
  }

  return container;
}

// Pre-warm DDC monitor detection cache in background on module load
// This prevents the first sidebar open from being slow
GLib.timeout_add(GLib.PRIORITY_LOW, 100, () => {
  if (ddcMonitorsCache === null) {
    // Trigger detection in background
    getDDCMonitors();
  }
  return false; // Don't repeat
});
