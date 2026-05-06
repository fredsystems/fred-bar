// window-manager.tsx
// Service to manage exclusive popup windows (sidebar, time-pill, etc.)
// Ensures only one popup window is visible at a time

import type Gtk from "gi://Gtk?version=4.0";
import { createLogger } from "helpers/logger";

const log = createLogger("WindowManager");

class WindowManager {
  private windows: Map<string, Gtk.Window> = new Map();
  private currentlyVisible: string | null = null;
  private isUpdating = false; // Prevent recursive updates
  private deactivateCallbacks: Map<string, () => void> = new Map();
  // Owner widget for each managed window. Used by the bar-level click gate to
  // distinguish "click on the pill that owns the open panel" (let pill toggle
  // close it) from "click somewhere else in the bar" (force-dismiss).
  private owners: Map<string, Gtk.Widget> = new Map();

  /**
   * Register a window to be managed.
   *
   * @param owner Optional widget that "owns" this window (e.g. the pill button
   *   that opens it). When set, `isOwnerOfVisible` can detect whether a click
   *   target is inside that owner's subtree, so the bar-level dismiss gate can
   *   skip dismissal and let the owner's own toggle handler run.
   */
  public register(
    name: string,
    window: Gtk.Window,
    onDeactivate?: () => void,
    owner?: Gtk.Widget,
  ): void {
    this.windows.set(name, window);

    if (onDeactivate) {
      this.deactivateCallbacks.set(name, onDeactivate);
    }

    if (owner) {
      this.owners.set(name, owner);
    }

    // Connect to visibility changes to track state
    window.connect("notify::visible", () => {
      if (this.isUpdating) return; // Skip if we're the ones changing visibility

      if (window.visible) {
        this.onWindowShown(name);
      } else {
        this.onWindowHidden(name);
      }
    });
  }

  /**
   * Unregister a window from management
   */
  public unregister(name: string): void {
    this.windows.delete(name);
    this.deactivateCallbacks.delete(name);
    this.owners.delete(name);
    if (this.currentlyVisible === name) {
      this.currentlyVisible = null;
    }
  }

  /**
   * Show a window and hide all others
   */
  public show(name: string): void {
    const window = this.windows.get(name);
    if (!window) {
      log.warn(`Window ${name} not registered`);
      return;
    }

    // Already visible, nothing to do
    if (window.visible && this.currentlyVisible === name) {
      return;
    }

    this.isUpdating = true;

    try {
      // Notify and close all other windows first
      for (const [otherName, otherWindow] of this.windows.entries()) {
        if (otherName !== name) {
          // Notify the window it's being deactivated
          const callback = this.deactivateCallbacks.get(otherName);
          if (callback) {
            callback();
          }

          // Close if visible
          if (otherWindow.visible) {
            otherWindow.visible = false;
          }
        }
      }

      // Show the requested window
      window.visible = true;
      this.currentlyVisible = name;
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * Hide a specific window
   */
  public hide(name: string): void {
    const window = this.windows.get(name);
    if (!window) {
      return;
    }

    if (!window.visible) {
      return; // Already hidden
    }

    this.isUpdating = true;

    try {
      window.visible = false;
      if (this.currentlyVisible === name) {
        this.currentlyVisible = null;
      }
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * Hide all windows except the specified one
   */
  public hideAll(except?: string): void {
    this.isUpdating = true;

    try {
      for (const [name, window] of this.windows.entries()) {
        if (name !== except && window.visible) {
          window.visible = false;
        }
      }

      if (!except || !this.windows.has(except)) {
        this.currentlyVisible = null;
      }
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * Toggle a window's visibility
   */
  public toggle(name: string): void {
    const window = this.windows.get(name);
    if (!window) {
      log.warn(`Window ${name} not registered`);
      return;
    }

    if (window.visible) {
      this.hide(name);
    } else {
      this.show(name);
    }
  }

  /**
   * Check if a window is currently visible
   */
  public isVisible(name: string): boolean {
    const window = this.windows.get(name);
    return window?.visible ?? false;
  }

  /**
   * Get the name of the currently visible window, if any
   */
  public getCurrentlyVisible(): string | null {
    return this.currentlyVisible;
  }

  /**
   * Returns true if `widget` is the registered owner of the currently-visible
   * window, or a descendant of it. Walks the parent chain via `get_parent()`.
   * Used by the bar-level click gate to skip dismissal when the click target
   * belongs to the pill that opened the open panel.
   */
  public isOwnerOfVisible(widget: Gtk.Widget | null): boolean {
    if (!widget || !this.currentlyVisible) return false;
    const owner = this.owners.get(this.currentlyVisible);
    if (!owner) return false;

    let node: Gtk.Widget | null = widget;
    while (node) {
      if (node === owner) return true;
      node = node.get_parent();
    }
    return false;
  }

  /**
   * Set the owner widget for an already-registered window. Useful when the
   * window is registered in one place (e.g. sidebar/panel.tsx) but the owner
   * widget (e.g. the state-pill button) is created elsewhere and only
   * knowable later. Idempotent; overwrites any prior owner.
   */
  public setOwner(name: string, owner: Gtk.Widget): void {
    if (!this.windows.has(name)) {
      // Window not registered yet (or already unregistered); silently no-op.
      // Caller is expected to call this after the window is registered.
      return;
    }
    this.owners.set(name, owner);
  }

  /**
   * Internal handler when a window is shown (by external means)
   */
  private onWindowShown(name: string): void {
    // Hide other windows when this one is shown externally
    this.isUpdating = true;

    try {
      for (const [otherName, otherWindow] of this.windows.entries()) {
        if (otherName !== name) {
          // Notify the window it's being deactivated
          const callback = this.deactivateCallbacks.get(otherName);
          if (callback) {
            callback();
          }

          // Close if visible
          if (otherWindow.visible) {
            otherWindow.visible = false;
          }
        }
      }

      this.currentlyVisible = name;
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * Internal handler when a window is hidden (by external means)
   */
  private onWindowHidden(name: string): void {
    if (this.currentlyVisible === name) {
      this.currentlyVisible = null;
    }
  }
}

// Singleton instance
let instance: WindowManager | null = null;

/**
 * Get the window manager singleton
 */
export function getWindowManager(): WindowManager {
  if (!instance) {
    instance = new WindowManager();
  }
  return instance;
}
