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

  // Cached tooltip widget tree. GTK fires `query-tooltip` on every mouse-move
  // event while a widget has has_tooltip=true (and on the periodic re-query
  // it does for keyboard-triggered tooltips). The previous implementation
  // allocated a fresh Frame + Box + Label on every callback — visible as
  // jank when sliding the mouse across the bar. We build the tree once on
  // first show and only update the label text on subsequent queries.
  //
  // The cached widgets are owned by the GtkTooltip via set_custom(), which
  // reparents them; calling set_custom(frame) again with the same instance
  // is a no-op-ish reparent that GTK handles cleanly. The css class list
  // is recomputed each query because callers (e.g. battery, network) can
  // change `classes()` based on state.
  let cachedFrame: Gtk.Frame | null = null;
  let cachedLabel: Gtk.Label | null = null;
  let cachedClasses: string[] = [];
  let updateTimeoutId: number | null = null;

  // Helper to clean up the update timeout
  const cleanupTimeout = () => {
    if (updateTimeoutId !== null) {
      GLib.source_remove(updateTimeoutId);
      updateTimeoutId = null;
    }
  };

  // Compute the desired css class list from the user-supplied callback.
  // Mirrors the original branch logic so visuals are unchanged.
  const computeClasses = (): string[] => {
    const cls = opts.classes?.();
    if (!cls) return ["state-idle-tooltip"];
    const list = Array.isArray(cls) ? cls : [cls];
    if (list.length === 0) return ["state-idle-tooltip"];
    return list.map((c) => `${c}-tooltip`);
  };

  // Apply a class list to the frame, diffing against the previous list so
  // we only touch GTK when something actually changed (add_css_class /
  // remove_css_class each take the style-context lock).
  const applyClasses = (frame: Gtk.Frame, next: string[]): void => {
    if (
      cachedClasses.length === next.length &&
      cachedClasses.every((c, i) => c === next[i])
    ) {
      return;
    }
    for (const c of cachedClasses) frame.remove_css_class(c);
    for (const c of next) frame.add_css_class(c);
    cachedClasses = next;
  };

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

      // Build the widget tree on first show, reuse it thereafter.
      if (!cachedFrame || !cachedLabel) {
        const label = new Gtk.Label({
          label: text,
          wrap: true,
          xalign: 0,
          use_markup: true,
        });

        const body = new Gtk.Box({
          orientation: Gtk.Orientation.VERTICAL,
          css_classes: ["tooltip-body"],
        });
        body.append(label);

        const frame = new Gtk.Frame({
          css_classes: ["tooltip-frame"],
        });
        frame.set_child(body);

        cachedFrame = frame;
        cachedLabel = label;
      } else if (cachedLabel.get_label() !== text) {
        cachedLabel.set_label(text);
      }

      applyClasses(cachedFrame, computeClasses());
      tooltip.set_custom(cachedFrame);

      // Set up live updating if interval is specified.
      // Uses self-scheduling (SOURCE_REMOVE + manual reschedule) rather than
      // SOURCE_CONTINUE to avoid the GLib "catch-up cascade" after system sleep:
      // a SOURCE_CONTINUE timer reschedules from its *last* fire time, so after
      // a long sleep GLib would rapid-fire many callbacks before the event loop
      // can handle any input. With SOURCE_REMOVE we always reschedule from *now*.
      if (opts.updateInterval && opts.updateInterval > 0) {
        cleanupTimeout();

        const scheduleTooltipUpdate = () => {
          updateTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            opts.updateInterval!,
            () => {
              updateTimeoutId = null;
              if (cachedLabel) {
                const newText = opts.text();
                if (cachedLabel.get_label() !== newText) {
                  cachedLabel.set_label(newText);
                }
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
      // Drop our cached refs so GC can reclaim the widgets once the
      // GtkTooltip releases them. We don't unparent — the tooltip owns
      // the tree after set_custom() and will tear it down on its own
      // lifecycle when the anchor is destroyed.
      cachedFrame = null;
      cachedLabel = null;
      cachedClasses = [];
      prev?.();
    };
  })();
}
