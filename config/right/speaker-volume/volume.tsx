import Gdk from "gi://Gdk?version=4.0";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Gtk from "gi://Gtk?version=4.0";

import { createPoll } from "ags/time";
import { scriptPath } from "resolvescripts";
import { attachTooltip } from "tooltip";

const SCRIPT = scriptPath("volume.sh");

const ICONS = ["󰝟", "", "", ""];

type VolumeValue = number | "Muted";

function getIcon(volume: VolumeValue): string {
  if (volume === "Muted") return ICONS[0];
  if (volume <= 20) return ICONS[1];
  if (volume <= 60) return ICONS[2];
  if (volume <= 80) return ICONS[3];
  return ICONS[ICONS.length - 1];
}

interface VolumePayload {
  volume: VolumeValue;
  sink: string;
}

function parseOutput(stdout: string): VolumePayload | null {
  const lines = stdout.trim().split("\n");
  if (lines.length < 2) return null;

  const rawVolume = lines[0]?.trim() ?? "";
  const sink = lines[1]?.trim() ?? "";

  const volume: VolumeValue =
    rawVolume === "Muted" ? "Muted" : Number(rawVolume);

  if (volume !== "Muted" && Number.isNaN(volume)) return null;

  return { volume, sink };
}

const CMD = `${SCRIPT} --get-bar && ${SCRIPT} --get-sink-name`;

/* -----------------------------
 * Volume state (poll-only)
 * ----------------------------- */
export const volumeState = createPoll<VolumePayload | null>(
  null,
  1500,
  ["bash", "-lc", CMD],
  (stdout: string): VolumePayload | null => {
    try {
      return parseOutput(stdout);
    } catch {
      return null;
    }
  },
);

// Start polling immediately
volumeState.subscribe(() => {});

/* -----------------------------
 * Volume pill widget
 * ----------------------------- */
export function VolumePill(): Gtk.Box {
  const box = new Gtk.Box({
    spacing: 6,
    css_classes: ["volume-pill", "pill"],
  });

  const iconLabel = new Gtk.Label({ label: "" });
  const volLabel = new Gtk.Label({ label: "" });

  box.append(iconLabel);
  box.append(volLabel);

  // Keep last-known state for tooltip / UI
  let last: VolumePayload | null = null;

  function apply(state: VolumePayload | null): void {
    if (!state) return;
    last = state;

    iconLabel.set_text(getIcon(state.volume));
    volLabel.label = state.volume === "Muted" ? "Muted" : `${state.volume}%`;
  }

  // Poll-driven update
  function updateFromPoll(): void {
    apply(volumeState());
  }

  // One-shot update (event-driven, immediate after scroll/click)
  function updateNowFromScript(): void {
    const proc = Gio.Subprocess.new(
      ["bash", "-lc", CMD],
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
    );

    proc.communicate_utf8_async(null, null, (_p, res) => {
      try {
        const [, stdout] = proc.communicate_utf8_finish(res);
        apply(parseOutput(stdout));
      } catch {
        // ignore; poll will recover on next tick
      }
    });
  }

  // Initial render
  updateFromPoll();
  const unsubscribe = volumeState.subscribe(updateFromPoll);

  /* Scroll: volume up/down */
  const scroll = new Gtk.EventControllerScroll({
    flags: Gtk.EventControllerScrollFlags.VERTICAL,
  });

  scroll.connect("scroll", (_c, _dx, dy) => {
    if (dy < 0) {
      Gio.Subprocess.new(
        ["bash", "-lc", `${SCRIPT} --inc`],
        Gio.SubprocessFlags.NONE,
      );
    } else if (dy > 0) {
      Gio.Subprocess.new(
        ["bash", "-lc", `${SCRIPT} --dec`],
        Gio.SubprocessFlags.NONE,
      );
    }

    // 🔥 immediate UI update (don’t wait for poll interval)
    updateNowFromScript();

    return Gdk.EVENT_STOP;
  });

  box.add_controller(scroll);

  /* Click: toggle mute */
  const click = new Gtk.GestureClick();
  click.set_button(Gdk.BUTTON_PRIMARY);

  click.connect("released", () => {
    Gio.Subprocess.new(
      ["bash", "-lc", `${SCRIPT} --toggle`],
      Gio.SubprocessFlags.NONE,
    );

    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 75, () => {
      updateNowFromScript();
      return GLib.SOURCE_REMOVE;
    });
  });

  box.add_controller(click);

  /* Tooltip */
  attachTooltip(box, {
    text: () => last?.sink ?? "",
    classes: () => ["volume-pill"],
  });

  /* Cleanup */
  (box as Gtk.Widget & { _cleanup?: () => void })._cleanup = () => {
    unsubscribe();
  };

  return box;
}
