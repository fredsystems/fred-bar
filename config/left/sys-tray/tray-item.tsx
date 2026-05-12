import AstalTray from "gi://AstalTray";
import Gdk from "gi://Gdk?version=4.0";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Gtk from "gi://Gtk?version=4.0";
import {
  createManualBackdrop,
  type TrayBackdropHandle,
} from "helpers/backdrop";
import { registerCleanup } from "helpers/cleanup";
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

/* ------------------------------------------------------------------
 * Single-open invariant
 * ------------------------------------------------------------------
 * Only one tray popover may be visible at a time. We track it in a
 * module-global because Wayland popup grabs don't help us here: with
 * autohide:false (see menu.tsx), the root popover doesn't auto-close on
 * outside click, so we close it ourselves whenever:
 *
 *   1. The user clicks another tray button (handled here).
 *   2. The user clicks elsewhere on the bar (handled by the bar-level
 *      capture-phase controller in app.tsx via `closeOpenTrayPopover`).
 *   3. ESC is pressed while the popover has focus (handled by the
 *      Gtk.EventControllerKey installed below on each popover).
 * ------------------------------------------------------------------ */
let OPEN_POPOVER: Gtk.Popover | null = null;
let OPEN_OWNER: Gtk.Widget | null = null;
let ACTIVE_BACKDROP: TrayBackdropHandle | null = null;

/**
 * Per-monitor backdrop registry. We scope backdrops to a single monitor
 * (rather than spanning all outputs) to limit recovery blast-radius if
 * the layer-shell overlay ever wedges input on that display — the user
 * can still reach another monitor and `pkill gjs`.
 */
const BACKDROPS_BY_MONITOR = new Map<number, TrayBackdropHandle>();

/** Resolve the monitor index (GListModel order) hosting `widget`. */
function monitorIndexOfWidget(widget: Gtk.Widget): number | null {
  const native = widget.get_native();
  if (!native) return null;
  const surface = native.get_surface();
  if (!surface) return null;
  const display = Gdk.Display.get_default();
  if (!display) return null;
  const monitor = display.get_monitor_at_surface(surface);
  if (!monitor) return null;
  const monitors = display.get_monitors();
  for (let i = 0; i < monitors.get_n_items(); i++) {
    if (monitors.get_item(i) === monitor) return i;
  }
  return null;
}

function backdropForMonitor(monitorIndex: number): TrayBackdropHandle {
  const cached = BACKDROPS_BY_MONITOR.get(monitorIndex);
  if (cached) return cached;
  const handle = createManualBackdrop(monitorIndex, () => {
    closeOpenTrayPopover();
  });
  BACKDROPS_BY_MONITOR.set(monitorIndex, handle);
  return handle;
}

/** Close whatever tray popover is currently open. No-op if none. */
export function closeOpenTrayPopover(): void {
  if (!OPEN_POPOVER) return;
  try {
    OPEN_POPOVER.popdown();
  } catch {
    /* ignore */
  }
  OPEN_POPOVER = null;
  OPEN_OWNER = null;
  if (ACTIVE_BACKDROP) {
    ACTIVE_BACKDROP.hide();
    ACTIVE_BACKDROP = null;
  }
}

/** Whether `target` is a descendant of the currently-open tray popover. */
export function isInsideOpenTrayPopover(target: Gtk.Widget | null): boolean {
  if (!OPEN_POPOVER || !target) return false;
  let w: Gtk.Widget | null = target;
  while (w) {
    if (w === OPEN_POPOVER) return true;
    w = w.get_parent();
  }
  return false;
}

/** Whether `target` is the tray button that owns the currently-open popover. */
export function isOwnerOfOpenTrayPopover(target: Gtk.Widget | null): boolean {
  if (!OPEN_OWNER || !target) return false;
  let w: Gtk.Widget | null = target;
  while (w) {
    if (w === OPEN_OWNER) return true;
    w = w.get_parent();
  }
  return false;
}

/**
 * Recover the tray app's well-known D-Bus name from `item.item_id`.
 *
 * AstalTray composes `item_id = service + object_path` where `object_path`
 * starts with `/`. Splitting on the first `/` gives us the bus name.
 */
function busNameFromItemId(itemId: string): string | null {
  const slash = itemId.indexOf("/");
  if (slash <= 0) return null;
  return itemId.substring(0, slash);
}

/** Read the unintrospectable `menu_path` property at runtime. */
function menuObjectPath(item: TrayItem): string | null {
  const raw = (item as unknown as { menu_path?: string | null }).menu_path;
  return typeof raw === "string" && raw.startsWith("/") ? raw : null;
}

/**
 * Open the tray menu for `item`. Fetches layout over D-Bus, builds the
 * popover, and pops it up. Fetching is async (~ms); we close any
 * already-open popover first, then again right before showing (in case
 * another opened during the fetch window).
 */
function popupMenu(button: TrayButton, item: TrayItem): void {
  closeOpenTrayPopover();

  const busName = busNameFromItemId(item.item_id);
  const objectPath = menuObjectPath(item);
  if (!busName || !objectPath) {
    log.debug(`no dbusmenu coordinates for ${item.item_id}`);
    return;
  }

  fetchMenuLayout(busName, objectPath)
    .then((root) => {
      if (!root) return;
      closeOpenTrayPopover();

      let popover: Gtk.Popover;
      try {
        popover = buildTrayMenu(root, busName, objectPath);
      } catch (err) {
        log.warn("menu construction failed:", err);
        return;
      }

      popover.set_parent(button);
      popover.set_position(Gtk.PositionType.BOTTOM);

      // ESC dismissal — replaces the keyboard escape that autohide:true
      // would have given us for free.
      const keyCtrl = new Gtk.EventControllerKey();
      keyCtrl.connect("key-pressed", (_c, keyval) => {
        if (keyval === Gdk.KEY_Escape) {
          closeOpenTrayPopover();
          return true;
        }
        return false;
      });
      popover.add_controller(keyCtrl);

      // Defer unparent to idle: `closed` fires from inside GTK's hide path,
      // so mutating the widget tree synchronously here can reenter under
      // rapid open/close.
      popover.connect("closed", () => {
        if (OPEN_POPOVER === popover) {
          OPEN_POPOVER = null;
          OPEN_OWNER = null;
          if (ACTIVE_BACKDROP) {
            ACTIVE_BACKDROP.hide();
            ACTIVE_BACKDROP = null;
          }
        }
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
      OPEN_OWNER = button;

      // Show a click-catcher backdrop on the same monitor as the tray
      // button. Without it (and without a Wayland popup grab — see
      // autohide:false in menu.tsx), clicks on the desktop or other
      // windows wouldn't dismiss the menu. Scoped per-monitor on purpose
      // (see comment on createManualBackdrop in helpers/backdrop.tsx).
      const monitorIndex = monitorIndexOfWidget(button);
      if (monitorIndex !== null) {
        ACTIVE_BACKDROP = backdropForMonitor(monitorIndex);
        ACTIVE_BACKDROP.show();
      }

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
  if (
    typeof item.tooltip_markup === "string" &&
    item.tooltip_markup.length > 0
  ) {
    return item.tooltip_markup;
  }

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

  if (typeof item.title === "string" && item.title.length > 0) {
    return item.title;
  }

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
   *
   * Tooltip text on a SNI can be empty at construction (apps publish it
   * after their main window is fully realised) or change over the
   * item's lifetime (e.g. NetworkManager rewriting connection state).
   *
   * Strategy:
   *   - If a tooltip is already present, attach immediately with a
   *     resolver that re-reads the current value on every hover. The
   *     `if (tooltip)` gate stays — we never add a motion controller to
   *     a button that has no tooltip to show, because the controller has
   *     subtle interactions with the GtkPopoverMenu we attach on click
   *     (cf. AUDIT.md C-2.9, regression `66eb700` → `0987dc7`).
   *   - If a tooltip is initially absent, listen for the first time the
   *     SNI publishes one and attach then. Two properties may fire:
   *     `tooltip-markup` (Astal-cooked, what resolveTooltipMarkup reads
   *     first) and the unintrospectable `tooltip` struct. We watch both
   *     and self-disarm once a tooltip resolves.
   * ---------------------------------------------------------------- */
  const dynamicText = (): string => resolveTooltipMarkup(item) ?? "";

  if (resolveTooltipMarkup(item)) {
    attachTooltip(button, {
      text: dynamicText,
      classes: () => ["tray"],
      updateInterval: 1000,
    });
  } else {
    let attached = false;
    let markupHandler: number | null = null;
    let structHandler: number | null = null;

    const tryAttach = (): void => {
      if (attached) return;
      if (resolveTooltipMarkup(item) === null) return;
      attached = true;
      attachTooltip(button, {
        text: dynamicText,
        classes: () => ["tray"],
        updateInterval: 1000,
      });
      if (markupHandler !== null) item.disconnect(markupHandler);
      if (structHandler !== null) item.disconnect(structHandler);
      markupHandler = null;
      structHandler = null;
    };

    try {
      markupHandler = item.connect("notify::tooltip-markup", tryAttach);
    } catch {
      // Some SNI implementations don't expose the property; ignore.
    }
    try {
      structHandler = item.connect("notify::tooltip", tryAttach);
    } catch {
      // ditto
    }

    // If the button is destroyed before a tooltip ever appears, drop the
    // watchers so we don't leak signal handlers on the long-lived
    // TrayItem.
    registerCleanup(button, () => {
      if (markupHandler !== null) {
        try {
          item.disconnect(markupHandler);
        } catch {
          // already disconnected by tryAttach
        }
        markupHandler = null;
      }
      if (structHandler !== null) {
        try {
          item.disconnect(structHandler);
        } catch {
          // already disconnected by tryAttach
        }
        structHandler = null;
      }
    });
  }

  // PRIMARY CLICK
  button.connect("clicked", () => {
    try {
      if (item.category === AstalTray.Category.APPLICATION) {
        closeOpenTrayPopover();
        item.activate(0, 0);
        return;
      }

      // Toggle: if our own popover is the one open, just close it.
      if (button._popover && OPEN_POPOVER === button._popover) {
        closeOpenTrayPopover();
        return;
      }

      popupMenu(button, item);
    } catch (err) {
      log.error("activate failed:", err);
    }
  });

  // SECONDARY CLICK: open menu (with same toggle semantics for non-app items)
  const rightClick = new Gtk.GestureClick();
  rightClick.set_button(Gdk.BUTTON_SECONDARY);
  rightClick.connect("released", () => {
    if (button._popover && OPEN_POPOVER === button._popover) {
      closeOpenTrayPopover();
      return;
    }
    popupMenu(button, item);
  });
  button.add_controller(rightClick);

  // Cleanup for when SystemTray removes this widget.
  registerCleanup(button, () => {
    if (button._popover) {
      if (OPEN_POPOVER === button._popover) closeOpenTrayPopover();
      button._popover = null;
    }
  });

  // GObject property binding avoids ref count issues with manual gicon updates.
  item.bind_property("gicon", image, "gicon", GObject.BindingFlags.SYNC_CREATE);

  return button;
}
