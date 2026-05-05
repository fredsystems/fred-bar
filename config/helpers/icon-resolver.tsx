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

/**
 * Cached desktop-application list. Gio.AppInfo.get_all() walks
 * /usr/share/applications and ~/.local/share/applications and is moderately
 * expensive — calling it on every workspace preview / window-title update /
 * notification icon resolve was a measurable hot path.
 *
 * AppInfoMonitor invalidates the cache when desktop entries are added,
 * removed, or modified, so the cache is always fresh without polling.
 */
let appsCache: Gio.AppInfo[] | null = null;
const appInfoMonitor = Gio.AppInfoMonitor.get();
appInfoMonitor.connect("changed", () => {
  appsCache = null;
  iconCache.clear();
});

function getAllAppInfos(): Gio.AppInfo[] {
  if (appsCache === null) appsCache = Gio.AppInfo.get_all();
  return appsCache;
}

/**
 * Resolved-icon memo keyed by lowercased appClass. Cleared whenever the
 * AppInfo list changes (see appInfoMonitor handler above).
 *
 * `null` is a meaningful cached value — it means "we tried and the desktop
 * lookup yielded nothing", so callers should fall through to the
 * ThemedIcon construction path. We therefore use Map<key, value | null>.
 */
const iconCache = new Map<string, Gio.Icon | null>();

export function resolveAppIcon(appClass?: string): Gio.Icon | null {
  if (!appClass) return null;

  const classLower = appClass.toLowerCase();

  // 1️⃣ Check manual overrides first
  if (ICON_OVERRIDES[classLower]) {
    return Gio.ThemedIcon.new(ICON_OVERRIDES[classLower]);
  }

  // 2️⃣ Try exact match with desktop files (cached)
  if (iconCache.has(classLower)) {
    const cached = iconCache.get(classLower);
    if (cached) return cached;
  } else {
    const allApps = getAllAppInfos();

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

    const icon = appInfo?.get_icon() ?? null;
    iconCache.set(classLower, icon);
    if (icon) return icon;
  }

  // 3️⃣ ThemedIcon fallback chain. Gio.ThemedIcon.new_from_names() builds a
  // single GIcon carrying multiple candidate names; GTK tries each at render
  // time and uses the first that resolves in the active theme. The previous
  // implementation called Gio.ThemedIcon.new() per candidate inside try/catch
  // arms — but ThemedIcon.new is infallible (it never inspects the theme),
  // so only the first candidate was ever returned and the fallbacks were
  // dead code. Using new_from_names restores the intended fallback chain.
  const candidates: string[] = [classLower];
  if (appClass.includes(".")) {
    const parts = appClass.split(".");
    candidates.push(parts[parts.length - 1].toLowerCase());
  }
  const hyphenated = classLower.replace(/\s+/g, "-");
  if (hyphenated !== classLower) candidates.push(hyphenated);
  candidates.push("application-x-executable");

  return Gio.ThemedIcon.new_from_names(candidates);
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

    // Check if it's an icon name. Gio.ThemedIcon.new is infallible — the
    // previous try/catch was dead code.
    return Gio.ThemedIcon.new(customImage);
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
