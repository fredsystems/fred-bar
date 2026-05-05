import GLib from "gi://GLib";
import Gtk from "gi://Gtk?version=4.0";
import { getCompositor } from "compositors";
import { ActiveWorkspace } from "./active-workspace";
import { WindowTitle } from "./window-title";
import { Workspaces } from "./workspaces";

export function WindowWorkspacesPill(): Gtk.Box {
  const compositor = getCompositor();
  const supportsWorkspaces = compositor.supportsWorkspaces;

  const activeWs = ActiveWorkspace();
  const workspaces = Workspaces();
  const title = WindowTitle();

  const revealer = new Gtk.Revealer({
    transition_type: Gtk.RevealerTransitionType.SLIDE_RIGHT,
    transition_duration: 180,
    reveal_child: false,
  });

  revealer.set_child(workspaces);

  const box = new Gtk.Box({
    spacing: 0,
    css_classes: ["pill", "window-workspaces"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
  });

  // If workspaces are supported, show workspace widgets
  if (supportsWorkspaces) {
    // LEFT → RIGHT
    box.append(activeWs);
    box.append(revealer);
  }

  // Always show window title if windows are supported
  if (compositor.supportsWindows) {
    box.append(title);
  }

  // Only add hover behavior if workspaces are supported
  if (supportsWorkspaces) {
    const motion = new Gtk.EventControllerMotion();

    /* ----------------------------------------------------------------
     * Hover-state debounce
     * ----------------------------------------------------------------
     * The pill is `halign: CENTER`, so when the revealer expands it
     * widens the box symmetrically — its left edge slides left during
     * the 180ms slide animation. If the cursor sits in the few pixels
     * between the outer pill border and the inner workspace pill, the
     * relayout can briefly move the box's allocated bounds out from
     * under the cursor, firing `leave`. That collapses the revealer,
     * which moves the box right again, putting the cursor back inside,
     * which re-fires `enter` — an oscillation feedback loop.
     *
     * Fix: treat `leave` as tentative. Schedule the actual collapse
     * 80ms later; if `enter` arrives before then, cancel the collapse.
     * (See AUDIT C-1.11 for the related popover hover bug.)
     * -------------------------------------------------------------- */
    let collapseTimer: number | null = null;
    const cancelCollapse = () => {
      if (collapseTimer !== null) {
        GLib.source_remove(collapseTimer);
        collapseTimer = null;
      }
    };

    motion.connect("enter", () => {
      cancelCollapse();
      activeWs.set_visible(false);
      revealer.set_reveal_child(true);
    });

    motion.connect("leave", () => {
      cancelCollapse();
      collapseTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
        collapseTimer = null;
        revealer.set_reveal_child(false);
        activeWs.set_visible(true);
        return GLib.SOURCE_REMOVE;
      });
    });

    box.add_controller(motion);
  }

  // Hide the entire pill if neither workspaces nor windows are supported
  if (!supportsWorkspaces && !compositor.supportsWindows) {
    box.set_visible(false);
  }

  return box;
}
