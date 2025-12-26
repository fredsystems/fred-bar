import GLib from "gi://GLib";

/**
 * Resolve a script inside config/scripts/
 *
 * Resolution order:
 * 1. AGS_CONFIG_DIR (production, authoritative)
 * 2. cwd/config (ags run -d ./config dev mode)
 */
export function scriptPath(name: string): string {
  // 1️⃣ Production: AGS provides this
  const agsConfig = GLib.getenv("AGS_CONFIG_DIR");
  if (agsConfig) {
    return GLib.build_filenamev([agsConfig, "scripts", name]);
  }

  // 2️⃣ Dev mode fallback: ags run -d ./config
  const cwd = GLib.get_current_dir();
  const candidate = GLib.build_filenamev([cwd, "scripts", name]);

  if (GLib.file_test(candidate, GLib.FileTest.EXISTS)) {
    return candidate;
  }

  throw new Error(
    `Unable to resolve script '${name}'. ` +
      `AGS_CONFIG_DIR not set and dev fallback not found.`,
  );
}
