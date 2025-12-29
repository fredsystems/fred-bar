import Hyprland from "gi://AstalHyprland";
import Gtk from "gi://Gtk?version=4.0";
import Pango from "gi://Pango?version=1.0";

import { resolveAppIcon } from "helpers/icon-resolver";

const hypr = Hyprland.get_default();

let currentClient: Hyprland.Client | null = null;
let titleHandlerId: number | null = null;

export function WindowTitle(): Gtk.Box {
  let label: Gtk.Label;
  let image: Gtk.Image;
  let box: Gtk.Box;

  function update() {
    const client = hypr.focused_client;

    // Disconnect from old client
    if (currentClient && titleHandlerId !== null) {
      currentClient.disconnect(titleHandlerId);
      titleHandlerId = null;
    }

    currentClient = client;

    if (client) {
      titleHandlerId = client.connect("notify::title", () => {
        label.set_label(client.title ?? "");
        label.set_max_width_chars(40);
      });

      label.set_label(client.title ?? "");
      label.set_max_width_chars(40);

      const icon = resolveAppIcon(client.class);
      if (icon) {
        image.set_from_gicon(icon);
        image.set_visible(true);
      } else {
        image.set_visible(false);
      }
    } else {
      label.set_label("");
      image.set_visible(false);
      box.set_visible(false);
      return;
    }

    box.set_visible(true);
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
    visible: false, // Start hidden, update() will show if there's a focused client
  });

  box.append(image);
  box.append(label);

  update();
  hypr.connect("notify::focused-client", update);
  hypr.connect("notify::focused-title", update);
  hypr.connect("client-added", update);
  hypr.connect("client-removed", update);
  hypr.connect("client-moved", update);

  return box;
}
