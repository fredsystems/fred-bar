import AstalTray from "gi://AstalTray";
import Gdk from "gi://Gdk?version=4.0";
import Gio from "gi://Gio";
import GObject from "gi://GObject";
import Gtk from "gi://Gtk?version=4.0";
import { createLogger } from "helpers/logger";
import { attachTooltip } from "helpers/tooltip";

const log = createLogger("Tray");

type TrayItem = AstalTray.TrayItem;

type TrayButton = Gtk.Button & {
  _popover?: Gtk.Popover | null;
  _cleanup?: () => void;
};

// ---- Global "only one popover open" state ----
let OPEN_POPOVER: Gtk.Popover | null = null;

/**
 * Walk a menu_model and collect the set of action prefixes referenced by
 * its items (e.g. `dbusmenu`, `app`, `unity`, `indicator`). The
 * StatusNotifierItem spec uses `dbusmenu.` exclusively, but in practice
 * different toolkits emit menus with different prefixes. We register the
 * action_group only under the prefixes that actually appear, plus
 * `dbusmenu` as a safety baseline (some bare menus rely on it implicitly).
 */
function collectActionPrefixes(model: Gio.MenuModel): Set<string> {
  const prefixes = new Set<string>(["dbusmenu"]);
  const visit = (m: Gio.MenuModel): void => {
    const n = m.get_n_items();
    for (let i = 0; i < n; i++) {
      const actionVar = m.get_item_attribute_value(
        i,
        Gio.MENU_ATTRIBUTE_ACTION,
        null,
      );
      if (actionVar) {
        const action = actionVar.get_string()[0];
        const dot = action.indexOf(".");
        if (dot > 0) prefixes.add(action.slice(0, dot));
      }
      const section = m.get_item_link(i, Gio.MENU_LINK_SECTION);
      if (section) visit(section);
      const submenu = m.get_item_link(i, Gio.MENU_LINK_SUBMENU);
      if (submenu) visit(submenu);
    }
  };
  try {
    visit(model);
  } catch (err) {
    log.warn("menu prefix scan failed:", err);
  }
  return prefixes;
}

function closeOpenPopover(): void {
  if (!OPEN_POPOVER) return;

  try {
    OPEN_POPOVER.popdown();
  } catch {
    // ignore
  }

  OPEN_POPOVER = null;
}

function ensurePopover(button: TrayButton, item: TrayItem): Gtk.Popover | null {
  if (!item.menu_model || !item.action_group) return null;

  if (!button._popover) {
    // Use PopoverMenu but access and manipulate its internal child
    const popover = Gtk.PopoverMenu.new_from_model(item.menu_model);
    popover.set_parent(button);
    popover.set_has_arrow(false);
    popover.set_autohide(true);
    // Drop the menu downward from the bar, matching every other GTK status
    // tray. The previous PositionType.LEFT meant the popover was anchored
    // to the *left* of the button — which on a top bar with the tray on
    // the left of the screen pushes the menu off-screen and gets clipped
    // by the monitor edge. BOTTOM is the natural reading direction and
    // GTK auto-flips horizontally if the menu would overflow the right
    // edge, so it works for tray icons placed anywhere along the bar.
    popover.set_position(Gtk.PositionType.BOTTOM);
    popover.add_css_class("tray-menu");

    // Register the action_group only under prefixes the menu actually
    // uses. Previously we blanket-registered under dbusmenu/app/unity/
    // indicator which works but pollutes GTK's action map per item and
    // makes activation lookups ambiguous. See AUDIT C-1.10.
    if (item.action_group) {
      const prefixes = collectActionPrefixes(item.menu_model);
      for (const p of prefixes) {
        popover.insert_action_group(p, item.action_group);
      }
    }

    popover.connect("closed", () => {
      if (OPEN_POPOVER === popover) OPEN_POPOVER = null;
    });

    button._popover = popover;
  }

  return button._popover;
}

function popupMenu(button: TrayButton, item: TrayItem): void {
  const popover = ensurePopover(button, item);
  if (!popover) return;

  if (OPEN_POPOVER && OPEN_POPOVER !== popover) {
    closeOpenPopover();
  }

  OPEN_POPOVER = popover;
  popover.popup();
}

/* ------------------------------------------------------------------
 * Tooltip resolution (markup-aware)
 * ------------------------------------------------------------------ */
function resolveTooltipMarkup(item: AstalTray.TrayItem): string | null {
  // 1️⃣ Explicit markup string
  if (
    typeof item.tooltip_markup === "string" &&
    item.tooltip_markup.length > 0
  ) {
    return item.tooltip_markup;
  }

  // 2️⃣ Boxed tooltip object (Discord, 1Password, etc.)
  const tooltipObj = item.tooltip as unknown;
  if (tooltipObj && typeof tooltipObj === "object") {
    const anyTooltip = tooltipObj as {
      text?: string;
      markup?: string;
    };

    if (typeof anyTooltip.markup === "string" && anyTooltip.markup.length > 0) {
      return anyTooltip.markup;
    }

    if (typeof anyTooltip.text === "string" && anyTooltip.text.length > 0) {
      return anyTooltip.text;
    }
  }

  // 3️⃣ Title (udiskie, nm-applet)
  if (typeof item.title === "string" && item.title.length > 0) {
    return item.title;
  }

  // 4️⃣ Fallback
  if (typeof item.id === "string" && item.id.length > 0) {
    return item.id;
  }

  return null;
}

export function TrayItem(item: TrayItem): TrayButton {
  const image = new Gtk.Image({
    gicon: item.gicon ?? null,
    pixel_size: 16,
  });

  const button = new Gtk.Button({
    css_classes: ["tray-item"],
    focusable: false,
    child: image,
  }) as TrayButton;

  /* ----------------------------------------------------------------
   * Tooltip attachment (NEW)
   * ---------------------------------------------------------------- */
  const tooltip = resolveTooltipMarkup(item);
  if (tooltip) {
    attachTooltip(button, {
      text: () => tooltip,
      classes: () => ["tray"],
    });
  }

  // PRIMARY CLICK
  button.connect("clicked", () => {
    closeOpenPopover();

    try {
      if (item.category !== AstalTray.Category.APPLICATION) {
        popupMenu(button, item);
        return;
      }

      item.activate(0, 0);
    } catch (err) {
      log.error("activate failed:", err);
    }
  });

  // SECONDARY CLICK: open menu
  const rightClick = new Gtk.GestureClick();
  rightClick.set_button(Gdk.BUTTON_SECONDARY);

  rightClick.connect("released", () => {
    closeOpenPopover();
    popupMenu(button, item);
  });

  button.add_controller(rightClick);

  // Cleanup for when SystemTray removes this widget
  button._cleanup = () => {
    if (button._popover && OPEN_POPOVER === button._popover) {
      closeOpenPopover();
    }

    if (button._popover) {
      try {
        button._popover.unparent();
      } catch {
        /* ignore */
      }
      button._popover = null;
    }
  };

  // Use GObject property binding to avoid ref count issues with manual updates
  item.bind_property("gicon", image, "gicon", GObject.BindingFlags.SYNC_CREATE);

  return button;
}
