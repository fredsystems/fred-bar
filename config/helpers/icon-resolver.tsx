import Gio from "gi://Gio";

/**
 * Improved icon resolution with multiple fallback strategies
 * Handles edge cases like "GitHub Desktop", reverse domain names, etc.
 */

// Common icon name mappings for apps that don't follow standard naming
const ICON_OVERRIDES: Record<string, string> = {
  "github desktop": "github",
  "visual studio code": "vscode",
  code: "vscode",
  "org.gnome.nautilus": "system-file-manager",
  "org.gnome.terminal": "terminal",
  kitty: "utilities-terminal",
  alacritty: "utilities-terminal",
  "brave-browser": "brave",
  "google-chrome": "chrome",
  firefox: "firefox",
  thunderbird: "thunderbird",
};

export function resolveAppIcon(appClass?: string): Gio.Icon | null {
  if (!appClass) return null;

  const classLower = appClass.toLowerCase();

  // 1️⃣ Check manual overrides first
  if (ICON_OVERRIDES[classLower]) {
    try {
      return Gio.ThemedIcon.new(ICON_OVERRIDES[classLower]);
    } catch {
      // Continue to other methods
    }
  }

  // 2️⃣ Try exact match with desktop files
  const allApps = Gio.AppInfo.get_all();

  // Try exact ID match
  let appInfo = allApps.find(
    (app) => app.get_id()?.toLowerCase() === `${classLower}.desktop`,
  );

  // Try contains match
  if (!appInfo) {
    appInfo = allApps.find((app) =>
      app.get_id()?.toLowerCase().includes(classLower),
    );
  }

  // Try reverse domain match (e.g., "dev.zed.Zed" -> "zed")
  if (!appInfo && appClass.includes(".")) {
    const parts = appClass.split(".");
    const simpleName = parts[parts.length - 1].toLowerCase();
    appInfo = allApps.find((app) =>
      app.get_id()?.toLowerCase().includes(simpleName),
    );
  }

  if (appInfo) {
    const icon = appInfo.get_icon();
    if (icon) return icon;
  }

  // 3️⃣ Try class name as icon name (lowercase)
  try {
    return Gio.ThemedIcon.new(classLower);
  } catch {
    // Continue
  }

  // 4️⃣ Try just the last part of reverse domain
  if (appClass.includes(".")) {
    const parts = appClass.split(".");
    const lastName = parts[parts.length - 1].toLowerCase();
    try {
      return Gio.ThemedIcon.new(lastName);
    } catch {
      // Continue
    }
  }

  // 5️⃣ Try hyphenated version
  const hyphenated = classLower.replace(/\s+/g, "-");
  try {
    return Gio.ThemedIcon.new(hyphenated);
  } catch {
    // Continue
  }

  // 6️⃣ Fallback to generic application icon
  try {
    return Gio.ThemedIcon.new("application-x-executable");
  } catch {
    return null;
  }
}
