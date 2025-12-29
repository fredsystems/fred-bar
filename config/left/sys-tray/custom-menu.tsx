import type Gio from "gi://Gio";
import type GLib from "gi://GLib";
import Gtk from "gi://Gtk?version=4.0";

/**
 * Custom menu builder that parses GMenuModel and creates a proper GTK widget tree
 * This avoids the height constraints and scrolling issues of Gtk.PopoverMenu
 */

interface MenuItem {
  label: string;
  action?: string;
  target?: GLib.Variant;
  submenu?: MenuItem[];
  section?: MenuItem[];
  isSeparator?: boolean;
}

interface MenuStack {
  items: MenuItem[];
  title: string;
}

/**
 * Recursively parse a GMenuModel into our MenuItem structure
 */
function parseMenuModel(model: Gio.MenuModel): MenuItem[] {
  const items: MenuItem[] = [];
  const itemCount = model.get_n_items();

  for (let i = 0; i < itemCount; i++) {
    const item: MenuItem = { label: "" };

    // Get label
    const labelVariant = model.get_item_attribute_value(
      i,
      "label",
      null,
    ) as GLib.Variant | null;
    if (labelVariant) {
      item.label = labelVariant.get_string()[0] || "";
    }

    // Get action
    const actionVariant = model.get_item_attribute_value(
      i,
      "action",
      null,
    ) as GLib.Variant | null;
    if (actionVariant) {
      item.action = actionVariant.get_string()[0] || undefined;
    }

    // Get target (for parameterized actions)
    const targetVariant = model.get_item_attribute_value(
      i,
      "target",
      null,
    ) as GLib.Variant | null;
    if (targetVariant) {
      item.target = targetVariant;
    }

    // Check for submenu
    const submenuModel = model.get_item_link(i, "submenu");
    if (submenuModel) {
      item.submenu = parseMenuModel(submenuModel);
    }

    // Check for section
    const sectionModel = model.get_item_link(i, "section");
    if (sectionModel) {
      item.section = parseMenuModel(sectionModel);
    }

    // If no label and no submenu, it's likely a separator
    if (!item.label && !item.submenu && !item.section) {
      item.isSeparator = true;
    }

    items.push(item);
  }

  return items;
}

/**
 * Create a GTK button for a menu item
 */
function createMenuButton(
  item: MenuItem,
  actionGroup: Gio.ActionGroup | null,
  onClose: () => void,
  onNavigateToSubmenu: (submenu: MenuItem[], title: string) => void,
  isFirst: boolean = false,
  isLast: boolean = false,
): Gtk.Widget {
  if (item.isSeparator) {
    const sep = new Gtk.Box({
      css_classes: ["menu-separator"],
      height_request: 1,
    });
    sep.set_visible(true);
    return sep;
  }

  if (item.section) {
    // Sections are containers - render their children
    const box = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 0,
      margin_top: 0,
      margin_bottom: 0,
    });

    let hasSeparator = false;

    // If section has no label, add a separator before the section items
    // Skip separator for first item (top of menu) and last item (bottom of menu)
    if ((!item.label || item.label.trim() === "") && !isFirst && !isLast) {
      const sep = new Gtk.Box({
        css_classes: ["menu-separator"],
        height_request: 1,
      });
      sep.set_visible(true);
      box.append(sep);
      hasSeparator = true;
    }

    for (const child of item.section) {
      box.append(
        createMenuButton(
          child,
          actionGroup,
          onClose,
          onNavigateToSubmenu,
          false,
          false,
        ),
      );
    }

    // Only return box if it has content (separator or children)
    // This prevents empty boxes from being added
    if (hasSeparator || item.section.length > 0) {
      return box;
    }

    // Return empty box that won't be appended
    return new Gtk.Box();
  }

  // Remove mnemonics (underscores used for keyboard shortcuts)
  const displayLabel = item.label.replace(/_/g, "");

  const label = new Gtk.Label({
    label: displayLabel,
    xalign: 0, // Left align
    hexpand: true,
  });

  const button = new Gtk.Button({
    child: label,
    css_classes: item.submenu
      ? ["menu-item", "menu-item-submenu"]
      : ["menu-item"],
    halign: Gtk.Align.FILL,
  });

  // Handle submenus
  if (item.submenu) {
    label.set_label(`${displayLabel} ›`);

    button.connect("clicked", () => {
      if (item.submenu) {
        onNavigateToSubmenu(item.submenu, displayLabel);
      }
    });
  }
  // Handle regular actions
  else if (item.action && actionGroup) {
    button.connect("clicked", () => {
      try {
        if (item.action) {
          if (item.target) {
            actionGroup.activate_action(item.action, item.target);
          } else {
            actionGroup.activate_action(item.action, null);
          }
        }
        onClose();
      } catch (e) {
        console.error("Failed to activate action:", item.action, e);
      }
    });
  }

  return button;
}

/**
 * Build menu content from items
 */
function buildMenuContent(
  items: MenuItem[],
  actionGroup: Gio.ActionGroup | null,
  onClose: () => void,
  onNavigateToSubmenu: (submenu: MenuItem[], title: string) => void,
): Gtk.Box {
  const box = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 0,
    css_classes: ["custom-menu-box"],
  });

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isFirst = i === 0;
    const isLast = i === items.length - 1;
    const widget = createMenuButton(
      item,
      actionGroup,
      onClose,
      onNavigateToSubmenu,
      isFirst,
      isLast,
    );
    box.append(widget);
  }

  return box;
}

/**
 * Build a custom menu popover from a GMenuModel
 */
export function buildCustomMenu(
  menuModel: Gio.MenuModel,
  actionGroup: Gio.ActionGroup | null,
  parent: Gtk.Widget,
): Gtk.Popover {
  const rootItems = parseMenuModel(menuModel);
  const menuStack: MenuStack[] = [{ items: rootItems, title: "Menu" }];
  let isNavigating = false; // Flag to prevent stack reset during navigation

  // Use a stack for animated transitions
  const stack = new Gtk.Stack({
    transition_type: Gtk.StackTransitionType.SLIDE_LEFT_RIGHT,
    transition_duration: 200, // 200ms animation
    hhomogeneous: false, // Allow different widths
    vhomogeneous: false, // Allow different heights
  });

  // Create a scrolled window for the menu content
  const scrolled = new Gtk.ScrolledWindow({
    hscrollbar_policy: Gtk.PolicyType.NEVER,
    vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
    propagate_natural_height: true,
    propagate_natural_width: true,
    max_content_height: 800, // Max height before scrolling
    child: stack,
  });

  const popover = new Gtk.Popover({
    child: scrolled,
    has_arrow: false,
    css_classes: ["custom-menu"],
  });

  popover.set_parent(parent);

  let pageCounter = 0; // Counter for unique page names

  const onClose = () => {
    popover.popdown();
  };

  const onNavigateToSubmenu = (submenu: MenuItem[], title: string) => {
    menuStack.push({ items: submenu, title });
    render();
  };

  const onNavigateBack = () => {
    if (menuStack.length > 1) {
      menuStack.pop();
      render();
    }
  };

  const render = () => {
    const current = menuStack[menuStack.length - 1];
    const container = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 0,
    });

    // Add back button if not at root
    if (menuStack.length > 1) {
      const backButton = new Gtk.Button({
        css_classes: ["menu-item", "menu-back"],
        halign: Gtk.Align.FILL,
      });

      const backLabel = new Gtk.Label({
        label: `‹ ${current.title}`,
        xalign: 0,
        hexpand: true,
      });

      backButton.set_child(backLabel);
      backButton.connect("clicked", onNavigateBack);

      container.append(backButton);
    }

    // Add menu items
    const menuBox = buildMenuContent(
      current.items,
      actionGroup,
      onClose,
      onNavigateToSubmenu,
    );
    container.append(menuBox);

    // Add to stack with animation
    const pageName = `page-${pageCounter++}`;
    stack.add_named(container, pageName);
    stack.set_visible_child_name(pageName);

    // Clean up old pages (keep only current and previous for back animation)
    const children = [];
    let child = stack.get_first_child();
    while (child) {
      children.push(child);
      child = child.get_next_sibling();
    }

    // Remove all but the last 2 pages
    if (children.length > 2) {
      for (let i = 0; i < children.length - 2; i++) {
        stack.remove(children[i]);
      }
    }

    // Force popover to reposition after size change
    const wasVisible = popover.get_visible();
    if (wasVisible) {
      isNavigating = true;
      popover.hide();
      setTimeout(() => {
        popover.popup();
        // Clear flag after animation completes
        setTimeout(() => {
          isNavigating = false;
        }, 250); // Slightly longer than transition duration
      }, 1);
    }
  };

  // Reset stack when popover closes (but not during navigation)
  popover.connect("closed", () => {
    if (!isNavigating) {
      menuStack.length = 1;
    }
  });

  render();

  return popover;
}
