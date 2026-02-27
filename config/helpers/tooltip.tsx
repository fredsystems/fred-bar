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

  // Helper to clean up the update timeout
  const cleanupTimeout = () => {
    if (updateTimeoutId !== null) {
      GLib.source_remove(updateTimeoutId);
      updateTimeoutId = null;
    }
    currentLabel = null;
  };

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
        // Clean up timeout if tooltip won't be shown
        cleanupTimeout();
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

      // Set up live updating if interval is specified.
      // Uses self-scheduling (SOURCE_REMOVE + manual reschedule) rather than
      // SOURCE_CONTINUE to avoid the GLib "catch-up cascade" after system sleep:
      // a SOURCE_CONTINUE timer reschedules from its *last* fire time, so after
      // a long sleep GLib would rapid-fire many callbacks before the event loop
      // can handle any input. With SOURCE_REMOVE we always reschedule from *now*.
      if (opts.updateInterval && opts.updateInterval > 0) {
        if (updateTimeoutId !== null) {
          GLib.source_remove(updateTimeoutId);
        }

        const scheduleTooltipUpdate = () => {
          updateTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            opts.updateInterval!,
            () => {
              updateTimeoutId = null;
              if (currentLabel) {
                const newText = opts.text();
                currentLabel.set_label(newText);
                scheduleTooltipUpdate();
              }
              return GLib.SOURCE_REMOVE;
            },
          );
        };

        scheduleTooltipUpdate();
      }

      return true;
    },
  );

  // Listen for when tooltip is hidden to clean up timer
  const motionController = new Gtk.EventControllerMotion();
  motionController.connect("leave", cleanupTimeout);
  anchor.add_controller(motionController);

  // Also listen for notify::has-tooltip changes (when tooltip is programmatically hidden)
  const tooltipNotifyHandler = anchor.connect("notify::has-tooltip", () => {
    if (!anchor.has_tooltip) {
      cleanupTimeout();
    }
  });

  // Cleanup chaining
  (anchor as CleanupWidget)._cleanup = (() => {
    const prev = (anchor as CleanupWidget)._cleanup;
    return () => {
      cleanupTimeout();
      anchor.disconnect(handlerId);
      anchor.disconnect(tooltipNotifyHandler);
      prev?.();
    };
  })();
}
