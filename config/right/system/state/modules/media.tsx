import Mpris from "gi://AstalMpris";
import Wp from "gi://AstalWp";
import { createPoll } from "ags/time";
import type { SystemSignal } from "../helpers/normalize";

/* -----------------------------
 * Helpers
 * ----------------------------- */

function getMediaSignal(): SystemSignal | null {
  const mpris = Mpris.get_default();
  const wp = Wp.get_default();
  const audio = wp?.audio;

  // Check for active microphone (Audio/Source)
  if (audio) {
    const activeMic = audio.recorders.find((recorder) => recorder.volume > 0);
    if (activeMic) {
      return {
        severity: "info",
        category: "media",
        icon: "󰍬",
        summary: "Microphone is active",
        raw: { type: "microphone" },
        contextual: true,
      };
    }
  }

  // Check for media players (via MPRIS)
  const players = mpris.get_players();
  const activePlayers = players.filter(
    (p) => p.playback_status === Mpris.PlaybackStatus.PLAYING,
  );

  if (activePlayers.length > 0) {
    const player = activePlayers[0];
    const title = player.title || "Unknown";
    const artist = player.artist || "";
    const summary = artist ? `${artist} - ${title}` : title;

    return {
      severity: "info",
      category: "media",
      icon: "󰎆",
      summary: `Playing: ${summary}`,
      raw: { type: "media-player", player: player.bus_name },
      contextual: true,
    };
  }

  // Check for audio playback (Audio/Sink streams)
  if (audio) {
    const activeStream = audio.streams.find((stream) => stream.volume > 0);
    if (activeStream) {
      return {
        severity: "info",
        category: "media",
        icon: "󰎆",
        summary: "Audio is playing",
        raw: { type: "audio-stream" },
        contextual: true,
      };
    }
  }

  // No active media
  return {
    severity: "idle",
    category: "media",
    icon: "󰎆",
    summary: "No active media",
    raw: { type: "idle" },
    contextual: true,
  };
}

/* -----------------------------
 * Media state (reactive polling)
 * ----------------------------- */

export const mediaState = createPoll<SystemSignal | null>(
  null,
  2000,
  getMediaSignal,
);

// Start polling immediately
mediaState.subscribe(() => {});
