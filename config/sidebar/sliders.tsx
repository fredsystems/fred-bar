import Wp from "gi://AstalWp";
import GLib from "gi://GLib";
import Gtk from "gi://Gtk?version=4.0";

const audio = Wp.get_default();

// Brightness control using /sys/class/backlight
interface BrightnessDevice {
  name: string;
  path: string;
  max: number;
  current: number;
}

function getBrightnessDevices(): BrightnessDevice[] {
  const devices: BrightnessDevice[] = [];
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
              path: devicePath,
              max: maxBrightness,
              current: currentBrightness,
            });
          }
        }
      } catch (_e) {}

      name = dir.read_name();
    }
  } catch (_e) {
    // Backlight directory doesn't exist or can't be read
  }

  return devices;
}

function setBrightness(devicePath: string, value: number): void {
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
    label: device.name.charAt(0).toUpperCase() + device.name.slice(1),
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

  scale.connect("value-changed", () => {
    if (isChanging) return;

    const value = scale.get_value();
    const percentage = Math.round((value / device.max) * 100);
    valueLabel.label = `${percentage}%`;

    // Update icon based on brightness level
    if (percentage > 75) {
      icon.label = "󰃠";
    } else if (percentage > 50) {
      icon.label = "󰃟";
    } else if (percentage > 25) {
      icon.label = "󰃞";
    } else {
      icon.label = "󰃝";
    }

    setBrightness(device.path, value);
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
    setBrightness(device.path, newValue);
    return true;
  });
  container.add_controller(scrollController);

  // Poll for external brightness changes
  const pollInterval = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
    try {
      const [success, content] = GLib.file_get_contents(
        `${device.path}/brightness`,
      );
      if (success) {
        const current = parseInt(new TextDecoder().decode(content).trim(), 10);
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

  // Initial value
  const percentage = Math.round((device.current / device.max) * 100);
  valueLabel.label = `${percentage}%`;

  // Cleanup
  (container as Gtk.Widget & { _cleanup?: () => void })._cleanup = () => {
    GLib.source_remove(pollInterval);
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

  // Make the icon clickable to toggle mute
  const iconButton = new Gtk.Button({
    css_classes: ["slider-icon-btn"],
    child: icon,
  });
  iconButton.connect("clicked", () => {
    endpoint.mute = !endpoint.mute;
  });

  header.prepend(iconButton);

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
      iconButton.add_css_class("muted");
    } else {
      iconButton.remove_css_class("muted");
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
