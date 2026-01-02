import GLib from "gi://GLib?version=2.0";
import Gtk from "gi://Gtk?version=4.0";

type CleanupWidget = Gtk.Widget & { _cleanup?: () => void };

interface TooltipOptions {
  text: () => string;
  classes?: () => string[] | string | null;
  updateInterval?: number; // milliseconds, if set will update tooltip periodically
}

export function attachTooltip(anchor: Gtk.Widget, opts: TooltipOptions): void {
  anchor.has_tooltip = true;

  let currentLabel: Gtk.Label | null = null;
  let updateTimeoutId: number | null = null;

  // FIXME: Cache because we have to regenerate this a fair bit on mouse move
  const handlerId = anchor.connect(
    "query-tooltip",
    (
      _widget: Gtk.Widget,
      _x: number,
      _y: number,
      _keyboardMode: boolean,
      tooltip: Gtk.Tooltip,
    ) => {
      const text = opts.text();
      if (!text || text.length === 0) {
        return false;
      }

      // --- CREATE FRESH WIDGETS EVERY TIME ---
      const label = new Gtk.Label({
        label: text,
        wrap: true,
        xalign: 0,
        use_markup: true,
      });

      currentLabel = label;

      const body = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        css_classes: ["tooltip-body"],
      });
      body.append(label);

      const frame = new Gtk.Frame({
        css_classes: ["tooltip-frame"],
      });

      const cls = opts.classes?.();
      if (cls) {
        const list = Array.isArray(cls) ? cls : [cls];
        if (list.length === 0) {
          frame.add_css_class("state-idle-tooltip");
        } else {
          for (const c of list) {
            frame.add_css_class(`${c}-tooltip`);
          }
        }
      } else {
        frame.add_css_class("state-idle-tooltip");
      }

      frame.set_child(body);
      tooltip.set_custom(frame);

      // Set up live updating if interval is specified
      if (opts.updateInterval && opts.updateInterval > 0) {
        if (updateTimeoutId !== null) {
          GLib.source_remove(updateTimeoutId);
        }

        updateTimeoutId = GLib.timeout_add(
          GLib.PRIORITY_DEFAULT,
          opts.updateInterval,
          () => {
            if (currentLabel) {
              const newText = opts.text();
              currentLabel.set_label(newText);
              return GLib.SOURCE_CONTINUE;
            }
            updateTimeoutId = null;
            return GLib.SOURCE_REMOVE;
          },
        );
      }

      return true;
    },
  );

  // Listen for when tooltip is hidden to clean up timer
  const motionController = new Gtk.EventControllerMotion();
  motionController.connect("leave", () => {
    if (updateTimeoutId !== null) {
      GLib.source_remove(updateTimeoutId);
      updateTimeoutId = null;
    }
    currentLabel = null;
  });
  anchor.add_controller(motionController);

  // Cleanup chaining
  (anchor as CleanupWidget)._cleanup = (() => {
    const prev = (anchor as CleanupWidget)._cleanup;
    return () => {
      if (updateTimeoutId !== null) {
        GLib.source_remove(updateTimeoutId);
      }
      anchor.disconnect(handlerId);
      prev?.();
    };
  })();
}
