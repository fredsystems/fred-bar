import PowerProfiles from "gi://AstalPowerProfiles";
import Gtk from "gi://Gtk?version=4.0";

const powerProfiles = PowerProfiles.get_default();

export function PowerProfilesToggle(): Gtk.Box | null {
  // Check if power profiles are supported
  const profiles = powerProfiles.get_profiles();
  if (!profiles || profiles.length === 0) {
    return null;
  }

  const container = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 8,
    css_classes: ["power-profiles-section"],
  });

  const profileRow = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 8,
    css_classes: ["power-profiles-row"],
    homogeneous: true,
  });

  // Create buttons for each profile
  const profileButtons: Map<string, Gtk.Button> = new Map();

  // Common profiles: power-saver, balanced, performance
  const profileConfig = [
    { name: "power-saver", icon: "󰌪", label: "Power Saver" },
    { name: "balanced", icon: "󰾅", label: "Balanced" },
    { name: "performance", icon: "󰓅", label: "Performance" },
  ];

  for (const config of profileConfig) {
    // Check if this profile is available
    const isAvailable = profiles.some((p) => p.profile === config.name);
    if (!isAvailable) continue;

    const btn = new Gtk.Button({
      css_classes: ["power-profile-btn"],
      tooltip_text: config.label,
    });

    const btnBox = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 4,
      halign: Gtk.Align.CENTER,
    });

    const icon = new Gtk.Label({
      label: config.icon,
      css_classes: ["power-profile-icon"],
    });

    const label = new Gtk.Label({
      label: config.label,
      css_classes: ["power-profile-label"],
    });

    btnBox.append(icon);
    btnBox.append(label);
    btn.set_child(btnBox);

    btn.connect("clicked", () => {
      powerProfiles.active_profile = config.name;
    });

    profileButtons.set(config.name, btn);
    profileRow.append(btn);
  }

  container.append(profileRow);

  // Update function to highlight active profile
  function updateActiveProfile(): void {
    const activeProfile = powerProfiles.active_profile;

    for (const [profileName, btn] of profileButtons.entries()) {
      if (profileName === activeProfile) {
        btn.add_css_class("active");
      } else {
        btn.remove_css_class("active");
      }
    }
  }

  // Initial update
  updateActiveProfile();

  // Connect to profile changes
  const handler = powerProfiles.connect(
    "notify::active-profile",
    updateActiveProfile,
  );

  // Cleanup
  (container as Gtk.Widget & { _cleanup?: () => void })._cleanup = () => {
    powerProfiles.disconnect(handler);
  };

  return container;
}
