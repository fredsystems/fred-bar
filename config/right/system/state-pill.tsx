import GLib from "gi://GLib";
import Gtk from "gi://Gtk?version=4.0";
import App from "ags/gtk4/app";
import { attachTooltip } from "helpers/tooltip";
import { notificationService } from "services/notifications";
import type { AggregatedSystemState } from "./state/helpers/aggregate";
import type { SystemSignal } from "./state/helpers/normalize";
import { systemState } from "./state/modules/system";

/* Semantic → color mapping (mirrors Catppuccin vars) */
const SEVERITY_COLOR: Record<string, string> = {
  idle: "#a6adc8", // subtext0 - muted
  info: "#89b4fa", // blue
  warn: "#f9e2af", // yellow
  error: "#f38ba8", // red
};

function tooltipLineMarkup(s: SystemSignal): string {
  const icon = s.icon ?? "•";
  const color = SEVERITY_COLOR[s.severity] ?? SEVERITY_COLOR.idle;
  const summary = GLib.markup_escape_text(s.summary, -1);

  return `<span foreground="${color}">${icon}</span>  ${summary}`;
}

export function StatePill(): Gtk.Button {
  const button = new Gtk.Button({
    css_classes: ["state-pill", "pill", "state-idle"],
  });

  const iconBox = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 4,
    css_classes: ["state-pill-icons"],
  });
  button.set_child(iconBox);

  // Track notification count for badge
  let notificationCount = 0;

  // Click handler to toggle sidebar
  button.connect("clicked", () => {
    const display = button.get_display();
    if (!display) return;

    // Get the monitor this button is on
    const native = button.get_native();
    if (!native) return;

    const surface = native.get_surface();
    if (!surface) return;

    const monitor = display.get_monitor_at_surface(surface);
    if (!monitor) return;

    const monitors = display.get_monitors();
    let monitorIndex = 0;
    for (let i = 0; i < monitors.get_n_items(); i++) {
      if (monitors.get_item(i) === monitor) {
        monitorIndex = i;
        break;
      }
    }

    // Toggle sidebar window
    const sidebarName = `sidebar-${monitorIndex}`;
    const anyApp = App as unknown as {
      get_window?: (name: string) => Gtk.Window | null;
      getWindow?: (name: string) => Gtk.Window | null;
    };

    const sidebar =
      anyApp.get_window?.(sidebarName) ?? anyApp.getWindow?.(sidebarName);

    if (sidebar) {
      const willBeVisible = !sidebar.visible;
      sidebar.visible = willBeVisible;

      // Set window size to prevent blocking mouse events when hidden
      if (willBeVisible) {
        sidebar.set_default_size(420, -1);
      } else {
        sidebar.set_default_size(0, -1);
      }
    }
  });

  function update(): void {
    const state: AggregatedSystemState = systemState();

    // Reset severity classes
    button.remove_css_class("state-idle");
    button.remove_css_class("state-info");
    button.remove_css_class("state-warn");
    button.remove_css_class("state-error");

    button.add_css_class(`state-${state.severity}`);

    // Clear existing icons
    let child = iconBox.get_first_child();
    while (child) {
      const next = child.get_next_sibling();
      iconBox.remove(child);
      child = next;
    }

    // Update notification count from service
    notificationCount = notificationService.getPendingCount();

    // Create a map of icons to their source severity
    const iconSeverityMap = new Map<string, string>();
    for (const source of state.sources) {
      if (source.icon) {
        iconSeverityMap.set(source.icon, source.severity);
      }
    }

    // Always display all icons
    for (let i = 0; i < state.icons.length; i++) {
      const icon = state.icons[i];

      // For notification icon, use overlay with badge
      if (icon === "󰂚" && notificationCount > 0) {
        const overlay = new Gtk.Overlay({
          css_classes: ["notification-icon-overlay"],
        });

        const bellLabel = new Gtk.Label({ label: icon });
        const severity = iconSeverityMap.get(icon) || "idle";
        const color = SEVERITY_COLOR[severity];
        bellLabel.set_markup(`<span foreground="${color}">${icon}</span>`);

        overlay.set_child(bellLabel);

        // Badge
        const badge = new Gtk.Label({
          label: notificationCount > 99 ? "99+" : notificationCount.toString(),
          css_classes: ["notification-badge"],
          halign: Gtk.Align.END,
          valign: Gtk.Align.START,
        });
        overlay.add_overlay(badge);

        iconBox.append(overlay);
      } else {
        const iconLabel = new Gtk.Label({ label: icon });

        // Color the icon based on its severity
        const severity = iconSeverityMap.get(icon) || "idle";
        const color = SEVERITY_COLOR[severity];
        iconLabel.set_markup(`<span foreground="${color}">${icon}</span>`);

        iconBox.append(iconLabel);
      }
    }
  }

  // Initial render
  update();

  // Reactive updates
  const unsubscribe = systemState.subscribe(update);

  /* Tooltip — dynamic, markup-driven */
  attachTooltip(button, {
    text: () => {
      const state = systemState();

      if (state.sources.length === 0) {
        return "All systems normal";
      }

      return state.sources.map(tooltipLineMarkup).join("\n");
    },

    classes: () => [`state-${systemState().severity}`],
  });

  // Cleanup hook
  (button as Gtk.Widget & { _cleanup?: () => void })._cleanup = () => {
    unsubscribe();
  };

  return button;
}
