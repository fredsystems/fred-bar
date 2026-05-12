import type Gtk from "gi://Gtk?version=4.0";
import { createLogger } from "./logger";

const log = createLogger("Cleanup");

/* -----------------------------
 * Widget cleanup lifecycle
 *
 * The fred-bar code-base uses a `widget._cleanup = () => { ... }` convention
 * to release per-widget resources (signal handlers, GLib timeouts, service
 * subscriptions, GIO bindings) that GTK won't free on its own.
 *
 * Historically these cleanups only ran when `app.tsx`'s recursiveCleanup
 * walked the tree (window destroy). Mid-lifetime removals — e.g. a
 * tray-item being torn down while the bar stays up, or a media-player
 * player widget being swapped — required manual walks at every removal
 * site, and were easy to forget.
 *
 * This module makes `_cleanup` self-driving: each registered cleanup is
 * also bound to GTK's `destroy` signal, so it fires automatically whenever
 * the widget finalises — regardless of whether the recursive walker ran.
 * The walker stays as a defensive belt-and-suspenders on window destroy
 * (so e.g. cleanup runs even if a child somehow escapes destroy emission).
 *
 * Registrations chain: calling registerCleanup() twice on the same widget
 * stacks both cleanups (older runs after newer, mirroring the existing
 * convention in helpers/tooltip.tsx).
 * ----------------------------- */

export type CleanupFn = () => void;
type CleanupWidget = Gtk.Widget & {
  _cleanup?: CleanupFn;
  _cleanupBound?: boolean;
};

/**
 * Register a cleanup callback on a widget. Runs:
 *   1. when GTK emits "destroy" on the widget (automatic), AND
 *   2. when something explicitly invokes `widget._cleanup()` (e.g. the
 *      recursive walker in app.tsx, or a manual removal site).
 *
 * The cleanup runs at most once per registration: after invocation the
 * stored hook is replaced with a no-op, so the destroy signal firing later
 * doesn't double-fire the same logic.
 */
export function registerCleanup(widget: Gtk.Widget, fn: CleanupFn): void {
  const w = widget as CleanupWidget;
  const prev = w._cleanup;

  let done = false;
  const runOnce: CleanupFn = () => {
    if (done) return;
    done = true;
    try {
      fn();
    } catch (e) {
      log.error("cleanup callback threw:", e);
    }
    if (prev) {
      try {
        prev();
      } catch (e) {
        log.error("chained cleanup callback threw:", e);
      }
    }
  };

  w._cleanup = runOnce;

  // Bind to destroy only the first time we register on this widget. Once
  // bound, the bound handler will invoke whatever `_cleanup` currently
  // holds — which, thanks to chaining above, is always the most-recent
  // registration that wraps all previous ones.
  if (!w._cleanupBound) {
    w._cleanupBound = true;
    widget.connect("destroy", () => {
      const current = (widget as CleanupWidget)._cleanup;
      if (current) current();
    });
  }
}
