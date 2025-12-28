import Wp from "gi://AstalWp";
import Gdk from "gi://Gdk?version=4.0";
import Gtk from "gi://Gtk?version=4.0";

import { attachTooltip } from "helpers/tooltip";

const ICONS = ["󰝟", "󰕿", "󰖀", "󰕾"];

/* -----------------------------
 * Helpers
 * ----------------------------- */

function getIcon(volume: number, muted: boolean): string {
  if (muted) return ICONS[0];
  if (volume <= 20) return ICONS[1];
  if (volume <= 60) return ICONS[2];
  if (volume <= 80) return ICONS[3];
  return ICONS[ICONS.length - 1];
}

function getVolumePercent(audio: Wp.Audio): number {
  const speaker = audio.default_speaker;
  if (!speaker) return 0;
  return Math.round(speaker.volume * 100);
}

function getSinkName(audio: Wp.Audio): string {
  const speaker = audio.default_speaker;
  if (!speaker) return "No audio device";
  return speaker.description || "Unknown device";
}

/* -----------------------------
 * Volume pill widget
 * ----------------------------- */
export function VolumePill(): Gtk.Box {
  const audio = Wp.get_default()?.audio;
  if (!audio) {
    throw new Error("AstalWp audio not available");
  }

  const box = new Gtk.Box({
    spacing: 4,
    css_classes: ["volume-pill", "pill"],
  });

  const iconLabel = new Gtk.Label({ label: "" });
  const volLabel = new Gtk.Label({ label: "" });

  box.append(iconLabel);
  box.append(volLabel);

  function update(): void {
    const speaker = audio.default_speaker;
    if (!speaker) {
      iconLabel.set_text(ICONS[0]);
      volLabel.label = "N/A";
      return;
    }

    const volume = getVolumePercent(audio);
    const muted = speaker.mute;

    const icon = getIcon(volume, muted);
    iconLabel.set_text(icon);
    volLabel.label = muted ? "Muted" : ` ${volume}%`;
  }

  // Initial render
  update();

  // Listen for audio changes
  const speakerChangedId = audio.connect("notify::default-speaker", update);

  // Listen for speaker property changes (volume, mute)
  let currentSpeakerHandlers: number[] = [];

  function connectSpeakerSignals(): void {
    // Disconnect old handlers
    const oldSpeaker = audio.default_speaker;
    if (oldSpeaker) {
      currentSpeakerHandlers.forEach((id) => oldSpeaker.disconnect(id));
    }
    currentSpeakerHandlers = [];

    // Connect new handlers
    const speaker = audio.default_speaker;
    if (speaker) {
      currentSpeakerHandlers.push(speaker.connect("notify::volume", update));
      currentSpeakerHandlers.push(speaker.connect("notify::mute", update));
    }
  }

  // Initial connection
  connectSpeakerSignals();

  // Reconnect when default speaker changes
  audio.connect("notify::default-speaker", () => {
    connectSpeakerSignals();
    update();
  });

  /* Scroll: volume up/down */
  const scroll = new Gtk.EventControllerScroll({
    flags: Gtk.EventControllerScrollFlags.VERTICAL,
  });

  scroll.connect("scroll", (_c, _dx, dy) => {
    const speaker = audio.default_speaker;
    if (!speaker) return Gdk.EVENT_PROPAGATE;

    const currentVolume = speaker.volume;
    const step = 0.05; // 5% steps

    if (dy < 0) {
      // Scroll up: increase volume
      speaker.volume = Math.min(1.0, currentVolume + step);
    } else if (dy > 0) {
      // Scroll down: decrease volume
      speaker.volume = Math.max(0.0, currentVolume - step);
    }

    return Gdk.EVENT_STOP;
  });

  box.add_controller(scroll);

  /* Click: toggle mute */
  const click = new Gtk.GestureClick();
  click.set_button(Gdk.BUTTON_PRIMARY);

  click.connect("released", () => {
    const speaker = audio.default_speaker;
    if (speaker) {
      speaker.mute = !speaker.mute;
    }
  });

  box.add_controller(click);

  /* Tooltip */
  attachTooltip(box, {
    text: () => getSinkName(audio),
    classes: () => ["volume-pill"],
  });

  /* Cleanup */
  (box as Gtk.Widget & { _cleanup?: () => void })._cleanup = () => {
    audio.disconnect(speakerChangedId);

    const speaker = audio.default_speaker;
    if (speaker) {
      currentSpeakerHandlers.forEach((id) => speaker.disconnect(id));
    }
  };

  return box;
}
