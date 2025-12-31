import GLib from "gi://GLib";
import Gtk from "gi://Gtk?version=4.0";
import App from "ags/gtk4/app";
import { attachTooltip } from "helpers/tooltip";
import type { AggregatedSystemState } from "./state/helpers/aggregate";
import type { SystemSignal } from "./state/helpers/normalize";
import { systemState } from "./state/modules/system";

// Neutral icon shown when system is idle
const IDLE_ICON = "󰒓";

/* Semantic → color mapping (mirrors Catppuccin vars) */
const SEVERITY_COLOR: Record<string, string> = {
  idle: "#a6e3a1", // muted
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
      sidebar.visible = !sidebar.visible;
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

    const isIdle = state.severity === "idle";

    // Clear existing icons
    let child = iconBox.get_first_child();
    while (child) {
      const next = child.get_next_sibling();
      iconBox.remove(child);
      child = next;
    }

    // Add icons (multiple if available)
    if (isIdle) {
      const idleIcon = new Gtk.Label({ label: IDLE_ICON });
      iconBox.append(idleIcon);
    } else if (state.icons.length > 0) {
      for (const icon of state.icons) {
        const iconLabel = new Gtk.Label({ label: icon });
        iconBox.append(iconLabel);
      }
    } else if (state.icon) {
      const iconLabel = new Gtk.Label({ label: state.icon });
      iconBox.append(iconLabel);
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
