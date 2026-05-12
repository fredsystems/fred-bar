import Mpris from "gi://AstalMpris";
import GLib from "gi://GLib";
import Gtk from "gi://Gtk?version=4.0";
import { registerCleanup } from "helpers/cleanup";
import { attachTooltip } from "helpers/tooltip";

const mpris = Mpris.get_default();

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Reject obviously-bogus track lengths.
//
// Some players (notably Firefox, web-based clients) advertise
// `mpris:length = INT64_MAX` as a "length unknown" sentinel before they have
// real metadata. After /1_000_000 that's ~9.22e12 seconds (~292 thousand
// years) which is finite but useless: it briefly creates a slider that runs
// for the heat-death of the universe. Anything over 24h is the sentinel.
const MAX_REASONABLE_TRACK_SECONDS = 24 * 3600;
function isUsableLength(length: number): boolean {
  return (
    Number.isFinite(length) &&
    length > 0 &&
    length < MAX_REASONABLE_TRACK_SECONDS
  );
}

interface PlayerWidgetBox extends Gtk.Box {
  _rebindTo?: (newPlayer: Mpris.Player) => void;
  _currentPlayer?: Mpris.Player;
  _cleanup?: () => void;
}

function PlayerWidget(initialPlayer: Mpris.Player): PlayerWidgetBox {
  // Mutable holder so all closures resolve the *current* player at call time.
  // This lets us rebind to a new player (e.g. Spotify -> Firefox) without
  // tearing down and rebuilding all the widgets.
  let currentPlayer: Mpris.Player = initialPlayer;

  const container = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 12,
    css_classes: ["media-player"],
  }) as PlayerWidgetBox;

  // Artwork and metadata row
  const topRow = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 12,
    css_classes: ["media-top-row"],
  });

  // Artwork
  const artworkBox = new Gtk.Box({
    css_classes: ["media-artwork-container"],
    valign: Gtk.Align.START,
  });

  const artwork = new Gtk.Image({
    css_classes: ["media-artwork"],
    pixel_size: 80,
  });
  artworkBox.append(artwork);
  topRow.append(artworkBox);

  // Metadata
  const metadataBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 4,
    hexpand: true,
    valign: Gtk.Align.CENTER,
  });

  const titleLabel = new Gtk.Label({
    label: "No media playing",
    css_classes: ["media-title"],
    xalign: 0,
    ellipsize: 3, // Pango.EllipsizeMode.END
    max_width_chars: 30,
  });
  metadataBox.append(titleLabel);

  const artistLabel = new Gtk.Label({
    label: "",
    css_classes: ["media-artist"],
    xalign: 0,
    ellipsize: 3,
    max_width_chars: 30,
  });
  metadataBox.append(artistLabel);

  const albumLabel = new Gtk.Label({
    label: "",
    css_classes: ["media-album"],
    xalign: 0,
    ellipsize: 3,
    max_width_chars: 30,
  });
  metadataBox.append(albumLabel);

  topRow.append(metadataBox);
  container.append(topRow);

  // Position slider
  const positionBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 4,
    css_classes: ["media-position-box"],
  });

  const positionScale = new Gtk.Scale({
    orientation: Gtk.Orientation.HORIZONTAL,
    draw_value: false,
    css_classes: ["media-position-slider"],
    hexpand: true,
  });
  positionScale.set_range(0, 100);
  positionScale.set_increments(1, 10);

  let isManuallyDragging = false;

  // Track when user starts dragging
  const dragController = new Gtk.GestureDrag();
  dragController.connect("drag-begin", () => {
    isManuallyDragging = true;
  });
  dragController.connect("drag-end", () => {
    isManuallyDragging = false;
    const value = positionScale.get_value();
    const length = currentPlayer.length;
    if (length > 0) {
      currentPlayer.set_position(value);
    }
  });
  positionScale.add_controller(dragController);

  positionBox.append(positionScale);

  // Time labels
  const timeRow = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 8,
    css_classes: ["media-time-row"],
  });

  const currentTimeLabel = new Gtk.Label({
    label: "0:00",
    css_classes: ["media-time-current"],
    xalign: 0,
    hexpand: true,
  });
  timeRow.append(currentTimeLabel);

  const totalTimeLabel = new Gtk.Label({
    label: "0:00",
    css_classes: ["media-time-total"],
    xalign: 1,
    hexpand: true,
  });
  timeRow.append(totalTimeLabel);

  positionBox.append(timeRow);
  container.append(positionBox);

  // Control buttons
  const controlsBox = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 8,
    css_classes: ["media-controls"],
    halign: Gtk.Align.CENTER,
  });

  // Shuffle button
  const shuffleBtn = new Gtk.Button({
    css_classes: ["media-control-btn", "media-shuffle-btn"],
  });
  const shuffleIcon = new Gtk.Label({ label: "󰒟" });
  shuffleBtn.set_child(shuffleIcon);
  // Shuffle is typically read-only in MPRIS, so we just display the state
  shuffleBtn.sensitive = false;
  attachTooltip(shuffleBtn, {
    text: () => "Shuffle",
    classes: () => ["media-control"],
  });
  controlsBox.append(shuffleBtn);

  // Previous button
  const prevBtn = new Gtk.Button({
    css_classes: ["media-control-btn"],
  });
  const prevIcon = new Gtk.Label({ label: "󰒮" });
  prevBtn.set_child(prevIcon);
  prevBtn.connect("clicked", () => {
    if (currentPlayer.can_go_previous) {
      currentPlayer.previous();
    }
  });
  attachTooltip(prevBtn, {
    text: () => "Previous",
    classes: () => ["media-control"],
  });
  controlsBox.append(prevBtn);

  // Play/Pause button
  const playPauseBtn = new Gtk.Button({
    css_classes: ["media-control-btn", "media-play-pause-btn"],
  });
  const playPauseIcon = new Gtk.Label({ label: "󰐊" });
  playPauseBtn.set_child(playPauseIcon);
  playPauseBtn.connect("clicked", () => {
    if (currentPlayer.can_pause) {
      currentPlayer.play_pause();
    }
  });
  attachTooltip(playPauseBtn, {
    text: () => "Play/Pause",
    classes: () => ["media-control"],
  });
  controlsBox.append(playPauseBtn);

  // Next button
  const nextBtn = new Gtk.Button({
    css_classes: ["media-control-btn"],
  });
  const nextIcon = new Gtk.Label({ label: "󰒭" });
  nextBtn.set_child(nextIcon);
  nextBtn.connect("clicked", () => {
    if (currentPlayer.can_go_next) {
      currentPlayer.next();
    }
  });
  attachTooltip(nextBtn, {
    text: () => "Next",
    classes: () => ["media-control"],
  });
  controlsBox.append(nextBtn);

  // Loop button
  const loopBtn = new Gtk.Button({
    css_classes: ["media-control-btn", "media-loop-btn"],
  });
  const loopIcon = new Gtk.Label({ label: "󰑐" });
  loopBtn.set_child(loopIcon);
  // Loop status is typically read-only in MPRIS, so we just display the state
  loopBtn.sensitive = false;
  attachTooltip(loopBtn, {
    text: () => "Loop",
    classes: () => ["media-control"],
  });
  controlsBox.append(loopBtn);

  container.append(controlsBox);

  // Update function
  function updateMetadata(): void {
    const player = currentPlayer;
    const title = player.title || "Unknown Title";
    const artist = player.artist || "";
    const album = player.album || "";

    titleLabel.label = title;
    artistLabel.label = artist;
    artistLabel.visible = artist.length > 0;
    albumLabel.label = album;
    albumLabel.visible = album.length > 0;

    // Update artwork
    const artUrl = player.art_url;
    if (artUrl && artUrl.length > 0) {
      try {
        if (artUrl.startsWith("file://")) {
          const path = artUrl.substring(7);
          artwork.set_from_file(path);
        } else if (
          artUrl.startsWith("http://") ||
          artUrl.startsWith("https://")
        ) {
          // For remote URLs, we'd need to download them
          // For now, just use a placeholder
          artwork.set_from_icon_name("folder-music-symbolic");
        } else {
          artwork.set_from_file(artUrl);
        }
      } catch (_e) {
        artwork.set_from_icon_name("folder-music-symbolic");
      }
    } else {
      artwork.set_from_icon_name("folder-music-symbolic");
    }
  }

  function updatePosition(): void {
    const player = currentPlayer;
    // Get position - this seems to be working correctly
    const position = player.position ?? 0;

    // Try to get the actual track length from the GLib.Variant metadata
    const metadataVariant = player.metadata;
    let length = 0;

    if (metadataVariant && typeof metadataVariant.lookup_value === "function") {
      // Try to lookup the mpris:length key from the variant
      const lengthVariant = metadataVariant.lookup_value(
        "mpris:length",
        null,
      ) as {
        get_int64?: () => number;
        print?: (type_annotate: boolean) => string;
      } | null;
      if (lengthVariant && typeof lengthVariant.get_int64 === "function") {
        // Some players (Firefox, web clients) publish mpris:length = INT64_MAX
        // as a "length unknown" sentinel. Calling get_int64() on that would
        // trigger a GJS precision warning *before* we ever see the value, so
        // sniff the raw printed representation first and only convert if the
        // magnitude is reasonable.
        let lengthMicros: number | null = null;
        if (typeof lengthVariant.print === "function") {
          const printed = lengthVariant.print(false);
          // For 'x' (int64) variants the printed form is just the digits,
          // possibly with a leading '-'. Parse via BigInt to avoid any JS
          // Number-precision involvement until we know it's safe.
          try {
            const big = BigInt(printed);
            // 24h in microseconds = 86_400 * 1_000_000 = 8.64e10, well within
            // Number-safe range (2^53 ≈ 9e15). Anything beyond a day is the
            // sentinel.
            const maxMicros = BigInt(MAX_REASONABLE_TRACK_SECONDS) * 1_000_000n;
            if (big > 0n && big < maxMicros) {
              lengthMicros = Number(big);
            }
          } catch (_e) {
            // Not parseable as a plain integer; fall through to get_int64.
            lengthMicros = null;
          }
        }
        // If print() wasn't available (unlikely) and we have a small variant
        // anyway, fall back to get_int64. We only reach this when print() is
        // missing, since a sentinel value above would have set
        // lengthMicros = null and we'd skip the conversion entirely.
        if (
          lengthMicros === null &&
          typeof lengthVariant.print !== "function"
        ) {
          lengthMicros = lengthVariant.get_int64();
        }
        if (lengthMicros !== null) {
          length = lengthMicros / 1_000_000;
        }
      }
    }

    // Fallback: try player.length (some players like Firefox don't provide metadata)
    if (!isUsableLength(length)) {
      length = player.length ?? 0;
    }

    // If we still don't have a valid length, hide the slider
    if (!isUsableLength(length)) {
      positionBox.visible = false;
      return;
    }

    positionScale.set_range(0, length);
    if (!isManuallyDragging) {
      positionScale.set_value(position);
    }
    currentTimeLabel.label = formatTime(position);
    totalTimeLabel.label = formatTime(length);
    positionBox.visible = true;
  }

  function updateControls(): void {
    const player = currentPlayer;
    // Play/Pause
    if (player.playback_status === Mpris.PlaybackStatus.PLAYING) {
      playPauseIcon.label = "󰏤"; // Pause
    } else {
      playPauseIcon.label = "󰐊"; // Play
    }
    playPauseBtn.sensitive = player.can_pause;

    // Previous/Next
    prevBtn.sensitive = player.can_go_previous;
    nextBtn.sensitive = player.can_go_next;

    // Shuffle - display only. shuffle_status is a Shuffle enum:
    // UNSUPPORTED (hide button), ON (active), OFF (inactive).
    const shuffleStatus = player.shuffle_status;
    if (shuffleStatus === Mpris.Shuffle.UNSUPPORTED) {
      shuffleBtn.visible = false;
    } else {
      if (shuffleStatus === Mpris.Shuffle.ON) {
        shuffleBtn.add_css_class("active");
      } else {
        shuffleBtn.remove_css_class("active");
      }
      shuffleBtn.visible = true;
    }

    // Loop - display only
    const loopStatus = player.loop_status;
    if (loopStatus !== Mpris.Loop.UNSUPPORTED) {
      loopBtn.remove_css_class("active");
      loopBtn.remove_css_class("loop-track");
      loopBtn.remove_css_class("loop-playlist");

      if (loopStatus === Mpris.Loop.TRACK) {
        loopIcon.label = "󰑘"; // Loop one
        loopBtn.add_css_class("active");
        loopBtn.add_css_class("loop-track");
      } else if (loopStatus === Mpris.Loop.PLAYLIST) {
        loopIcon.label = "󰑐"; // Loop all
        loopBtn.add_css_class("active");
        loopBtn.add_css_class("loop-playlist");
      } else {
        loopIcon.label = "󰑐"; // Loop (inactive)
      }
      loopBtn.visible = true;
    } else {
      loopBtn.visible = false;
    }
  }

  function update(): void {
    updateMetadata();
    updatePosition();
    updateControls();
  }

  // Initial update
  update();

  // Connect to player signals.
  // Tracked as [player, handlerId] pairs so we can disconnect on rebind/cleanup
  // even after `currentPlayer` has been swapped.
  let playerHandlers: Array<[Mpris.Player, number]> = [];

  const bindPlayerSignals = (p: Mpris.Player): void => {
    playerHandlers = [
      [p, p.connect("notify::title", update)],
      [
        p,
        p.connect("notify::metadata", () => {
          update();
          updatePosition();
        }),
      ],
      [p, p.connect("notify::length", updatePosition)],
      [p, p.connect("notify::position", updatePosition)],
      [p, p.connect("notify::playback-status", updateControls)],
      [p, p.connect("notify::shuffle", updateControls)],
      [p, p.connect("notify::loop-status", updateControls)],
    ];
  };

  const unbindPlayerSignals = (): void => {
    for (const [p, handlerId] of playerHandlers) {
      try {
        p.disconnect(handlerId);
      } catch (_e) {
        // Player may already be gone; ignore.
      }
    }
    playerHandlers = [];
  };

  bindPlayerSignals(currentPlayer);

  // Position polling (since position updates might not trigger notify).
  // Uses self-scheduling (SOURCE_REMOVE + manual reschedule) rather than
  // SOURCE_CONTINUE / return true to avoid the GLib "catch-up cascade" after
  // system sleep: a repeating timer reschedules from its *last* fire time, so
  // after a long sleep GLib would rapid-fire many callbacks before the event
  // loop can handle any input. With SOURCE_REMOVE we always reschedule from now.
  let positionPollId: number | null = null;

  const schedulePositionPoll = () => {
    positionPollId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
      positionPollId = null;
      if (currentPlayer.playback_status === Mpris.PlaybackStatus.PLAYING) {
        updatePosition();
      }
      schedulePositionPoll();
      return GLib.SOURCE_REMOVE;
    });
  };

  schedulePositionPoll();

  // Expose current player so the parent can detect identity changes.
  container._currentPlayer = currentPlayer;

  // Swap to a new player without rebuilding any widgets.
  container._rebindTo = (newPlayer: Mpris.Player): void => {
    if (newPlayer === currentPlayer) return;
    unbindPlayerSignals();
    currentPlayer = newPlayer;
    container._currentPlayer = currentPlayer;
    bindPlayerSignals(currentPlayer);
    update();
  };

  // Cleanup
  registerCleanup(container, () => {
    unbindPlayerSignals();
    if (positionPollId !== null) {
      GLib.source_remove(positionPollId);
      positionPollId = null;
    }
  });

  return container;
}

export function MediaPlayer(): Gtk.Box {
  const container = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 12,
    css_classes: ["media-section"],
  });

  const playerContainer = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 8,
    css_classes: ["media-player-container"],
  });
  container.append(playerContainer);

  function pickActivePlayer(): Mpris.Player | null {
    const players = mpris.get_players();
    if (players.length === 0) return null;
    return (
      players.find((p) => p.playback_status === Mpris.PlaybackStatus.PLAYING) ||
      players[0]
    );
  }

  function update(): void {
    const activePlayer = pickActivePlayer();

    if (activePlayer === null) {
      // Tear down any existing widget and hide.
      let child = playerContainer.get_first_child();
      while (child) {
        const next = child.get_next_sibling();
        (child as PlayerWidgetBox)._cleanup?.();
        playerContainer.remove(child);
        child = next;
      }
      container.visible = false;
      return;
    }

    const existing =
      playerContainer.get_first_child() as PlayerWidgetBox | null;
    if (existing) {
      if (existing._currentPlayer === activePlayer) {
        // Same player, nothing to do.
        return;
      }
      // Different player: rebind in place to preserve widgets/animations.
      if (existing._rebindTo) {
        existing._rebindTo(activePlayer);
        container.visible = true;
        return;
      }
      // Fallback: tear down and rebuild (shouldn't happen).
      existing._cleanup?.();
      playerContainer.remove(existing);
    }

    playerContainer.append(PlayerWidget(activePlayer));
    container.visible = true;
  }

  // Initial update
  update();

  // Listen for player changes
  const addHandler = mpris.connect("player-added", update);
  const removeHandler = mpris.connect("player-closed", update);

  // Poll for active player changes (when switching between existing players,
  // since AstalMpris doesn't emit a signal for that).
  // `update()` is now cheap when the active player is unchanged: it short-
  // circuits on identity match and only rebinds (no widget rebuild) on swap.
  // Self-scheduling to avoid the GLib "catch-up cascade" after system sleep.
  let playerSwitchPollId: number | null = null;

  const schedulePlayerSwitchPoll = () => {
    playerSwitchPollId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
      playerSwitchPollId = null;
      update();
      schedulePlayerSwitchPoll();
      return GLib.SOURCE_REMOVE;
    });
  };

  schedulePlayerSwitchPoll();

  // Cleanup. Child PlayerWidget boxes are also _cleanup-bound (via
  // registerCleanup), so destroying them via remove()/unparent() is enough
  // — the destroy signal fires their own cleanups. We still walk children
  // explicitly here because they may have been removed from this container
  // before destroy fires (rebind path).
  registerCleanup(container, () => {
    mpris.disconnect(addHandler);
    mpris.disconnect(removeHandler);
    if (playerSwitchPollId !== null) {
      GLib.source_remove(playerSwitchPollId);
      playerSwitchPollId = null;
    }
  });

  return container;
}
