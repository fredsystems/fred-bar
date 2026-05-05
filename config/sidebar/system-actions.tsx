import Gtk from "gi://Gtk?version=4.0";

import { spawnDetached } from "helpers/subprocess";
import { getCompositorExitCommand } from "services/compositor-detect";

function getLogoutCommand(): string[] {
  return getCompositorExitCommand() ?? ["loginctl", "terminate-user", "$USER"];
}

function withCompositorExit(systemCommand: string[]): string[] {
  const exitCmd = getCompositorExitCommand();
  if (!exitCmd) return systemCommand;
  // Compose: run compositor exit, then the system command. Falling back
  // to a shell here is unavoidable because we want sequencing.
  const exitStr = exitCmd.map(shellQuote).join(" ");
  const sysStr = systemCommand.map(shellQuote).join(" ");
  return ["sh", "-c", `${exitStr} && ${sysStr}`];
}

/**
 * Quote a single argv token for a `sh -c` body. Only runs against
 * trusted, hard-coded values (compositor exit + systemctl invocations),
 * but encapsulating it keeps the call sites honest.
 */
function shellQuote(arg: string): string {
  if (/^[a-zA-Z0-9_\-./=]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

function executeCommand(argv: string[]): void {
  spawnDetached(argv);
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
    executeCommand(withCompositorExit(["systemctl", "reboot"]));
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
    executeCommand(withCompositorExit(["systemctl", "poweroff"]));
  });
  powerRow.append(shutdownBtn);

  container.append(powerRow);

  return container;
}
