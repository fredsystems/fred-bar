import AstalTray from "gi://AstalTray";
import Gdk from "gi://Gdk?version=4.0";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Gtk from "gi://Gtk?version=4.0";
import { createLogger } from "helpers/logger";
import { attachTooltip } from "helpers/tooltip";
import { fetchMenuLayout } from "./dbusmenu";
import { buildTrayMenu } from "./menu";

const log = createLogger("Tray");

type TrayItem = AstalTray.TrayItem;

type TrayButton = Gtk.Button & {
  _popover?: Gtk.Popover | null;
  _cleanup?: () => void;
};

// ---- Global "only one popover open" state ----
let OPEN_POPOVER: Gtk.Popover | null = null;

function closeOpenPopover(): void {
  if (!OPEN_POPOVER) return;

  try {
    OPEN_POPOVER.popdown();
  } catch {
    // ignore
  }

  OPEN_POPOVER = null;
}

/**
 * Recover the tray app's well-known D-Bus name from `item.item_id`.
 *
 * AstalTray composes `item_id = service + object_path` where `object_path`
 * starts with `/` (e.g. `org.kde.StatusNotifierItem-1234-1/StatusNotifierItem`).
 * Splitting on the first `/` gives us the bus name.
 *
 * We can't use the well-known-vs-unique-name distinction from AstalTray
 * (which uses `proxy.g_name_owner`, the unique `:1.NN` name) — that's not
 * exposed in the gir. The well-known name is fine: D-Bus routes to the
 * current owner automatically.
 */
function busNameFromItemId(itemId: string): string | null {
  const slash = itemId.indexOf("/");
  if (slash <= 0) return null;
  return itemId.substring(0, slash);
}

/** Read the unintrospectable `menu_path` property at runtime. */
function menuObjectPath(item: TrayItem): string | null {
  // `menu_path` is typed `never` in the gir because it's `ObjectPath`, but
  // at runtime it's a plain string (or null). Cast through `unknown`.
  const raw = (item as unknown as { menu_path?: string | null }).menu_path;
  return typeof raw === "string" && raw.startsWith("/") ? raw : null;
}

/**
 * Open the tray menu for `item`. Fetches layout over D-Bus, builds the
 * popover, and pops it up.
 *
 * Fetching is async (~ms over the session bus), so the popover appears
 * slightly after the click. We intentionally don't pre-fetch: the freshest
 * layout is the one the user expects.
 */
function popupMenu(button: TrayButton, item: TrayItem): void {
  closeOpenPopover();

  const busName = busNameFromItemId(item.item_id);
  const objectPath = menuObjectPath(item);

  if (!busName || !objectPath) {
    log.debug(`no dbusmenu coordinates for ${item.item_id}`);
    return;
  }

  fetchMenuLayout(busName, objectPath)
    .then((root) => {
      if (!root) return;

      // If the user clicked elsewhere while we were fetching, another popover
      // may have opened. Close it first so we maintain the single-open
      // invariant.
      closeOpenPopover();

      let popover: Gtk.Popover;
      try {
        popover = buildTrayMenu(root, busName, objectPath);
      } catch (err) {
        log.warn("menu construction failed:", err);
        return;
      }

      popover.set_parent(button);
      popover.set_position(Gtk.PositionType.BOTTOM);

      // Defer unparent to idle: `closed` is emitted from inside GTK's hide
      // / grab-release path, so mutating the widget tree synchronously here
      // can reenter under rapid open/close.
      popover.connect("closed", () => {
        if (OPEN_POPOVER === popover) OPEN_POPOVER = null;
        if (button._popover === popover) button._popover = null;
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
          try {
            popover.unparent();
          } catch {
            /* ignore */
          }
          return GLib.SOURCE_REMOVE;
        });
      });

      button._popover = popover;
      OPEN_POPOVER = popover;
      popover.popup();
    })
    .catch((err: unknown) => {
      log.warn(`fetchMenuLayout for ${item.item_id} threw:`, err);
    });
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
   * Tooltip attachment
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

  // Cleanup for when SystemTray removes this widget. The popover is normally
  // unparented on idle from its own `closed` handler; here we handle the
  // edge case of the tray item being removed while its menu is still open.
  button._cleanup = () => {
    if (button._popover) {
      if (OPEN_POPOVER === button._popover) closeOpenPopover();
      button._popover = null;
    }
  };

  // Use GObject property binding to avoid ref count issues with manual updates
  item.bind_property("gicon", image, "gicon", GObject.BindingFlags.SYNC_CREATE);

  return button;
}
