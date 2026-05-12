/**
 * Hand-rolled tray-menu builder.
 *
 * Why this exists: see `./dbusmenu.tsx` and `AUDIT.md` C-1.16. Briefly:
 * neither `Gtk.PopoverMenu.new_from_model(item.menu_model)` nor a hand-rolled
 * walk of `item.menu_model` is safe — both crash inside glib when
 * appmenu-glib-translator mutates the model concurrently (which it does in
 * response to `LayoutUpdated` DBus signals from the tray app).
 *
 * This module builds the popover widget tree from a `MenuNode` produced by
 * `dbusmenu.fetchMenuLayout()` — pure JS data, no GLib pointers retained.
 * Click handlers dispatch via `dbusmenu.sendClicked()` over D-Bus directly.
 */

import GLib from "gi://GLib";
import Gtk from "gi://Gtk?version=4.0";
import { fetchMenuLayout, type MenuNode, sendClicked } from "./dbusmenu";

// ---- Helpers ---------------------------------------------------------------

/**
 * Remove the first un-escaped `_` from a dbusmenu label string (the mnemonic
 * marker), and collapse `__` → `_` (the literal underscore escape).
 */
function stripMnemonic(s: string): string {
  let out = "";
  let mnemonicRemoved = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "_") {
      if (s[i + 1] === "_") {
        out += "_";
        i++;
        continue;
      }
      if (!mnemonicRemoved) {
        mnemonicRemoved = true;
        continue;
      }
    }
    out += c;
  }
  return out;
}

type TrailingGlyph = "check" | "radio-on" | "radio-off" | "submenu" | null;

function trailingFor(node: MenuNode): TrailingGlyph {
  if (node.hasSubmenu) return "submenu";
  if (node.toggleType === "checkmark") {
    return node.toggleState === 1 ? "check" : null;
  }
  if (node.toggleType === "radio") {
    return node.toggleState === 1 ? "radio-on" : "radio-off";
  }
  return null;
}

function trailingIconName(glyph: Exclude<TrailingGlyph, null>): string {
  switch (glyph) {
    case "check":
      return "object-select-symbolic";
    case "radio-on":
      return "radio-checked-symbolic";
    case "radio-off":
      return "radio-symbolic";
    case "submenu":
      return "go-next-symbolic";
  }
}

function makeRowContent(node: MenuNode, glyph: TrailingGlyph): Gtk.Widget {
  const row = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 8,
    css_classes: ["tray-menu-row"],
  });

  if (node.iconName) {
    row.append(
      new Gtk.Image({
        icon_name: node.iconName,
        pixel_size: 16,
        css_classes: ["tray-menu-icon"],
      }),
    );
  }

  row.append(
    new Gtk.Label({
      label: stripMnemonic(node.label),
      halign: Gtk.Align.START,
      hexpand: true,
      css_classes: ["tray-menu-label"],
    }),
  );

  if (glyph) {
    row.append(
      new Gtk.Image({
        icon_name: trailingIconName(glyph),
        pixel_size: 12,
        css_classes: ["tray-menu-trailing"],
      }),
    );
  }

  return row;
}

// ---- Widget construction ---------------------------------------------------

function buildLeafRow(
  node: MenuNode,
  busName: string,
  objectPath: string,
  close: () => void,
): Gtk.Widget {
  const button = new Gtk.Button({
    css_classes: ["tray-menu-item", "flat"],
    sensitive: node.enabled,
    child: makeRowContent(node, trailingFor(node)),
  });

  button.connect("clicked", () => {
    sendClicked(busName, objectPath, node.id);
    close();
  });

  return button;
}

function buildSubmenuRow(
  node: MenuNode,
  busName: string,
  objectPath: string,
  rootClose: () => void,
  /**
   * Holder owned by the parent popover. We use it to enforce "only one
   * submenu open per parent": when a submenu-row is clicked, it closes
   * whatever submenu the parent is currently showing (if any) before
   * opening its own. Set to `null` on close so subsequent clicks know
   * there's no open submenu.
   */
  openChildHolder: { popover: Gtk.Popover | null; owner: Gtk.Widget | null },
): Gtk.Widget {
  const button = new Gtk.Button({
    css_classes: ["tray-menu-item", "tray-menu-submenu", "flat"],
    sensitive: node.enabled,
    child: makeRowContent(node, "submenu"),
  });

  // We never reuse a child popover: many tray apps (NetworkManager being the
  // worst offender) rebuild submenu subtrees with fresh IDs every few seconds
  // as their backend state changes. If we cached the popover from the first
  // click, the IDs in its rows would be stale by the second open, and
  // `Event(clicked, id)` would return "ID does not refer to a menu item we
  // have" — the action would silently do nothing.
  //
  // Instead, on every click we:
  //   1. AboutToShow(node.id)  — let the app populate.
  //   2. GetLayout(node.id, -1) — fetch the fresh subtree with current IDs.
  //   3. Build a new popover from the result and pop it up.
  //   4. On close, unparent on idle (mirrors root-popover lifecycle).
  let inFlight = false;

  button.connect("clicked", () => {
    if (inFlight) return;

    // Toggle: if our submenu is the one currently open, close it.
    if (openChildHolder.owner === button && openChildHolder.popover) {
      try {
        openChildHolder.popover.popdown();
      } catch {
        /* ignore */
      }
      return;
    }

    // Replace: a different submenu is open — close it first.
    if (openChildHolder.popover) {
      try {
        openChildHolder.popover.popdown();
      } catch {
        /* ignore */
      }
      openChildHolder.popover = null;
      openChildHolder.owner = null;
    }

    inFlight = true;

    fetchMenuLayout(busName, objectPath, node.id, -1)
      .then((subtree) => {
        inFlight = false;
        if (!subtree) return;
        const child = buildPopoverFromNode(
          subtree,
          busName,
          objectPath,
          rootClose,
        );
        child.set_parent(button);
        child.set_position(Gtk.PositionType.RIGHT);
        child.set_has_arrow(false);
        // Submenus inherit autohide:false from buildPopoverFromNode. Taking
        // a Wayland popup grab here would consume clicks on sibling tray
        // buttons (the click would arrive as popup_done on the submenu's
        // surface, never reaching the other tray button). Outside-the-submenu
        // dismissal is driven instead by:
        //   - bar-level capture gate in app.tsx (clicks on the bar)
        //   - rootClose chain from leaf-row activation (closes ancestors)
        //   - the parent popover's openChildHolder (clicking another
        //     submenu-row in the parent closes this one)
        openChildHolder.popover = child;
        openChildHolder.owner = button;
        child.connect("closed", () => {
          if (openChildHolder.popover === child) {
            openChildHolder.popover = null;
            openChildHolder.owner = null;
          }
          GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            try {
              child.unparent();
            } catch {
              /* ignore */
            }
            return GLib.SOURCE_REMOVE;
          });
        });
        child.popup();
      })
      .catch(() => {
        inFlight = false;
      });
  });

  return button;
}

/**
 * Build a popover containing the children of `parent`. Separators between
 * children with type=="separator" are rendered as `Gtk.Separator`.
 */
function buildPopoverFromNode(
  parent: MenuNode,
  busName: string,
  objectPath: string,
  rootClose: () => void,
): Gtk.Popover {
  // autohide:false on the root popover so it doesn't take a Wayland popup
  // grab. With a grab, clicking another tray icon while this menu is open
  // sends `popup_done` to this surface and *consumes* the click — the second
  // tray button never sees the press. With autohide:false, the click reaches
  // the bar normally, and `tray-item.tsx` / bar-level handlers close the
  // open popover and open the new one. Submenus also inherit this so they
  // don't shadow sibling tray buttons either.
  const popover = new Gtk.Popover({
    has_arrow: false,
    autohide: false,
    css_classes: ["tray-menu"],
  });

  // Each popover owns one "open submenu" slot. Submenu rows mutate this to
  // enforce single-open-per-parent without a Wayland grab. See buildSubmenuRow.
  const openChildHolder: {
    popover: Gtk.Popover | null;
    owner: Gtk.Widget | null;
  } = { popover: null, owner: null };

  const box = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 0,
    css_classes: ["tray-menu-box"],
  });

  for (const child of parent.children) {
    if (!child.visible) continue;

    if (child.type === "separator") {
      box.append(
        new Gtk.Separator({
          orientation: Gtk.Orientation.HORIZONTAL,
          css_classes: ["tray-menu-separator"],
        }),
      );
      continue;
    }

    if (child.hasSubmenu) {
      box.append(
        buildSubmenuRow(child, busName, objectPath, rootClose, openChildHolder),
      );
    } else {
      box.append(buildLeafRow(child, busName, objectPath, rootClose));
    }
  }

  popover.set_child(box);
  return popover;
}

// ---- Public entry point ----------------------------------------------------

/**
 * Build a fresh tray menu popover from a decoded layout root.
 *
 * The popover is unparented; callers must `set_parent()` it before calling
 * `popup()`. Caller is also responsible for `unparent()` on close (we do
 * this on idle in `tray-item.tsx`).
 *
 * `root` is the top-level `MenuNode` returned by `fetchMenuLayout`. Its
 * `children` become the rows of the popover; the root node itself is never
 * rendered.
 */
export function buildTrayMenu(
  root: MenuNode,
  busName: string,
  objectPath: string,
): Gtk.Popover {
  // Mutable holder to break the cycle: child rows reference `rootClose`,
  // but `rootClose` needs to refer to the popover we're about to build.
  const holder: { popover: Gtk.Popover | null } = { popover: null };
  const rootClose = (): void => {
    try {
      holder.popover?.popdown();
    } catch {
      /* ignore */
    }
  };

  const popover = buildPopoverFromNode(root, busName, objectPath, rootClose);
  holder.popover = popover;
  return popover;
}
