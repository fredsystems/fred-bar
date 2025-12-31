import Mpris from "gi://AstalMpris";
import GLib from "gi://GLib";
import Gtk from "gi://Gtk?version=4.0";

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

function PlayerWidget(player: Mpris.Player): Gtk.Box {
  const container = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 12,
    css_classes: ["media-player"],
  });

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
    const length = player.length;
    if (length > 0) {
      player.set_position(value);
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
    tooltip_text: "Shuffle",
  });
  const shuffleIcon = new Gtk.Label({ label: "󰒟" });
  shuffleBtn.set_child(shuffleIcon);
  // Shuffle is typically read-only in MPRIS, so we just display the state
  shuffleBtn.sensitive = false;
  controlsBox.append(shuffleBtn);

  // Previous button
  const prevBtn = new Gtk.Button({
    css_classes: ["media-control-btn"],
    tooltip_text: "Previous",
  });
  const prevIcon = new Gtk.Label({ label: "󰒮" });
  prevBtn.set_child(prevIcon);
  prevBtn.connect("clicked", () => {
    if (player.can_go_previous) {
      player.previous();
    }
  });
  controlsBox.append(prevBtn);

  // Play/Pause button
  const playPauseBtn = new Gtk.Button({
    css_classes: ["media-control-btn", "media-play-pause-btn"],
    tooltip_text: "Play/Pause",
  });
  const playPauseIcon = new Gtk.Label({ label: "󰐊" });
  playPauseBtn.set_child(playPauseIcon);
  playPauseBtn.connect("clicked", () => {
    if (player.can_pause) {
      player.play_pause();
    }
  });
  controlsBox.append(playPauseBtn);

  // Next button
  const nextBtn = new Gtk.Button({
    css_classes: ["media-control-btn"],
    tooltip_text: "Next",
  });
  const nextIcon = new Gtk.Label({ label: "󰒭" });
  nextBtn.set_child(nextIcon);
  nextBtn.connect("clicked", () => {
    if (player.can_go_next) {
      player.next();
    }
  });
  controlsBox.append(nextBtn);

  // Loop button
  const loopBtn = new Gtk.Button({
    css_classes: ["media-control-btn", "media-loop-btn"],
    tooltip_text: "Loop",
  });
  const loopIcon = new Gtk.Label({ label: "󰑐" });
  loopBtn.set_child(loopIcon);
  // Loop status is typically read-only in MPRIS, so we just display the state
  loopBtn.sensitive = false;
  controlsBox.append(loopBtn);

  container.append(controlsBox);

  // Update function
  function updateMetadata(): void {
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
    // Get position - this seems to be working correctly
    const position = player.position ?? 0;

    // Try to get the actual track length from the GLib.Variant metadata
    const metadataVariant = (
      player as unknown as {
        metadata?: { lookup_value?: (key: string, type: null) => any };
      }
    ).metadata;
    let length = 0;

    if (metadataVariant && typeof metadataVariant.lookup_value === "function") {
      // Try to lookup the mpris:length key from the variant
      const lengthVariant = metadataVariant.lookup_value("mpris:length", null);
      if (lengthVariant && typeof lengthVariant.get_int64 === "function") {
        // Length is in microseconds, convert to seconds
        length = lengthVariant.get_int64() / 1000000;
      }
    }

    // Fallback: try player.length (some players like Firefox don't provide metadata)
    if (length <= 0 || !Number.isFinite(length)) {
      length = player.length ?? 0;
    }

    // If we still don't have a valid length, hide the slider
    if (length <= 0 || !Number.isFinite(length)) {
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

    // Shuffle - display only
    const shuffleStatus = (player as unknown as { shuffle?: boolean }).shuffle;
    if (shuffleStatus !== undefined && shuffleStatus !== null) {
      if (shuffleStatus) {
        shuffleBtn.add_css_class("active");
      } else {
        shuffleBtn.remove_css_class("active");
      }
      shuffleBtn.visible = true;
    } else {
      shuffleBtn.visible = false;
    }

    // Loop - display only
    const loopStatus = (player as unknown as { loop_status?: number })
      .loop_status;
    if (loopStatus !== undefined && loopStatus !== null) {
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

  // Connect to player signals
  const metadataHandler = player.connect("notify::title", update);
  const metadataChangeHandler = player.connect("notify::metadata", () => {
    update();
    updatePosition();
  });
  const lengthHandler = player.connect("notify::length", updatePosition);
  const positionHandler = player.connect("notify::position", updatePosition);
  const statusHandler = player.connect(
    "notify::playback-status",
    updateControls,
  );
  const shuffleHandler = player.connect("notify::shuffle", updateControls);
  const loopHandler = player.connect("notify::loop-status", updateControls);

  // Position polling (since position updates might not trigger notify)
  const pollInterval = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
    if (player.playback_status === Mpris.PlaybackStatus.PLAYING) {
      updatePosition();
    }
    return true; // Continue polling
  });

  // Cleanup
  (container as Gtk.Widget & { _cleanup?: () => void })._cleanup = () => {
    player.disconnect(metadataHandler);
    player.disconnect(metadataChangeHandler);
    player.disconnect(lengthHandler);
    player.disconnect(positionHandler);
    player.disconnect(statusHandler);
    player.disconnect(shuffleHandler);
    player.disconnect(loopHandler);
    GLib.source_remove(pollInterval);
  };

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

  const noMediaLabel = new Gtk.Label({
    label: "No media playing",
    css_classes: ["media-no-media"],
    valign: Gtk.Align.CENTER,
    vexpand: true,
  });

  function update(): void {
    // Clear existing
    let child = playerContainer.get_first_child();
    while (child) {
      const next = child.get_next_sibling();
      (child as Gtk.Widget & { _cleanup?: () => void })?._cleanup?.();
      playerContainer.remove(child);
      child = next;
    }

    const players = mpris.get_players();

    if (players.length === 0) {
      playerContainer.append(noMediaLabel);
    } else {
      // Show the first active player (or just the first one)
      const activePlayer =
        players.find(
          (p) => p.playback_status === Mpris.PlaybackStatus.PLAYING,
        ) || players[0];

      playerContainer.append(PlayerWidget(activePlayer));
    }
  }

  // Initial update
  update();

  // Listen for player changes
  const addHandler = mpris.connect("player-added", update);
  const removeHandler = mpris.connect("player-closed", update);

  // Poll for active player changes (when switching between existing players)
  const pollInterval = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
    const players = mpris.get_players();
    if (players.length > 1) {
      // Multiple players - check if active one changed
      const activePlayer = players.find(
        (p) => p.playback_status === Mpris.PlaybackStatus.PLAYING,
      );
      if (activePlayer) {
        update(); // Rebuild widget for new active player
      }
    }
    return true;
  });

  // Cleanup
  (container as Gtk.Widget & { _cleanup?: () => void })._cleanup = () => {
    mpris.disconnect(addHandler);
    mpris.disconnect(removeHandler);
    GLib.source_remove(pollInterval);

    // Cleanup player widgets
    let child = playerContainer.get_first_child();
    while (child) {
      const next = child.get_next_sibling();
      (child as Gtk.Widget & { _cleanup?: () => void })?._cleanup?.();
      child = next;
    }
  };

  return container;
}
