import Gtk from "gi://Gtk?version=4.0";
import { getCompositor } from "compositors";

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

  // Get monitor from the window's monitor property
  label.connect("realize", () => {
    const root = label.get_root();
    if (!root) return;

    const display = root.get_display();
    if (!display) return;

    const monitorProp = (root as unknown as { monitor?: number }).monitor;
    if (monitorProp === undefined) return;

    const monitors = display.get_monitors();
    const monitor = monitors.get_item(monitorProp) as unknown as {
      get_connector?: () => string;
    } | null;
    if (monitor) {
      monitorName = monitor?.get_connector?.() || null;
      update();
    }
  });

  update();

  // Connect to compositor events
  compositor.connect({
    onFocusedWorkspaceChanged: update,
  });

  return label;
}
