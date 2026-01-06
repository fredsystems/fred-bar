// window-manager.tsx
// Service to manage exclusive popup windows (sidebar, time-pill, etc.)
// Ensures only one popup window is visible at a time

import type Gtk from "gi://Gtk?version=4.0";

class WindowManager {
  private windows: Map<string, Gtk.Window> = new Map();
  private currentlyVisible: string | null = null;
  private isUpdating = false; // Prevent recursive updates
  private deactivateCallbacks: Map<string, () => void> = new Map();

  /**
   * Register a window to be managed
   */
  public register(
    name: string,
    window: Gtk.Window,
    onDeactivate?: () => void,
  ): void {
    this.windows.set(name, window);

    if (onDeactivate) {
      this.deactivateCallbacks.set(name, onDeactivate);
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
      console.warn(`Window ${name} not registered with WindowManager`);
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
      console.warn(`Window ${name} not registered with WindowManager`);
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
