import Gtk from "gi://Gtk?version=4.0";

import { getCompositor } from "compositors";
import { resolveAppIcon } from "helpers/icon-resolver";

/* -----------------------------
 * Helper: Format app class name
 * ----------------------------- */
function formatAppClass(appClass: string): string {
  if (!appClass) return "";

  // Remove reverse domain notation (e.g., "dev.zed.Zed" -> "Zed")
  const parts = appClass.split(".");
  const lastName = parts[parts.length - 1];

  // Capitalize first letter if all lowercase
  if (lastName === lastName.toLowerCase()) {
    return lastName.charAt(0).toUpperCase() + lastName.slice(1);
  }

  return lastName;
}

/* -----------------------------
 * Workspace Preview Popover
 * ----------------------------- */
function createWorkspacePreview(workspaceId: number): Gtk.Popover {
  const compositor = getCompositor();

  const popover = new Gtk.Popover({
    has_arrow: false,
    autohide: false,
    css_classes: ["workspace-preview"],
  });

  const box = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 4,
    css_classes: ["workspace-preview-box"],
  });

  function updatePreview(): void {
    // Clear existing children
    for (let child = box.get_first_child(); child; ) {
      const next = child.get_next_sibling();
      box.remove(child);
      child = next;
    }

    const windows = compositor.getWorkspaceWindows(workspaceId);

    if (windows.length === 0) {
      const emptyLabel = new Gtk.Label({
        label: "Empty workspace",
        css_classes: ["workspace-preview-empty"],
      });
      box.append(emptyLabel);
    } else {
      // Add header
      const header = new Gtk.Label({
        label: `Workspace ${workspaceId} - ${windows.length} window${windows.length !== 1 ? "s" : ""}`,
        css_classes: ["workspace-preview-header"],
        xalign: 0,
      });
      box.append(header);

      // Add separator
      const sep = new Gtk.Separator({
        css_classes: ["workspace-preview-separator"],
      });
      box.append(sep);

      // Add window list
      for (const window of windows) {
        const windowBox = new Gtk.Box({
          orientation: Gtk.Orientation.HORIZONTAL,
          spacing: 8,
          css_classes: ["workspace-preview-window"],
        });

        // App icon
        const icon = resolveAppIcon(window.appClass);
        if (icon) {
          const iconImage = new Gtk.Image({
            gicon: icon,
            pixel_size: 16,
            css_classes: ["workspace-preview-window-icon"],
          });
          windowBox.append(iconImage);
        }

        // Window title
        const titleLabel = new Gtk.Label({
          label: window.title || window.appClass || "Unknown",
          xalign: 0,
          hexpand: true,
          ellipsize: 3, // PANGO_ELLIPSIZE_END
          max_width_chars: 30,
          css_classes: ["workspace-preview-window-title"],
        });

        // Window class (app name) - formatted
        const formattedClass = formatAppClass(window.appClass || "");
        const classLabel = new Gtk.Label({
          label: formattedClass,
          css_classes: ["workspace-preview-window-class"],
        });

        windowBox.append(titleLabel);
        windowBox.append(classLabel);

        // Make it clickable to focus the window
        const button = new Gtk.Button({
          child: windowBox,
          css_classes: ["workspace-preview-window-button"],
        });

        button.connect("clicked", () => {
          compositor.focusWindow(window.address);
          popover.popdown();
        });

        box.append(button);
      }
    }
  }

  popover.set_child(box);
  updatePreview();

  // Update preview when popover is shown
  popover.connect("show", updatePreview);

  return popover;
}

/* -----------------------------
 * Main Workspaces Widget
 * ----------------------------- */
export function Workspaces(): Gtk.Box {
  const compositor = getCompositor();

  const box = new Gtk.Box({
    spacing: 0,
    css_classes: ["workspaces", "pill"],
    valign: Gtk.Align.CENTER,
  });

  // If compositor doesn't support workspaces, hide the widget
  if (!compositor.supportsWorkspaces) {
    box.set_visible(false);
    return box;
  }

  let popovers: Gtk.Popover[] = [];

  function render() {
    // Clean up old popovers BEFORE clearing children (synchronously)
    for (const popover of popovers) {
      try {
        popover.unparent();
      } catch {
        /* ignore */
      }
    }
    popovers = [];

    // Clear children safely
    for (let child = box.get_first_child(); child; ) {
      const next = child.get_next_sibling();
      box.remove(child);
      child = next;
    }

    const workspaces = compositor.getWorkspaces();
    const focusedWorkspace = compositor.getFocusedWorkspace();
    const focusedId = focusedWorkspace?.id ?? null;

    for (const ws of workspaces) {
      const active = focusedId === ws.id;

      const button = new Gtk.Button({
        css_classes: active ? ["ws", "active"] : ["ws"],
        focusable: false,
      });

      const label = new Gtk.Label({ label: String(ws.id) });
      button.set_child(label);

      button.connect("clicked", () => {
        compositor.switchToWorkspace(ws.id);
      });

      // Add workspace preview popover
      const preview = createWorkspacePreview(ws.id);
      preview.set_parent(button);
      popovers.push(preview);

      // Show preview on hover
      const hoverController = new Gtk.EventControllerMotion();
      let hoverTimeout: number | null = null;
      let isHovering = false;

      hoverController.connect("enter", () => {
        isHovering = true;
        // Small delay before showing preview
        hoverTimeout = setTimeout(() => {
          if (isHovering) {
            preview.popup();
          }
          hoverTimeout = null;
        }, 500) as unknown as number;
      });

      hoverController.connect("leave", () => {
        isHovering = false;
        // Clear timeout if we leave before it triggers
        if (hoverTimeout !== null) {
          clearTimeout(hoverTimeout);
          hoverTimeout = null;
        }
        // Close immediately when leaving
        preview.popdown();
      });

      button.add_controller(hoverController);

      box.append(button);
    }
  }

  render();

  // Connect to compositor events
  compositor.connect({
    onWorkspacesChanged: render,
    onFocusedWorkspaceChanged: render,
  });

  return box;
}
