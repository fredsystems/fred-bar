/**
 * Direct `com.canonical.dbusmenu` client.
 *
 * Why this exists: the appmenu-glib-translator-provided `GMenuModel` and
 * `GActionGroup` (exposed by AstalTray as `item.menu_model` / `item.action_group`)
 * are unsafe to read from JS — see `AUDIT.md` C-1.16. The translator borrows
 * `GVariant` and `GVariantTypeInfo` into the model's attribute table and frees
 * them mid-walk when it processes a DBus `LayoutUpdated` signal, which causes
 * a SIGSEGV in `g_variant_type_info_get_type_string` (or
 * `g_menu_model_real_get_item_attribute_value`, depending on which accessor
 * we use) under any tray client that updates its menu at runtime
 * (NetworkManager, mpv, Discord, …).
 *
 * Our workaround: bypass the translator entirely. We open a direct D-Bus
 * channel to the tray application's `com.canonical.dbusmenu` object, call
 * `GetLayout` ourselves, and immediately `recursiveUnpack()` the reply into
 * plain JS values. After that call we never touch the source `GVariant`
 * again, so subsequent translator (or app) mutations cannot affect our
 * widgets.
 *
 * Freshness: dbusmenu servers (notably NetworkManager) rebuild submenu
 * subtrees with new IDs across short timespans — Wi-Fi rescans tick every
 * few seconds and re-number every child. Holding IDs from an initial
 * `GetLayout(0, -1)` and clicking them seconds later yields
 * "ID does not refer to a menu item we have" errors. We therefore fetch
 * lazily: root with `depth=1` on popup-open, then each submenu's subtree
 * with `depth=-1` immediately before opening *that* submenu's popover.
 *
 * Spec: https://github.com/AyatanaIndicators/libdbusmenu/blob/master/libdbusmenu-glib/dbus-menu.xml
 */

import Gio from "gi://Gio";
import GLib from "gi://GLib";
import { createLogger } from "helpers/logger";

const log = createLogger("DBusMenu");

const IFACE = "com.canonical.dbusmenu";

/** Properties we want for every menu item. Anything not listed is omitted
 *  by the server, saving bandwidth and reducing surface for malformed apps. */
const REQUESTED_PROPS = [
  "type", // "standard" | "separator"
  "label", // mnemonic-marked string
  "enabled", // boolean (default true)
  "visible", // boolean (default true)
  "icon-name", // themed icon name
  "icon-data", // ay (PNG bytes) — we ignore for now, prefer icon-name
  "toggle-type", // "" | "checkmark" | "radio"
  "toggle-state", // 0 = off, 1 = on, -1 = indeterminate
  "children-display", // "" | "submenu"
  "disposition", // "normal" | "informative" | "warning" | "alert"
];

/** Decoded menu node. Pure JS data — no GLib pointers retained. */
export interface MenuNode {
  id: number;
  type: "standard" | "separator";
  label: string;
  enabled: boolean;
  visible: boolean;
  iconName: string | null;
  toggleType: "" | "checkmark" | "radio";
  /** 0 = off, 1 = on, -1 = indeterminate. */
  toggleState: number;
  hasSubmenu: boolean;
  children: MenuNode[];
}

// ---- Variant unpacking -----------------------------------------------------

interface RawLayoutNode extends Array<unknown> {
  // GetLayout returns layout as `(ia{sv}av)`:
  //   - i:    id
  //   - a{sv}: properties
  //   - av:   children (each child is itself a `v` wrapping `(ia{sv}av)`)
  // After recursiveUnpack(), tuples become arrays, dicts become plain
  // objects, and inner variants (`v`) are fully unwrapped so each child
  // appears directly as another `RawLayoutNode` tuple.
  0: number;
  1: Record<string, unknown>;
  2: RawLayoutNode[];
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === "number" ? v : fallback;
}

function decodeNode(raw: RawLayoutNode): MenuNode {
  const props = raw[1] ?? {};
  const type = asString(props.type, "standard");
  return {
    id: raw[0],
    type: type === "separator" ? "separator" : "standard",
    label: asString(props.label, ""),
    enabled: asBool(props.enabled, true),
    visible: asBool(props.visible, true),
    iconName:
      typeof props["icon-name"] === "string" &&
      (props["icon-name"] as string).length > 0
        ? (props["icon-name"] as string)
        : null,
    toggleType:
      props["toggle-type"] === "checkmark" || props["toggle-type"] === "radio"
        ? (props["toggle-type"] as "checkmark" | "radio")
        : "",
    toggleState: asNumber(props["toggle-state"], -1),
    hasSubmenu: props["children-display"] === "submenu",
    children: (raw[2] ?? []).map(decodeNode),
  };
}

// ---- Public API ------------------------------------------------------------

function getBus(): Gio.DBusConnection {
  // `bus_get_sync` returns the (singleton) session bus connection. The first
  // call connects; subsequent calls just return the cached connection — this
  // is documented in the glib source and is what every GJS app does in
  // practice. We avoid the async `bus_get` because its GJS Promise overload
  // is fragile: depending on gjs version it may bind to the callback overload
  // and throw "At least 3 arguments required".
  return Gio.bus_get_sync(Gio.BusType.SESSION, null);
}

/**
 * `Gio.DBusConnection.call()` ships both a callback-form and Promise-form
 * overload in the gir, but at runtime GJS requires the full 10-arg callback
 * form ("At least 10 arguments required, but only 9 passed"). Wrap it in a
 * real Promise ourselves rather than relying on gi's coercion.
 */
function dbusCall(
  bus: Gio.DBusConnection,
  busName: string,
  objectPath: string,
  iface: string,
  method: string,
  params: GLib.Variant,
  replyType: GLib.VariantType | null,
  timeoutMs: number,
): Promise<GLib.Variant> {
  return new Promise((resolve, reject) => {
    bus.call(
      busName,
      objectPath,
      iface,
      method,
      params,
      replyType,
      Gio.DBusCallFlags.NONE,
      timeoutMs,
      null,
      (src, res) => {
        try {
          const reply = (src as Gio.DBusConnection).call_finish(res);
          resolve(reply);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      },
    );
  });
}

/**
 * Notify the server that the subtree rooted at `parentId` is about to be
 * shown. Apps that populate their menus lazily (NetworkManager's "Available
 * Networks", Discord's per-server menus) use this as a signal to scan/fill.
 * Reply is a bool indicating whether the layout will change; we ignore it
 * because we always refetch immediately afterward anyway.
 *
 * Errors here are non-fatal — many apps reply with a D-Bus error or just
 * silently do nothing. We log at debug level.
 */
export async function aboutToShow(
  busName: string,
  objectPath: string,
  parentId: number,
): Promise<void> {
  let bus: Gio.DBusConnection;
  try {
    bus = getBus();
  } catch (err) {
    log.warn("session bus unavailable:", err);
    return;
  }
  try {
    await dbusCall(
      bus,
      busName,
      objectPath,
      IFACE,
      "AboutToShow",
      new GLib.Variant("(i)", [parentId]),
      GLib.VariantType.new("(b)"),
      2000,
    );
  } catch (err) {
    log.debug(`AboutToShow(${parentId}) failed (non-fatal):`, err);
  }
}

/**
 * Fetch a menu subtree for a tray item.
 *
 * - `busName` is the well-known D-Bus name of the tray application (e.g.
 *   `org.kde.StatusNotifierItem-1234-1`). D-Bus auto-routes to the current
 *   owner; no need to resolve the unique name ourselves.
 * - `objectPath` is `item.menu_path`.
 * - `parentId` is `0` for the root menu, or the id of an interior submenu
 *   node returned by a previous fetch.
 * - `depth` is `-1` for "unlimited", `1` for "root + immediate children",
 *   etc. For volatile menus (NetworkManager's Wi-Fi list rebuilds every
 *   scan tick) it is critical to refetch with current IDs at submenu-open
 *   time, otherwise the IDs we send back via `Event(id, "clicked")` will
 *   reference items the server has already replaced.
 *
 * Reply is `recursiveUnpack`-ed immediately into plain JS objects. After
 * this call returns we never touch the source `GVariant` again — the whole
 * point of this module (see file header).
 */
export async function fetchMenuSubtree(
  busName: string,
  objectPath: string,
  parentId: number,
  depth: number,
): Promise<MenuNode | null> {
  let bus: Gio.DBusConnection;
  try {
    bus = getBus();
  } catch (err) {
    log.warn("session bus unavailable:", err);
    return null;
  }

  // GetLayout(parentId, recursionDepth, propertyNames).
  // Reply signature: (u(ia{sv}av))  — revision + recursive layout tuple.
  let reply: GLib.Variant;
  try {
    reply = await dbusCall(
      bus,
      busName,
      objectPath,
      IFACE,
      "GetLayout",
      new GLib.Variant("(iias)", [parentId, depth, REQUESTED_PROPS]),
      GLib.VariantType.new("(u(ia{sv}av))"),
      5000,
    );
  } catch (err) {
    log.warn(
      `GetLayout(${parentId},${depth}) failed for ${busName}${objectPath}:`,
      err,
    );
    return null;
  }

  try {
    const unpacked = reply.recursiveUnpack() as [number, RawLayoutNode];
    const root = unpacked[1];
    return decodeNode(root);
  } catch (err) {
    log.warn(`GetLayout reply parse failed for ${busName}${objectPath}:`, err);
    return null;
  }
}

/**
 * Convenience: `AboutToShow(parentId)` + `fetchMenuSubtree(parentId, depth)`.
 * The two calls are sequential by design — many apps only repopulate after
 * receiving the AboutToShow ping, so a parallel `GetLayout` would race and
 * miss the new content.
 */
export async function fetchMenuLayout(
  busName: string,
  objectPath: string,
  parentId = 0,
  depth = 1,
): Promise<MenuNode | null> {
  await aboutToShow(busName, objectPath, parentId);
  return fetchMenuSubtree(busName, objectPath, parentId, depth);
}

/**
 * Send a `clicked` Event to the menu item with the given id. Used for both
 * leaf activation and toggle/radio rows (the app updates `toggle-state` and
 * emits `ItemsPropertiesUpdated`; we just refetch next open).
 *
 * Per spec, `data` is an arbitrary variant — `clicked` ignores it, so we
 * send a zero-length string for maximum compatibility. `timestamp` is the
 * X server timestamp; we don't have one in Wayland, so we send 0 which the
 * spec says is acceptable.
 */
export function sendClicked(
  busName: string,
  objectPath: string,
  id: number,
): void {
  void (async (): Promise<void> => {
    try {
      const bus = getBus();
      await dbusCall(
        bus,
        busName,
        objectPath,
        IFACE,
        "Event",
        // Signature: (isvu) = (id, eventId, data, timestamp).
        new GLib.Variant("(isvu)", [
          id,
          "clicked",
          new GLib.Variant("s", ""),
          0,
        ]),
        null,
        2000,
      );
    } catch (err) {
      // Common, not worth a warning:
      //   - "ID does not refer to a menu item we have" — server rebuilt the
      //     submenu between our GetLayout and this Event. Lazy refetch on
      //     submenu open makes this rare but not impossible (sub-ms race).
      //   - app exited, ignored the event, replied with its own error.
      log.debug(`Event(clicked,${id}) on ${busName}${objectPath} failed:`, err);
    }
  })();
}
