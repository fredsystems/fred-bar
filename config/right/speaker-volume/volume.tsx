import Wp from "gi://AstalWp";
import Gdk from "gi://Gdk?version=4.0";
import Gtk from "gi://Gtk?version=4.0";

import { attachTooltip } from "helpers/tooltip";

/* -----------------------------
 * Volume Widget - AstalWp Integration
 * -----------------------------
 *
 * This widget controls audio volume using AstalWp (WirePlumber/PipeWire).
 * It provides real-time reactive updates via GObject signals.
 *
 * Features:
 * - Scroll up/down to adjust volume (5% steps)
 * - Click to toggle mute
 * - Shows volume icon that changes with level
 * - Displays percentage alongside icon
 * - Tooltip shows current audio sink name
 *
 * Icons used (Nerd Fonts):
 * - 󰝟 Muted
 * - 󰕿 Low (0-20%)
 * - 󰖀 Medium (21-60%)
 * - 󰕾 High (61-100%)
 */

const ICONS = ["󰝟", "󰕿", "󰖀", "󰕾"];

/* -----------------------------
 * Helpers
 * ----------------------------- */

/**
 * Returns appropriate volume icon based on volume level and mute state
 * @param volume - Volume percentage (0-100)
 * @param muted - Whether audio is muted
 * @returns Nerd Font icon representing current volume state
 */
function getIcon(volume: number, muted: boolean): string {
  if (muted) return ICONS[0]; // 󰝟 Muted
  if (volume <= 20) return ICONS[1]; // 󰕿 Low
  if (volume <= 60) return ICONS[2]; // 󰖀 Medium
  if (volume <= 80) return ICONS[3]; // 󰕾 High
  return ICONS[ICONS.length - 1]; // 󰕾 Very high
}

/**
 * Converts WirePlumber volume (0.0-1.0) to percentage (0-100)
 * @param audio - AstalWp Audio instance
 * @returns Volume as rounded percentage
 */
function getVolumePercent(audio: Wp.Audio): number {
  const speaker = audio.default_speaker;
  if (!speaker) return 0;
  return Math.round(speaker.volume * 100);
}

/**
 * Gets human-readable name of the current audio output device
 * @param audio - AstalWp Audio instance
 * @returns Descriptive name of the audio sink
 */
function getSinkName(audio: Wp.Audio): string {
  const speaker = audio.default_speaker;
  if (!speaker) return "No audio device";
  return speaker.description || "Unknown device";
}

/* -----------------------------
 * Volume pill widget
 * ----------------------------- */

/**
 * Volume pill widget - interactive audio volume control
 *
 * Reactive updates:
 * - Listens to WirePlumber audio property changes
 * - Updates immediately when volume or mute state changes
 * - Handles audio device hotplug (speaker changes)
 *
 * Interactions:
 * - Scroll: Increase/decrease volume
 * - Click: Toggle mute
 */
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

  /**
   * Updates widget display based on current audio state
   */
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

  // Listen for default speaker changes (device hotplug)
  const speakerChangedId = audio.connect("notify::default-speaker", update);

  // Track signal handlers for current speaker
  let currentSpeakerHandlers: number[] = [];

  /**
   * Connects signal handlers to the current default speaker
   * Handles speaker hotplug by reconnecting to the new device
   */
  function connectSpeakerSignals(): void {
    // Disconnect old handlers from previous speaker
    const oldSpeaker = audio.default_speaker;
    if (oldSpeaker) {
      currentSpeakerHandlers.forEach((id) => {
        oldSpeaker.disconnect(id);
      });
    }
    currentSpeakerHandlers = [];

    // Connect new handlers to current speaker
    const speaker = audio.default_speaker;
    if (speaker) {
      // Update when volume changes (from any source)
      currentSpeakerHandlers.push(speaker.connect("notify::volume", update));
      // Update when mute state changes
      currentSpeakerHandlers.push(speaker.connect("notify::mute", update));
    }
  }

  // Initial connection to current speaker
  connectSpeakerSignals();

  // Reconnect when default speaker changes (e.g., plugging in headphones)
  audio.connect("notify::default-speaker", () => {
    connectSpeakerSignals();
    update();
  });

  /* -----------------------------
   * Event Handlers
   * ----------------------------- */

  // Scroll up/down to adjust volume
  const scroll = new Gtk.EventControllerScroll({
    flags: Gtk.EventControllerScrollFlags.VERTICAL,
  });

  scroll.connect("scroll", (_c, _dx, dy) => {
    const speaker = audio.default_speaker;
    if (!speaker) return Gdk.EVENT_PROPAGATE;

    const currentVolume = speaker.volume;
    const step = 0.05; // 5% steps (0.05 = 5% of 1.0)

    if (dy < 0) {
      // Scroll up: increase volume (clamped to 100%)
      speaker.volume = Math.min(1.0, currentVolume + step);
    } else if (dy > 0) {
      // Scroll down: decrease volume (clamped to 0%)
      speaker.volume = Math.max(0.0, currentVolume - step);
    }

    // Setting .volume triggers the notify::volume signal,
    // which automatically calls update() - no manual refresh needed!
    return Gdk.EVENT_STOP;
  });

  box.add_controller(scroll);

  // Click to toggle mute
  const click = new Gtk.GestureClick();
  click.set_button(Gdk.BUTTON_PRIMARY);

  click.connect("released", () => {
    const speaker = audio.default_speaker;
    if (speaker) {
      speaker.mute = !speaker.mute;
      // Setting .mute triggers notify::mute signal -> auto update
    }
  });

  box.add_controller(click);

  /* -----------------------------
   * Tooltip - shows audio device name
   * ----------------------------- */

  attachTooltip(box, {
    text: () => getSinkName(audio),
    classes: () => ["volume-pill"],
  });

  /* -----------------------------
   * Cleanup - disconnect signal handlers
   * ----------------------------- */

  (box as Gtk.Widget & { _cleanup?: () => void })._cleanup = () => {
    // Disconnect audio-level signals
    audio.disconnect(speakerChangedId);

    // Disconnect speaker-level signals
    const speaker = audio.default_speaker;
    if (speaker) {
      currentSpeakerHandlers.forEach((id) => {
        speaker.disconnect(id);
      });
    }
  };

  return box;
}
