import Gio from "gi://Gio";
import GLib from "gi://GLib";

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

/**
 * Resolve notification icon, prioritizing custom image over app icon
 */
/**
 * Helper to check if a string looks like a file path
 */
function isFilePath(path: string): boolean {
  return (
    path.startsWith("/") ||
    path.startsWith("~/") ||
    path.startsWith("file://") ||
    path.startsWith("./") ||
    path.startsWith("../") ||
    path.includes("/") // Relative paths like "icons/image.png"
  );
}

/**
 * Helper to try loading an icon from a file path
 */
function tryLoadFileIcon(path: string): Gio.Icon | null {
  try {
    let file: Gio.File;

    if (path.startsWith("file://")) {
      file = Gio.File.new_for_uri(path);
    } else if (path.startsWith("~/")) {
      // Expand ~ to home directory
      const homeDir = GLib.get_home_dir();
      const expandedPath = path.replace("~", homeDir);
      file = Gio.File.new_for_path(expandedPath);
    } else {
      file = Gio.File.new_for_path(path);
    }

    if (file.query_exists(null)) {
      return Gio.FileIcon.new(file);
    } else {
      return null;
    }
  } catch (_e) {
    return null;
  }
}

export function resolveNotificationIcon(
  customImage?: string | null,
  appIcon?: string | null,
  appName?: string,
): Gio.Icon | null {
  // 1️⃣ Prioritize custom notification image
  if (customImage) {
    // Check if it's a file path
    if (isFilePath(customImage)) {
      const fileIcon = tryLoadFileIcon(customImage);
      if (fileIcon) return fileIcon;
    }

    // Check if it's an icon name
    try {
      return Gio.ThemedIcon.new(customImage);
    } catch (_e) {
      // Continue to fallback
    }
  }

  // 2️⃣ Check if appIcon is a file path (notify-send -i /path/to/image.png)
  if (appIcon) {
    if (isFilePath(appIcon)) {
      const fileIcon = tryLoadFileIcon(appIcon);
      if (fileIcon) return fileIcon;
    }
  }

  // 3️⃣ Fall back to app icon resolution (icon name lookup)
  return resolveAppIcon(appIcon || appName);
}
