// jsx.ts
// Helpers that bridge gnim's JSX inference with concrete Gtk widget types.
//
// gnim's `<window>...</window>` JSX expression is typed as `Object` (the GJS
// base class) rather than `Gtk.Window`, even though it instantiates a Window
// at runtime. Tightening the JSX runtime types is upstream work; until then
// `asWindow(<window .../>)` provides a single, documented place where the
// double-cast lives instead of scattering `as unknown as Gtk.Window` across
// every site that creates a window.
import type Gtk from "gi://Gtk?version=4.0";

/**
 * Coerce a JSX-built `<window>` expression to its true `Gtk.Window` type.
 * Use this at every JSX window-construction site instead of casting inline.
 */
export function asWindow(jsx: object): Gtk.Window {
  return jsx as unknown as Gtk.Window;
}
