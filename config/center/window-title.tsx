import Gtk from "gi://Gtk?version=4.0";
import Pango from "gi://Pango?version=1.0";

import { getCompositor } from "compositors";
import { resolveAppIcon } from "helpers/icon-resolver";

export function WindowTitle(): Gtk.Box {
  const compositor = getCompositor();

  let image: Gtk.Image;
  let label: Gtk.Label;
  let box: Gtk.Box;
  let currentWindowAddress: string | null = null;

  function update() {
    const window = compositor.getFocusedWindow();

    // Track if we switched to a different window
    const addressChanged = currentWindowAddress !== window?.address;
    currentWindowAddress = window?.address ?? null;

    if (window) {
      label.set_label(window.title ?? "");
      label.set_max_width_chars(40);

      // Only update icon if window changed (not just title update)
      if (addressChanged) {
        const icon = resolveAppIcon(window.appClass);
        if (icon) {
          image.set_from_gicon(icon);
          image.set_visible(true);
        } else {
          image.set_visible(false);
        }
      }

      box.set_visible(true);
    } else {
      label.set_label("");
      image.set_visible(false);
      box.set_visible(false);
    }
  }

  image = new Gtk.Image({
    pixel_size: 16,
    visible: false,
  });

  label = new Gtk.Label({
    xalign: 0.5,
    ellipsize: Pango.EllipsizeMode.END,
    hexpand: false,
  });

  label.set_max_width_chars(40);

  box = new Gtk.Box({
    spacing: 4,
    halign: Gtk.Align.CENTER,
    css_classes: ["window-title", "pill"],
    visible: false, // Start hidden, update() will show if there's a focused window
  });

  box.append(image);
  box.append(label);

  update();

  // Connect to compositor events
  compositor.connect({
    onFocusedWindowChanged: update,
    onWindowAdded: update,
    onWindowRemoved: update,
    onWindowMoved: update,
  });

  return box;
}
