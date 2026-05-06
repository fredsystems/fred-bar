import Gtk from "gi://Gtk?version=4.0";
import { getCompositor, getMonitorConnectorName } from "compositors";

export function ActiveWorkspace(): Gtk.Label {
  const compositor = getCompositor();
  let monitorName: string | null = null;

  const label = new Gtk.Label({
    css_classes: ["ws", "active", "ws-single"],
    xalign: 0.5,
  });

  function update() {
    const workspace = compositor.getFocusedWorkspace(monitorName || undefined);
    // Display the workspace name (index) not ID
    label.set_label(workspace ? String(workspace.name || workspace.id) : "");
  }

  // Resolve the monitor connector once the widget is realised. We use the
  // documented GTK4 path (get_native → get_surface → get_monitor_at_surface
  // → get_connector) via the shared helper instead of casting `root` to an
  // undocumented Astal `monitor: number` property.
  label.connect("realize", () => {
    monitorName = getMonitorConnectorName(label);
    if (monitorName) update();
  });

  update();

  // Connect to compositor events
  compositor.connect({
    onFocusedWorkspaceChanged: update,
  });

  return label;
}
