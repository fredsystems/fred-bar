import GLib from "gi://GLib";
import Gtk from "gi://Gtk?version=4.0";

// Detect which compositor is running
function detectCompositor(): "hyprland" | "niri" | "sway" | "other" {
  const session = GLib.getenv("XDG_CURRENT_DESKTOP") || "";
  const sessionLower = session.toLowerCase();

  if (sessionLower.includes("hyprland")) {
    return "hyprland";
  }
  if (sessionLower.includes("niri")) {
    return "niri";
  }
  if (sessionLower.includes("sway")) {
    return "sway";
  }

  // Try checking running processes
  try {
    const [, stdout] = GLib.spawn_command_line_sync("pgrep -x hyprland");
    if (stdout && stdout.length > 0) {
      return "hyprland";
    }
  } catch {
    // ignore
  }

  try {
    const [, stdout] = GLib.spawn_command_line_sync("pgrep -x niri");
    if (stdout && stdout.length > 0) {
      return "niri";
    }
  } catch {
    // ignore
  }

  try {
    const [, stdout] = GLib.spawn_command_line_sync("pgrep -x sway");
    if (stdout && stdout.length > 0) {
      return "sway";
    }
  } catch {
    // ignore
  }

  return "other";
}

function getCompositorExitCommand(): string | null {
  const compositor = detectCompositor();

  switch (compositor) {
    case "hyprland":
      return "hyprshutdown";
    case "niri":
      return "niri msg action quit";
    case "sway":
      return "swaymsg exit";
    default:
      return null;
  }
}

function getLogoutCommand(): string {
  return getCompositorExitCommand() ?? "loginctl terminate-user $USER";
}

function withCompositorExit(systemCommand: string): string {
  const exitCmd = getCompositorExitCommand();
  return exitCmd ? `sh -c '${exitCmd} && ${systemCommand}'` : systemCommand;
}

function executeCommand(command: string): void {
  try {
    GLib.spawn_command_line_async(command);
  } catch (e) {
    console.error(`Failed to execute command: ${command}`, e);
  }
}

export function SystemActions(): Gtk.Box {
  const container = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 12,
    css_classes: ["system-actions-section"],
  });

  // Power actions
  const powerRow = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 8,
    css_classes: ["system-actions-row"],
    homogeneous: true,
  });

  // Logout button
  const logoutBtn = new Gtk.Button({
    css_classes: ["system-action-btn", "system-logout-btn"],
  });
  const logoutBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 4,
    halign: Gtk.Align.CENTER,
  });
  const logoutIcon = new Gtk.Label({
    label: "󰍃",
    css_classes: ["system-action-icon"],
  });
  const logoutLabel = new Gtk.Label({
    label: "Log Out",
    css_classes: ["system-action-label"],
  });
  logoutBox.append(logoutIcon);
  logoutBox.append(logoutLabel);
  logoutBtn.set_child(logoutBox);
  logoutBtn.connect("clicked", () => {
    executeCommand(getLogoutCommand());
  });
  powerRow.append(logoutBtn);

  // Reboot button
  const rebootBtn = new Gtk.Button({
    css_classes: ["system-action-btn", "system-reboot-btn"],
  });
  const rebootBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 4,
    halign: Gtk.Align.CENTER,
  });
  const rebootIcon = new Gtk.Label({
    label: "󰜉",
    css_classes: ["system-action-icon"],
  });
  const rebootLabel = new Gtk.Label({
    label: "Reboot",
    css_classes: ["system-action-label"],
  });
  rebootBox.append(rebootIcon);
  rebootBox.append(rebootLabel);
  rebootBtn.set_child(rebootBox);
  rebootBtn.connect("clicked", () => {
    executeCommand(withCompositorExit("systemctl reboot"));
  });
  powerRow.append(rebootBtn);

  // Shutdown button
  const shutdownBtn = new Gtk.Button({
    css_classes: ["system-action-btn", "system-shutdown-btn"],
  });
  const shutdownBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 4,
    halign: Gtk.Align.CENTER,
  });
  const shutdownIcon = new Gtk.Label({
    label: "󰐥",
    css_classes: ["system-action-icon"],
  });
  const shutdownLabel = new Gtk.Label({
    label: "Shutdown",
    css_classes: ["system-action-label"],
  });
  shutdownBox.append(shutdownIcon);
  shutdownBox.append(shutdownLabel);
  shutdownBtn.set_child(shutdownBox);
  shutdownBtn.connect("clicked", () => {
    executeCommand(withCompositorExit("systemctl poweroff"));
  });
  powerRow.append(shutdownBtn);

  container.append(powerRow);

  return container;
}
