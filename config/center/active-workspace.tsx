import Gtk from "gi://Gtk?version=4.0";
import { getCompositor } from "compositors";

export function ActiveWorkspace(): Gtk.Label {
  const compositor = getCompositor();

  const label = new Gtk.Label({
    css_classes: ["ws", "active", "ws-single"],
    xalign: 0.5,
  });

  function update() {
    const workspace = compositor.getFocusedWorkspace();
    label.set_label(workspace ? String(workspace.id) : "");
  }

  update();

  // Connect to compositor events
  compositor.connect({
    onFocusedWorkspaceChanged: update,
  });

  return label;
}
